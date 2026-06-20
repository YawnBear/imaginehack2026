from datetime import UTC, datetime
from uuid import uuid4

from app.agents.ai_client import generate_agent_analysis, generate_workflow_summary
from app.agents.recommendations import build_recommendation
from app.agents.summary import stitch_summary
from app.schemas import Finding, WorkflowRunResponse


class WorkflowService:
    """On-demand preview: run a rule's selected agents + summarizer. Persists nothing."""

    def __init__(self, store) -> None:
        self.store = store

    def run(self, rule_id: str, agent_keys: list[str]) -> WorkflowRunResponse | None:
        rule = self.store.rules.get(rule_id)
        if rule is None:
            return None
        finding, synthetic = self._representative_finding(rule_id, rule)
        rec = build_recommendation(finding)
        by_key = {a.output_key: a for a in self.store.agents.values() if a.enabled}
        selected = [by_key[k] for k in agent_keys if k in by_key]
        ai_outputs = generate_agent_analysis(finding, rec, selected) or {}
        ai_generated = bool(ai_outputs)
        summary = generate_workflow_summary(finding, ai_outputs) or stitch_summary(ai_outputs)
        if not summary:
            summary = self._empty_summary(selected)
        return WorkflowRunResponse(
            summary=summary,
            agent_outputs={k: str(v) for k, v in ai_outputs.items()},
            ai_generated=ai_generated,
            finding_preview=finding.model_dump(mode="json"),
            synthetic=synthetic,
        )

    def _representative_finding(self, rule_id: str, rule):
        matches = [f for f in self.store.findings.values() if f.rule_id == rule_id]
        if matches:
            return max(matches, key=lambda f: f.created_at), False
        return self._synthetic_finding(rule), True

    def _synthetic_finding(self, rule) -> Finding:
        now = datetime.now(UTC)
        return Finding(
            finding_id=f"preview-{uuid4().hex[:8]}",
            source_event_id="preview",
            resource_id="preview-resource",
            resource_name="Sample resource",
            resource_type=getattr(rule, "resource_type", None) or "bucket",
            issue_type=getattr(rule, "issue_type", "unknown"),
            category=getattr(rule, "category", "security"),
            severity=getattr(rule, "severity_base", "medium"),
            status="pending_review",
            rule_id=rule.rule_id,
            evidence={"preview": True, "note": "Synthetic sample for workflow preview"},
            rule_confidence=getattr(rule, "rule_confidence", 0.8),
            created_at=now,
            updated_at=now,
        )

    @staticmethod
    def _empty_summary(selected) -> str:
        if not selected:
            return (
                "No agents are selected for this rule yet. Pick one or more agents above to "
                "generate a combined analysis."
            )
        return (
            "No analysis text was generated (the AI layer is off or returned nothing). "
            "Configure an AI key to see a merged summary."
        )
