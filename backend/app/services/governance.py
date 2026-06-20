from datetime import UTC, datetime
from typing import Any, Callable
from uuid import uuid4

from app.agents.ai_client import generate_agent_analysis, generate_workflow_summary
from app.agents.recommendations import build_recommendation
from app.agents.summary import stitch_summary
from app.rules.engine import evaluate_event
from app.schemas import (
    ApprovalDecision,
    Agent,
    AuditLog,
    AuditLogListResponse,
    CloudEvent,
    DashboardSummary,
    EnergyHistoryPoint,
    EnergySummary,
    EventIngestResponse,
    Finding,
    FindingDetail,
    FindingListResponse,
    Recommendation,
    ReviewRequest,
    ReviewResponse,
    Rule,
    SourceRecordCounts,
    Workflow,
    WorkflowRun,
)
from app.services.cloud_event_sources import build_cloud_events_from_rows
from app.services.scan_sources import build_scan_events_from_asset_rows
from app.services.seed import demo_events
from app.services.store import InMemoryStore

_INACTIVE = {"rejected", "action_completed"}


class GovernanceService:
    def __init__(self, store: InMemoryStore) -> None:
        self.store = store

    @property
    def has_events(self) -> bool:
        return bool(self.store.events)

    def ingest_events(
        self,
        events: list[CloudEvent],
        actor_id: str,
        *,
        reprocess_existing: bool = False,
        source_records: SourceRecordCounts | None = None,
        agent_context: Callable[[CloudEvent], dict[str, Any]] | None = None,
    ) -> EventIngestResponse:
        accepted = 0
        created_findings = 0
        duplicate_events = 0
        updated_findings = 0
        agent_runs = 0

        for event in events:
            duplicate = event.event_id in self.store.events
            if duplicate:
                duplicate_events += 1
                if not reprocess_existing:
                    continue

            accepted += 1
            self.store.events[event.event_id] = event
            self.store.latest_scan_at = event.timestamp
            self._audit(
                entity_type="event",
                entity_id=event.event_id,
                action="event_reprocessed" if duplicate else "event_ingested",
                actor_id=actor_id,
                after_state=event.model_dump(mode="json"),
            )

            for rule_match in evaluate_event(event, list(self.store.rules.values())):
                existing = self.store.find_active_duplicate(event.resource_id, rule_match.issue_type)
                context = agent_context(event) if agent_context else None
                if existing:
                    before = existing.model_dump(mode="json")
                    existing.source_event_id = event.event_id
                    existing.resource_name = event.resource_name
                    existing.resource_type = event.resource_type
                    existing.owner_team = event.owner_team
                    existing.evidence = rule_match.evidence
                    existing.updated_at = _now()
                    self.store.findings[existing.finding_id] = existing
                    recommendation = self._refresh_recommendation(existing)
                    updated_findings += 1
                    agent_runs += self._maybe_enrich_recommendation(
                        existing,
                        recommendation,
                        context=context,
                        force=True,
                    )
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
                agent_runs += self._maybe_enrich_recommendation(
                    finding,
                    recommendation,
                    context=context,
                    force=True,
                )

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
            updated_findings=updated_findings,
            agent_runs=agent_runs,
            source_records=source_records or SourceRecordCounts(),
        )

    def ingest_events_from_seed(self) -> EventIngestResponse:
        return self.ingest_events(demo_events(), actor_id="system-seed")

    def run_scan_from_database_sources(self) -> EventIngestResponse:
        asset_rows_loader = getattr(self.store, "scan_source_rows", None)
        if callable(asset_rows_loader):
            scanned_asset_rows = asset_rows_loader()
            asset_events = build_scan_events_from_asset_rows(scanned_asset_rows)
        else:
            scanned_asset_rows = []
            loader = getattr(self.store, "scan_source_events", None)
            asset_events = loader() if callable(loader) else demo_events()

        cloud_rows_loader = getattr(self.store, "cloud_event_source_rows", None)
        cloud_event_rows = cloud_rows_loader() if callable(cloud_rows_loader) else []
        cloud_events = build_cloud_events_from_rows(cloud_event_rows)

        response = self.ingest_events(
            [*asset_events, *cloud_events],
            actor_id="scan-run",
            reprocess_existing=True,
            source_records=SourceRecordCounts(
                cloud_events=len(cloud_event_rows),
                scanned_assets=len(scanned_asset_rows) if scanned_asset_rows else len(asset_events),
            ),
            agent_context=lambda event: _agent_context_for_event(
                event,
                scanned_asset_rows,
                cloud_event_rows,
            ),
        )
        return response

    def list_findings(
        self,
        severity: str | None,
        category: str | None,
        status: str | None,
        resource_type: str | None,
        owner_team: str | None,
        q: str | None,
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
        if q:
            findings = [item for item in findings if _finding_matches(item, q)]

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

    def dashboard_energy_summary(self) -> EnergySummary:
        source_reader = getattr(self.store, "energy_source_summary", None)
        source = source_reader() if callable(source_reader) else self._in_memory_energy_source()
        by_operation = {
            key: round(float(value), 2)
            for key, value in (source.get("by_operation") or {}).items()
        }
        source_current = source.get("current_footprint_kg")
        current_footprint = round(
            float(source_current) if source_current is not None else sum(by_operation.values()),
            2,
        )
        source_reduction = source.get("estimated_reduction_kg")
        estimated_reduction = round(float(source_reduction or 0), 2)
        source_projected = source.get("projected_footprint_kg")
        projected_footprint = round(
            float(source_projected)
            if source_projected is not None
            else max(current_footprint - estimated_reduction, 0),
            2,
        )
        history = [EnergyHistoryPoint(**item) for item in source.get("history", [])]

        return EnergySummary(
            current_footprint_kg=current_footprint,
            projected_footprint_kg=projected_footprint,
            estimated_reduction_kg=estimated_reduction,
            by_operation=by_operation,
            history=history,
        )

    def reviewer_roles(self) -> list[dict[str, str]]:
        roles: set[str] = set()
        for rule in self.store.rules.values():
            roles.update(rule.required_reviewers)
        if not roles:
            roles.update({"security", "devops", "application_owner", "project_owner", "compliance", "dba"})
        return [{"role": role, "label": _role_label(role)} for role in sorted(roles)]

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

    def _in_memory_energy_source(self) -> dict:
        by_operation: dict[str, float] = {}
        for event in self.store.events.values():
            value = event.metrics.get("estimated_carbon_impact")
            if value is None:
                value = event.cost.get("estimated_carbon_impact")
            if value is None:
                continue
            operation = _operation_label(event.resource_type)
            by_operation[operation] = by_operation.get(operation, 0) + float(value)
        current_footprint = sum(by_operation.values())
        return {
            "by_operation": by_operation,
            "current_footprint_kg": current_footprint,
            "estimated_reduction_kg": 0,
            "projected_footprint_kg": current_footprint,
            "history": [],
        }

    def _refresh_recommendation(self, finding: Finding) -> Recommendation:
        existing = self.store.recommendations.get(finding.finding_id)
        refreshed = build_recommendation(finding)
        if existing is not None:
            refreshed.recommendation_id = existing.recommendation_id
            refreshed.agent_outputs = dict(existing.agent_outputs)
            refreshed.ai_generated = existing.ai_generated
            refreshed.agent_summary = existing.agent_summary
        self.store.recommendations[finding.finding_id] = refreshed
        finding.ai_confidence = refreshed.confidence
        self.store.findings[finding.finding_id] = finding
        return refreshed

    def _get_rule(self, rule_id: str) -> Rule | None:
        return self.store.rules.get(rule_id)

    def _maybe_enrich_recommendation(
        self,
        finding: Finding,
        recommendation: Recommendation | None,
        *,
        context: dict[str, Any] | None = None,
        force: bool = False,
    ) -> int:
        """Lazily rewrite the analysis TEXT via the LLM, once per finding.

        Hybrid safety: the rule engine remains the source of truth. Only the
        per-agent ``agent_outputs`` text is replaced/extended. The deterministic
        numbers (savings/carbon/risk/required reviewers/confidence) are never
        touched. On any AI failure the deterministic template text is kept and
        ``ai_generated`` stays False. Result is cached on the stored
        recommendation so generation happens at most once per finding.
        """
        if recommendation is None:
            return 0
        if recommendation.ai_generated and not force:
            return 0

        workflows = self._workflows_for_rule(finding.rule_id)
        if not workflows:
            return 0

        total_outputs = 0
        merged = dict(recommendation.agent_outputs)
        for workflow in workflows:
            selected = self._agents_for_workflow(workflow)
            ai_outputs = generate_agent_analysis(
                finding,
                recommendation,
                selected,
                context=context,
            ) or {}
            workflow_summary = (
                generate_workflow_summary(finding, ai_outputs) or stitch_summary(ai_outputs)
            )
            if not workflow_summary:
                workflow_summary = (
                    "No agents are selected for this workflow." if not selected
                    else "No analysis text was generated (AI layer off or empty)."
                )
            workflow.last_run = WorkflowRun(
                ran_at=_now(),
                finding_count=self._active_finding_count_for_rule(workflow.rule_id),
                summary=workflow_summary,
                agent_outputs={key: str(value) for key, value in ai_outputs.items()},
                ai_generated=bool(ai_outputs),
            )
            self.store.workflows[workflow.workflow_id] = workflow
            if ai_outputs:
                merged.update(ai_outputs)
                total_outputs += len(ai_outputs)

        if total_outputs == 0:
            return 0
        recommendation.agent_outputs = merged
        recommendation.ai_generated = True
        recommendation.agent_summary = (
            generate_workflow_summary(finding, merged) or stitch_summary(merged)
        )
        # Cache back so it's only generated once per finding.
        self.store.recommendations[finding.finding_id] = recommendation
        return total_outputs

    def _workflows_for_rule(self, rule_id: str) -> list[Workflow]:
        return [
            workflow
            for workflow in self.store.workflows.values()
            if workflow.rule_id == rule_id
        ]

    def _agents_for_workflow(self, workflow: Workflow) -> list[Agent]:
        by_key = {
            agent.output_key: agent
            for agent in self.store.agents.values()
            if agent.enabled
        }
        return [by_key[key] for key in workflow.agent_keys if key in by_key]

    def _active_finding_count_for_rule(self, rule_id: str) -> int:
        return sum(
            1
            for finding in self.store.findings.values()
            if finding.rule_id == rule_id and finding.status not in _INACTIVE
        )

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


def _operation_label(resource_type: str) -> str:
    text_value = str(resource_type or "").lower()
    if "database" in text_value or text_value in {"db", "rds"}:
        return "idle database"
    if "storage" in text_value or "volume" in text_value or text_value.startswith("disk"):
        return "Unused Storage"
    return "idle VM"


def _agent_context_for_event(
    event: CloudEvent,
    scanned_asset_rows: list[dict],
    cloud_event_rows: list[dict],
) -> dict[str, Any]:
    source_id = event.config.get("source_id")
    asset_id = event.config.get("asset_id") or event.resource_id
    triggering_source = _source_row(event, scanned_asset_rows, cloud_event_rows, source_id)
    related_cloud_events = [
        row
        for row in cloud_event_rows
        if row.get("asset_id") and row.get("asset_id") == asset_id
    ]

    return {
        "triggering_source": triggering_source or event.model_dump(mode="json"),
        "scanned_assets": scanned_asset_rows,
        "related_cloud_events": related_cloud_events,
    }


def _source_row(
    event: CloudEvent,
    scanned_asset_rows: list[dict],
    cloud_event_rows: list[dict],
    source_id: Any,
) -> dict | None:
    if event.source_type == "asset_scan":
        for row in scanned_asset_rows:
            if row.get("id") == source_id or row.get("asset_id") == event.resource_id:
                return row
    for row in cloud_event_rows:
        if row.get("id") == source_id:
            return row
    return None


def _finding_matches(finding: Finding, query: str) -> bool:
    q = query.strip().lower()
    if not q:
        return True
    project_id = finding.evidence.get("project_id", "")
    haystack = " ".join(
        str(value)
        for value in [
            finding.finding_id,
            finding.resource_id,
            finding.resource_name,
            finding.resource_type,
            finding.issue_type,
            finding.category,
            finding.severity,
            finding.status,
            finding.owner_team,
            project_id,
        ]
        if value is not None
    ).lower()
    return q in haystack


def _role_label(role: str) -> str:
    labels = {
        "security": "Security",
        "devops": "DevOps",
        "application_owner": "Application Owner",
        "project_owner": "Project Owner",
        "compliance": "Compliance",
        "dba": "Database Admin",
    }
    return labels.get(role, role.replace("_", " ").title())
