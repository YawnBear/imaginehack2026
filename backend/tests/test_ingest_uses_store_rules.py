from app.services.governance import GovernanceService
from app.services.seed import demo_events
from app.services.store import InMemoryStore


def test_store_seeds_builtin_rules():
    store = InMemoryStore()
    assert len(store.rules) == 4
    assert "RULE_PUBLIC_BUCKET" in store.rules


def test_ingest_creates_findings_via_store_rules():
    store = InMemoryStore()
    service = GovernanceService(store)
    res = service.ingest_events(demo_events(), actor_id="test")
    assert res.created_findings == 4


def test_disabling_a_store_rule_suppresses_its_finding():
    store = InMemoryStore()
    store.rules["RULE_PUBLIC_BUCKET"].enabled = False
    service = GovernanceService(store)
    res = service.ingest_events(demo_events(), actor_id="test")
    assert res.created_findings == 3
    assert all(f.issue_type != "public_bucket" for f in store.findings.values())


def test_idle_vm_and_storage_savings_preserved():
    # REGRESSION GUARD: the data-driven engine keys cost.monthly_usd as
    # "monthly_usd"; recommendations.py must read that key or savings -> 0.
    store = InMemoryStore()
    service = GovernanceService(store)
    service.ingest_events(demo_events(), actor_id="test")
    recs = {f.issue_type: store.recommendations[f.finding_id] for f in store.findings.values()}
    assert recs["idle_vm"].estimated_monthly_savings == 76.8  # 96 * 0.8
    assert recs["unused_storage"].estimated_monthly_savings == 28.7  # 41 * 0.7
