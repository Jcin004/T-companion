import json
from pathlib import Path
from backend.app.agent_runtime.runtime import BASE_RUNTIME_INVARIANTS


def test_client_invariants_match_program_owned_rules():
    content = Path('frontend/runtime-rules.js').read_text(encoding='utf-8')
    assert json.loads(content.split('export const INVARIANTS = ')[1].rstrip(';\n')) == BASE_RUNTIME_INVARIANTS
