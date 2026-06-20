from app.schemas import RuleCondition, RuleCreate, RuleUpdate
from app.services.rules_service import RuleService
from app.services.store import InMemoryStore


def _service() -> RuleService:
    return RuleService(InMemoryStore())


def test_list_includes_builtins():
    res = _service().list_rules()
    assert res.total == 10


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
    assert svc.list_rules().total == 11


def test_update_rule():
    svc = _service()
    updated = svc.update_rule("RULE_PUBLIC_BUCKET", RuleUpdate(enabled=False), actor_id="tester")
    assert updated is not None
    assert updated.enabled is False


def test_delete_rule():
    svc = _service()
    assert svc.delete_rule("RULE_IDLE_VM", actor_id="tester") is True
    assert svc.get_rule("RULE_IDLE_VM") is None
    assert svc.delete_rule("does-not-exist", actor_id="tester") is False


def test_clashes_passthrough():
    assert _service().get_clashes() == []


def test_preview_counts_matches():
    svc = _service()
    # store starts with no events; ingest the demo set so preview has data
    from app.services.seed import demo_events
    svc.store.events = {e.event_id: e for e in demo_events()}
    result = svc.preview(
        resource_type="bucket",
        conditions=[RuleCondition(field="config.public_access", operator="==", value=True)],
    )
    assert result.match_count == 1
    assert "bucket-project-drawings" in result.matched_resource_ids
