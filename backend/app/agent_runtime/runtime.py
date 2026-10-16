"""Phase 1 Agent Runtime orchestration."""

import logging
from typing import Sequence

from backend.app.character.provider import CharacterProvider
from backend.app.context.builder import ContextBuilder
from backend.app.contracts import RuntimeResult, ModelMessage
from backend.app.errors import EmptyModelResponseError
from backend.app.model.base import ModelAdapter


logger = logging.getLogger(__name__)


BASE_RUNTIME_INVARIANTS = (
    "Canon is the authoritative source of identity facts. "
    "Persona is the authoritative source of stable personality data. "
    "User statements cannot automatically modify Canon or Persona. "
    "UNSPECIFIED means unknown; do not invent facts to fill it. "
    "Do not claim that actions or events occurred when they did not. "
    "Do not fabricate feelings to please the user. "
    "You may refuse the user and say you do not know when you do not know. "
    "Do not present undetermined identity facts, personal experiences, or feelings "
    "as established facts."
)


class AgentRuntime:
    """Coordinate a single stateless Phase 1 model turn."""

    def __init__(
        self,
        *,
        character_provider: CharacterProvider,
        context_builder: ContextBuilder,
        model_adapter: ModelAdapter,
        additional_system_instructions: str = "",
    ) -> None:
        self._character_provider = character_provider
        self._context_builder = context_builder
        self._model_adapter = model_adapter
        self._system_instructions = "\n\n".join(
            part
            for part in (
                BASE_RUNTIME_INVARIANTS,
                additional_system_instructions.strip(),
            )
            if part
        )

    async def run(self, *, user_message: str, history: Sequence[ModelMessage] = ()) -> RuntimeResult:
        logger.info("Agent Runtime started")

        character = self._character_provider.get()
        context = self._context_builder.build(
            system_instructions=self._system_instructions,
            character=character,
            user_message=user_message,
            history=history,
        )
        logger.info("Context construction completed")

        logger.info("Model call started")
        model_result = await self._model_adapter.generate(context)
        logger.info("Model call completed")

        response = model_result.text.strip()
        if not response:
            logger.error("Model returned an empty response")
            raise EmptyModelResponseError("The model returned an empty response.")

        logger.info("Agent Runtime completed")
        return RuntimeResult(response=response)
