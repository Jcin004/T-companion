"""Android memory projection over pinned OB. SQLite owns the durable document.

No sockets, model clients, credentials or autonomous jobs. Every operation first
reconciles the caller's validated snapshot, including after a failed SQLite save.
OB files in the app cache are disposable, never a second authoritative vault.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
from pathlib import Path
import sys
import threading
import warnings

os.environ['RAPIDFUZZ_IMPLEMENTATION'] = 'python'
import ombre.src
sys.path.insert(0, next(iter(ombre.src.__path__)))
# The pinned jieba predates Python 3.12's warning for regex string escapes.
# Limit this compatibility filter to loading the unchanged dependency.
with warnings.catch_warnings():
    warnings.filterwarnings('ignore', message=r'invalid escape sequence.*', category=SyntaxWarning)
    warnings.filterwarnings('ignore', message=r'pkg_resources is deprecated as an API.*', category=DeprecationWarning)
    import jieba
from bucket_manager import BucketManager
from ombrebrain.policy.surfacing import SurfacePolicyVM
logging.getLogger('ombre_brain').setLevel(logging.CRITICAL)

PIN = '115d831d979bf67efc7150f976e2cb34c333c935'
_lock = threading.Lock()
_engines = {}


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':')).encode()).hexdigest()


class SnapshotBuckets(BucketManager):
    """Rank by source dates, not the time a disposable index was rebuilt."""
    event_times = None

    def _calc_time_score(self, metadata):
        source_time = (self.event_times or {}).get(metadata.get('id'))
        return super()._calc_time_score({**metadata, **({'last_active': source_time} if source_time else {})})


class Engine:
    def __init__(self, directory):
        # Android /data/data is a symlink to /data/user/0. OB's no-overwrite
        # migration guard compares paths; use one canonical spelling throughout.
        self.root = Path(directory).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.policy = SurfacePolicyVM.default()
        self.managers = {}

    def manager(self, owner):
        if owner not in self.managers:
            path = self.root / fingerprint(owner)
            self.managers[owner] = SnapshotBuckets({
                'buckets_dir': str(path), 'storage': {'external_change_poll_seconds': 0},
                'matching': {'max_results': 36, 'fuzzy_threshold': 50},
            })
        return self.managers[owner]

    async def sync(self, rows):
        if not isinstance(rows, list) or len(rows) > 5000:
            raise ValueError('invalid memory snapshot')
        grouped = {}
        ids = set()
        for row in rows:
            if (not isinstance(row, dict) or not isinstance(row.get('owner_id'), str)
                    or not isinstance(row.get('id'), str) or row['id'] in ids
                    or not isinstance(row.get('content'), str) or not row['content'].strip()
                    or len(row['content']) > 6000 or type(row.get('active')) is not bool):
                raise ValueError('invalid memory record')
            ids.add(row['id'])
            grouped.setdefault(row['owner_id'], []).append(row)
        # Also reconcile removed owners: the map survives for this process; on a
        # fresh process only requested owners can be searched, never orphan dirs.
        for owner in set(grouped) | set(self.managers):
            manager = self.manager(owner)
            manager.event_times = {fingerprint([owner, r['id']])[:24]: r.get('updated_at') or r.get('created_at')
                                   for r in grouped.get(owner, [])}
            existing = {b['id']: b for b in await manager.list_all(include_archive=True)}
            wanted = {}
            changed = False
            for row in grouped.get(owner, []):
                bid = fingerprint([owner, row['id']])[:24]
                wanted[bid] = row
                old = existing.get(bid)
                digest = fingerprint(row)
                if old and not old['metadata'].get('deleted_at') and old['metadata'].get('grow_batch_id') == digest:
                    continue
                if old and old['metadata'].get('deleted_at'):
                    result = await manager.restore_archived(bid)
                    if not result.get('ok'):
                        raise ValueError('OB restore failed')
                if not old:
                    created = await manager.create(row['content'], name=row.get('title') or row['id'],
                                                   bucket_id_override=bid,
                                                   source_tool='t-android', defer_derived_index=True)
                    if created != bid:
                        raise ValueError('OB identifier collision')
                # The snapshot fingerprint includes every evidence reference.
                # Quotes stay untruncated in authoritative SQLite. OB's quotes
                # field has different semantics/limits and is not repurposed.
                updated = await manager.update(bid, content=row['content'],
                    name=row.get('title') or row['id'], title=row.get('title') or '',
                    dont_surface=not row['active'], grow_batch_id=digest)
                if not updated:
                    raise ValueError('OB update failed')
                changed = True
            for bid, old in existing.items():
                if bid not in wanted and not old['metadata'].get('deleted_at'):
                    if not await manager.delete(bid):
                        raise ValueError('OB delete failed')
                    changed = True
            # OB normally builds lazily on a background task. Await its own
            # implementation here so the first query uses the current index.
            if changed or manager._bm25_dirty:
                await manager._rebuild_bm25_async(await manager.list_all())
            if not manager._bm25 or not manager._bm25.available or manager._bm25_dirty:
                raise ValueError('OB BM25 unavailable')
        return {'provider': 'embedded-ob', 'commit': PIN, 'count': len(rows),
                'vector_enabled': False, 'network_requests': 0}

    async def handle(self, request):
        rows = request.get('records')
        status = await self.sync(rows)
        if request.get('action') == 'sync':
            return status
        if request.get('action') != 'recall':
            raise ValueError('unknown memory action')
        owner, queries = request.get('owner'), request.get('queries')
        if not isinstance(owner, str) or not isinstance(queries, list) or len(queries) > 5:
            raise ValueError('invalid recall input')
        manager = self.manager(owner)
        active = {fingerprint([owner, r['id']])[:24]: r['id'] for r in rows
                  if r['owner_id'] == owner and r['active']}
        ranked = []
        for query in queries:
            if not isinstance(query, str) or len(query) > 20000:
                raise ValueError('invalid query')
            found = await manager.search(query, limit=36, allowed_bucket_ids=set(active))
            ranked.append([{'id': active[b['id']], 'score': b['score']} for b in found
                if b['id'] in active and self.policy.evaluate_bucket(b, mode='automatic').allowed])
        return {**status, 'ranked': ranked}


def dispatch(directory, request_json):
    """One serialized Java worker invokes this small JSON-only interface."""
    with _lock:
        if directory not in _engines:
            _engines[directory] = Engine(directory)
        engine = _engines[directory]
        try:
            return json.dumps(asyncio.run(engine.handle(json.loads(request_json))), ensure_ascii=False)
        except Exception:
            # A partly applied projection is never trusted. Reconcile from the
            # next durable snapshot instead of claiming an uncommitted result.
            _engines.pop(directory, None)
            raise
