"""Real pinned OB core, synthetic records only. No server or model calls."""
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'vendor/python'), str(ROOT / 'android/app/src/main/python')]
import t_memory


def record(id='orchid', owner='alice', content='用户说紫色兰花的花盆裂了'):
    return dict(id=id, owner_id=owner, title=content, content=content, kind='statement',
                active=True, evidence=[dict(message_id=1, quote=content)], revision=0,
                created_at='2026-01-01T00:00:00Z', updated_at='2026-01-01T00:00:00Z')


def call(path, rows, query='兰花', owner='alice'):
    return json.loads(t_memory.dispatch(str(path), json.dumps(dict(action='recall', records=rows,
                                  owner=owner, queries=[query]), ensure_ascii=False)))


def test_real_ob_crud_restart_sources_and_disposable_cache(tmp_path):
    row = record()
    result = call(tmp_path, [row])
    assert result['ranked'][0][0]['id'] == 'orchid'
    assert result['network_requests'] == 0 and not result['vector_enabled']
    files = list(tmp_path.rglob('*.md'))
    assert files and t_memory.fingerprint(row) in files[0].read_text(encoding='utf-8')
    assert row['evidence'] == [dict(message_id=1, quote=row['content'])]
    t_memory._engines.clear()  # Simulate process death; real OB files stay.
    assert call(tmp_path, [row])['ranked'][0][0]['id'] == 'orchid'
    row['content'] = row['title'] = '用户说快递还没到'
    row['revision'] += 1
    assert call(tmp_path, [row], '快递')['ranked'][0][0]['id'] == 'orchid'
    row['active'] = False
    assert call(tmp_path, [row], '快递')['ranked'] == [[]]
    row['active'] = True
    assert call(tmp_path, [row], '快递')['ranked'][0]
    assert call(tmp_path, [], '快递')['ranked'] == [[]]
    # Restoring a backup can restore a previously deleted ID, with no duplicate.
    assert len(call(tmp_path, [row], '快递')['ranked'][0]) == 1


def test_same_names_do_not_grant_cross_person_knowledge(tmp_path):
    rows = [record(), record('secret', 'bob', '秘密兰花在保险箱里')]
    assert [r['id'] for r in call(tmp_path, rows)['ranked'][0]] == ['orchid']
    assert call(tmp_path, rows, owner='nobody')['ranked'] == [[]]
    assert [r['id'] for r in call(tmp_path, rows, owner='bob')['ranked'][0]] == ['secret']


def test_failed_apply_and_uncommitted_snapshot_are_reconciled(tmp_path, monkeypatch):
    row = record(); call(tmp_path, [row])
    engine = t_memory._engines[str(tmp_path)]
    async def fail(*a, **kw):
        raise OSError('synthetic full disk')
    monkeypatch.setattr(engine.manager('alice'), 'update', fail)
    changed = {**row, 'content': '快递到了', 'title': '快递'}
    with pytest.raises(OSError):
        call(tmp_path, [changed], '快递')
    assert str(tmp_path) not in t_memory._engines
    assert call(tmp_path, [row])['ranked'][0][0]['id'] == 'orchid'
    call(tmp_path, [changed], '快递')  # Projection succeeds but SQLite hypothetically fails.
    assert call(tmp_path, [row])['ranked'][0][0]['id'] == 'orchid'


def test_actual_rapidfuzz_python_and_bm25_chinese_are_enabled(tmp_path):
    from rapidfuzz import fuzz
    from rapidfuzz.fuzz_py import partial_ratio
    from bm25_index import _JIEBA_AVAILABLE
    assert fuzz.partial_ratio is partial_ratio
    assert _JIEBA_AVAILABLE
    # BM25Okapi intentionally yields no positive IDF for a one-document corpus.
    call(tmp_path, [record(), record('parcel', content='快递还没到'), record('museum', content='下周参观博物馆')])
    manager = t_memory._engines[str(tmp_path)].manager('alice')
    assert manager._bm25.available and not manager._bm25_dirty
    assert manager._bm25.score('紫色')


def test_invalid_snapshots_do_not_escape_app_owned_directory(tmp_path):
    assert t_memory.Engine(tmp_path / 'alias' / '..' / 'cache').root == tmp_path / 'cache'
    with pytest.raises(ValueError):
        call(tmp_path, [record(), record()])
    row = record(owner='../../outside')
    assert call(tmp_path, [row], owner='../../outside')['ranked'][0]
    assert all(p.is_relative_to(tmp_path) for p in tmp_path.rglob('*'))
