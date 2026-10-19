"""Synthetic acceptance against actual OB code; optionally serve the fixture locally.

Never points at an existing vault. This is not the user's deployment/configuration.
"""
import argparse
import asyncio
import json
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.ob_gateway import OmbreReader, create_gateway

TOKEN = "synthetic-gateway-token-only-for-tests"
ROOT = Path(__file__).resolve().parents[1]


async def seed(reader, fixture):
    for row in fixture["records"]:
        await reader.stores[(row["owner"], row["scope"])].create(
            row["text"], title=row["query"], tags=[row["query"]], test_data=True)
    store = reader.stores[("lin", "daily")]
    hidden = await store.create("青瓷兰花：这条已经消化，不应自动浮现。", tags=["青瓷兰花"], test_data=True)
    await store.update(hidden, digested=True)


async def verify(app, fixture, reader):
    import httpx
    cases = []
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        headers = {"Authorization": "Bearer " + TOKEN}
        for query in fixture["queries"]:
            response = await client.post("/v1/recall", headers=headers, json={
                "character_id": query["owner"], "scope": query["scope"], "query": query["text"]})
            response.raise_for_status()
            records = response.json()["records"]
            actual = [next((r["id"] for r in fixture["records"] if r["text"] == item["content"]),
                           "UNMAPPED") for item in records]
            cases.append({"id": query["id"], "pass": sorted(actual) == sorted(query["expected"]),
                          "actual": actual, "probe": query.get("probe", False)})
            assert all(r["source"]["id"] == r["id"] for r in records)
        rejected = await client.post("/v1/recall", headers=headers, json={
            "character_id": "unknown", "scope": "daily", "query": "兰花"})
        cases.append({"id": "unmapped-character-rejected", "pass": rejected.status_code == 404})
        store = reader.stores[("lin", "daily")]
        target = next(b for b in await store.search("青瓷兰花") if b["content"] == fixture["records"][0]["text"])
        writer = type(store)(dict(store.config))
        await writer.update(target["id"], digested=True)
        changed = await client.post("/v1/recall", headers=headers, json={
            "character_id": "lin", "scope": "daily", "query": "青瓷兰花"})
        cases.append({"id": "external-edit-refreshes-policy-immediately", "pass": changed.status_code == 200 and not changed.json()["records"]})
    report = {"cases": cases, "actual_ob_code": True, "embedding_enabled": False,
              "real_model_called": False, "fixture_only": True}
    (ROOT / "artifacts").mkdir(exist_ok=True)
    (ROOT / "artifacts/ob-gateway-acceptance.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True))
    return int(any(not c["pass"] for c in cases if not c.get("probe")))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--port", type=int, default=8019)
    args = parser.parse_args()
    fixture = json.loads((ROOT / "tests/fixtures/memory-evaluation.json").read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(prefix="ob-gateway-fixture-") as directory:
        bindings = [{"character_id": owner, "scope": scope, "vault": str(Path(directory) / owner / scope)}
                    for owner, scope in sorted({(r["owner"], r["scope"]) for r in fixture["records"]})]
        reader = OmbreReader(args.source, bindings)
        asyncio.run(seed(reader, fixture))
        app = create_gateway(reader, TOKEN, ["http://127.0.0.1:8018", "http://127.0.0.1:8028"])
        if args.serve:
            import uvicorn
            uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
            return 0
        return asyncio.run(verify(app, fixture, reader))


if __name__ == "__main__":
    raise SystemExit(main())
