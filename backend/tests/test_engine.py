from datetime import UTC, datetime

from app.rules.engine import build_match, evaluate_event
from app.schemas import CloudEvent, Rule, RuleCondition


def _now():
    return datetime.now(UTC)


def _rule(**overrides) -> Rule:
    base = dict(
        rule_id="R1",
        name="Test",
        resource_type="vm",
        issue_type="idle_vm",
        category="cost",
        severity_base="medium",
        escalate_in_prod=True,
        rule_confidence=0.9,
        required_reviewers=["devops"],
        conditions=[RuleCondition(field="metrics.avg_cpu_percent_7d", operator="<=", value=10)],
        evidence_fields=["cost.monthly_usd"],
        created_at=_now(),
    )
    base.update(overrides)
    return Rule(**base)


def _vm(env="staging", cpu=3.2) -> CloudEvent:
    return CloudEvent(
        event_id="e",
        account_id="a",
        resource_id="vm-1",
        resource_type="vm",
        environment=env,
        timestamp=_now(),
        metrics={"avg_cpu_percent_7d": cpu},
        cost={"monthly_usd": 96},
    )


def test_matching_rule_produces_match():
    matches = evaluate_event(_vm(), [_rule()])
    assert len(matches) == 1
    assert matches[0].rule_id == "R1"
    assert matches[0].issue_type == "idle_vm"


def test_non_matching_rule_is_skipped():
    assert evaluate_event(_vm(cpu=80), [_rule()]) == []


def test_disabled_rule_is_skipped():
    assert evaluate_event(_vm(), [_rule(enabled=False)]) == []


def test_wrong_resource_type_is_skipped():
    bucket = CloudEvent(event_id="e", account_id="a", resource_id="b1", resource_type="bucket", timestamp=_now())
    assert evaluate_event(bucket, [_rule()]) == []


def test_rule_source_type_does_not_skip_matching_event():
    event = CloudEvent(
        event_id="cloud-1",
        source_type="cloud_event",
        account_id="a",
        resource_id="arn:aws:iam::a:user/alex",
        resource_type="identity",
        timestamp=_now(),
        config={"action": "ConsoleLogin", "status": "Failed"},
    )
    rule = _rule(
        resource_type="identity",
        issue_type="failed_login",
        category="security",
        conditions=[
            RuleCondition(field="config.action", operator="==", value="ConsoleLogin"),
            RuleCondition(field="config.status", operator="!=", value="Success"),
        ],
    )

    matches = evaluate_event(event, [rule])

    assert len(matches) == 1
    assert matches[0].issue_type == "failed_login"


def test_prod_escalation():
    assert build_match(_vm(env="production"), _rule()).severity == "high"
    assert build_match(_vm(env="staging"), _rule()).severity == "medium"


def test_evidence_keyed_by_leaf():
    ev = build_match(_vm(), _rule()).evidence
    assert ev["avg_cpu_percent_7d"] == 3.2  # from condition
    assert ev["monthly_usd"] == 96  # from evidence_fields
