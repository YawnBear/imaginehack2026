from datetime import UTC, datetime

from app.agents.router import select_agents_for_finding
from app.rules.engine import evaluate_event
from app.schemas import Agent, Finding, Rule, RuleCondition
from app.services.cloud_event_sources import cloud_event_row_to_event


def _row(**overrides):
    row = {
        "id": "evt-1",
        "provider": "AWS",
        "cloud_account_id": "acct-1",
        "event_type": "login attempt",
        "event_source": "CloudTrail",
        "asset_id": None,
        "actor_id": "arn:aws:iam::acct-1:user/alex",
        "actor_type": "IAMUser",
        "action": "ConsoleLogin",
        "event_timestamp": datetime(2026, 6, 20, tzinfo=UTC),
        "ip_address": "203.0.113.10",
        "status": "Failed",
        "raw_payload": {"awsRegion": "ap-southeast-1"},
    }
    row.update(overrides)
    return row


def _issue_for(row) -> str | None:
    event = cloud_event_row_to_event(row)
    matches = evaluate_event(event, _event_rules())
    return matches[0].issue_type if matches else None


def test_failed_login_event_maps_to_event_rule():
    assert _issue_for(_row(action="ConsoleLogin", status="Failed")) == "failed_login"


def test_iam_change_event_maps_to_event_rule():
    assert _issue_for(_row(action="AttachRolePolicy", status="Success")) == "iam_policy_change"


def test_firewall_ingress_event_maps_to_event_rule():
    assert _issue_for(_row(action="AuthorizeSecurityGroupIngress", status="Success")) == "firewall_ingress_change"


def test_bucket_policy_event_maps_to_event_rule():
    assert _issue_for(_row(action="PutBucketPolicy", status="Success", asset_id="bucket-a")) == "bucket_policy_change"


def test_audit_logging_event_maps_to_event_rule_even_when_denied():
    assert _issue_for(_row(action="StopLogging", status="Denied")) == "audit_logging_change"


def test_database_change_event_maps_to_event_rule():
    assert _issue_for(
        _row(action="ModifyDBInstance", status="Success", asset_id="arn:aws:rds:region:acct:db:orders")
    ) == "database_change"


def test_benign_inventory_event_is_ignored_by_event_rules():
    assert _issue_for(_row(action="DescribeInstances", event_type="asset inventory read", status="Success")) is None


def test_event_rule_agent_keys_select_matching_agents():
    event = cloud_event_row_to_event(_row(action="AuthorizeSecurityGroupIngress", status="Success"))
    rules = _event_rules()
    match = evaluate_event(event, rules)[0]
    rule = next(rule for rule in rules if rule.rule_id == match.rule_id)
    finding = Finding(
        finding_id="f1",
        source_event_id=event.event_id,
        resource_id=event.resource_id,
        resource_type=event.resource_type,
        issue_type=match.issue_type,
        category=match.category,
        severity=match.severity,
        status="pending_review",
        rule_id=match.rule_id,
        evidence=match.evidence,
        rule_confidence=match.rule_confidence,
        required_reviewers=match.required_reviewers,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    selected = select_agents_for_finding(finding, _agents(), rule)

    assert [agent.output_key for agent in selected] == ["security", "workflow", "audit"]


def _event_rules() -> list[Rule]:
    now = datetime.now(UTC)
    return [
        Rule(
            rule_id="RULE_FAILED_LOGIN",
            name="Failed Console Login",
            source_type="cloud_event",
            resource_type="identity",
            conditions=[
                RuleCondition(field="config.action", operator="==", value="ConsoleLogin"),
                RuleCondition(field="config.status", operator="!=", value="Success"),
            ],
            severity_base="high",
            category="security",
            issue_type="failed_login",
            created_at=now,
        ),
        Rule(
            rule_id="RULE_IAM_CHANGE",
            name="IAM Policy Change",
            source_type="cloud_event",
            resource_type="identity",
            conditions=[
                RuleCondition(field="config.action", operator="in", value=["AttachRolePolicy"]),
                RuleCondition(field="config.status", operator="==", value="Success"),
            ],
            severity_base="high",
            category="security",
            issue_type="iam_policy_change",
            created_at=now,
        ),
        Rule(
            rule_id="RULE_FIREWALL_INGRESS_CHANGE",
            name="Firewall Ingress Change",
            source_type="cloud_event",
            resource_type="network",
            conditions=[
                RuleCondition(field="config.action", operator="==", value="AuthorizeSecurityGroupIngress"),
                RuleCondition(field="config.status", operator="==", value="Success"),
            ],
            severity_base="high",
            category="security",
            issue_type="firewall_ingress_change",
            agent_keys=["security", "workflow", "audit"],
            created_at=now,
        ),
        Rule(
            rule_id="RULE_BUCKET_POLICY_CHANGE",
            name="Bucket Policy Change",
            source_type="cloud_event",
            resource_type="bucket",
            conditions=[
                RuleCondition(field="config.action", operator="==", value="PutBucketPolicy"),
                RuleCondition(field="config.status", operator="==", value="Success"),
            ],
            severity_base="high",
            category="security",
            issue_type="bucket_policy_change",
            created_at=now,
        ),
        Rule(
            rule_id="RULE_AUDIT_LOGGING_CHANGE",
            name="Audit Logging Change",
            source_type="cloud_event",
            resource_type="audit",
            conditions=[
                RuleCondition(field="config.action", operator="in", value=["StopLogging"]),
            ],
            severity_base="critical",
            category="security",
            issue_type="audit_logging_change",
            created_at=now,
        ),
        Rule(
            rule_id="RULE_DATABASE_CHANGE",
            name="Database Change",
            source_type="cloud_event",
            resource_type="database",
            conditions=[
                RuleCondition(field="config.action", operator="in", value=["ModifyDBInstance"]),
                RuleCondition(field="config.status", operator="==", value="Success"),
            ],
            severity_base="medium",
            category="security",
            issue_type="database_change",
            created_at=now,
        ),
    ]


def _agents() -> list[Agent]:
    now = datetime.now(UTC)
    return [
        Agent(agent_id=f"agent-{key}", name=key.title(), system_prompt=f"Analyze {key}.", output_key=key, created_at=now)
        for key in ("security", "workflow", "audit")
    ]
