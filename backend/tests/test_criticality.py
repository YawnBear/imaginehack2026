from datetime import UTC, datetime

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


def test_low_severity_low_score():
    score, _ = compute_criticality(
        _finding(severity="low", issue_type="idle_vm", category="cost",
                 evidence={"environment": "staging"}),
        _event(env="staging"),
    )
    assert score == 8


def test_score_capped_at_100():
    score, _ = compute_criticality(
        _finding(evidence={"public_access": True, "contains_sensitive_data": True,
                           "environment": "production", "application_id": "app"}),
        _event(),
    )
    assert score == 100  # 40+25+15+15+5 = 100
