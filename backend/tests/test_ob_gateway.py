"""Gateway contract with an injected reader; no external package, network or keys."""
import asyncio

import httpx
from fastapi import HTTPException

from backend.ob_gateway import create_gateway

TOKEN = "synthetic-gateway-token-only-for-tests"


class Reader:
    def __init__(self):
        self.calls = []

    async def recall(self, query):
        self.calls.append(query)
        if query.character_id != "lin" or query.scope != "daily":
            raise HTTPException(404, "character_scope_not_configured")
        if query.query == "fail":
            raise RuntimeError("PRIVATE_FILE_PATH_AND_SECRET")
        return {"version": 1, "provider": "ombre", "character_id": query.character_id,
                "scope": query.scope, "records": []}


def test_gateway_auth_scope_and_strict_request_contract():
    async def check():
        reader = Reader()
        app = create_gateway(reader, TOKEN)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/v1/health")).status_code == 401
            headers = {"Authorization": "Bearer " + TOKEN}
            assert (await client.get("/v1/health", headers=headers)).json()["read_only"]
            body = {"character_id": "lin", "scope": "daily", "query": "兰花"}
            assert (await client.post("/v1/recall", json=body)).status_code == 401
            assert not reader.calls
            assert (await client.post("/v1/recall", headers=headers, json=body)).status_code == 200
            for changes, status in [({"scope": "story"}, 404), ({"character_id": "yu"}, 404),
                                    ({"vault": "/arbitrary/path"}, 422), ({"limit": 99}, 422),
                                    ({"query": " "}, 422), ({"scope": "unknown"}, 422)]:
                assert (await client.post("/v1/recall", headers=headers, json={**body, **changes})).status_code == status
            failed = await client.post("/v1/recall", headers=headers, json={**body, "query": "fail"})
            assert failed.status_code == 503
            assert "PRIVATE_FILE" not in failed.text
    asyncio.run(check())
