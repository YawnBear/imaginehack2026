from datetime import UTC, datetime

from app.schemas import CloudEvent, RuleCondition, RuleCreate, RuleUpdate
from app.services.rules_service import RuleService
from app.services.store import InMemoryStore


def _service() -> RuleService:
    return RuleService(InMemoryStore())


def _create_bucket_rule(svc: RuleService):
    return svc.create_rule(
        RuleCreate(
            name="Public Bucket",
            resource_type="bucket",
            issue_type="public_bucket",
            category="security",
            conditions=[RuleCondition(field="config.public_access", operator="==", value=True)],
        ),
        actor_id="tester",
    )


def test_list_starts_empty():
    res = _service().list_rules()
    assert res.total == 0


def test_seed_configuration_is_noop():
    from app.services.seed import seed_builtin_configuration

    store = InMemoryStore()
    seed_builtin_configuration(store)
    assert RuleService(store).list_rules().total == 0


def test_templates_nonempty():
    templates = _service().get_templates()
    assert len(templates) >= 6
    assert any(t.template_key == "threshold_breach" for t in templates)


def test_create_then_get():
    svc = _service()
    created = svc.create_rule(
        RuleCreate(
            name="Idle Prod VM",
            resource_type="vm",
            issue_type="idle_vm",
            category="cost",
            conditions=[RuleCondition(field="metrics.avg_cpu_percent_7d", operator="<=", value=5)],
        ),
        actor_id="tester",
    )
    assert created.rule_id.startswith("rule-")
    assert svc.get_rule(created.rule_id) is not None
    assert svc.list_rules().total == 1


def test_update_rule():
    svc = _service()
    created = _create_bucket_rule(svc)
    updated = svc.update_rule(created.rule_id, RuleUpdate(enabled=False), actor_id="tester")
    assert updated is not None
    assert updated.enabled is False


def test_delete_rule():
    svc = _service()
    created = _create_bucket_rule(svc)
    assert svc.delete_rule(created.rule_id, actor_id="tester") is True
    assert svc.get_rule(created.rule_id) is None
    assert svc.delete_rule("does-not-exist", actor_id="tester") is False


def test_clashes_passthrough():
    assert _service().get_clashes() == []


def test_preview_counts_matches():
    svc = _service()
    event = CloudEvent(
        event_id="event-1",
        account_id="acct-1",
        resource_id="bucket-1",
        resource_type="bucket",
        timestamp=datetime.now(UTC),
        config={"public_access": True},
    )
    svc.store.events = {event.event_id: event}
    result = svc.preview(
        resource_type="bucket",
        conditions=[RuleCondition(field="config.public_access", operator="==", value=True)],
    )
    assert result.match_count == 1
    assert "bucket-1" in result.matched_resource_ids


def test_preview_does_not_filter_by_source_type():
    svc = _service()
    asset = CloudEvent(
        event_id="asset-1",
        source_type="asset_scan",
        account_id="acct-1",
        resource_id="bucket-1",
        resource_type="bucket",
        timestamp=datetime.now(UTC),
        config={"status": "Failed"},
    )
    cloud = CloudEvent(
        event_id="cloud-1",
        source_type="cloud_event",
        account_id="acct-1",
        resource_id="arn:aws:iam::acct-1:user/alex",
        resource_type="identity",
        timestamp=datetime.now(UTC),
        config={"status": "Failed"},
    )
    svc.store.events = {asset.event_id: asset, cloud.event_id: cloud}

    result = svc.preview(
        resource_type=None,
        conditions=[RuleCondition(field="config.status", operator="!=", value="Success")],
    )

    assert result.match_count == 2
    assert result.matched_resource_ids == [
        "bucket-1",
        "arn:aws:iam::acct-1:user/alex",
    ]
