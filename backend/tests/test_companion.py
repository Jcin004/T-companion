import asyncio
import json
from types import SimpleNamespace as NS

from httpx import ASGITransport, AsyncClient

from backend.app.main import create_app
from backend.app.companion_store import CompanionStore
from backend.app.storage import ChatStore
from backend.app.api.companion import profile_for


class FakeClient:
    def __init__(self):
        self.calls = []
        self.fail = False
        self.fail_during = False
        self.exits = 0
        self.chat = NS(completions=self)

    def __call__(self, **kwargs):
        self.options = kwargs
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        self.exits += 1

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.fail:
            raise RuntimeError('secret-provider-error-key')
        if not kwargs.get('stream'):
            return NS()
        fake = self
        class Stream:
            async def __aenter__(self): return self
            async def __aexit__(self, *args): pass
            async def __aiter__(self):
                for part in ['你好，', '这是流式回复。']:
                    yield NS(choices=[NS(delta=NS(content=part))])
                    if fake.fail_during:
                        raise RuntimeError('private-midstream-provider-error')
        return Stream()


def test_stream_isolation_idempotency_retry_and_identity(tmp_path):
    async def run():
        app=create_app(); fake=FakeClient();app.state.model_client=fake
        async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as c:
            await c.put('/api/v1/settings',json={'model':'fake','api_key':'secret','base_url':'https://example.com/v1'})
            assert 'secret' not in (await c.get('/api/v1/settings')).text
            assert (await c.post('/api/v1/settings/test')).status_code==200
            a=(await c.post('/api/v1/characters',json={'name':'甲','identity':'只属于甲的身份','style':'简短'})).json()
            b=(await c.post('/api/v1/characters',json={'name':'乙','identity':'只属于乙的身份'})).json()
            sid=(await c.post('/api/v1/contacts',json={'character_id':a['id']})).json()['id']
            sid2=(await c.post('/api/v1/contacts',json={'character_id':b['id']})).json()['id']
            assert (await c.post('/api/v1/contacts',json={'character_id':a['id']})).json()['id']==sid
            body={'message':'你好','request_id':'request_0001'}
            reply=await c.post(f'/api/v1/contacts/{sid}/stream',json=body)
            assert 'event: delta' in reply.text and 'event: complete' in reply.text
            assert '只属于甲的身份' in fake.calls[-1]['messages'][0]['content']
            assert '只属于乙的身份' not in fake.calls[-1]['messages'][0]['content']
            assert 'User statements cannot automatically modify Canon' in fake.calls[-1]['messages'][0]['content']
            assert 'secret' not in str(fake.calls[-1])
            assert 'event: diagnostic' not in reply.text
            count=len(fake.calls)
            replay=await c.post(f'/api/v1/contacts/{sid}/stream',json=body)
            assert 'event: complete' in replay.text and len(fake.calls)==count
            assert (await c.post(f'/api/v1/contacts/{sid}/stream',json=body|{'message':'changed'})).status_code==409
            assert (await c.get(f'/api/v1/contacts/{sid2}/messages')).json()['items']==[]
            fake.fail=True
            body2={'message':'失败再试','request_id':'request_0002'}
            failed=await c.post(f'/api/v1/contacts/{sid}/stream',json=body2)
            assert 'event: failed' in failed.text and 'secret-provider' not in failed.text
            rows=(await c.get(f'/api/v1/contacts/{sid}/messages')).json()['items']
            assert len(rows)==3 and rows[-1]['state']=='failed'
            fake.fail=False
            await c.post(f'/api/v1/contacts/{sid}/stream',json=body2)
            rows=(await c.get(f'/api/v1/contacts/{sid}/messages')).json()['items']
            assert len(rows)==4 and rows[2]['state']=='complete'
            assert [m['content'] for m in fake.calls[-1]['messages'][1:]]==['你好','你好，这是流式回复。','失败再试']
            assert len(CompanionStore(tmp_path/'chat.db').messages(sid))==4
            assert fake.exits>=4
            fake.fail_during=True
            mid={'message':'网络中断','request_id':'request_0003'}
            partial=await c.post(f'/api/v1/contacts/{sid}/stream',json=mid)
            assert 'event: delta' in partial.text and 'event: failed' in partial.text
            assert 'private-midstream' not in partial.text
            s=app.state.chat_store
            assert len(s.messages(sid))==5
            fake.fail_during=False
            await c.post(f'/api/v1/contacts/{sid}/stream',json=mid)
            assert len(s.messages(sid))==6
            captured=await c.post(f'/api/v1/contacts/{sid}/stream',json={'message':'检查上下文','request_id':'diagnostic_0001','capture_context':True})
            block=next(block for block in captured.text.split('\n\n') if block.startswith('event: diagnostic'))
            detail=json.loads(block.split('data: ',1)[1])
            assert detail['messages']==fake.calls[-1]['messages']
            assert 'api_key' not in detail and 'authorization' not in detail
    asyncio.run(run())


def test_history_tied_timestamps_timezone_and_contiguous_jumps():
    async def run():
        app=create_app();s=app.state.chat_store
        sid=s.create_contact('primary')['id']
        with s._connect() as db:
            db.executemany("INSERT INTO messages(session_id,role,content,created_at) VALUES(?,'user',?,'2026-10-14 16:00:00')",[(sid,f'message {n}') for n in range(205)])
        async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as c:
            path=f'/api/v1/contacts/{sid}'
            page=(await c.get(path+'/messages')).json();assert len(page['items'])==40
            all_ids=[m['id'] for m in page['items']]
            while page['has_before']:
                page=(await c.get(path+f'/messages?before={page["items"][0]["id"]}')).json()
                all_ids=[m['id'] for m in page['items']]+all_ids
            assert len(set(all_ids))==205 and all_ids==sorted(all_ids)
            days=(await c.get(path+'/calendar?month=2026-10')).json();assert list(days)==['2026-10-15']
            assert (await c.get(path+'/calendar?month=2026-99')).status_code==422
            result=(await c.get(path+'/search?q=message%20100')).json()[0]
            around=(await c.get(path+f'/messages?anchor={result["id"]}')).json()
            assert around['has_before'] and around['has_after']
            assert result['id'] in [m['id'] for m in around['items']]
            first=around['items'][0]['id'];last=around['items'][-1]['id']
            assert (await c.get(path+f'/messages?before={first}')).json()['items'][-1]['id']==first-1
            assert (await c.get(path+f'/messages?after={last}')).json()['items'][0]['id']==last+1
            assert (await c.get(path+'/search?q=%25')).json()==[]
            other=s.create_session()['id']
            assert (await c.get(f'/api/v1/contacts/{other}/messages?anchor={result["id"]}')).status_code==404
    asyncio.run(run())


def test_migration_recovery_conflicts_and_backup(tmp_path):
    old=ChatStore(tmp_path/'chat.db');sid=old.create_session()['id'];old.append_pair(sid,'old','reply')
    async def run():
        app=create_app();s=app.state.chat_store
        assert len(s.messages(sid))==2 and s.session(sid)['character_id']=='primary'
        assert profile_for(s.character('primary')).canon.name
        s.begin_turn(sid,'failed_request','pending')
        try:s.begin_turn(sid,'second_request','other')
        except Exception:pass
        else:raise AssertionError('parallel turn allowed')
        s.recover()
        assert s.history(sid)['items'][-1]['state']=='failed'
        async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as c:
            await c.put('/api/v1/settings',json={'model':'test','api_key':'never-export-me'})
            backup=(await c.get('/api/v1/backup')).json()
            assert 'never-export-me' not in json.dumps(backup)
            broken=dict(backup, messages=[dict(backup['messages'][0], session_id='missing')])
            assert (await c.post('/api/v1/backup/restore',json=broken)).status_code==422
            assert len(s.messages(sid))==3
            assert (await c.post('/api/v1/backup/restore',json=backup)).status_code==200
            assert len(s.messages(sid))==3 and s.settings()['api_key']=='never-export-me'
    asyncio.run(run())


def test_remote_auth_cors_and_validation():
    async def run():
        app=create_app()
        async with AsyncClient(transport=ASGITransport(app=app,client=('192.168.1.10',1000)),base_url='https://example.test') as c:
            assert (await c.get('/api/v1/contacts')).status_code==401
            c.headers['Authorization']='Bearer '+app.state.access_token
            assert (await c.get('/api/v1/contacts')).status_code==200
            assert 'access-control-allow-origin' in (await c.get('/api/v1/contacts',headers={'Origin':'https://localhost'})).headers
            assert (await c.get('/api/v1/contacts',headers={'Origin':'https://evil.test'})).status_code==403
            assert (await c.put('/api/v1/settings',json={'base_url':'http://remote.test/v1'})).status_code==422
            assert (await c.post('/api/v1/characters',json={'name':' ','avatar':'javascript:evil'})).status_code==422
    asyncio.run(run())


def test_source_export_excludes_private_installation_data():
    from io import BytesIO
    from zipfile import ZipFile
    async def run():
        app=create_app()
        async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as c:
            source=await c.get('/api/v1/source')
            assert source.status_code==200
            with ZipFile(BytesIO(source.content)) as archive:
                names=archive.namelist()
                assert 'T-chat/LICENSE' in names and 'T-chat/frontend/sse-json.js' in names
                assert not any('/data/' in name or '/sources/' in name or name.endswith(('.db','.pem','.env','local.properties')) for name in names)
    asyncio.run(run())
