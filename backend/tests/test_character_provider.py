from dataclasses import asdict
from pathlib import Path

import pytest
import yaml

from backend.app.character.provider import YamlCharacterProvider
from backend.app.contracts import CanonData, PersonaData
from backend.app.errors import CharacterConfigurationError


@pytest.fixture
def configs(tmp_path: Path):
    canon = {
        "schema_version": 1,
        "character_id": "t-minus",
        "identity": {
            "name": " T- ", "nature": "character",
            "source_world": "UNSPECIFIED", "description": "UNSPECIFIED",
        },
        "immutable_facts": [" test-fact "],
        "background": {"origin": "UNSPECIFIED", "important_history": ["test-history"]},
        "fixed_boundaries": ["test-fixed-boundary"],
    }
    persona = {
        "schema_version": 1, "traits": [" independent "], "values": ["honesty"],
        "preferences": {"likes": ["test-like"], "dislikes": ["test-dislike"]},
        "communication_style": ["clear"], "boundaries": ["test-boundary"],
        "behavioral_tendencies": ["test-tendency"],
    }
    canon_path, persona_path = tmp_path / "canon.yaml", tmp_path / "persona.yaml"
    canon_path.write_text(yaml.safe_dump(canon), encoding="utf-8")
    persona_path.write_text(yaml.safe_dump(persona), encoding="utf-8")
    return canon, persona, canon_path, persona_path


def provider(configs):
    return YamlCharacterProvider(canon_path=configs[2], persona_path=configs[3])


def test_character_provider_loads_canon_and_persona(configs):
    profile = provider(configs).get()
    assert profile.canon == CanonData(
        1, "t-minus", "T-", "character", "UNSPECIFIED", "UNSPECIFIED",
        ("test-fact",), "UNSPECIFIED", ("test-history",), ("test-fixed-boundary",),
    )
    assert profile.persona == PersonaData(
        1, ("independent",), ("honesty",), ("test-like",), ("test-dislike",),
        ("clear",), ("test-boundary",), ("test-tendency",),
    )


@pytest.mark.parametrize("content", [
    "[]", "", "identity: {}", "schema_version: true\nidentity: {}\nbackground: {}",
])
def test_character_provider_rejects_invalid_canon(configs, content):
    configs[2].write_text(content, encoding="utf-8")
    with pytest.raises(CharacterConfigurationError):
        provider(configs).get()


@pytest.mark.parametrize("content", [
    "[]", "", "schema_version: 1", "schema_version: 1\npreferences: []",
])
def test_character_provider_rejects_invalid_persona(configs, content):
    configs[3].write_text(content, encoding="utf-8")
    with pytest.raises(CharacterConfigurationError):
        provider(configs).get()


@pytest.mark.parametrize(("source", "section", "field", "value"), [
    (0, None, "schema_version", True),
    (1, None, "schema_version", "1"),
    (0, None, "character_id", ""),
    (0, "identity", "source_world", 12),
    (0, "background", "origin", " "),
    (0, "background", "origin", ""),
    (0, None, "immutable_facts", "not-a-list"),
    (0, "background", "important_history", [" "]),
    (0, None, "fixed_boundaries", [1]),
    (1, None, "traits", [None]),
    (1, None, "values", None),
    (1, "preferences", "likes", [""]),
    (1, "preferences", "dislikes", "not-a-list"),
    (1, None, "communication_style", [False]),
    (1, None, "boundaries", [""]),
    (1, None, "behavioral_tendencies", {}),
])
def test_character_provider_validates_field_types(configs, source, section, field, value):
    raw = configs[source]
    (raw if section is None else raw[section])[field] = value
    configs[source + 2].write_text(yaml.safe_dump(raw), encoding="utf-8")
    with pytest.raises(CharacterConfigurationError):
        provider(configs).get()


def test_character_provider_does_not_merge_canon_into_persona(configs):
    loader = provider(configs)
    first = loader.get()
    assert isinstance(first.canon, CanonData)
    assert isinstance(first.persona, PersonaData)
    assert first.canon is not first.persona
    assert "name" not in asdict(first.persona)
    assert "traits" not in asdict(first.canon)
    configs[0]["identity"]["name"] = "Changed in Canon"
    configs[2].write_text(yaml.safe_dump(configs[0]), encoding="utf-8")
    second = loader.get()
    assert second.canon.name == "Changed in Canon"
    assert second.persona == first.persona
    configs[1]["traits"] = ["Changed in Persona"]
    configs[3].write_text(yaml.safe_dump(configs[1]), encoding="utf-8")
    third = loader.get()
    assert third.persona.traits == ("Changed in Persona",)
    assert third.canon == second.canon
    assert first.canon.name == "T-"
    assert first.persona.traits == ("independent",)


@pytest.mark.parametrize("index", [2, 3])
@pytest.mark.parametrize("failure", ["missing", "malformed", "encoding"])
def test_character_provider_wraps_loading_errors(configs, index, failure):
    path = configs[index]
    if failure == "missing":
        path.unlink()
    elif failure == "malformed":
        path.write_text("identity: [", encoding="utf-8")
    else:
        path.write_bytes(b"\xff")
    with pytest.raises(CharacterConfigurationError) as error:
        provider(configs).get()
    assert str(error.value) == "Character configuration could not be loaded."
    assert str(path) not in str(error.value)


@pytest.mark.parametrize("source", [0, 1], ids=["canon", "persona"])
@pytest.mark.parametrize("version", [0, 2, 999, True, False])
def test_character_provider_rejects_unsupported_schema_versions(configs, source, version):
    configs[source]["schema_version"] = version
    configs[source + 2].write_text(yaml.safe_dump(configs[source]), encoding="utf-8")
    with pytest.raises(CharacterConfigurationError):
        provider(configs).get()


def test_canon_default_origin_matches_provider_unknown_origin(configs):
    canon = provider(configs).get().canon
    default_canon = CanonData(
        schema_version=1, character_id="t-minus", name="T-",
        nature="UNSPECIFIED", source_world="UNSPECIFIED", description="UNSPECIFIED",
    )
    assert default_canon.origin == canon.origin == "UNSPECIFIED"
