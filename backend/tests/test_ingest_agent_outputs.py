from datetime import UTC, datetime

from app.schemas import CloudEvent, Rule, RuleCondition
from app.services.governance import GovernanceService
from app.services.store import InMemoryStore


def _add_cost_rules(store: InMemoryStore) -> None:
    store.rules["RULE_IDLE_VM"] = Rule(
        rule_id="RULE_IDLE_VM",
        name="Idle VM",
        resource_type="vm",
        issue_type="idle_vm",
        category="cost",
        conditions=[RuleCondition(field="metrics.avg_cpu_percent_7d", operator="<=", value=10)],
        evidence_fields=["cost.monthly_usd"],
        created_at=datetime.now(UTC),
    )
    store.rules["RULE_UNUSED_STORAGE"] = Rule(
        rule_id="RULE_UNUSED_STORAGE",
        name="Unused Storage",
        resource_type="storage",
        issue_type="unused_storage",
        category="cost",
        conditions=[
            RuleCondition(field="config.attached", operator="==", value=False),
            RuleCondition(field="metrics.read_ops_30d", operator="==", value=0),
        ],
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


def _ingest():
    store = InMemoryStore()
    _add_cost_rules(store)
    service = GovernanceService(store)
    service.ingest_events([_vm_event(), _storage_event()], actor_id="test")
    return store


def test_agent_outputs_empty_at_ingest():
    store = _ingest()
    for finding in store.findings.values():
        assert store.recommendations[finding.finding_id].agent_outputs == {}


def test_savings_still_preserved():
    store = _ingest()
    by_issue = {f.issue_type: store.recommendations[f.finding_id] for f in store.findings.values()}
    assert by_issue["idle_vm"].estimated_monthly_savings == 76.8
    assert by_issue["unused_storage"].estimated_monthly_savings == 28.7
