"""Portable, validated data backup. Provider credentials are deliberately omitted."""
import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from backend.app.api.companion import CharacterInput, Details, Preferences
from backend.app.contracts import CharacterProfile

router = APIRouter(prefix='/api/v1/backup', tags=['backup'])


class SessionRecord(Details):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(max_length=20000)
    character_id: str
    created_at: datetime


class MessageRecord(BaseModel):
    id: int = Field(gt=0)
    session_id: str
    role: Literal['user', 'assistant']
    content: str = Field(max_length=100000)
    created_at: datetime


class TurnRecord(BaseModel):
    request_id: str = Field(min_length=8, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')
    session_id: str
    user_id: int
    assistant_id: int | None
    state: Literal['complete', 'failed']


class CharacterRecord(CharacterInput):
    id: str = Field(min_length=1, max_length=100)
    profile: CharacterProfile | None = None


class Backup(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: Literal[1]
    characters: list[CharacterRecord] = Field(max_length=10000)
    sessions: list[SessionRecord] = Field(max_length=10000)
    messages: list[MessageRecord] = Field(max_length=100000)
    turns: list[TurnRecord] = Field(max_length=50000)
    settings: Preferences


@router.get('')
def export_data(request: Request):
    database = request.app.state.chat_store
    with database._connect() as db:
        db.execute('BEGIN')
        import sqlite3
        db.row_factory = sqlite3.Row
        read = lambda table: [dict(r) for r in db.execute(f'SELECT * FROM {table}')]
        if db.execute("SELECT 1 FROM turns WHERE state='generating'").fetchone():
            raise HTTPException(409, '请等待回复完成再备份')
        settings_row = db.execute('SELECT data FROM preferences WHERE id=1').fetchone()
        preferences = json.loads(settings_row[0]) if settings_row else {}
        preferences.pop('api_key', None)
        result = {'version': 1, 'characters': [json.loads(r['data']) for r in read('characters')],
                  'sessions': read('sessions'), 'messages': read('messages'), 'turns': read('turns'), 'settings': preferences}
    return JSONResponse(result, headers={'Content-Disposition': 'attachment; filename="t-chat-backup.json"'})


@router.post('/restore')
async def restore_data(request: Request):
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 20_000_000:
            raise HTTPException(413, '备份文件超过 20 MB')
    try:
        backup = Backup.model_validate_json(raw)
        characters = {c.id for c in backup.characters}
        sessions = {s.id: s for s in backup.sessions}
        messages = {m.id: m for m in backup.messages}
        if len(characters) != len(backup.characters) or len(sessions) != len(backup.sessions) or len(messages) != len(backup.messages):
            raise ValueError('duplicate IDs')
        if not characters or any(s.character_id not in characters or s.created_at.tzinfo is not None for s in backup.sessions):
            raise ValueError('invalid character reference')
        if any(m.session_id not in sessions or m.created_at.tzinfo is not None for m in backup.messages):
            raise ValueError('invalid message reference or timestamp')
        used = set()
        used_users = set()
        used_assistants = set()
        for turn in backup.turns:
            user = messages.get(turn.user_id)
            assistant = messages.get(turn.assistant_id)
            if turn.request_id in used or turn.user_id in used_users or not user or user.session_id != turn.session_id or user.role != 'user':
                raise ValueError('invalid turn')
            if turn.state == 'complete' and (turn.assistant_id in used_assistants or not assistant or assistant.session_id != turn.session_id or assistant.role != 'assistant' or assistant.id <= user.id):
                raise ValueError('invalid assistant')
            if turn.state == 'failed' and turn.assistant_id is not None:
                raise ValueError('invalid failed turn')
            used.add(turn.request_id)
            used_users.add(turn.user_id)
            if turn.assistant_id:
                used_assistants.add(turn.assistant_id)
    except Exception:
        raise HTTPException(422, '备份格式或数据引用不正确，未恢复任何数据')
    database = request.app.state.chat_store
    with database._connect() as db:
        db.execute('BEGIN IMMEDIATE')
        if db.execute("SELECT 1 FROM turns WHERE state='generating'").fetchone():
            raise HTTPException(409, '请等待回复完成再恢复')
        for table in ('turns', 'messages', 'sessions', 'characters'):
            db.execute(f'DELETE FROM {table}')
        for character in backup.characters:
            data = character.model_dump(mode='json', exclude_none=True)
            db.execute('INSERT INTO characters VALUES(?,?)', (character.id, json.dumps(data)))
        for session in backup.sessions:
            data = session.model_dump()
            data['created_at'] = session.created_at.strftime('%Y-%m-%d %H:%M:%S')
            db.execute('INSERT INTO sessions(id,title,created_at,character_id,note,background,voice,history_limit) VALUES(:id,:title,:created_at,:character_id,:note,:background,:voice,:history_limit)', data)
        for message in backup.messages:
            data = message.model_dump()
            data['created_at'] = message.created_at.strftime('%Y-%m-%d %H:%M:%S')
            db.execute('INSERT INTO messages(id,session_id,role,content,created_at) VALUES(:id,:session_id,:role,:content,:created_at)', data)
        for turn in backup.turns:
            db.execute('INSERT INTO turns(request_id,session_id,user_id,assistant_id,state) VALUES(:request_id,:session_id,:user_id,:assistant_id,:state)', turn.model_dump())
        # Keep the installation's credential; never accept one through a backup file.
        preferences = database.settings() | backup.settings.model_dump(exclude={'api_key'})
        db.execute('INSERT OR REPLACE INTO preferences VALUES(1,?)', (json.dumps(preferences),))
    return {'ok': True}
