import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from backend.app.contracts import ModelContext, ModelMessage
from backend.app.errors import ModelConfigurationError, ModelProviderError
from backend.app.model.openai_provider import OpenAIModelAdapter


CONTEXT = ModelContext(
    system="System instruction",
    messages=(ModelMessage(role="user", content="Hello"),),
)


@pytest.mark.parametrize(
    ("api_key", "model_name"),
    [
        (None, "model"),
        ("", "model"),
        ("key", ""),
    ],
)
def test_openai_model_adapter_rejects_missing_configuration(
    api_key: str | None, model_name: str
) -> None:
    adapter = OpenAIModelAdapter(api_key=api_key, model_name=model_name)

    with pytest.raises(ModelConfigurationError):
        asyncio.run(adapter.generate(CONTEXT))


def test_openai_model_adapter_translates_context_and_result() -> None:
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.__aexit__.return_value = False
    client.responses.create = AsyncMock(
        return_value=SimpleNamespace(output_text="Model response")
    )
    adapter = OpenAIModelAdapter(api_key="test-key", model_name="test-model")

    with patch(
        "backend.app.model.openai_provider.AsyncOpenAI", return_value=client
    ) as client_class:
        result = asyncio.run(adapter.generate(CONTEXT))

    client_class.assert_called_once_with(api_key="test-key")
    client.responses.create.assert_awaited_once_with(
        model="test-model",
        instructions="System instruction",
        input=[{"role": "user", "content": "Hello"}],
    )
    assert result.text == "Model response"
    client.__aenter__.assert_awaited_once_with()
    client.__aexit__.assert_awaited_once()


def test_openai_model_adapter_wraps_provider_error_and_closes_client() -> None:
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.__aexit__.return_value = False
    provider_error = RuntimeError("provider failed")
    client.responses.create = AsyncMock(side_effect=provider_error)
    adapter = OpenAIModelAdapter(api_key="test-key", model_name="test-model")

    with patch(
        "backend.app.model.openai_provider.AsyncOpenAI", return_value=client
    ):
        with pytest.raises(ModelProviderError) as exc_info:
            asyncio.run(adapter.generate(CONTEXT))

    assert exc_info.value.__cause__ is provider_error
    client.__aexit__.assert_awaited_once()
