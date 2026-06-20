from datetime import UTC, datetime

from app.schemas import Rule, RuleCondition, RuleCreate


def test_rule_without_resource_type_defaults_to_none():
    rule = Rule(
        rule_id="r-1",
        name="Any Resource Rule",
        issue_type="custom_rule",
        category="security",
        conditions=[RuleCondition(field="config.public_access", operator="==", value=True)],
        created_at=datetime.now(UTC),
    )
    assert rule.resource_type is None


def test_rule_create_without_resource_type_defaults_to_none():
    payload = RuleCreate(
        name="Any Resource Rule",
        issue_type="custom_rule",
        category="security",
        conditions=[RuleCondition(field="config.public_access", operator="==", value=True)],
    )
    assert payload.resource_type is None


def test_rule_condition_minimal():
    c = RuleCondition(field="config.public_access", operator="==", value=True)
    assert c.field == "config.public_access"
    assert c.operator == "=="
    assert c.value is True


def test_rule_create_defaults():
    payload = RuleCreate(
        name="My Rule",
        resource_type="bucket",
        issue_type="public_bucket",
        category="security",
        conditions=[RuleCondition(field="config.public_access", operator="==", value=True)],
    )
    assert payload.enabled is True
    assert payload.severity_base == "medium"
    assert payload.required_reviewers == []
    assert payload.remediation_destructive is False
