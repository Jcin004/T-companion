"""Shared web/Android API. Credentials never enter chat context or responses."""
import asyncio
import json
import re
import sqlite3
from typing import Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from backend.app.agent_runtime.runtime import BASE_RUNTIME_INVARIANTS
from backend.app.contracts import CanonData, PersonaData, CharacterProfile
from backend.app.context.builder import ContextBuilder

router = APIRouter(prefix='/api/v1', tags=['companion'])


class CharacterInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    avatar: str = Field(default='', max_length=600000)
    identity: str = Field(default='', max_length=20000)
    style: str = Field(default='', max_length=10000)

    @field_validator('name')
    @classmethod
    def name_not_blank(cls, value):
        if not value.strip():
            raise ValueError('名称不能为空')
        return value.strip()

    @field_validator('avatar')
    @classmethod
    def safe_avatar(cls, value):
        if value and not re.fullmatch(r'data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+', value):
            raise ValueError('请选择 PNG、JPEG 或 WebP 图片')
        return value


class Preferences(BaseModel):
    history_limit: int = Field(default=30, ge=0, le=2000, strict=True)
    base_url: str = Field(default='https://api.openai.com/v1', max_length=2000)
    model: str = Field(default='', max_length=200)
    api_key: str | None = Field(default=None, max_length=4000)
    theme: Literal['light', 'dark'] = 'light'
    font_size: int = Field(default=16, ge=12, le=24)
    voice: str = Field(default='', max_length=500)
    timezone: str = 'Asia/Shanghai'

    @field_validator('base_url')
    @classmethod
    def safe_url(cls, value):
        parts = urlsplit(value)
        if parts.scheme not in ('https', 'http') or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
            raise ValueError('服务地址格式错误')
        if parts.scheme == 'http' and parts.hostname not in ('localhost', '127.0.0.1', '::1'):
            raise ValueError('远程模型服务必须使用 HTTPS')
        return value.rstrip('/')

    @field_validator('timezone')
    @classmethod
    def valid_zone(cls, value):
        try:
            ZoneInfo(value)
        except (ValueError, ZoneInfoNotFoundError):
            raise ValueError('无效时区')
        return value


class ContactInput(BaseModel):
    character_id: str


class Details(BaseModel):
    history_limit: int | None = Field(default=None, ge=0, le=2000, strict=True)
    note: str = Field(default='', max_length=100)
    background: str = '#eef2f3'
    voice: str = Field(default='', max_length=500)

    @field_validator('background')
    @classmethod
    def color(cls, value):
        if not re.fullmatch('#[0-9a-fA-F]{6}', value):
            raise ValueError('背景应为颜色值')
        return value


class SendInput(BaseModel):
    capture_context: bool = False
    request_id: str = Field(min_length=8, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')
    message: str = Field(min_length=1, max_length=20000)


def store(request):
    return request.app.state.chat_store


def contact(request, sid):
    result = store(request).session(sid)
    if not result:
        raise HTTPException(404, '会话不存在')
    return result


@router.get('/health')
def health():
    return {'ok': True, 'app': 'T-', 'version': 1}


@router.get('/characters')
def characters(request: Request):
    return store(request).characters()


@router.post('/characters', status_code=201)
def create_character(payload: CharacterInput, request: Request):
    return store(request).save_character(payload.model_dump())


@router.put('/characters/{cid}')
def edit_character(cid: str, payload: CharacterInput, request: Request):
    if not store(request).character(cid):
        raise HTTPException(404, '角色不存在')
    return store(request).save_character(payload.model_dump(), cid)


@router.get('/settings')
def settings(request: Request):
    return store(request).settings(public=True)


@router.put('/settings')
@router.patch('/settings')
def save_settings(payload: Preferences, request: Request):
    return store(request).save_settings(payload.model_dump(exclude_none=True, exclude_unset=True))


def model_options(request):
    options = store(request).settings()
    if not options['api_key'] or not options['model'].strip():
        raise HTTPException(503, '请先在设置中保存模型名和密钥')
    return options


@router.post('/settings/test')
async def test_model(request: Request):
    options = model_options(request)
    try:
        async with request.app.state.model_client(api_key=options['api_key'], base_url=options['base_url'], timeout=20, max_retries=0) as client:
            await client.chat.completions.create(model=options['model'], messages=[{'role': 'user', 'content': 'Reply OK'}], max_tokens=4)
    except Exception:
        raise HTTPException(502, '连接测试失败，请检查服务地址、密钥和模型名')
    return {'ok': True}


@router.get('/contacts')
def contacts(request: Request):
    return store(request).contacts()


@router.post('/contacts')
def create_contact(payload: ContactInput, request: Request):
    if not store(request).character(payload.character_id):
        raise HTTPException(404, '角色不存在')
    return store(request).create_contact(payload.character_id)


@router.patch('/contacts/{sid}')
def details(sid: str, payload: Details, request: Request):
    contact(request, sid)
    return store(request).patch_session(sid, payload.model_dump(exclude_unset=True))


@router.get('/contacts/{sid}/messages')
def messages(sid: str, request: Request, before: int | None = Query(None, ge=1), after: int | None = Query(None, ge=0), anchor: int | None = Query(None, ge=1), limit: int = Query(40, ge=10, le=100)):
    contact(request, sid)
    if sum(x is not None for x in (before, after, anchor)) > 1:
        raise HTTPException(422, '只能使用一个游标')
    try:
        return store(request).history(sid, before, after, anchor, limit)
    except KeyError:
        raise HTTPException(404, '消息不存在')


@router.get('/contacts/{sid}/search')
def search(sid: str, request: Request, q: str = Query(min_length=1, max_length=200), before: int = Query(9223372036854775807, ge=1)):
    contact(request, sid)
    return store(request).search(sid, q, before)


@router.get('/contacts/{sid}/calendar')
def calendar(sid: str, request: Request, month: str = Query(pattern=r'^\d{4}-\d{2}$')):
    contact(request, sid)
    try:
        return store(request).calendar(sid, month, store(request).settings()['timezone'])
    except ValueError:
        raise HTTPException(422, '无效月份')


def profile_for(data):
    if 'profile' in data:
        return CharacterProfile(CanonData(**data['profile']['canon']), PersonaData(**data['profile']['persona']))
    return CharacterProfile(CanonData(schema_version=1, character_id=data['id'], name=data['name'],
        nature='UNSPECIFIED', source_world='UNSPECIFIED', description=data['identity'] or 'UNSPECIFIED'),
        PersonaData(schema_version=1, communication_style=(data['style'],) if data['style'] else ()))


def event(kind, data):
    return f'event: {kind}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n'


@router.post('/contacts/{sid}/stream')
async def stream(sid: str, payload: SendInput, request: Request):
    item = contact(request, sid)
    message = payload.message.strip()
    if not message:
        raise HTTPException(422, '消息不能为空')
    database = store(request)
    try:
        state, uid, aid = database.begin_turn(sid, payload.request_id, message)
    except (ValueError, sqlite3.IntegrityError) as exc:
        raise HTTPException(409, '当前会话已有消息正在生成' if isinstance(exc, sqlite3.IntegrityError) else str(exc))

    async def generate():
        completed = state == 'complete'
        try:
            yield event('accepted', {'user_id': uid, 'request_id': payload.request_id})
            if completed:
                yield event('complete', {})
                return
            options = model_options(request)
            character = database.character(item['character_id'])
            instructions = '\n\n'.join(filter(None, [BASE_RUNTIME_INVARIANTS, request.app.state.additional_system_instructions]))
            history_limit = item.get('history_limit') if item.get('history_limit') is not None else database.settings().get('history_limit',30)
            context = ContextBuilder().build(system_instructions=instructions,
                character=profile_for(character), user_message=message, history=database.completed_context(sid,
                    limit=history_limit))
            messages = [{'role': 'system', 'content': context.system}] + [{'role': m.role, 'content': m.content} for m in context.messages]
            if payload.capture_context:
                yield event('diagnostic', {'messages': messages, 'model': options['model'],
                    'message_count': len(messages), 'request_chars': len(json.dumps(messages, ensure_ascii=False)),
                    'history_count': max(0,len(messages)-2), 'history_limit': history_limit,
                    'context_omitted': None})
            chunks = []
            length = 0
            async with asyncio.timeout(180):
                async with request.app.state.model_client(api_key=options['api_key'], base_url=options['base_url'], timeout=45, max_retries=0) as client:
                    response = await client.chat.completions.create(model=options['model'],
                        messages=messages, stream=True)
                    async with response:
                        async for chunk in response:
                            text = chunk.choices[0].delta.content if chunk.choices else None
                            if text:
                                chunks.append(text)
                                length += len(text)
                                if length > 100000:
                                    raise ValueError('response too large')
                                yield event('delta', {'text': text})
            text = ''.join(chunks).strip()
            if not text:
                raise ValueError('empty response')
            database.finish_turn(payload.request_id, text)
            completed = True
            yield event('complete', {})
        except HTTPException as exc:
            yield event('failed', {'detail': exc.detail, 'error_type': type(exc).__name__, 'http_status': exc.status_code})
        except Exception as exc:
            code = getattr(exc, 'status_code', None)
            yield event('failed', {'detail': '生成失败，可重试同一条消息。请检查模型配置或网络。',
                'error_type': type(exc).__name__, 'http_status': code if isinstance(code, int) else None})
        finally:
            if not completed:
                database.finish_turn(payload.request_id)
    return StreamingResponse(generate(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
