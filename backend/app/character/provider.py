"""Character identity provider backed by authoritative YAML files."""

from pathlib import Path
from typing import Any, Protocol

import yaml

from backend.app.contracts import CanonData, CharacterProfile, PersonaData
from backend.app.errors import CharacterConfigurationError


SUPPORTED_SCHEMA_VERSION = 1


class CharacterProvider(Protocol):
    """Provides the current authoritative character profile."""

    def get(self) -> CharacterProfile:
        ...


class YamlCharacterProvider:
    """Load and validate Canon and Persona YAML on each get()."""

    def __init__(self, *, canon_path: Path, persona_path: Path) -> None:
        self._canon_path = canon_path
        self._persona_path = persona_path

    def get(self) -> CharacterProfile:
        try:
            canon_raw = self._load_yaml(self._canon_path)
            persona_raw = self._load_yaml(self._persona_path)
            return CharacterProfile(
                canon=self._parse_canon(canon_raw),
                persona=self._parse_persona(persona_raw),
            )
        except CharacterConfigurationError:
            raise
        except (OSError, UnicodeError, yaml.YAMLError) as exc:
            raise CharacterConfigurationError(
                "Character configuration could not be loaded."
            ) from exc

    @staticmethod
    def _load_yaml(path: Path) -> Any:
        with path.open("r", encoding="utf-8") as file:
            return yaml.safe_load(file)

    @classmethod
    def _parse_canon(cls, raw: Any) -> CanonData:
        root = cls._mapping(raw, "canon")
        identity = cls._mapping(root.get("identity"), "identity")
        background = cls._mapping(root.get("background"), "background")
        return CanonData(
            schema_version=cls._schema_version(root),
            character_id=cls._string(root, "character_id"),
            name=cls._string(identity, "name"),
            nature=cls._string(identity, "nature"),
            source_world=cls._string(identity, "source_world"),
            description=cls._string(identity, "description"),
            immutable_facts=cls._string_tuple(root, "immutable_facts"),
            origin=cls._string(background, "origin"),
            important_history=cls._string_tuple(background, "important_history"),
            fixed_boundaries=cls._string_tuple(root, "fixed_boundaries"),
        )

    @classmethod
    def _parse_persona(cls, raw: Any) -> PersonaData:
        root = cls._mapping(raw, "persona")
        preferences = cls._mapping(root.get("preferences"), "preferences")
        return PersonaData(
            schema_version=cls._schema_version(root),
            traits=cls._string_tuple(root, "traits"),
            values=cls._string_tuple(root, "values"),
            likes=cls._string_tuple(preferences, "likes"),
            dislikes=cls._string_tuple(preferences, "dislikes"),
            communication_style=cls._string_tuple(root, "communication_style"),
            boundaries=cls._string_tuple(root, "boundaries"),
            behavioral_tendencies=cls._string_tuple(root, "behavioral_tendencies"),
        )

    @staticmethod
    def _mapping(value: Any, label: str) -> dict[str, Any]:
        if not isinstance(value, dict):
            raise CharacterConfigurationError(
                f"Character field '{label}' must be a mapping."
            )
        return value

    @staticmethod
    def _string(data: dict[str, Any], field: str) -> str:
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            raise CharacterConfigurationError(
                f"Character field '{field}' must be a non-empty string."
            )
        return value.strip()

    @staticmethod
    def _integer(data: dict[str, Any], field: str) -> int:
        value = data.get(field)
        if not isinstance(value, int) or isinstance(value, bool):
            raise CharacterConfigurationError(
                f"Character field '{field}' must be an integer."
            )
        return value

    @classmethod
    def _schema_version(cls, data: dict[str, Any]) -> int:
        value = cls._integer(data, "schema_version")
        if value != SUPPORTED_SCHEMA_VERSION:
            raise CharacterConfigurationError(
                "Character schema_version is unsupported."
            )
        return value

    @staticmethod
    def _string_tuple(data: dict[str, Any], field: str) -> tuple[str, ...]:
        value = data.get(field, [])
        if not isinstance(value, list) or any(
            not isinstance(item, str) or not item.strip() for item in value
        ):
            raise CharacterConfigurationError(
                f"Character field '{field}' must be a list of non-empty strings."
            )
        return tuple(item.strip() for item in value)
