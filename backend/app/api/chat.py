"""Phase 1 HTTP chat endpoint."""

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, field_validator


router = APIRouter()


class ChatRequest(BaseModel):
    """Transport-only request contract for POST /api/chat."""

    message: str

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("message must not be blank")
        return value


class ChatResponse(BaseModel):
    """Transport-only response contract for POST /api/chat."""

    response: str


@router.post("/api/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, request: Request) -> ChatResponse:
    runtime: Any = request.app.state.runtime
    runtime_result = await runtime.run(user_message=payload.message)
    return ChatResponse(response=runtime_result.response)
