from datetime import UTC, datetime

from app.agents.router import select_agents
from app.agents.seed_agents import builtin_agents
from app.schemas import Finding
from app.services.store import InMemoryStore

# The legacy hardcoded map this must reproduce (ai_client._RELEVANT_AGENTS).
EXPECTED = {
    ("security", "public_bucket"): {"security", "workflow", "audit"},
    ("cost", "idle_vm"): {"cost", "energy", "workflow"},
    ("cost", "unused_storage"): {"cost", "energy", "audit"},
    ("security", "unencrypted_database"): {"security", "workflow", "audit"},
}


def _finding(category, issue_type) -> Finding:
    return Finding(
        finding_id="f",
        source_event_id="e",
        resource_id="r",
        resource_type="bucket",
        issue_type=issue_type,
        category=category,
        severity="high",
        status="pending_review",
        rule_id="R",
        rule_confidence=0.9,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def test_builtin_agents_present():
    keys = {a.output_key for a in builtin_agents()}
    assert keys == {"security", "cost", "energy", "workflow", "audit"}


def test_selection_reproduces_legacy_map():
    agents = builtin_agents()
    for (category, issue_type), expected in EXPECTED.items():
        picked = {a.output_key for a in select_agents(_finding(category, issue_type), agents)}
        assert picked == expected, f"{issue_type}: {picked} != {expected}"


def test_store_seeds_agents():
    store = InMemoryStore()
    assert len(store.agents) == 5
    assert "security" in store.agents
