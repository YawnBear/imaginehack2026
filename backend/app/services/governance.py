from datetime import UTC, datetime
from uuid import uuid4

from app.agents.ai_client import generate_agent_analysis, generate_workflow_summary
from app.agents.recommendations import build_recommendation
from app.agents.summary import stitch_summary
from app.agents.router import select_agents_for_finding
from app.core.config import get_settings
from app.rules.engine import evaluate_event
from app.schemas import (
    ApprovalDecision,
    AuditLog,
    AuditLogListResponse,
    CloudEvent,
    DashboardSummary,
    EventIngestResponse,
    Finding,
    FindingDetail,
    FindingListResponse,
    Recommendation,
    ReviewRequest,
    ReviewResponse,
)
from app.services.seed import demo_events
from app.services.store import InMemoryStore


class GovernanceService:
    def __init__(self, store: InMemoryStore) -> None:
        self.store = store

    @property
    def has_events(self) -> bool:
        return bool(self.store.events)

    def ingest_events(self, events: list[CloudEvent], actor_id: str) -> EventIngestResponse:
        accepted = 0
        created_findings = 0
        duplicate_events = 0

        for event in events:
            if event.event_id in self.store.events:
                duplicate_events += 1
                continue

            accepted += 1
            self.store.events[event.event_id] = event
            self.store.latest_scan_at = event.timestamp
            self._audit(
                entity_type="event",
                entity_id=event.event_id,
                action="event_ingested",
                actor_id=actor_id,
                after_state=event.model_dump(mode="json"),
            )

            for rule_match in evaluate_event(event, list(self.store.rules.values())):
                existing = self.store.find_active_duplicate(event.resource_id, rule_match.issue_type)
                if existing:
                    before = existing.model_dump(mode="json")
                    existing.evidence = rule_match.evidence
                    existing.updated_at = _now()
                    self.store.findings[existing.finding_id] = existing
                    self._audit(
                        entity_type="finding",
                        entity_id=existing.finding_id,
                        action="finding_updated",
                        actor_id=actor_id,
                        before_state=before,
                        after_state=existing.model_dump(mode="json"),
                    )
                    continue

                finding = Finding(
                    finding_id=f"find-{uuid4().hex[:10]}",
                    source_event_id=event.event_id,
                    resource_id=event.resource_id,
                    resource_name=event.resource_name,
                    resource_type=event.resource_type,
                    owner_team=event.owner_team,
                    issue_type=rule_match.issue_type,
                    category=rule_match.category,
                    severity=rule_match.severity,
                    status="pending_review",
                    rule_id=rule_match.rule_id,
                    evidence=rule_match.evidence,
                    rule_confidence=rule_match.rule_confidence,
                    required_reviewers=rule_match.required_reviewers,
                    created_at=_now(),
                    updated_at=_now(),
                )
                recommendation = build_recommendation(finding)
                finding.ai_confidence = recommendation.confidence

                self.store.findings[finding.finding_id] = finding
                self.store.recommendations[finding.finding_id] = recommendation
                created_findings += 1

                self._audit(
                    entity_type="finding",
                    entity_id=finding.finding_id,
                    action="finding_created",
                    actor_id=actor_id,
                    after_state=finding.model_dump(mode="json"),
                )
                self._audit(
                    entity_type="recommendation",
                    entity_id=recommendation.recommendation_id,
                    action="recommendation_generated",
                    actor_id="recommendation-engine",
                    after_state=recommendation.model_dump(mode="json"),
                )

        return EventIngestResponse(
            accepted=accepted,
            created_findings=created_findings,
            duplicate_events=duplicate_events,
        )

    def ingest_events_from_seed(self) -> EventIngestResponse:
        return self.ingest_events(demo_events(), actor_id="system-seed")

    def list_findings(
        self,
        severity: str | None,
        category: str | None,
        status: str | None,
        resource_type: str | None,
        owner_team: str | None,
        page: int,
        page_size: int,
    ) -> FindingListResponse:
        findings = list(self.store.findings.values())
        if severity:
            findings = [item for item in findings if item.severity == severity]
        if category:
            findings = [item for item in findings if item.category == category]
        if status:
            findings = [item for item in findings if item.status == status]
        if resource_type:
            findings = [item for item in findings if item.resource_type == resource_type]
        if owner_team:
            findings = [item for item in findings if item.owner_team == owner_team]

        findings.sort(key=lambda item: item.created_at, reverse=True)
        total = len(findings)
        start = (page - 1) * page_size
        end = start + page_size

        return FindingListResponse(
            items=findings[start:end],
            page=page,
            page_size=page_size,
            total=total,
        )

    def get_finding_detail(self, finding_id: str) -> FindingDetail | None:
        finding = self.store.findings.get(finding_id)
        if not finding:
            return None

        recommendation = self.store.recommendations.get(finding_id)
        self._maybe_enrich_recommendation(finding, recommendation)

        return FindingDetail(
            finding=finding,
            recommendation=recommendation,
            approvals=[
                approval
                for approval in self.store.approvals.values()
                if approval.finding_id == finding_id
            ],
            audit_logs=[
                audit_log
                for audit_log in self.store.audit_logs
                if audit_log.entity_id in {finding_id, finding.source_event_id}
            ],
        )

    def review_finding(self, finding_id: str, review: ReviewRequest) -> ReviewResponse:
        finding = self.store.findings[finding_id]
        before = finding.model_dump(mode="json")

        approval = ApprovalDecision(
            approval_id=f"approval-{uuid4().hex[:10]}",
            finding_id=finding_id,
            decision=review.decision,
            reviewer_id=review.reviewer_id,
            reviewer_role=review.reviewer_role,
            reason=review.reason,
            created_at=_now(),
        )
        self.store.approvals[approval.approval_id] = approval

        if review.decision == "approved":
            remaining = self._remaining_reviewers(finding_id, finding.required_reviewers)
            finding.status = "approved" if not remaining else "pending_review"
        elif review.decision == "rejected":
            finding.status = "rejected"
        elif review.decision == "deferred":
            finding.status = "deferred"
        else:
            finding.status = "needs_more_information"

        finding.updated_at = _now()
        self.store.findings[finding_id] = finding

        audit_log = self._audit(
            entity_type="approval",
            entity_id=approval.approval_id,
            action=f"finding_{review.decision}",
            actor_id=review.reviewer_id,
            before_state=before,
            after_state={
                "finding": finding.model_dump(mode="json"),
                "approval": approval.model_dump(mode="json"),
            },
            metadata={"finding_id": finding_id},
        )

        return ReviewResponse(
            finding_id=finding_id,
            status=finding.status,
            required_reviewers_remaining=self._remaining_reviewers(
                finding_id,
                finding.required_reviewers,
            ),
            audit_id=audit_log.audit_id,
        )

    def dashboard_summary(self) -> DashboardSummary:
        findings = list(self.store.findings.values())
        recommendations = list(self.store.recommendations.values())
        active = [finding for finding in findings if finding.status not in {"rejected", "action_completed"}]

        return DashboardSummary(
            active_findings=len(active),
            critical_findings=sum(1 for finding in active if finding.severity == "critical"),
            pending_approvals=sum(1 for finding in active if finding.status == "pending_review"),
            approved_actions=sum(1 for finding in findings if finding.status == "approved"),
            estimated_monthly_savings=round(
                sum(item.estimated_monthly_savings for item in recommendations),
                2,
            ),
            estimated_carbon_reduction_kg=round(
                sum(item.estimated_carbon_reduction_kg for item in recommendations),
                2,
            ),
            latest_scan_at=self.store.latest_scan_at,
            findings_by_category=_count_by(findings, "category"),
            findings_by_severity=_count_by(findings, "severity"),
        )

    def list_audit_logs(
        self,
        entity_type: str | None,
        entity_id: str | None,
        page: int,
        page_size: int,
    ) -> AuditLogListResponse:
        audit_logs = self.store.audit_logs
        if entity_type:
            audit_logs = [item for item in audit_logs if item.entity_type == entity_type]
        if entity_id:
            audit_logs = [item for item in audit_logs if item.entity_id == entity_id]

        audit_logs = sorted(audit_logs, key=lambda item: item.created_at, reverse=True)
        total = len(audit_logs)
        start = (page - 1) * page_size
        end = start + page_size

        return AuditLogListResponse(
            items=audit_logs[start:end],
            page=page,
            page_size=page_size,
            total=total,
        )

    def _maybe_enrich_recommendation(
        self,
        finding: Finding,
        recommendation: Recommendation | None,
    ) -> None:
        """Lazily rewrite the analysis TEXT via the LLM, once per finding.

        Hybrid safety: the rule engine remains the source of truth. Only the
        per-agent ``agent_outputs`` text is replaced/extended. The deterministic
        numbers (savings/carbon/risk/required reviewers/confidence) are never
        touched. On any AI failure the deterministic template text is kept and
        ``ai_generated`` stays False. Result is cached on the stored
        recommendation so generation happens at most once per finding.
        """
        if recommendation is None:
            return
        if recommendation.ai_generated:
            return  # already enriched (cached) — generate once only
        if not get_settings().ai_enabled:
            return

        selected = select_agents_for_finding(
            finding, list(self.store.agents.values()), self.store.rules.get(finding.rule_id)
        )
        ai_outputs = generate_agent_analysis(finding, recommendation, selected)
        if not ai_outputs:
            return  # disabled/timeout/unparseable -> keep template text

        merged = dict(recommendation.agent_outputs)
        merged.update(ai_outputs)
        recommendation.agent_outputs = merged
        recommendation.ai_generated = True
        recommendation.agent_summary = (
            generate_workflow_summary(finding, merged) or stitch_summary(merged)
        )
        # Cache back so it's only generated once per finding.
        self.store.recommendations[finding.finding_id] = recommendation

    def record_activity(self, activities: list) -> int:
        for activity in activities:
            self.store.activities.append(activity)
        return len(activities)

    def _remaining_reviewers(self, finding_id: str, required_reviewers: list[str]) -> list[str]:
        approved_roles = {
            approval.reviewer_role
            for approval in self.store.approvals.values()
            if approval.finding_id == finding_id and approval.decision == "approved"
        }
        return [role for role in required_reviewers if role not in approved_roles]

    def _audit(
        self,
        entity_type: str,
        entity_id: str,
        action: str,
        actor_id: str,
        before_state: dict | None = None,
        after_state: dict | None = None,
        metadata: dict | None = None,
    ) -> AuditLog:
        audit_log = AuditLog(
            audit_id=f"audit-{uuid4().hex[:10]}",
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            actor_id=actor_id,
            before_state=before_state or {},
            after_state=after_state or {},
            metadata=metadata or {},
            created_at=_now(),
        )
        self.store.audit_logs.append(audit_log)
        return audit_log


def _now() -> datetime:
    return datetime.now(UTC)


def _count_by(findings: list[Finding], field_name: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for finding in findings:
        value = str(getattr(finding, field_name))
        counts[value] = counts.get(value, 0) + 1
    return counts
