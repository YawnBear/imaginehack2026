from datetime import UTC, datetime

from app.rules.operators import evaluate_condition, resolve_field
from app.schemas import CloudEvent, RuleCondition


def _event(**overrides) -> CloudEvent:
    base = dict(
        event_id="e1",
        account_id="a",
        resource_id="r1",
        resource_type="vm",
        environment="production",
        timestamp=datetime.now(UTC),
        config={"application_id": "app-1", "public_access": True},
        metrics={"avg_cpu_percent_7d": 3.2},
        cost={"monthly_usd": 96},
    )
    base.update(overrides)
    return CloudEvent(**base)


def test_resolve_top_level_field():
    assert resolve_field(_event(), "resource_type") == "vm"
    assert resolve_field(_event(), "environment") == "production"


def test_resolve_nested_field():
    assert resolve_field(_event(), "config.public_access") is True
    assert resolve_field(_event(), "metrics.avg_cpu_percent_7d") == 3.2
    assert resolve_field(_event(), "cost.monthly_usd") == 96


def test_resolve_missing_field_is_none():
    assert resolve_field(_event(), "metrics.does_not_exist") is None
    assert resolve_field(_event(), "config.nope") is None


def test_eq_and_neq():
    assert evaluate_condition(_event(), RuleCondition(field="config.public_access", operator="==", value=True))
    assert evaluate_condition(_event(), RuleCondition(field="resource_type", operator="!=", value="bucket"))


def test_numeric_lte_gt():
    e = _event(metrics={"avg_cpu_percent_7d": 3.2})
    assert evaluate_condition(e, RuleCondition(field="metrics.avg_cpu_percent_7d", operator="<=", value=10))
    assert not evaluate_condition(e, RuleCondition(field="metrics.avg_cpu_percent_7d", operator=">", value=10))


def test_missing_numeric_field_does_not_match():
    e = _event(metrics={})
    assert not evaluate_condition(e, RuleCondition(field="metrics.avg_cpu_percent_7d", operator="<=", value=10))


def test_exists_and_contains():
    assert evaluate_condition(_event(), RuleCondition(field="config.application_id", operator="exists"))
    assert not evaluate_condition(_event(metrics={}), RuleCondition(field="metrics.avg_cpu_percent_7d", operator="exists"))
    assert evaluate_condition(_event(), RuleCondition(field="config.application_id", operator="contains", value="app"))


def test_in_and_not_in():
    assert evaluate_condition(_event(), RuleCondition(field="resource_type", operator="in", value=["vm", "bucket"]))
    assert evaluate_condition(_event(), RuleCondition(field="resource_type", operator="not_in", value=["bucket"]))
