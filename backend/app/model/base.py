"""Provider-neutral model interface."""

from typing import Protocol

from backend.app.contracts import ModelContext, ModelResult


class ModelAdapter(Protocol):
    """Asynchronous interface implemented directly by each model provider."""

    async def generate(self, context: ModelContext) -> ModelResult:
        """Generate one response for the supplied context."""
        ...
