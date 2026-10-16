"""Pure construction of provider-neutral model context."""

from backend.app.contracts import CharacterProfile, ModelContext, ModelMessage
from typing import Sequence


class ContextBuilder:
    """Project read-only character data and the current user message."""

    def build(
        self,
        *,
        system_instructions: str,
        character: CharacterProfile,
        user_message: str,
        history: Sequence[ModelMessage] = (),
    ) -> ModelContext:
        character_section = self._render_character(character)
        system = "\n\n".join(
            part for part in (system_instructions.strip(), character_section) if part
        )
        return ModelContext(
            system=system,
            messages=tuple(history) + (ModelMessage(role="user", content=user_message),),
        )

    @staticmethod
    def _render_character(profile: CharacterProfile) -> str:
        canon = profile.canon
        persona = profile.persona
        lines = [
            "Authoritative Character Canon:",
            f"- Name: {canon.name}",
            f"- Nature: {canon.nature}",
            f"- Source world: {canon.source_world}",
            f"- Description: {canon.description}",
        ]
        ContextBuilder._append_list(lines, "Immutable facts", canon.immutable_facts)
        lines.append(f"- Background origin: {canon.origin}")
        ContextBuilder._append_list(lines, "Important history", canon.important_history)
        ContextBuilder._append_list(lines, "Fixed boundaries", canon.fixed_boundaries)
        lines.extend(("", "Stable Persona:"))
        ContextBuilder._append_list(lines, "Traits", persona.traits)
        ContextBuilder._append_list(lines, "Values", persona.values)
        ContextBuilder._append_list(lines, "Likes", persona.likes)
        ContextBuilder._append_list(lines, "Dislikes", persona.dislikes)
        ContextBuilder._append_list(
            lines, "Communication style", persona.communication_style
        )
        ContextBuilder._append_list(lines, "Boundaries", persona.boundaries)
        ContextBuilder._append_list(
            lines, "Behavioral tendencies", persona.behavioral_tendencies
        )
        return "\n".join(lines)

    @staticmethod
    def _append_list(lines: list[str], label: str, values: tuple[str, ...]) -> None:
        if values:
            lines.append(f"- {label}: {'; '.join(values)}")
