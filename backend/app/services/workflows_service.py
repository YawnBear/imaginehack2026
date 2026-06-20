import json
import os
from datetime import UTC, datetime
from uuid import uuid4

from app.agents.ai_client import generate_agent_analysis, generate_workflow_summary
from app.agents.recommendations import build_recommendation
from app.agents.summary import stitch_summary
from app.agent.runtime import snapshot_to_events
from app.schemas import (
    CloudEvent,
    Workflow,
    WorkflowCreate,
    WorkflowListResponse,
    WorkflowRun,
    WorkflowRunAllResponse,
    WorkflowUpdate,
)

# repo_root/watch/infra-snapshot.json  (…/backend/app/services/this -> 4x up = repo root)
_REPO_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)
_SNAPSHOT_PATH = os.environ.get(
    "SAFECLOUD_SNAPSHOT", os.path.join(_REPO_ROOT, "watch", "infra-snapshot.json")
)

_INACTIVE = {"rejected", "action_completed"}


class WorkflowService:
    """Saved workflows (name + rule + agents) and a Run-all that re-scans the logs."""

    def __init__(self, store, governance) -> None:
        self.store = store
        self.governance = governance

    def list(self) -> WorkflowListResponse:
        items = list(self.store.workflows.values())
        return WorkflowListResponse(items=items, total=len(items))

    def create(self, payload: WorkflowCreate) -> Workflow:
        wf = Workflow(
            workflow_id=f"wf-{uuid4().hex[:10]}",
            name=payload.name.strip() or "Untitled workflow",
            rule_id=payload.rule_id,
            agent_keys=list(payload.agent_keys),
            created_at=datetime.now(UTC),
            last_run=None,
        )
        self.store.workflows[wf.workflow_id] = wf
        return wf

    def update(self, workflow_id: str, payload: WorkflowUpdate) -> Workflow | None:
        wf = self.store.workflows.get(workflow_id)
        if wf is None:
            return None

        updates = payload.model_dump(exclude_unset=True, exclude_none=True)
        name = wf.name
        if "name" in updates:
            name = str(updates["name"]).strip() or "Untitled workflow"
        rule_id = updates.get("rule_id", wf.rule_id)
        agent_keys = list(updates["agent_keys"]) if "agent_keys" in updates else list(wf.agent_keys)

        routing_changed = rule_id != wf.rule_id or agent_keys != wf.agent_keys
        updated = Workflow.model_validate(
            {
                **wf.model_dump(),
                "name": name,
                "rule_id": rule_id,
                "agent_keys": agent_keys,
                "last_run": None if routing_changed else wf.last_run,
            }
        )
        self.store.workflows[workflow_id] = updated
        return updated

    def delete(self, workflow_id: str) -> bool:
        if workflow_id in self.store.workflows:
            del self.store.workflows[workflow_id]
            return True
        return False

    def rule_exists(self, rule_id: str) -> bool:
        return rule_id in self.store.rules

    def run_all(self) -> WorkflowRunAllResponse:
        scanned = self._scan()
        results: list[Workflow] = []
        for wf in list(self.store.workflows.values()):
            wf.last_run = self._run_one(wf)
            self.store.workflows[wf.workflow_id] = wf  # persist last_run
            results.append(wf)
        return WorkflowRunAllResponse(scanned_findings=scanned, workflows=results)

    # ---- internals ----
    def _scan(self) -> int:
        try:
            with open(_SNAPSHOT_PATH) as fh:
                snap = json.load(fh)
            if not isinstance(snap, dict):
                return 0  # valid JSON but not an object (e.g. [], "foo", 42, null)
            events = snapshot_to_events(snap, datetime.now(UTC).isoformat())
            cloud_events = [CloudEvent(**e) for e in events]
        except (OSError, ValueError, TypeError, AttributeError):
            return 0  # no/garbage snapshot on this box -> run over whatever's already ingested
        return self.governance.ingest_events(cloud_events, actor_id="workflow-run").created_findings

    def _run_one(self, wf: Workflow) -> WorkflowRun:
        now = datetime.now(UTC)
        findings = [
            f for f in self.store.findings.values()
            if f.rule_id == wf.rule_id and f.status not in _INACTIVE
        ]
        if not findings:
            return WorkflowRun(
                ran_at=now, finding_count=0,
                summary="No matching resources found in the latest scan for this rule.",
            )
        finding = max(findings, key=lambda f: f.created_at)
        by_key = {a.output_key: a for a in self.store.agents.values() if a.enabled}
        selected = [by_key[k] for k in wf.agent_keys if k in by_key]
        rec = build_recommendation(finding)
        ai_outputs = generate_agent_analysis(finding, rec, selected) or {}
        ai_generated = bool(ai_outputs)
        summary = generate_workflow_summary(finding, ai_outputs) or stitch_summary(ai_outputs)
        if not summary:
            summary = (
                "No agents are selected for this workflow." if not selected
                else "No analysis text was generated (AI layer off or empty)."
            )
        return WorkflowRun(
            ran_at=now,
            finding_count=len(findings),
            summary=summary,
            agent_outputs={k: str(v) for k, v in ai_outputs.items()},
            ai_generated=ai_generated,
        )
