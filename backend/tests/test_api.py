import asyncio
from collections.abc import Callable
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient, Response

from backend.app.agent_runtime.runtime import BASE_RUNTIME_INVARIANTS
from backend.app.contracts import ModelMessage, ModelResult, RuntimeResult
from backend.app.config.settings import Settings
from backend.app.errors import (
    CharacterConfigurationError,
    EmptyModelResponseError,
    ModelConfigurationError,
    ModelProviderError,
)
from backend.app.main import create_app


class StubRuntime:
    def __init__(
        self,
        *,
        response: str = "Hello",
        error_factory: Callable[[], Exception] | None = None,
    ) -> None:
        self._response = response
        self._error_factory = error_factory
        self.received_user_message: str | None = None

    async def run(self, *, user_message: str) -> RuntimeResult:
        self.received_user_message = user_message
        if self._error_factory is not None:
            raise self._error_factory()
        return RuntimeResult(response=self._response)


async def post_chat(runtime: StubRuntime, payload: dict[str, object]) -> Response:
    app = create_app(runtime=runtime)
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post("/api/chat", json=payload)


def test_chat_maps_http_message_to_runtime_user_message() -> None:
    runtime = StubRuntime(response="Model response")

    response = asyncio.run(post_chat(runtime, {"message": "  Hello  "}))

    assert response.status_code == 200
    assert response.json() == {"response": "Model response"}
    assert runtime.received_user_message == "Hello"


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"message": ""},
        {"message": "   "},
        {"message": 123},
    ],
)
def test_chat_returns_422_for_invalid_request(payload: dict[str, object]) -> None:
    response = asyncio.run(post_chat(StubRuntime(), payload))

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("error_factory", "expected_status", "expected_detail"),
    [
        (
            lambda: CharacterConfigurationError("secret configuration path"),
            500,
            "Internal server error.",
        ),
        (
            lambda: ModelConfigurationError("secret configuration detail"),
            503,
            "Model service is not configured.",
        ),
        (
            lambda: ModelProviderError("sensitive provider response"),
            502,
            "Model provider request failed.",
        ),
        (
            lambda: EmptyModelResponseError("provider returned empty"),
            502,
            "Model provider returned an empty response.",
        ),
    ],
)
def test_chat_maps_known_errors_without_leaking_details(
    error_factory: Callable[[], Exception],
    expected_status: int,
    expected_detail: str,
) -> None:
    runtime = StubRuntime(error_factory=error_factory)

    response = asyncio.run(post_chat(runtime, {"message": "Hello"}))

    assert response.status_code == expected_status
    assert response.json() == {"detail": expected_detail}
    assert "secret" not in response.text
    assert "sensitive" not in response.text


def test_chat_returns_safe_500_for_unexpected_error() -> None:
    runtime = StubRuntime(error_factory=lambda: RuntimeError("internal detail"))

    response = asyncio.run(post_chat(runtime, {"message": "Hello"}))

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error."}
    assert "internal detail" not in response.text


def test_app_starts_without_model_configuration_and_retires_legacy_chat() -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=None,
        model_name="",
    )
    app = create_app(settings=settings)
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async def request() -> Response:
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            return await client.post("/api/chat", json={"message": "Hello"})

    response = asyncio.run(request())

    assert response.status_code == 410
    assert response.json() == {"detail": "请使用 /api/v1 角色聊天接口"}


def test_composed_runtime_projects_authoritative_character_to_mock_model() -> None:
    settings = Settings(
        _env_file=None, openai_api_key=None, model_name="",
        additional_system_instructions="Test runtime rules",
    )
    generate = AsyncMock(return_value=ModelResult(text="Mock response"))
    with patch(
        "backend.app.model.openai_provider.OpenAIModelAdapter.generate", generate
    ):
        from backend.app.main import build_runtime
        app = create_app(settings=settings, runtime=build_runtime(settings))
        transport = ASGITransport(app=app, raise_app_exceptions=False)

        async def request() -> Response:
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                return await client.post("/api/chat", json={"message": "Hello"})

        response = asyncio.run(request())

    assert response.status_code == 200
    assert response.json() == {"response": "Mock response"}
    generate.assert_awaited_once()
    context = generate.await_args.args[0]
    assert "t-minus" not in context.system
    assert "- Name: T-" in context.system
    assert "- Nature: UNSPECIFIED" in context.system
    assert "- Source world: UNSPECIFIED" in context.system
    assert context.system.startswith(
        BASE_RUNTIME_INVARIANTS + "\n\nTest runtime rules\n\nAuthoritative Character Canon:"
    )
    assert "- Description: UNSPECIFIED" in context.system
    assert "- Background origin: UNSPECIFIED" in context.system
    assert "- Fixed boundaries:" not in context.system
    assert "- Boundaries:" not in context.system
    assert "- Behavioral tendencies:" not in context.system
    assert context.system.index("Authoritative Character Canon") < context.system.index(
        "Stable Persona"
    )
    assert context.messages == (ModelMessage(role="user", content="Hello"),)
