"""Persistent conversation endpoints (a session shares the same primary agent)."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class Turn(BaseModel):
    message: str = Field(min_length=1, max_length=20000)


@router.get("")
def list_sessions(request: Request):
    return request.app.state.chat_store.list_sessions()


@router.post("", status_code=201)
def create_session(request: Request):
    return request.app.state.chat_store.create_session()


@router.get("/{session_id}/messages")
def messages(session_id: str, request: Request):
    store = request.app.state.chat_store
    if not store.exists(session_id):
        raise HTTPException(404, "Session not found")
    return store.messages(session_id)


@router.post("/{session_id}/chat")
async def send(session_id: str, payload: Turn, request: Request):
    store = request.app.state.chat_store
    if not store.exists(session_id):
        raise HTTPException(404, "Session not found")
    message = payload.message.strip()
    if not message:
        raise HTTPException(422, "Message must not be blank")
    history = store.recent_context(session_id)
    runtime = request.app.state.runtime
    result = await runtime.run(user_message=message, history=history)
    store.append_pair(session_id, message, result.response)
    return {"response": result.response}
