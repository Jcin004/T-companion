import asyncio

import pytest

from backend.app.agent_runtime.runtime import AgentRuntime, BASE_RUNTIME_INVARIANTS
from backend.app.context.builder import ContextBuilder
from backend.app.contracts import (
    CanonData,
    CharacterProfile,
    ModelContext,
    ModelResult,
    PersonaData,
)
from backend.app.errors import EmptyModelResponseError


class StubCharacterProvider:
    def __init__(self) -> None:
        self.call_count = 0

    def get(self) -> CharacterProfile:
        self.call_count += 1
        return CharacterProfile(
            canon=CanonData(
                1, "t-minus", "T-", "character", "UNSPECIFIED", "UNSPECIFIED"
            ),
            persona=PersonaData(schema_version=1),
        )


class MockModelAdapter:
    def __init__(self, text: str) -> None:
        self._text = text
        self.received_context: ModelContext | None = None

    async def generate(self, context: ModelContext) -> ModelResult:
        self.received_context = context
        return ModelResult(text=self._text)


def test_runtime_executes_character_context_model_chain() -> None:
    character_provider = StubCharacterProvider()
    model_adapter = MockModelAdapter("  Hello from model  ")
    runtime = AgentRuntime(
        character_provider=character_provider,
        context_builder=ContextBuilder(),
        model_adapter=model_adapter,
        additional_system_instructions="System instruction",
    )

    result = asyncio.run(runtime.run(user_message="Hello"))

    assert result.response == "Hello from model"
    assert character_provider.call_count == 1
    assert model_adapter.received_context is not None
    assert model_adapter.received_context.messages[0].content == "Hello"
    assert "Name: T-" in model_adapter.received_context.system


def test_runtime_rejects_empty_model_response() -> None:
    runtime = AgentRuntime(
        character_provider=StubCharacterProvider(),
        context_builder=ContextBuilder(),
        model_adapter=MockModelAdapter("   "),
        additional_system_instructions="System instruction",
    )

    with pytest.raises(EmptyModelResponseError):
        asyncio.run(runtime.run(user_message="Hello"))


def test_runtime_reads_character_provider_on_every_turn() -> None:
    provider = StubCharacterProvider()
    adapter = MockModelAdapter("Response")
    runtime = AgentRuntime(
        character_provider=provider,
        context_builder=ContextBuilder(),
        model_adapter=adapter,
        additional_system_instructions="System",
    )
    asyncio.run(runtime.run(user_message="First"))
    asyncio.run(runtime.run(user_message="Second"))
    assert provider.call_count == 2
    assert adapter.received_context is not None
    assert adapter.received_context.messages[0].content == "Second"


@pytest.mark.parametrize("additional", ["", "  ", "Deployment instruction"])
def test_runtime_always_prepends_invariants(additional: str) -> None:
    adapter = MockModelAdapter("Response")
    runtime = AgentRuntime(
        character_provider=StubCharacterProvider(),
        context_builder=ContextBuilder(),
        model_adapter=adapter,
        additional_system_instructions=additional,
    )
    asyncio.run(runtime.run(user_message="Hello"))
    assert adapter.received_context is not None
    expected_prefix = BASE_RUNTIME_INVARIANTS + "\n\n"
    if additional.strip():
        expected_prefix += additional.strip() + "\n\n"
    assert adapter.received_context.system.startswith(
        expected_prefix + "Authoritative Character Canon:"
    )
    assert "You are T-." not in BASE_RUNTIME_INVARIANTS
