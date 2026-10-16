"""FastAPI application and Phase 1 dependency composition."""

import logging
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI

from backend.app.agent_runtime.runtime import AgentRuntime
from backend.app.api.chat import router as chat_router
from backend.app.api.sessions import router as sessions_router
from backend.app.companion_store import CompanionStore
from backend.app.api.companion import router as companion_router
from backend.app.api.backup import router as backup_router
from backend.app.source import router as source_router
from backend.app.character.provider import YamlCharacterProvider
from backend.app.config.settings import Settings
from backend.app.context.builder import ContextBuilder
from backend.app.errors import (
    EmptyModelResponseError,
    ModelConfigurationError,
    ModelProviderError,
)
from backend.app.model.openai_provider import OpenAIModelAdapter


logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
PROJECT_ROOT = Path(__file__).resolve().parents[2]
CANON_PATH = PROJECT_ROOT / "config" / "character" / "canon.yaml"
PERSONA_PATH = PROJECT_ROOT / "config" / "character" / "persona.yaml"


def build_runtime(settings: Settings) -> AgentRuntime:
    """Compose the concrete Phase 1 runtime without a DI framework."""

    api_key = (
        settings.openai_api_key.get_secret_value()
        if settings.openai_api_key is not None
        else None
    )
    return AgentRuntime(
        character_provider=YamlCharacterProvider(
            canon_path=CANON_PATH, persona_path=PERSONA_PATH
        ),
        context_builder=ContextBuilder(),
        model_adapter=OpenAIModelAdapter(
            api_key=api_key,
            model_name=settings.model_name,
        ),
        additional_system_instructions=settings.additional_system_instructions,
    )


def create_app(
    *, runtime: Any | None = None, settings: Settings | None = None
) -> FastAPI:
    """Create an application, allowing tests to inject a mock runtime."""

    @asynccontextmanager
    async def lifespan(application):
        if not getattr(application.state, 'recovered', False):
            application.state.chat_store.recover()
            application.state.recovered = True
        yield

    application = FastAPI(title="T-", version="0.2.0", lifespan=lifespan)
    application.state.runtime = runtime if runtime is not None else build_runtime(settings or Settings())
    application.state.chat_store = CompanionStore(profile=YamlCharacterProvider(canon_path=CANON_PATH, persona_path=PERSONA_PATH).get())
    application.state.model_client = AsyncOpenAI
    application.state.legacy_enabled = runtime is not None
    current_settings = settings or Settings()
    application.state.additional_system_instructions = current_settings.additional_system_instructions
    application.state.chat_store.bootstrap_settings({'model': current_settings.model_name,
        'api_key': current_settings.openai_api_key.get_secret_value() if current_settings.openai_api_key else ''})
    token_path = application.state.chat_store.path.parent / 'access-token.txt'
    if not token_path.exists():
        token_path.write_text(secrets.token_urlsafe(32), encoding='utf-8')
    application.state.access_token = os.environ.get('T_ACCESS_TOKEN') or token_path.read_text(encoding='utf-8').strip()

    @application.middleware('http')
    async def protect_api(request: Request, call_next):
        if request.url.path.startswith('/api/') and request.method != 'OPTIONS':
            local_names = ('127.0.0.1', 'localhost', '::1', 'test', 'testserver')
            peer = request.client.host if request.client else ''
            local = peer in local_names and request.url.hostname in local_names
            auth = request.headers.get('authorization', '')
            authenticated = secrets.compare_digest(auth, 'Bearer ' + application.state.access_token)
            if not local and not authenticated:
                return JSONResponse(status_code=401, content={'detail': '请在设置中填写后端访问口令'})
            origin = request.headers.get('origin')
            if origin and origin not in (str(request.base_url).rstrip('/'), 'https://localhost', 'http://localhost'):
                return JSONResponse(status_code=403, content={'detail': '不允许此来源访问'})
            if not application.state.legacy_enabled and (request.url.path == '/api/chat' or request.url.path.startswith('/api/sessions')):
                return JSONResponse(status_code=410, content={'detail': '请使用 /api/v1 角色聊天接口'})
        return await call_next(request)

    application.add_middleware(CORSMiddleware, allow_origins=['https://localhost', 'http://localhost'],
        allow_methods=['GET', 'POST', 'PUT', 'PATCH'], allow_headers=['Authorization', 'Content-Type'])
    application.include_router(chat_router)
    application.include_router(sessions_router)
    application.include_router(companion_router)
    application.include_router(backup_router)
    application.include_router(source_router)

    web_root = PROJECT_ROOT / "frontend"
    if web_root.is_dir():
        @application.get("/", include_in_schema=False)
        async def home() -> FileResponse:
            return FileResponse(web_root / "index.html")

        application.mount("/assets", StaticFiles(directory=web_root), name="assets")

    @application.exception_handler(ModelConfigurationError)
    async def model_configuration_error(
        _request: Request, _exc: ModelConfigurationError
    ) -> JSONResponse:
        logger.error("Model configuration is incomplete")
        return JSONResponse(
            status_code=503,
            content={"detail": "Model service is not configured."},
        )

    @application.exception_handler(ModelProviderError)
    async def model_provider_error(
        _request: Request, _exc: ModelProviderError
    ) -> JSONResponse:
        logger.error("Model provider request failed")
        return JSONResponse(
            status_code=502,
            content={"detail": "Model provider request failed."},
        )

    @application.exception_handler(EmptyModelResponseError)
    async def empty_model_response_error(
        _request: Request, _exc: EmptyModelResponseError
    ) -> JSONResponse:
        logger.error("Model provider returned no usable content")
        return JSONResponse(
            status_code=502,
            content={"detail": "Model provider returned an empty response."},
        )

    @application.exception_handler(Exception)
    async def unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unexpected internal error: %s", type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error."},
        )

    return application


app = create_app()
