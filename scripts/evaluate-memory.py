"""Run native memory cores against the same synthetic corpus, without a model API.

Sources are supplied externally; this does not vendor or deploy either project.
Each provider runs in a separate process and uses newly created temporary stores.
Source fingerprints are checked before imports. No user configuration is loaded.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/memory-evaluation.json"
MANIFEST = ROOT / "config/memory-sources.json"
NETWORK_ATTEMPTS = 0


def block_network(*_args, **_kwargs):
    global NETWORK_ATTEMPTS
    NETWORK_ATTEMPTS += 1
    raise RuntimeError("Network disabled in synthetic memory evaluation")


def source_digest(root):
    rows = [(p.relative_to(root).as_posix(), hashlib.sha256(p.read_bytes()).hexdigest())
            for p in sorted((root / "src").rglob("*.py"),
                            key=lambda p: p.relative_to(root).as_posix())]
    return hashlib.sha256(json.dumps(rows, separators=(",", ":")).encode()).hexdigest()


def snapshot(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in root.rglob("*") if p.is_file()}


async def evaluate(provider, source):
    socket.socket.connect = block_network
    socket.create_connection = block_network
    pins = json.loads(MANIFEST.read_text(encoding="utf-8"))[provider]
    if source_digest(source) != pins["python_source_tree_sha256"]:
        raise ValueError(f"Python source tree fingerprint mismatch: {provider}")
    for name, expected in pins["files"].items():
        actual = hashlib.sha256((source / name).read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f"Source fingerprint mismatch: {provider}/{name}")
    sys.path.insert(0, str(source / "src"))
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    cases, stores, record_ids = [], {}, {}
    with tempfile.TemporaryDirectory(prefix="memory-corpus-") as directory:
        root = Path(directory)
        if provider == "latent":
            from memory_retrieval import append_record, load_corpus

            def make(path):
                return load_corpus(str(path))

            def create(path, row):
                append_record(str(path), row["text"], row["state"], now=1792339200)

            async def search(store, query):
                rows = store.retrieve_candidates(query, topN=4)
                return [r["text"] for r in rows]
        else:
            from bucket_manager import BucketManager

            def make(path):
                return BucketManager({"buckets_dir": str(path), "embedding": {"enabled": False},
                                      "wikilink": {"enabled": False}})

            async def search(store, query):
                rows = await store.search(query, limit=4)
                return [r["content"] for r in rows]

        for row in fixture["records"]:
            key = row["owner"] + "/" + row["scope"]
            path = root / key
            path.mkdir(parents=True, exist_ok=True)
            if provider == "latent":
                create(path, row)
            else:
                if key not in stores:
                    stores[key] = make(path)
                store = stores[key]
                record_ids[row["id"]] = await store.create(
                    row["text"], title=row["query"], tags=[row["query"]], test_data=True)
        for row in fixture["records"]:
            key = row["owner"] + "/" + row["scope"]
            stores[key] = make(root / key)

        async def select(q):
            store = stores[q["owner"] + "/" + q["scope"]]
            texts = await search(store, q["text"])
            # Unknown results remain visible and fail the comparison.
            return [next((r["id"] for r in fixture["records"] if r["text"] in text),
                         "UNMAPPED") for text in texts]

        before = snapshot(root)
        timings = []
        for query in fixture["queries"]:
            start = time.perf_counter()
            actual = await select(query)
            timings.append(round((time.perf_counter() - start) * 1000, 2))
            cases.append({"id": query["id"], "expected": query["expected"], "actual": actual,
                          "pass": sorted(actual) == sorted(query["expected"]),
                          "probe": query.get("probe", False)})
        cases.append({"id": "query-files-unchanged", "pass": snapshot(root) == before})
        first = fixture["queries"][0]
        stores["lin/daily"] = make(root / "lin/daily")
        cases.append({"id": "reload-from-disk", "pass": "orchid" in await select(first)})
        if provider == "latent":
            index = stores["lin/daily"]
            weights = list(index.weights)
            await select(first)
            cases.append({"id": "passive-candidate-weights-unchanged", "pass": index.weights == weights})
            index.retract(fixture["records"][0]["text"], "Synthetic correction", now=1792425600)
        else:
            await stores["lin/daily"].update(record_ids["orchid"], dont_surface=True)
            # Explicit search intentionally still reaches dont_surface records in OB.
            cases.append({"id": "explicit-search-after-dont-surface", "pass": "orchid" in await select(first)})
            await stores["lin/daily"].delete(record_ids["orchid"])
        cases.append({"id": "retracted-or-archived-excluded", "pass": "orchid" not in await select(first)})
        cases.append({"id": "no-network-attempts", "pass": NETWORK_ATTEMPTS == 0})
        return {"provider": provider, "commit": pins["commit"], "cases": cases,
                "mode": "native core; no embedding; separate corpus per owner and scope",
                "isolation_owner": "evaluation host routing, not native permissions",
                "network": "blocked", "network_attempts": NETWORK_ATTEMPTS,
                "model_quality_tested": False,
                "query_ms": timings}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--latent-source", type=Path)
    parser.add_argument("--ombre-source", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--worker", choices=["latent", "ombre"])
    parser.add_argument("--source", type=Path)
    args = parser.parse_args()
    if args.worker:
        result = asyncio.run(evaluate(args.worker, args.source.resolve()))
        print(json.dumps(result, ensure_ascii=True))
        return int(any(not c["pass"] for c in result["cases"] if not c.get("probe")))
    results = []
    jobs = [("current-local", ["node", str(ROOT / "scripts/evaluate-local-memory.mjs")])]
    for provider, source in [("latent", args.latent_source), ("ombre", args.ombre_source)]:
        if source:
            jobs.append((provider, [sys.executable, "-X", "utf8", str(Path(__file__).resolve()),
                                    "--worker", provider, "--source", str(source.resolve())]))
    for provider, command in jobs:
        # Strip inherited credentials/configuration; never load an upstream user's .env.
        env = {k: v for k, v in os.environ.items()
               if not k.upper().startswith(("LATENT_", "MEMORY_", "OMBRE_", "OPENAI_", "HOST_API_"))}
        env["PYTHONIOENCODING"] = "utf-8"
        try:
            with tempfile.TemporaryDirectory(prefix="memory-worker-") as cwd:
                run = subprocess.run(command, cwd=cwd, env=env, capture_output=True,
                                     encoding="utf-8", timeout=120)
            if not run.stdout.strip():
                raise RuntimeError(run.stderr[-2500:])
            result = json.loads(run.stdout.strip().splitlines()[-1])
            result["exit_code"] = run.returncode
        except (RuntimeError, ValueError, subprocess.TimeoutExpired) as exc:
            result = {"provider": provider, "error": str(exc), "exit_code": 1}
        results.append(result)
        passed = sum(c["pass"] for c in result.get("cases", []) if not c.get("probe"))
        print(f"{provider}: {passed} required cases passed; exit={result['exit_code']}")
        if "error" in result:
            print(result["error"])
    report = {"fixture_version": 1, "results": results, "real_model_tested": False}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return int(any(r["exit_code"] != 0 for r in results))


if __name__ == "__main__":
    raise SystemExit(main())
