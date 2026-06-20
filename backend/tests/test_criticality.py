from datetime import UTC, datetime

import pytest

from app.schemas import CloudEvent, Finding
from app.threats.criticality import compute_criticality


def _finding(**kw) -> Finding:
    base = dict(finding_id="f", source_event_id="e", resource_id="r", resource_type="bucket",
                issue_type="public_bucket", category="security", severity="critical",
                status="pending_review", rule_id="R", rule_confidence=0.9,
                evidence={"public_access": True, "environment": "production"},
                created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
    base.update(kw)
    return Finding(**base)


def _event(env="production") -> CloudEvent:
    return CloudEvent(event_id="e", account_id="a", resource_id="r", resource_type="bucket",
                      environment=env, timestamp=datetime.now(UTC))


def test_public_prod_bucket_is_high():
    score, factors = compute_criticality(_finding(), _event())
    assert score == 95  # 40 sev + 25 exposure + 15 sensitivity + 15 prod
    assert factors["severity"] == 40
    assert factors["internet_exposure"] == 25


def test_low_severity_idle_keeps_issue_specific_risk():
    score, factors = compute_criticality(
        _finding(severity="low", issue_type="idle_vm", category="cost",
                 evidence={"environment": "staging"}),
        _event(env="staging"),
    )
    assert score == 18
    assert factors["idle_compute_waste"] == 10


def test_score_capped_at_100():
    score, _ = compute_criticality(
        _finding(evidence={"public_access": True, "contains_sensitive_data": True,
                           "environment": "production", "application_id": "app"}),
        _event(),
    )
    assert score == 100  # 40+25+15+15+5 = 100


@pytest.mark.parametrize(
    ("issue_type", "severity", "evidence", "env", "expected_score", "expected_factor"),
    [
        (
            "public_bucket",
            "critical",
            {"public_access": True, "environment": "production"},
            "production",
            95,
            "internet_exposure",
        ),
        ("idle_vm", "medium", {"environment": "staging"}, "staging", 28, "idle_compute_waste"),
        (
            "unused_storage",
            "medium",
            {"contains_sensitive_data": True, "environment": "production"},
            "production",
            58,
            "orphaned_storage",
        ),
        (
            "unencrypted_database",
            "critical",
            {"environment": "production", "application_id": "app"},
            "production",
            75,
            "data_sensitivity",
        ),
        ("failed_login", "high", {}, "unknown", 50, "identity_attack"),
        ("iam_policy_change", "high", {}, "unknown", 55, "privilege_change"),
        ("firewall_ingress_change", "high", {}, "unknown", 55, "network_exposure"),
        ("bucket_policy_change", "high", {}, "unknown", 50, "bucket_policy_change"),
        ("audit_logging_change", "critical", {}, "unknown", 70, "audit_visibility_loss"),
        (
            "database_change",
            "high",
            {"environment": "production"},
            "production",
            60,
            "database_control_change",
        ),
    ],
)
def test_all_builtin_issue_types_have_criticality_factors(
    issue_type,
    severity,
    evidence,
    env,
    expected_score,
    expected_factor,
):
    score, factors = compute_criticality(
        _finding(issue_type=issue_type, severity=severity, evidence=evidence),
        _event(env=env),
    )

    assert score == expected_score
    assert expected_factor in factors
