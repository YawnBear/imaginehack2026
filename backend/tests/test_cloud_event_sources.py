from datetime import UTC, datetime

from app.agents.router import select_agents_for_finding
from app.rules.engine import evaluate_event
from app.rules.seed_rules import builtin_rules
from app.schemas import Finding
from app.agents.seed_agents import builtin_agents
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
    matches = evaluate_event(event, builtin_rules())
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
    match = evaluate_event(event, builtin_rules())[0]
    rule = next(rule for rule in builtin_rules() if rule.rule_id == match.rule_id)
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

    selected = select_agents_for_finding(finding, builtin_agents(), rule)

    assert [agent.output_key for agent in selected] == ["security", "workflow", "audit"]
