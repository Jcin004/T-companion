"""Provider-neutral data contracts shared by character and model modules."""

from dataclasses import dataclass
from typing import Literal


MessageRole = Literal["user", "assistant"]


@dataclass(frozen=True, slots=True)
class CanonData:
    """Authoritative character identity and fixed facts."""

    schema_version: int
    character_id: str
    name: str
    nature: str
    source_world: str
    description: str
    immutable_facts: tuple[str, ...] = ()
    origin: str = "UNSPECIFIED"
    important_history: tuple[str, ...] = ()
    fixed_boundaries: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class PersonaData:
    """Authoritative stable personality, separate from Canon."""

    schema_version: int
    traits: tuple[str, ...] = ()
    values: tuple[str, ...] = ()
    likes: tuple[str, ...] = ()
    dislikes: tuple[str, ...] = ()
    communication_style: tuple[str, ...] = ()
    boundaries: tuple[str, ...] = ()
    behavioral_tendencies: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class CharacterProfile:
    """Read-only projection of the two authoritative character sources."""

    canon: CanonData
    persona: PersonaData


@dataclass(frozen=True, slots=True)
class ModelMessage:
    """A provider-neutral conversational message."""

    role: MessageRole
    content: str


@dataclass(frozen=True, slots=True)
class ModelContext:
    """The complete input for one model call."""

    system: str
    messages: tuple[ModelMessage, ...]


@dataclass(frozen=True, slots=True)
class ModelResult:
    """Normalized output returned by a ModelAdapter."""

    text: str


@dataclass(frozen=True, slots=True)
class RuntimeResult:
    """Result of one Agent Runtime turn."""

    response: str
