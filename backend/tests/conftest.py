"""All application imports and tests use disposable databases, never user history."""
import os
import tempfile
from pathlib import Path

import pytest

_import_data = tempfile.TemporaryDirectory(prefix='t-chat-tests-')
os.environ['T_CHAT_DB'] = str(Path(_import_data.name) / 'import.db')


@pytest.fixture(autouse=True)
def isolated_database(monkeypatch, tmp_path):
    monkeypatch.setenv('T_CHAT_DB', str(tmp_path / 'chat.db'))
