import asyncio
import json
from httpx import ASGITransport, AsyncClient
from backend.app.main import create_app
from backend.tests.test_companion import FakeClient


def test_configurable_history_limits_inherit_validate_and_roundtrip():
    async def run():
        app = create_app()
        fake = FakeClient()
        app.state.model_client = fake
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            await client.patch('/api/v1/settings', json={'model':'mock','api_key':'test-only','history_limit':64})
            sid = (await client.post('/api/v1/contacts', json={'character_id':'primary'})).json()['id']
            store = app.state.chat_store
            for i in range(40):
                store.begin_turn(sid, f'history_{i:04d}', f'问题{i}')
                store.finish_turn(f'history_{i:04d}', f'回复{i}')

            async def send(number, expected):
                response = await client.post(f'/api/v1/contacts/{sid}/stream', json={
                    'message':'本次输入','request_id':f'new_history_{number}','capture_context':True})
                assert 'event: complete' in response.text
                block = next(b for b in response.text.split('\n\n') if b.startswith('event: diagnostic'))
                diagnostic = json.loads(block.split('data: ',1)[1])
                assert diagnostic['history_count'] == expected
                assert len(fake.calls[-1]['messages']) == expected+2
                assert diagnostic['messages'] == fake.calls[-1]['messages']

            await send(1,64)
            await client.patch(f'/api/v1/contacts/{sid}',json={'history_limit':0})
            await client.patch(f'/api/v1/contacts/{sid}',json={'note':'备注'})
            assert store.session(sid)['history_limit'] == 0
            await send(2,0)
            assert len(store.messages(sid)) == 84
            await client.patch(f'/api/v1/contacts/{sid}',json={'history_limit':None})
            await send(3,64)
            for value in [-1,2001,1.5,'30',True]:
                assert (await client.patch('/api/v1/settings',json={'history_limit':value})).status_code == 422
                assert (await client.patch(f'/api/v1/contacts/{sid}',json={'history_limit':value})).status_code == 422
            await client.patch(f'/api/v1/contacts/{sid}',json={'history_limit':7})
            backup = (await client.get('/api/v1/backup')).json()
            assert (await client.post('/api/v1/backup/restore',json=backup)).status_code == 200
            assert store.session(sid)['history_limit'] == 7
            assert store.settings()['history_limit'] == 64
    asyncio.run(run())
