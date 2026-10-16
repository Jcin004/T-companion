"""Deterministic browser test backend. Never configure a real provider here."""
import os
import tempfile
from pathlib import Path

root = tempfile.TemporaryDirectory(prefix='t-browser-')
os.environ['T_CHAT_DB'] = str(Path(root.name) / 'chat.db')

from backend.app.main import create_app
from backend.tests.test_companion import FakeClient

app = create_app()
app.state.model_client = FakeClient()
store = app.state.chat_store


def seed():
    with store._connect() as db:
        for table in ('turns','messages','sessions'):
            db.execute(f'DELETE FROM {table}')
        db.execute("DELETE FROM characters WHERE id!='primary'")
    store.save_settings({'api_key':'fake-only', 'model':'mock', 'theme':'light'})
    a = store.save_character({'name':'林间', 'identity':'用于浏览器验收的测试角色', 'style':'温和简短', 'avatar':''})
    b = store.save_character({'name':'远山', 'identity':'另一个独立测试角色', 'style':'直接', 'avatar':''})
    sid = store.create_contact(a['id'])['id']
    store.create_contact(b['id'])
    with store._connect() as db:
        db.executemany("INSERT INTO messages(session_id,role,content,created_at) VALUES(?,?,?,'2026-10-14 16:00:00')", [(sid, 'user' if n%2==0 else 'assistant', f'历史消息 {n:04d}') for n in range(600)])
    app.state.model_client.fail=False


seed()


@app.post('/test/reset')
def reset():
    seed()
    return {'ok':True}


@app.post('/test/fail/{value}')
def fail(value: int):
    app.state.model_client.fail = bool(value)
    return {'ok':True}
