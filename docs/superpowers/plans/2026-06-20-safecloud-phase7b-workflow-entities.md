# SafeCloud Phase 7b — Workflows as saved entities + Run all (REVAMP)

> Spec: `docs/superpowers/specs/2026-06-20-workflow-summary-design.md`. Replaces the prior
> "builder + /run preview". A **Workflow** is a persisted entity (name + rule + agents); the page lists
> cards created via a modal; one **Run all** button re-scans `watch/infra-snapshot.json` and fills each
> card with a merged summary. Results persist.
>
> **Branch:** `safecloud-phase1-rules`. macOS, `backend/.venv`. **Keep** the summarizer/stitch
> (`agents/summary.py`, `agents/ai_client.py`), the finding-modal WORKFLOW SUMMARY block, and the typed
> `sc_*` Postgres store. **Rewrite** the old workflows_service/routes/schemas/WorkflowBuilder.
> **Gates:** backend `cd backend && .venv/bin/python -m pytest -q`; frontend `node ./node_modules/next/dist/bin/next build`.

## Invariants
- Rules own detection + ALL numbers; the LLM only writes/merges TEXT; AI calls never raise.
- `run_all` always returns 200; `_scan` tolerates a missing snapshot file.
- AI is ON in the backend test env → every test hitting `run_all`/agents MUST monkeypatch
  `generate_agent_analysis` + `generate_workflow_summary`. Suite stays network-free and fast.
- Do NOT touch the kept files except where listed. Do NOT change `rule.agent_keys` routing (decoupled).

---

# BACKEND

## B1. `backend/app/schemas/workflows.py` — REPLACE ENTIRE FILE
```python
from datetime import datetime

from pydantic import BaseModel, Field


class WorkflowRun(BaseModel):
    """Persisted result of the last Run-all for one workflow."""
    ran_at: datetime | None = None
    finding_count: int = 0
    summary: str = ""
    agent_outputs: dict[str, str] = Field(default_factory=dict)
    ai_generated: bool = False


class Workflow(BaseModel):
    workflow_id: str
    name: str
    rule_id: str
    agent_keys: list[str] = Field(default_factory=list)
    created_at: datetime
    last_run: WorkflowRun | None = None


class WorkflowCreate(BaseModel):
    name: str
    rule_id: str
    agent_keys: list[str] = Field(default_factory=list)


class WorkflowListResponse(BaseModel):
    items: list[Workflow]
    total: int


class WorkflowRunAllResponse(BaseModel):
    scanned_findings: int
    workflows: list[Workflow]
```

## B2. `backend/app/schemas/__init__.py`
Replace the `from app.schemas.workflows import (WorkflowRunRequest, WorkflowRunResponse)` block with:
```python
from app.schemas.workflows import (
    Workflow,
    WorkflowCreate,
    WorkflowListResponse,
    WorkflowRun,
    WorkflowRunAllResponse,
)
```
And in `__all__` replace `"WorkflowRunRequest", "WorkflowRunResponse"` with
`"Workflow", "WorkflowCreate", "WorkflowListResponse", "WorkflowRun", "WorkflowRunAllResponse"`.

## B3. `backend/app/services/store.py` — add to `InMemoryStore.__init__`
Add (and import `Workflow` on the existing schemas import line):
```python
        self.workflows: dict[str, Workflow] = {}
```

## B4. `backend/app/services/pg_store.py` — add `sc_workflows`
Add `Workflow` to the `from app.schemas import (...)` block. Add the table next to `sc_activities`:
```python
sc_workflows = Table(
    "sc_workflows", _md,
    Column("workflow_id", String, primary_key=True),
    Column("name", String), Column("rule_id", String),
    Column("agent_keys", JSONB),
    Column("created_at", DateTime(timezone=True)),
    Column("last_run", JSONB),
    _seq(),
)
```
In `PostgresStore.__init__`, after `self.activities = ...`:
```python
        self.workflows = TableDict(self._engine, sc_workflows, "workflow_id", Workflow)
```
(`_md.create_all(checkfirst=True)` already runs first, so the new table is auto-created.)

## B5. `backend/app/services/workflows_service.py` — REPLACE ENTIRE FILE
```python
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
        except (OSError, ValueError):
            return 0  # no snapshot on this box -> run over whatever's already ingested
        events = snapshot_to_events(snap, datetime.now(UTC).isoformat())
        try:
            cloud_events = [CloudEvent(**e) for e in events]
        except (TypeError, ValueError):
            return 0
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
```

## B6. `backend/app/api/workflows_routes.py` — REPLACE ENTIRE FILE
```python
from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas import (
    Workflow,
    WorkflowCreate,
    WorkflowListResponse,
    WorkflowRunAllResponse,
)
from app.services.dependencies import get_workflow_service
from app.services.workflows_service import WorkflowService

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.get("", response_model=WorkflowListResponse)
def list_workflows(service: WorkflowService = Depends(get_workflow_service)) -> WorkflowListResponse:
    return service.list()


@router.post("", response_model=Workflow, status_code=status.HTTP_201_CREATED)
def create_workflow(
    payload: WorkflowCreate, service: WorkflowService = Depends(get_workflow_service)
) -> Workflow:
    if not service.rule_exists(payload.rule_id):
        raise HTTPException(status_code=400, detail="Unknown rule_id")
    return service.create(payload)


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow(
    workflow_id: str, service: WorkflowService = Depends(get_workflow_service)
) -> None:
    if not service.delete(workflow_id):
        raise HTTPException(status_code=404, detail="Workflow not found")


@router.post("/run-all", response_model=WorkflowRunAllResponse)
def run_all(service: WorkflowService = Depends(get_workflow_service)) -> WorkflowRunAllResponse:
    return service.run_all()
```
(`main.py` already does `include_router(workflows_router)` — leave it.)

## B7. `backend/app/services/dependencies.py`
Change the workflow service construction to inject governance:
```python
_workflow_service = WorkflowService(_store, _governance_service)
```
(keep `get_workflow_service`). Ensure `_governance_service` is defined above this line (it is).

## B8. Tests — `backend/tests/test_workflow_summary.py`
KEEP the existing unit tests for `stitch_summary`, `parse_summary`, `generate_workflow_summary`.
REMOVE the old `WorkflowService.run`/`/api/workflows/run` tests. ADD (network-free; monkeypatch the two AI funcs and, where needed, `WorkflowService._scan`):
- CRUD via `TestClient`: `POST /api/workflows` → 201 + appears in `GET /api/workflows`; `DELETE` → 204 then gone; `POST` with unknown rule → 400.
- `run_all`: seed a rule + a finding for it (or stub `_scan` to inject one), stub `generate_agent_analysis`→`{"security": "..."}` and `generate_workflow_summary`→`"merged"`; assert the workflow's `last_run.summary == "merged"`, `finding_count >= 1`, `ai_generated True`, and that `store.workflows[id].last_run` persisted.
- `run_all` with a rule that has no findings → `last_run.summary` starts "No matching resources".
- Patch `WorkflowService._scan` to return 0 in CRUD/run tests so they never read the real file or hit the network.

**Gate:** `cd backend && .venv/bin/python -m pytest -q` — green.
**Commit:** `feat(workflows): saved workflow entities + Run-all scan (backend)`

---

# FRONTEND

## F1. `app/lib/types.ts`
Remove `WorkflowRunRequest`/`WorkflowRunResponse`. Keep `agent_summary?: string` on `Recommendation`. Add:
```ts
export interface WorkflowRun {
  ran_at: string | null;
  finding_count: number;
  summary: string;
  agent_outputs: Record<string, string>;
  ai_generated: boolean;
}

export interface Workflow {
  workflow_id: string;
  name: string;
  rule_id: string;
  agent_keys: string[];
  created_at: string;
  last_run: WorkflowRun | null;
}

export interface WorkflowCreateBody {
  name: string;
  rule_id: string;
  agent_keys: string[];
}

export interface WorkflowListResponse {
  items: Workflow[];
  total: number;
}

export interface WorkflowRunAllResponse {
  scanned_findings: number;
  workflows: Workflow[];
}
```

## F2. `app/lib/api.ts`
Remove `runWorkflow`. Import the new types. Add:
```ts
export async function getWorkflows(): Promise<ApiResult<WorkflowListResponse>> {
  try {
    return ok(await tryFetch<WorkflowListResponse>("/api/workflows"));
  } catch (e) {
    return fallback({ items: [], total: 0 }, e);
  }
}

export async function createWorkflow(
  body: WorkflowCreateBody,
): Promise<ApiResult<Workflow | null>> {
  try {
    return ok(await tryFetch<Workflow>("/api/workflows", { method: "POST", body: JSON.stringify(body) }));
  } catch (e) {
    return fallback(null, e);
  }
}

export async function deleteWorkflow(id: string): Promise<ApiResult<boolean>> {
  try {
    await tryFetch<unknown>(`/api/workflows/${id}`, { method: "DELETE" });
    return ok(true);
  } catch (e) {
    return fallback(false, e);
  }
}

export async function runAllWorkflows(): Promise<ApiResult<WorkflowRunAllResponse>> {
  try {
    return ok(await tryFetch<WorkflowRunAllResponse>("/api/workflows/run-all", { method: "POST" }));
  } catch (e) {
    return fallback({ scanned_findings: 0, workflows: [] }, e);
  }
}
```

## F3. `app/(dashboard)/workflows/WorkflowsManager.tsx` — NEW (delete `WorkflowBuilder.tsx`)
Client component. Props `{ workflows: Workflow[]; rules: Rule[]; agents: Agent[] }`.
- State: `list` (Workflow[], seeded from props), `running` (bool), `modalOpen` (bool).
- **Header row**: `<PageHeader>`-style title on the left; on the right two buttons — `+ Create workflow`
  (opens modal) and `Run all ▶` (disabled when `list` is empty or `running`; shows a spinner label while running).
- **Run all** → `setRunning(true)`; `const res = await runAllWorkflows()`; merge `res.data.workflows` into
  `list` by `workflow_id`; toast `"Scanned ${res.data.scanned_findings} findings · ran ${res.data.workflows.length} workflows"`;
  `setRunning(false)`. On `res.mock` show an offline toast.
- **Cards grid** (`grid gap-4 md:grid-cols-2`): each card shows the workflow `name`, the rule name
  (look up `rules` by `rule_id`), agent chips (look up `agents` by `output_key`, colored via `CATEGORY_COLOR`),
  a ✕ delete control (→ `deleteWorkflow` + remove from `list`), and a result area:
  - if `last_run` present: a highlighted summary block (reuse the finding-modal style: `border-[#065FD433] bg-[#065FD40A]`),
    a ✨ AI-generated / "offline" badge from `last_run.ai_generated`, `last_run.finding_count` resources, relative
    `ran_at`, and a collapsible `<details>` listing `agent_outputs`.
  - else a muted "Not run yet — press Run all." line.
- **Create modal** (simple overlay like `FindingModal` scrim): `name` text input, rule `<select>` (from `rules`),
  agent checkbox chips (from `agents`, toggling a local `Set`), Cancel + Save. Save (disabled until name + rule
  chosen) → `createWorkflow({name, rule_id, agent_keys})` → prepend `res.data` to `list`, close modal, toast.
Reuse `Card`, `PageHeader` (or inline header), `useToast`, `CATEGORY_COLOR`/`issueLabel` from `@/app/lib/format`.
Match existing Tailwind conventions. Must start with `"use client"`.

## F4. `app/(dashboard)/workflows/page.tsx`
```tsx
import { getWorkflows, getRules, getAgents } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner } from "@/app/components/ui";
import WorkflowsManager from "./WorkflowsManager";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const [wfRes, rulesRes, agentsRes] = await Promise.all([getWorkflows(), getRules(), getAgents()]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Workflows"
        subtitle="Create a workflow from a rule and its agents, then press Run all to scan the logs and get one merged summary per workflow."
      />
      {(wfRes.mock || rulesRes.mock || agentsRes.mock) && (
        <MockBanner reason={wfRes.error ?? rulesRes.error ?? agentsRes.error} />
      )}
      <WorkflowsManager
        workflows={wfRes.data.items}
        rules={rulesRes.data.items}
        agents={agentsRes.data.items}
      />
    </div>
  );
}
```
(If `PageHeader` is rendered here, have `WorkflowsManager` render only the action buttons + cards + modal, OR move the header into the manager so the buttons sit on the title row — pick whichever keeps the `Run all` button top-right; the manager owning the header row is cleaner.)

## F5. `app/components/FindingModal.tsx` — leave as-is (WORKFLOW SUMMARY block stays).

**Gate:** `node ./node_modules/next/dist/bin/next build` — clean (no type/lint errors, no dangling `WorkflowBuilder` import).
**Commit:** `feat(workflows): saved-workflow cards + create modal + Run all (frontend)`

---

# Order & verification
1. Backend B1–B8 → pytest gate green → commit.
2. Frontend F1–F5 → build gate clean → commit.
3. Adversarial review (correctness vs plan, safety/invariants, build/runtime) → fix findings → re-run both gates.
4. Independently re-run pytest + build before claiming done.
