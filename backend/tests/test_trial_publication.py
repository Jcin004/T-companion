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
    def __init__(self, previous=None, fail_upload=False, hide_draft_tag=False):
        self.calls = []
        self.current = None if previous is None else {'sha': 'old-blob', 'content': base64.b64encode(json.dumps(previous).encode()).decode()}
        self.release = None
        self.fail_upload = fail_upload
        self.hide_draft_tag = hide_draft_tag

    def request(self, method, path, payload=None, binary=False):
        self.calls.append((method, path))
        if method == 'GET':
            if path.startswith('/releases?'):
                return [self.release] if self.release else []
            if self.hide_draft_tag and path.startswith('/releases/tags/'):
                return None
            return self.current if path.startswith('/contents/') else self.release
        if path == '/releases' and method == 'POST':
            self.release = {'id': 1, 'tag_name':payload['tag_name'], 'draft': True, 'assets': [], 'upload_url': 'https://uploads.github.com/test{?name}'}
            return self.release
        if binary:
            if self.fail_upload:
                raise RuntimeError('Fixture upload failed')
            name = publisher.urllib.parse.parse_qs(publisher.urllib.parse.urlsplit(path).query)['name'][0]
            asset = {'id':len(self.release['assets'])+1, 'name': name, 'size': len(payload), 'digest': 'sha256:' + publisher.sha256(payload)}
            self.release['assets'].append(asset)
            return asset
        if method == 'PATCH':
            self.release.update(payload)
        if method == 'DELETE':
            self.release['assets'] = [item for item in self.release['assets'] if str(item['id']) != path.rsplit('/',1)[-1]]
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


def test_retry_recovers_hidden_draft_and_replaces_only_its_failed_asset():
    manifest, assets = bundle()
    api = FakeGitHub(hide_draft_tag=True)
    api.release = {'id':1, 'tag_name':'android-v0.13.2', 'draft':True, 'assets':[{'id':7,'name':'app.apk','size':0,'state':'starter'}], 'upload_url':'https://uploads.github.com/test{?name}'}
    publisher.publish_bundle(api, manifest, 'android-v0.13.2', assets)
    assert ('DELETE','/releases/assets/7') in api.calls
    assert ('POST','/releases') not in api.calls
    assert api.release['draft'] is False


def test_binary_transport_streams_bounded_chunks_with_an_explicit_length(monkeypatch):
    payload = b'fixture' * 10000
    def urlopen(request, timeout):
        assert timeout == 120
        assert request.get_header('Content-length') == str(len(payload))
        assert isinstance(request.data, publisher.UploadStream)
        chunks=[]
        while chunk := request.data.read(8192):
            chunks.append(chunk)
        assert b''.join(chunks) == payload
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return b'{}'
        return Response()
    monkeypatch.setattr(publisher.urllib.request,'urlopen',urlopen)
    api=publisher.GitHub.__new__(publisher.GitHub)
    api.token='synthetic-test-token'
    assert api.request('POST','https://uploads.github.com/test',payload,binary=True) == {}
