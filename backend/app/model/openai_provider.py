"""OpenAI implementation of the ModelAdapter contract."""

import logging

from openai import AsyncOpenAI

from backend.app.contracts import ModelContext, ModelResult
from backend.app.errors import ModelConfigurationError, ModelProviderError


logger = logging.getLogger(__name__)


class OpenAIModelAdapter:
    """Translate the internal model contract to the OpenAI Responses API."""

    def __init__(self, *, api_key: str | None, model_name: str) -> None:
        self._api_key = api_key
        self._model_name = model_name

    async def generate(self, context: ModelContext) -> ModelResult:
        if not self._api_key or not self._api_key.strip():
            raise ModelConfigurationError("OPENAI_API_KEY is not configured.")
        if not self._model_name.strip():
            raise ModelConfigurationError("MODEL_NAME is not configured.")

        try:
            async with AsyncOpenAI(api_key=self._api_key) as client:
                response = await client.responses.create(
                    model=self._model_name,
                    instructions=context.system,
                    input=[
                        {"role": message.role, "content": message.content}
                        for message in context.messages
                    ],
                )
        except Exception as exc:
            logger.error("Model provider call failed: %s", type(exc).__name__)
            raise ModelProviderError("The model provider call failed.") from exc

        return ModelResult(text=response.output_text or "")
