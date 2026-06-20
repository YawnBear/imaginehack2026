from datetime import UTC, datetime

from app.schemas import AuditLog, CloudEvent, Finding, Recommendation
from app.threats.report import build_threat_report


def _finding() -> Finding:
    return Finding(finding_id="f1", source_event_id="e1", resource_id="bucket-x",
                   resource_type="bucket", issue_type="public_bucket", category="security",
                   severity="critical", status="pending_review", rule_id="R", rule_confidence=0.9,
                   evidence={"public_access": True, "environment": "production"},
                   created_at=datetime.now(UTC), updated_at=datetime.now(UTC))


def _event() -> CloudEvent:
    return CloudEvent(event_id="e1", account_id="a", resource_id="bucket-x", resource_type="bucket",
                      environment="production", owner_team="Docs", timestamp=datetime.now(UTC))


def _rec() -> Recommendation:
    return Recommendation(recommendation_id="r1", finding_id="f1",
                          recommended_action="Restrict public access.", rationale="why",
                          risk_level="critical", confidence=0.9,
                          agent_outputs={"security": "exposure risk"})


def _audit() -> list[AuditLog]:
    return [AuditLog(audit_id="a1", entity_type="finding", entity_id="f1", action="finding_created",
                     actor_id="system-seed", created_at=datetime.now(UTC))]


def test_report_has_score_solution_and_timeline():
    report = build_threat_report(_finding(), _rec(), _event(), _audit(), "pending_review")
    assert report.criticality_score == 95
    assert report.recommended_solution == "Restrict public access."
    assert report.agent_sections == {"security": "exposure risk"}
    assert len(report.timeline) >= 2  # synthetic origin + finding_created audit
    assert report.timeline == sorted(report.timeline, key=lambda e: e.timestamp)


def test_summary_override_marks_ai_generated():
    report = build_threat_report(_finding(), _rec(), _event(), _audit(), "approved",
                                 summary_override="LLM text")
    assert report.summary == "LLM text"
    assert report.ai_generated is True
