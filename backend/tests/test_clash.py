from datetime import UTC, datetime

from app.rules.clash import detect_clashes
from app.rules.seed_rules import builtin_rules
from app.schemas import Rule, RuleCondition


def _rule(rule_id, field) -> Rule:
    return Rule(
        rule_id=rule_id,
        name=rule_id,
        resource_type="vm",
        issue_type="idle_vm",
        category="cost",
        conditions=[RuleCondition(field=field, operator="<=", value=10)],
        created_at=datetime.now(UTC),
    )


def test_no_clash_among_builtins():
    # built-ins target different resource_types -> no clashes
    assert detect_clashes(builtin_rules()) == []


def test_same_resource_and_field_clashes():
    warnings = detect_clashes([_rule("A", "metrics.avg_cpu_percent_7d"), _rule("B", "metrics.avg_cpu_percent_7d")])
    assert len(warnings) == 1
    assert {warnings[0].rule_id_a, warnings[0].rule_id_b} == {"A", "B"}
    assert warnings[0].field == "metrics.avg_cpu_percent_7d"


def test_same_resource_different_field_no_clash():
    assert detect_clashes([_rule("A", "metrics.avg_cpu_percent_7d"), _rule("B", "metrics.network_in_mb_7d")]) == []


def test_disabled_rule_does_not_clash():
    a = _rule("A", "metrics.avg_cpu_percent_7d")
    b = _rule("B", "metrics.avg_cpu_percent_7d")
    b.enabled = False
    assert detect_clashes([a, b]) == []
