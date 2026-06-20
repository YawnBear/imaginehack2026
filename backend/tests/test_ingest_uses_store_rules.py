from datetime import UTC, datetime

from app.schemas import CloudEvent, Rule, RuleCondition
from app.services.governance import GovernanceService
from app.services.seed import seed_builtin_configuration
from app.services.store import InMemoryStore


def _rule(rule_id: str, issue_type: str, resource_type: str, conditions: list[RuleCondition]) -> Rule:
    return Rule(
        rule_id=rule_id,
        name=rule_id,
        resource_type=resource_type,
        issue_type=issue_type,
        category="cost" if issue_type != "public_bucket" else "security",
        conditions=conditions,
        required_reviewers=["devops"],
        evidence_fields=["cost.monthly_usd"],
        created_at=datetime.now(UTC),
    )


def _vm_event() -> CloudEvent:
    return CloudEvent(
        event_id="event-vm",
        account_id="acct-1",
        resource_id="vm-1",
        resource_type="vm",
        timestamp=datetime.now(UTC),
        metrics={"avg_cpu_percent_7d": 3.2},
        cost={"monthly_usd": 96},
    )


def _storage_event() -> CloudEvent:
    return CloudEvent(
        event_id="event-storage",
        account_id="acct-1",
        resource_id="storage-1",
        resource_type="storage",
        timestamp=datetime.now(UTC),
        config={"attached": False},
        metrics={"read_ops_30d": 0},
        cost={"monthly_usd": 41},
    )


def _add_cost_rules(store: InMemoryStore) -> None:
    store.rules["RULE_IDLE_VM"] = _rule(
        "RULE_IDLE_VM",
        "idle_vm",
        "vm",
        [RuleCondition(field="metrics.avg_cpu_percent_7d", operator="<=", value=10)],
    )
    store.rules["RULE_UNUSED_STORAGE"] = _rule(
        "RULE_UNUSED_STORAGE",
        "unused_storage",
        "storage",
        [
            RuleCondition(field="config.attached", operator="==", value=False),
            RuleCondition(field="metrics.read_ops_30d", operator="==", value=0),
        ],
    )


def test_store_starts_without_builtin_rules():
    store = InMemoryStore()
    assert len(store.rules) == 0


def test_seed_configuration_does_not_add_rules():
    store = InMemoryStore()
    seed_builtin_configuration(store, agents=False, workflows=False)
    assert len(store.rules) == 0


def test_ingest_creates_findings_via_store_rules():
    store = InMemoryStore()
    _add_cost_rules(store)
    service = GovernanceService(store)
    res = service.ingest_events([_vm_event(), _storage_event()], actor_id="test")
    assert res.created_findings == 2


def test_disabling_a_store_rule_suppresses_its_finding():
    store = InMemoryStore()
    _add_cost_rules(store)
    store.rules["RULE_IDLE_VM"].enabled = False
    service = GovernanceService(store)
    res = service.ingest_events([_vm_event(), _storage_event()], actor_id="test")
    assert res.created_findings == 1
    assert all(f.issue_type != "idle_vm" for f in store.findings.values())


def test_idle_vm_and_storage_savings_preserved():
    store = InMemoryStore()
    _add_cost_rules(store)
    service = GovernanceService(store)
    service.ingest_events([_vm_event(), _storage_event()], actor_id="test")
    recs = {f.issue_type: store.recommendations[f.finding_id] for f in store.findings.values()}
    assert recs["idle_vm"].estimated_monthly_savings == 76.8
    assert recs["unused_storage"].estimated_monthly_savings == 28.7
