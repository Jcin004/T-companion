import asyncio
from httpx import ASGITransport, AsyncClient
from backend.app.main import create_app
from backend.app.storage import ChatStore
from backend.app.contracts import RuntimeResult


class FakeRuntime:
    def __init__(self):
        self.calls = []
    async def run(self, *, user_message, history=()):
        self.calls.append((user_message,tuple(history)))
        return RuntimeResult(response="reply:"+user_message)


def test_sessions_persist_context_and_do_not_merge(tmp_path):
    async def scenario():
        runtime=FakeRuntime()
        app=create_app(runtime=runtime)
        app.state.chat_store=ChatStore(tmp_path/"messages.sqlite")
        async with AsyncClient(transport=ASGITransport(app=app),base_url="http://test") as client:
            first=(await client.post("/api/sessions")).json()["id"]
            second=(await client.post("/api/sessions")).json()["id"]
            r=await client.post(f"/api/sessions/{first}/chat",json={"message":"  hello  "})
            assert r.status_code==200,r.text
            assert r.json()["response"]=="reply:hello"
            assert (await client.get(f"/api/sessions/{first}/messages")).json()[0]["content"]=="hello"
            await client.post(f"/api/sessions/{first}/chat",json={"message":"again"})
            assert [m.content for m in runtime.calls[-1][1]]==["hello","reply:hello"]
            await client.post(f"/api/sessions/{second}/chat",json={"message":"other"})
            assert runtime.calls[-1][1]==()
            assert len(ChatStore(tmp_path/"messages.sqlite").messages(first))==4
            assert (await client.get("/")).status_code==200
            assert (await client.post("/api/sessions/missing/chat",json={"message":"x"})).status_code==404
    asyncio.run(scenario())


def test_no_orphan_turn_after_failure(tmp_path):
    class Broken:
        async def run(self, **kwargs):
            raise RuntimeError("model failed")
    async def scenario():
        app=create_app(runtime=Broken())
        app.state.chat_store=ChatStore(tmp_path/"fails.sqlite")
        async with AsyncClient(transport=ASGITransport(app=app,raise_app_exceptions=False),base_url="http://test") as client:
            sid=(await client.post("/api/sessions")).json()["id"]
            assert (await client.post(f"/api/sessions/{sid}/chat",json={"message":"x"})).status_code==500
            assert (await client.get(f"/api/sessions/{sid}/messages")).json()==[]
    asyncio.run(scenario())
