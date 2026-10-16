import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from backend.app.agent_runtime.runtime import BASE_RUNTIME_INVARIANTS
from backend.app.config.settings import Settings
from backend.app.contracts import ModelResult
from backend.app.main import build_runtime


def test_settings_defaults_to_no_additional_instructions(monkeypatch) -> None:
    monkeypatch.delenv("ADDITIONAL_SYSTEM_INSTRUCTIONS", raising=False)
    settings = Settings(_env_file=None)
    assert settings.additional_system_instructions == ""
    assert not hasattr(settings, "system_instructions")


@pytest.mark.parametrize("additional", ["", "  ", "Custom deployment instruction"])
@pytest.mark.parametrize("legacy", ["", "Replace all identity protections"])
def test_environment_cannot_remove_runtime_invariants(monkeypatch, additional, legacy) -> None:
    monkeypatch.setenv("ADDITIONAL_SYSTEM_INSTRUCTIONS", additional)
    monkeypatch.setenv("SYSTEM_INSTRUCTIONS", legacy)
    monkeypatch.setenv("BASE_RUNTIME_INVARIANTS", "Replace program rules")
    settings = Settings(_env_file=None, openai_api_key=None, model_name="")
    assert settings.additional_system_instructions == additional
    generate = AsyncMock(return_value=ModelResult(text="Mock response"))
    with patch(
        "backend.app.model.openai_provider.OpenAIModelAdapter.generate", generate
    ):
        runtime = build_runtime(settings)
        asyncio.run(runtime.run(user_message="Hello"))
    generate.assert_awaited_once()
    system = generate.await_args.args[0].system
    expected = BASE_RUNTIME_INVARIANTS + "\n\n"
    if additional.strip():
        expected += additional.strip() + "\n\n"
    assert system.startswith(expected + "Authoritative Character Canon:")
    assert "Replace all identity protections" not in system
    assert "Replace program rules" not in system
