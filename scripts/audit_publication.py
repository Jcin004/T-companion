"""Local publication checks. Gitleaks scans secrets; these checks add privacy metadata.

Reports contain locations and counts, never secret values or private email addresses.
GitHub metadata is an optional locally saved API export; no credentials are requested here.
"""
import argparse
from collections import Counter
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
from tempfile import TemporaryDirectory
from zipfile import ZipFile


def git(repo, *args):
    return subprocess.run(
        ['git', '-C', str(repo), *args], check=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60,
    ).stdout


def private_email(value):
    value = value.strip().lower()
    return bool(value and not (
        value.endswith('@users.noreply.github.com') or value == 'noreply@github.com'
        or value.endswith(('@example.invalid', '@example.com', '@localhost'))
    ))


def sensitive_path(name):
    parts = PurePosixPath(name).parts
    if any(p in ('data', '.venv', 'node_modules') for p in parts):
        return True
    filename = PurePosixPath(name).name.lower()
    if filename in ('.env.example', '.env.sample'):
        return False
    return bool(
        filename == '.env' or filename.startswith('.env.')
        or filename in ('access-token.txt', 'password.txt', 'id_rsa', 'id_ed25519')
        or filename.endswith(('.db', '.db-wal', '.db-shm', '.keystore', '.jks', '.p12', '.pfx', '.pem', '.key'))
    )


PRIVACY_PATTERNS = {
    'device_identifier': re.compile(rb'wxid_[A-Za-z0-9]{8,}'),
    'personal_windows_path': re.compile(rb'[A-Za-z]:[\\/]+Users[\\/]+(?!Public|Default|<|your|user[\\/])[A-Za-z0-9_.-]+'),
    'private_lan_address': re.compile(rb'\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b'),
}


def inspect_git(repo, snapshot=False):
    revision = git(repo, 'rev-parse', 'HEAD').decode().strip()
    logs = ('-1',) if snapshot else ('--all',)
    commits = [r.split('\t') for r in git(repo, 'log', *logs, '--format=%H%x09%ae%x09%ce').decode().splitlines()]
    email_commits = [row[0] for row in commits if any(private_email(e) for e in row[1:])]
    if snapshot:
        # ls-tree rows are mode/type/object TAB path; retain paths with spaces.
        blobs = []
        for row in git(repo, 'ls-tree', '-r', '-z', revision).split(b'\0'):
            if not row:
                continue
            head, name = row.split(b'\t', 1)
            _, kind, oid = head.split()
            if kind == b'blob':
                blobs.append((oid.decode(), name.decode('utf-8')))
    else:
        blobs = [tuple(row.partition(' ')[::2]) for row in git(repo, 'rev-list', '--objects', '--all').decode().splitlines() if ' ' in row]

    findings = []
    scanned = 0
    process = subprocess.Popen(
        ['git', '-C', str(repo), 'cat-file', '--batch'],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    try:
        for oid, name in blobs:
            process.stdin.write((oid + '\n').encode())
            process.stdin.flush()
            header = process.stdout.readline().split()
            if len(header) != 3:
                raise ValueError('Could not read repository object')
            raw = process.stdout.read(int(header[2]))
            process.stdout.read(1)
            if header[1] != b'blob':
                continue
            scanned += 1
            if sensitive_path(name):
                findings.append({'kind': 'sensitive_path', 'path': name, 'blob': oid})
            for kind, pattern in PRIVACY_PATTERNS.items():
                # LAN fixtures are not the developer's network address. Secrets are never excluded.
                if kind == 'private_lan_address' and (name.startswith('tests/') or '/tests/' in name):
                    continue
                for match in pattern.finditer(raw):
                    findings.append({'kind': kind, 'path': name, 'blob': oid, 'line': raw[:match.start()].count(b'\n') + 1})
    finally:
        process.stdin.close()
        process.wait(timeout=10)
        process.stdout.close()
        process.stderr.close()
    return {
        'revision': revision, 'scope': 'snapshot' if snapshot else 'all_reachable_refs',
        'commits_scanned': len(commits), 'blob_versions_scanned': scanned,
        'commits_with_private_email': len(email_commits), 'privacy_findings': findings,
    }


def scan_secrets(repo, executable, snapshot):
    if not executable:
        return {'status': 'unavailable', 'finding_count': None, 'findings': []}
    with TemporaryDirectory(prefix='t-publication-scan-') as folder:
        temporary = Path(folder).resolve()
        report = temporary / 'redacted.json'
        if snapshot:
            source = temporary / 'source'
            source.mkdir()
            with ZipFile(BytesIO(git(repo, 'archive', '--format=zip', 'HEAD'))) as archive:
                for member in archive.namelist():
                    if not (source / member).resolve().is_relative_to(source):
                        raise ValueError('Unsafe archive path')
                archive.extractall(source)
            args = ['dir', str(source)]
        else:
            args = ['git', str(repo), '--log-opts=--all']
        result = subprocess.run(
            [str(executable), *args, '--redact=100', '--report-format=json',
             '--report-path=' + str(report), '--no-banner', '--no-color', '--log-level=warn'],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180,
        )
        if result.returncode not in (0, 1) or not report.is_file():
            return {'status': 'error', 'exit_code': result.returncode, 'finding_count': None, 'findings': []}
        raw = json.loads(report.read_text(encoding='utf-8')) or []
        findings = [{
            'rule': item.get('RuleID'), 'path': item.get('File'),
            'line': item.get('StartLine'), 'commit': item.get('Commit'),
        } for item in raw]
        return {'status': 'complete', 'finding_count': len(findings), 'findings': findings}


def inspect_metadata(path):
    if path is None:
        return {'status': 'not_in_scope', 'private_email_occurrences': 0, 'unreviewed_artifacts': 0}
    value = json.loads(Path(path).read_text(encoding='utf-8'))

    def walk(item):
        if isinstance(item, dict):
            for key, child in item.items():
                if key == 'email' and isinstance(child, str) and private_email(child):
                    yield 1
                else:
                    yield from walk(child)
        elif isinstance(item, list):
            for child in item:
                yield from walk(child)

    artifacts = value.get('artifacts', {}).get('artifacts', [])
    return {'status': 'metadata_only', 'private_email_occurrences': sum(walk(value)),
            'unreviewed_artifacts': len([a for a in artifacts if not a.get('expired')])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path('.'))
    parser.add_argument('--gitleaks', default=shutil.which('gitleaks'))
    parser.add_argument('--snapshot', action='store_true', help='Inspect HEAD files, not the full history')
    parser.add_argument('--metadata', type=Path, help='Local private GitHub API export, never a credential')
    parser.add_argument('--output', type=Path, default=Path('artifacts/publication-audit.json'))
    parser.add_argument('--require-public', action='store_true', help='Return failure if any publication gate is blocked')
    args = parser.parse_args()
    repo = args.repo.resolve()
    report = inspect_git(repo, args.snapshot)
    report['secrets'] = scan_secrets(repo, args.gitleaks, args.snapshot)
    report['github'] = inspect_metadata(args.metadata)
    blockers = []
    if report['commits_with_private_email']:
        blockers.append('private_email_in_commit_metadata')
    if report['privacy_findings']:
        blockers.append('privacy_or_sensitive_paths_in_source')
    if report['secrets']['status'] != 'complete' or report['secrets']['finding_count']:
        blockers.append('secret_scan_not_clear')
    if report['github']['private_email_occurrences']:
        blockers.append('private_email_in_github_metadata')
    if report['github']['unreviewed_artifacts']:
        blockers.append('github_artifacts_not_reviewed')
    report['blockers'] = blockers
    report['result'] = 'blocked' if blockers else 'passed_within_scope'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({
        'result': report['result'], 'scope': report['scope'], 'commits': report['commits_scanned'],
        'blobs': report['blob_versions_scanned'], 'secret_findings': report['secrets']['finding_count'],
        'privacy_counts': dict(Counter(f['kind'] for f in report['privacy_findings'])),
        'commits_with_private_email': report['commits_with_private_email'], 'blockers': blockers,
        'github_scope': report['github']['status'],
    }, ensure_ascii=False))
    return 1 if args.require_public and blockers else 0


if __name__ == '__main__':
    raise SystemExit(main())
