from app.services.governance import GovernanceService
from app.services.seed import demo_events
from app.services.store import InMemoryStore


def _ingest():
    store = InMemoryStore()
    service = GovernanceService(store)
    service.ingest_events(demo_events(), actor_id="test")
    return store


def test_agent_outputs_empty_at_ingest():
    # No deterministic base text; AI is off in tests. The LLM fills agent_outputs
    # lazily (and only when an AI key is configured), so at ingest it stays {}.
    store = _ingest()
    for finding in store.findings.values():
        assert store.recommendations[finding.finding_id].agent_outputs == {}


def test_savings_still_preserved():
    store = _ingest()
    by_issue = {f.issue_type: store.recommendations[f.finding_id] for f in store.findings.values()}
    assert by_issue["idle_vm"].estimated_monthly_savings == 76.8
    assert by_issue["unused_storage"].estimated_monthly_savings == 28.7
