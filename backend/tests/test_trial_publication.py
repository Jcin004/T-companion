"""No GitHub access: verify publication ordering, retries and feed isolation."""
import base64
import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location('publish_trial', Path(__file__).resolve().parents[2] / 'scripts/publish-trial.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class FakeGitHub:
    def __init__(self, previous=None, fail_upload=False):
        self.calls = []
        self.current = None if previous is None else {'sha': 'old-blob', 'content': base64.b64encode(json.dumps(previous).encode()).decode()}
        self.release = None
        self.fail_upload = fail_upload

    def request(self, method, path, payload=None, binary=False):
        self.calls.append((method, path))
        if method == 'GET':
            return self.current if path.startswith('/contents/') else self.release
        if path == '/releases' and method == 'POST':
            self.release = {'id': 1, 'draft': True, 'assets': [], 'upload_url': 'https://uploads.github.com/test{?name}'}
            return self.release
        if binary:
            if self.fail_upload:
                raise RuntimeError('Fixture upload failed')
            name = publisher.urllib.parse.parse_qs(publisher.urllib.parse.urlsplit(path).query)['name'][0]
            asset = {'name': name, 'size': len(payload), 'digest': 'sha256:' + publisher.sha256(payload)}
            self.release['assets'].append(asset)
            return asset
        if method == 'PATCH':
            self.release['draft'] = False
        if method == 'PUT':
            self.current = payload


def bundle(code=20):
    manifest = {'versionCode': code, 'versionName': '0.13.2-trial', 'sha256': 'apk-digest', 'sourceCommit': 'a' * 40}
    return manifest, {'app.apk': b'apk-fixture', 'source.zip': b'source-fixture', 't-update.json': json.dumps(manifest).encode()}


def test_only_advance_feed_after_every_asset_is_uploaded_and_release_is_public():
    manifest, assets = bundle()
    api = FakeGitHub(previous={'versionCode': 9})
    publisher.publish_bundle(api, manifest, 'android-v0.13.2', assets)
    mutations = [(method, path) for method, path in api.calls if method != 'GET']
    assert [method for method, _ in mutations] == ['POST', 'POST', 'POST', 'POST', 'PATCH', 'PUT']
    assert json.loads(base64.b64decode(api.current['content'])) == manifest
    count = len(api.calls)
    publisher.publish_bundle(api, manifest, 'android-v0.13.2', assets)
    assert all(method == 'GET' for method, _ in api.calls[count:])


def test_upload_failure_keeps_draft_and_existing_feed():
    manifest, assets = bundle()
    api = FakeGitHub(previous={'versionCode': 9}, fail_upload=True)
    with pytest.raises(RuntimeError, match='upload failed'):
        publisher.publish_bundle(api, manifest, 'android-v0.13.2', assets)
    assert api.release['draft'] is True
    assert json.loads(base64.b64decode(api.current['content'])) == {'versionCode': 9}
    assert not any(method in {'PATCH', 'PUT'} for method, _ in api.calls)


@pytest.mark.parametrize('previous', [
    {'versionCode': 21},
    {'versionCode': 20, 'sha256': 'different-apk', 'sourceCommit': 'a' * 40},
])
def test_reject_downgrade_and_reuse_of_a_version_for_different_content(previous):
    manifest, assets = bundle()
    api = FakeGitHub(previous=previous)
    with pytest.raises(ValueError):
        publisher.publish_bundle(api, manifest, 'android-v0.13.2', assets)
    assert all(method == 'GET' for method, _ in api.calls)
