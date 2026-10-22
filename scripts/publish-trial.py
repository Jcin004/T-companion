"""Validate a committed Android delivery, publish its assets, then advance its feed.

Dry-run by default. Credentials stay in the system Git credential helper.
"""
import argparse
import base64
import hashlib
import io
import json
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

REPOSITORY = 'Jcin004/T-companion-updates'
API = f'https://api.github.com/repos/{REPOSITORY}'


def sha256(data):
    return hashlib.sha256(data).hexdigest()


class GitHub:
    def __init__(self):
        credential = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
                                    text=True, capture_output=True, check=False)
        if credential.returncode:
            raise RuntimeError('GitHub credential helper failed')
        values = dict(line.split('=', 1) for line in credential.stdout.splitlines() if '=' in line)
        self.token = values.get('password')
        if not self.token:
            raise RuntimeError('GitHub credential helper returned no credential')

    def request(self, method, path, payload=None, binary=False):
        url = path if path.startswith('https://') else API + path
        if urllib.parse.urlsplit(url).hostname not in {'api.github.com', 'uploads.github.com'}:
            raise RuntimeError('Unexpected GitHub API host')
        body = payload if binary else json.dumps(payload).encode() if payload is not None else None
        headers = {'Authorization': 'Bearer ' + self.token, 'Accept': 'application/vnd.github+json',
                   'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'T-companion-release',
                   'Content-Type': 'application/octet-stream' if binary else 'application/json'}
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers, method=method), timeout=180) as response:
                data = response.read()
                return json.loads(data) if data else None
        except urllib.error.HTTPError as error:
            if error.code == 404 and method == 'GET':
                return None
            raise RuntimeError(f'GitHub {method} failed: HTTP {error.code}') from None


def validate_bundle(root, apk, source, manifest_path, build_tools):
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    if manifest.get('sourceCommit') != commit:
        raise ValueError('Manifest must identify the current committed source')
    archive = subprocess.run(['git', 'archive', '--format=zip', commit], cwd=root, capture_output=True, check=True).stdout
    if source.read_bytes() != archive:
        raise ValueError('Source archive must be the exact git archive of the manifest commit')
    apk_bytes = apk.read_bytes()
    if manifest.get('packageName') != 'io.jcin.tcompanion' or manifest.get('schemaVersion') != 1:
        raise ValueError('Unexpected update package or schema')
    if manifest.get('sizeBytes') != len(apk_bytes) or manifest.get('sha256') != sha256(apk_bytes):
        raise ValueError('APK size or SHA-256 does not match the manifest')
    badging = subprocess.check_output([str(build_tools / 'aapt.exe'), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    match = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
    if not match or (match[1], int(match[2]), match[3]) != (manifest['packageName'], manifest['versionCode'], manifest['versionName']):
        raise ValueError('APK version or package does not match the manifest')
    with zipfile.ZipFile(io.BytesIO(archive)) as sources, zipfile.ZipFile(io.BytesIO(apk_bytes)) as packaged:
        if packaged.read('assets/public/source-commit.txt').decode().strip() != commit:
            raise ValueError('APK was not built from the manifest commit')
        for name in sources.namelist():
            if name.startswith('frontend/') and not name.endswith('/'):
                local = name[len('frontend/'):]
                target = 'assets/public/' + ('index.html' if local == 'index.html' else 'assets/' + local)
                built, original = packaged.read(target), sources.read(name)
                if Path(name).suffix in {'.js', '.mjs', '.html', '.css', '.json', '.md', '.txt', '.svg'}:
                    built, original = built.replace(b'\r\n', b'\n'), original.replace(b'\r\n', b'\n')
                if built != original:
                    raise ValueError(f'APK and committed source differ: {name}')
        assets = {apk.name: apk_bytes, source.name: source.read_bytes(),
                  'LICENSE': sources.read('LICENSE'), 'THIRD_PARTY_NOTICES.md': sources.read('THIRD_PARTY_NOTICES.md'),
                  'BUILD_INSTRUCTIONS.md': sources.read('README.md')}
    version = manifest['versionName'].removesuffix('-trial')
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Expected a numbered trial version')
    tag = 'android-v' + version
    expected = f'https://github.com/{REPOSITORY}/releases/download/{tag}/{urllib.parse.quote(apk.name)}'
    if manifest['apkUrl'] != expected:
        raise ValueError('APK URL must point at this delivery and release tag')
    java = Path(os.environ['JAVA_HOME']) / 'bin/java.exe'
    subprocess.run([str(java), '-jar', str(build_tools / 'lib/apksigner.jar'), 'verify', str(apk)],
                   capture_output=True, check=True)
    assets['t-update.json'] = manifest_path.read_bytes()
    assets['SHA256SUMS.txt'] = ''.join(f'{sha256(data)}  {name}\n' for name, data in assets.items()).encode()
    return manifest, tag, assets


def publish_bundle(api, manifest, tag, assets):
    current = api.request('GET', '/contents/t-update.json?ref=main')
    if current:
        previous = json.loads(base64.b64decode(current['content']))
        if previous['versionCode'] > manifest['versionCode']:
            raise ValueError('Refusing to move the public update feed backwards')
        if previous['versionCode'] == manifest['versionCode'] and (previous['sha256'], previous.get('sourceCommit')) != (manifest['sha256'], manifest['sourceCommit']):
            raise ValueError('A published version code cannot identify a different build')
    release = api.request('GET', '/releases/tags/' + tag)
    if not release:
        release = api.request('POST', '/releases', {'tag_name': tag, 'name': manifest['versionName'], 'draft': True, 'prerelease': True,
            'body': '\n'.join('- ' + note for note in manifest.get('releaseNotes', [])) + '\n\nSource commit: https://github.com/Jcin004/T-companion/commit/' + manifest['sourceCommit']})
    existing = {asset['name']: asset for asset in release['assets']}
    upload = release['upload_url'].split('{', 1)[0]
    for name, data in assets.items():
        digest = 'sha256:' + sha256(data)
        if name in existing:
            if existing[name].get('digest') == digest and existing[name]['size'] == len(data):
                continue
            raise ValueError('Release asset already exists with different content: ' + name)
        if not release['draft']:
            raise ValueError('Published release is incomplete; refusing to alter it')
        asset = api.request('POST', upload + '?name=' + urllib.parse.quote(name), data, binary=True)
        if asset['size'] != len(data) or asset.get('digest') != digest:
            raise ValueError('Uploaded asset verification failed: ' + name)
        print('Uploaded', name, flush=True)
    if release['draft']:
        api.request('PATCH', '/releases/' + str(release['id']), {'draft': False, 'prerelease': True})
    # The feed advances only after the APK, exact source and notices are public.
    encoded = base64.b64encode(assets['t-update.json']).decode()
    if not current or base64.b64decode(current['content']) != assets['t-update.json']:
        update = {'message': 'Publish verified trial manifest ' + manifest['versionName'], 'content': encoded, 'branch': 'main',
                  'committer': {'name': 'Jcin004', 'email': '285790879+Jcin004@users.noreply.github.com'}}
        update['author'] = update['committer']
        if current:
            update['sha'] = current['sha']
        api.request('PUT', '/contents/t-update.json', update)
    return f'https://github.com/{REPOSITORY}/releases/tag/{tag}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, required=True)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--build-tools', type=Path, required=True)
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    manifest, tag, assets = validate_bundle(root, args.apk, args.source, args.manifest, args.build_tools)
    print(f'Validated {tag} from {manifest["sourceCommit"]}: {len(assets)} matching assets', flush=True)
    if args.publish:
        api = GitHub()
        remote = api.request('GET', 'https://api.github.com/repos/Jcin004/T-companion/commits/' + manifest['sourceCommit'])
        if not remote or remote.get('sha') != manifest['sourceCommit']:
            raise ValueError('Push the exact source commit before publishing the phone update')
        print(publish_bundle(api, manifest, tag, assets), flush=True)
    else:
        print('Dry run: no remote files changed')


if __name__ == '__main__':
    main()
