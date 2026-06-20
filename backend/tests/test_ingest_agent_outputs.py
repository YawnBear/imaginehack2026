from app.services.governance import GovernanceService
from app.services.seed import demo_events
from app.services.store import InMemoryStore


def _ingest():
    store = InMemoryStore()
    service = GovernanceService(store)
    service.ingest_events(demo_events(), actor_id="test")
    return store


def test_agent_outputs_keys_match_coverage():
    store = _ingest()
    by_issue = {f.issue_type: store.recommendations[f.finding_id] for f in store.findings.values()}
    assert set(by_issue["public_bucket"].agent_outputs.keys()) == {"security", "workflow", "audit"}
    assert set(by_issue["idle_vm"].agent_outputs.keys()) == {"cost", "energy", "workflow"}
    assert set(by_issue["unused_storage"].agent_outputs.keys()) == {"cost", "energy", "audit"}
    assert set(by_issue["unencrypted_database"].agent_outputs.keys()) == {"security", "workflow", "audit"}


def test_savings_still_preserved():
    store = _ingest()
    by_issue = {f.issue_type: store.recommendations[f.finding_id] for f in store.findings.values()}
    assert by_issue["idle_vm"].estimated_monthly_savings == 76.8
    assert by_issue["unused_storage"].estimated_monthly_savings == 28.7


def test_disabling_an_agent_drops_its_section():
    store = InMemoryStore()
    store.agents["workflow"].enabled = False
    service = GovernanceService(store)
    service.ingest_events(demo_events(), actor_id="test")
    bucket = next(
        store.recommendations[f.finding_id]
        for f in store.findings.values()
        if f.issue_type == "public_bucket"
    )
    assert "workflow" not in bucket.agent_outputs
    assert "security" in bucket.agent_outputs
