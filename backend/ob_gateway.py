"""Optional read-only gateway over an externally installed, pinned Ombre-Brain.

No chat synchronization, memory writes, or model credentials are owned here.
Run with: uvicorn backend.ob_gateway:from_env --factory --host 127.0.0.1 --port 8019
"""
from __future__ import annotations

import hashlib
import importlib
import json
import os
from pathlib import Path
import re
import secrets
import sys
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field


class RecallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    character_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    scope: Literal["daily", "story"]
    query: str = Field(min_length=1, max_length=2000)
    limit: int = Field(default=4, ge=1, le=12)
    budget: int = Field(default=2000, ge=500, le=6000)


class OmbreReader:
    """Reuse OB's canonical Markdown reader, ranking and automatic surface policy."""

    def __init__(self, source: Path, bindings: list[dict]):
        source = source.resolve()
        pins = json.loads((Path(__file__).parents[1] / "config/memory-sources.json").read_text())["ombre"]
        for name, expected in pins["files"].items():
            if hashlib.sha256((source / name).read_bytes()).hexdigest() != expected:
                raise ValueError("OB entrypoint/license fingerprint mismatch")
        rows = [(p.relative_to(source).as_posix(), hashlib.sha256(p.read_bytes()).hexdigest())
                for p in sorted((source / "src").rglob("*.py"), key=lambda p: p.relative_to(source).as_posix())]
        if hashlib.sha256(json.dumps(rows, separators=(",", ":")).encode()).hexdigest() != pins["python_source_tree_sha256"]:
            raise ValueError("OB source does not match the evaluated commit")
        # Run this gateway in its own process/venv, not inside the chat backend.
        sys.path.insert(0, str(source / "src"))
        bucket_module = importlib.import_module("bucket_manager")
        if Path(bucket_module.__file__).resolve().parent != source / "src":
            raise ValueError("OB gateway requires its own clean Python process")
        policy_module = importlib.import_module("ombrebrain.policy.surfacing")
        self.policy = policy_module.SurfacePolicyVM.default()
        self.stores = {}
        vaults = []
        for binding in bindings:
            key = (binding["character_id"], binding["scope"])
            vault = Path(binding["vault"]).resolve()
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", key[0]) or key[1] not in {"daily", "story"}:
                raise ValueError("Invalid character/scope binding")
            if key in self.stores or any(vault == p or vault in p.parents or p in vault.parents for p in vaults):
                raise ValueError("Each character/scope needs a distinct, non-overlapping vault")
            vaults.append(vault)
            self.stores[key] = bucket_module.BucketManager({
                "buckets_dir": str(vault), "embedding": {"enabled": False},
                "wikilink": {"enabled": False},
                "storage": {"external_change_poll_seconds": 0},
            })

    async def recall(self, request: RecallRequest):
        store = self.stores.get((request.character_id, request.scope))
        if store is None:
            raise HTTPException(404, "character_scope_not_configured")
        candidates = await store.search(request.query.strip(), limit=36, include_archive=False)
        records, used, seen = [], 0, set()
        for bucket in candidates:
            metadata = bucket.get("metadata") or {}
            if metadata.get("type") in {"feel", "plan", "letter", "self", "i"}:
                continue  # Dedicated private channels are not ordinary chat recall.
            if not self.policy.evaluate_bucket(bucket, mode="automatic").allowed:
                continue
            item = {"id": str(bucket["id"]), "content": bucket["content"],
                    "source": {"kind": "ob_bucket", "id": str(bucket["id"])}}
            size = len(json.dumps(item, ensure_ascii=False, separators=(",", ":")))
            if item["id"] in seen or used + size > request.budget:
                continue  # Whole records only, never truncate evidence.
            records.append(item)
            used += size
            seen.add(item["id"])
            if len(records) >= request.limit:
                break
        return {"version": 1, "provider": "ombre", "character_id": request.character_id,
                "scope": request.scope, "records": records,
                "method": "ob-keyword-bm25", "vector_enabled": False}


def create_gateway(reader, token: str, origins=()):
    if len(token) < 24:
        raise ValueError("Gateway token must contain at least 24 characters")
    app = FastAPI(title="T- optional OB memory gateway", docs_url=None, redoc_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=list(origins),
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type", "Authorization"])

    def authorize(authorization):
        if not authorization or not secrets.compare_digest(authorization.encode(), ("Bearer " + token).encode()):
            raise HTTPException(401, "unauthorized")

    @app.get("/v1/health")
    async def health(authorization: str | None = Header(default=None)):
        authorize(authorization)
        return {"version": 1, "provider": "ombre", "read_only": True, "vector_enabled": False}

    @app.post("/v1/recall")
    async def recall(request: RecallRequest, authorization: str | None = Header(default=None)):
        authorize(authorization)
        if not request.query.strip():
            raise HTTPException(422, "empty_query")
        try:
            return await reader.recall(request)
        except HTTPException:
            raise
        except Exception:
            # Do not return provider errors containing paths, memory or credentials.
            raise HTTPException(503, "memory_unavailable") from None

    return app


def from_env():
    config = json.loads(Path(os.environ["T_OB_GATEWAY_CONFIG"]).read_text(encoding="utf-8"))
    reader = OmbreReader(Path(config["source_dir"]), config["bindings"])
    return create_gateway(reader, os.environ.get("T_OB_GATEWAY_TOKEN", ""), config.get("origins", []))
