from datetime import UTC, datetime
from uuid import uuid4

from app.schemas import (
    AuditLog,
    CloudEvent,
    Finding,
    Recommendation,
    ThreatReport,
    TimelineEntry,
)
from app.threats.criticality import compute_criticality


def _issue_label(issue_type: str) -> str:
    return issue_type.replace("_", " ").title()


def build_timeline(
    finding: Finding, event: CloudEvent | None, audit_logs: list[AuditLog]
) -> list[TimelineEntry]:
    entries: list[TimelineEntry] = []
    if event is not None:
        entries.append(
            TimelineEntry(
                actor=event.owner_team or "unknown",
                action="resource_entered_risky_state",
                target_resource_id=finding.resource_id,
                timestamp=event.timestamp,
                note=f"{_issue_label(finding.issue_type)} condition present.",
            )
        )
    for log in audit_logs:
        if log.entity_id in {finding.finding_id, finding.source_event_id}:
            entries.append(
                TimelineEntry(
                    actor=log.actor_id,
                    action=log.action,
                    target_resource_id=finding.resource_id,
                    timestamp=log.created_at,
                )
            )
    entries.sort(key=lambda e: e.timestamp)
    return entries


def build_threat_report(
    finding: Finding,
    recommendation: Recommendation | None,
    event: CloudEvent | None,
    audit_logs: list[AuditLog],
    approval_status: str,
    summary_override: str | None = None,
) -> ThreatReport:
    score, factors = compute_criticality(finding, event)
    recommended = (
        recommendation.recommended_action
        if recommendation
        else "Review and remediate after approval."
    )
    agent_sections = dict(recommendation.agent_outputs) if recommendation else {}
    why = ", ".join(f"{k.replace('_', ' ')} (+{v})" for k, v in factors.items())
    summary = summary_override or (
        f"{_issue_label(finding.issue_type)} detected on {finding.resource_id} "
        f"({finding.severity}). Criticality {score}/100 — driven by {why}. "
        f"Evidence: {dict(finding.evidence)}."
    )
    return ThreatReport(
        report_id=f"threat-{uuid4().hex[:10]}",
        finding_id=finding.finding_id,
        criticality_score=score,
        criticality_factors=factors,
        summary=summary,
        timeline=build_timeline(finding, event, audit_logs),
        recommended_solution=recommended,
        agent_sections=agent_sections,
        approval_status=approval_status,
        ai_generated=bool(summary_override),
        generated_at=datetime.now(UTC),
    )
