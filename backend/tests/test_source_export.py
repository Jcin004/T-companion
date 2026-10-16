from io import BytesIO
from pathlib import Path
import subprocess
from zipfile import ZipFile

import pytest
from fastapi import HTTPException

from backend.app import source as source_module


def git(root, *args):
    return subprocess.run(
        ['git', '-C', str(root), *args], check=True,
        capture_output=True, text=True,
    ).stdout


def committed_fixture(root: Path):
    root.mkdir()
    git(root, 'init')
    (root / 'backend').mkdir()
    (root / 'backend' / 'app.py').write_text('# public fixture\n', encoding='utf-8')
    (root / '.env.example').write_text('API_KEY=\n', encoding='utf-8')
    git(root, 'add', '.')
    git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        'commit', '-m', 'isolated source fixture')


def test_source_uses_committed_files_and_omits_runtime_secrets(tmp_path, monkeypatch):
    root = tmp_path / 'repo'
    committed_fixture(root)
    (root / 'backend' / 'private.env').write_text('PRIVATE=fixture-only', encoding='utf-8')
    (root / 'backend' / 'client.pem').write_text('fixture-only', encoding='utf-8')
    (root / 'backend' / 'app.py').write_text('# private uncommitted notes', encoding='utf-8')
    monkeypatch.setattr(source_module, 'ROOT', root)
    result = source_module.source()
    assert result.headers['X-T-Source-Revision'] == git(root, 'rev-parse', 'HEAD').strip()
    with ZipFile(BytesIO(result.body)) as archive:
        assert set(archive.namelist()) >= {'T-chat/.env.example', 'T-chat/backend/app.py'}
        assert not any('private.env' in n or 'client.pem' in n for n in archive.namelist())
        assert archive.read('T-chat/backend/app.py').replace(b'\r\n', b'\n') == b'# public fixture\n'


def test_source_refuses_non_git_installations_and_unrelated_parent_repositories(tmp_path, monkeypatch):
    root = tmp_path / 'repo'
    committed_fixture(root)
    for candidate in (tmp_path, root / 'backend'):
        monkeypatch.setattr(source_module, 'ROOT', candidate)
        with pytest.raises(HTTPException) as error:
            source_module.source()
        assert error.value.status_code == 503
        assert '源码包' in error.value.detail
