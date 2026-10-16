import json
from pathlib import Path
import subprocess

from scripts.audit_publication import inspect_git, inspect_metadata, sensitive_path


def git(root, *args):
    return subprocess.run(['git', '-C', str(root), *args], check=True, capture_output=True, text=True).stdout


def commit(root, email, message):
    git(root, 'add', '-A')
    git(root, '-c', 'user.name=Fixture', '-c', 'user.email=' + email, 'commit', '-m', message)


def test_removed_private_files_and_author_remain_in_history_without_exposing_values(tmp_path):
    git(tmp_path, 'init')
    (tmp_path / '.env').write_text('KEY=fixture-only', encoding='utf-8')
    (tmp_path / 'notes.md').write_text('https://10.23.45.67:8443', encoding='utf-8')
    commit(tmp_path, 'author@private.test', 'private fixture')
    (tmp_path / '.env').unlink()
    (tmp_path / 'notes.md').write_text('generic setup instructions', encoding='utf-8')
    commit(tmp_path, '123+fixture@users.noreply.github.com', 'clean fixture')

    current = inspect_git(tmp_path, snapshot=True)
    assert current['commits_with_private_email'] == 0
    assert current['privacy_findings'] == []
    history = inspect_git(tmp_path)
    assert history['commits_scanned'] == 2
    assert history['commits_with_private_email'] == 1
    assert {f['kind'] for f in history['privacy_findings']} == {'sensitive_path', 'private_lan_address'}
    text = json.dumps(history)
    assert 'author@private.test' not in text
    assert '10.23.45.67' not in text
    assert 'fixture-only' not in text


def test_github_metadata_counts_old_email_and_unreviewed_artifacts(tmp_path):
    metadata = tmp_path / 'metadata.json'
    metadata.write_text(json.dumps({
        'runs': {'workflow_runs': [{'head_commit': {'author': {'email': 'author@private.test'}}}]},
        'artifacts': {'artifacts': [{'expired': False}, {'expired': True}]},
    }), encoding='utf-8')
    report = inspect_metadata(metadata)
    assert report['private_email_occurrences'] == 1
    assert report['unreviewed_artifacts'] == 1
    assert 'author@private.test' not in json.dumps(report)


def test_sensitive_paths_cover_nested_environment_and_signing_files_without_rejecting_examples():
    for name in ('backend/.env', 'config/.env.production', 'data/chat.db', 'trial.keystore', 'config/client.pem'):
        assert sensitive_path(name)
    for name in ('.env.example', 'config/.env.sample', 'backend/app/config/settings.py'):
        assert not sensitive_path(name)
