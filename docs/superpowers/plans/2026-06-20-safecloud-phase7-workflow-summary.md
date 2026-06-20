# SafeCloud Phase 7 — Workflow Summary (rule → agents → one merged output)

> Spec: `docs/superpowers/specs/2026-06-20-workflow-summary-design.md`. Adds a **dedicated summarizer
> call** that merges every selected agent's analysis into one paragraph, stored on each finding
> (`agent_summary`) and previewable live from a rebuilt **Workflows builder** page.
>
> **Branch:** `safecloud-phase1-rules` (84 backend tests green). macOS, `backend/.venv`, no `uv`.
> **Gates:** backend `cd backend && .venv/bin/python -m pytest -q`; frontend `node ./node_modules/next/dist/bin/next build`.

## Invariants (do not break)
- Rules own detection + ALL numbers. Both LLM calls only produce/merge **text**, clamped, **never raise**.
- The `/api/workflows/run` preview **persists nothing** (no findings/recommendations/audit rows).
- `_maybe_enrich_recommendation` stays once-per-finding (gated by `ai_generated`); when AI is off it returns early and `agent_summary` stays `""`.

---

# BACKEND

## B1. `backend/app/schemas/findings.py` — add field to `Recommendation`
Add after `ai_generated: bool = False`:
```python
    agent_summary: str = ""
```

## B2. `backend/app/agents/summary.py` — NEW (deterministic fallback)
```python
"""Deterministic fallback for the merged workflow summary (no LLM)."""

_ORDER = ["security", "cost", "energy", "workflow", "audit"]


def stitch_summary(agent_outputs: dict) -> str:
    """Join per-agent blurbs into one block. Empty inputs -> ""."""
    outputs = {k: str(v).strip() for k, v in (agent_outputs or {}).items() if str(v).strip()}
    if not outputs:
        return ""
    known = [k for k in _ORDER if k in outputs]
    extra = [k for k in outputs if k not in _ORDER]
    keys = known + extra
    parts = [f"{k.capitalize()}: {outputs[k]}" for k in keys]
    n = len(keys)
    lead = f"{n} agent{'s' if n != 1 else ''} reviewed this finding. "
    return lead + " ".join(parts)
```

## B3. `backend/app/agents/ai_client.py` — add summarizer (append; reuse existing helpers)
Add near the top after `_TIMEOUT_SECONDS`:
```python
_SUMMARY_MAX_TOKENS = 320
```
Append these functions (reuse `_COMPLETIONS_PATH`, `_TIMEOUT_SECONDS`, `_extract_content`):
```python
def generate_workflow_summary(finding: Any, agent_outputs: dict) -> str | None:
    """Merge per-agent analyses into ONE cohesive paragraph. None on any failure. Never raises."""
    settings = get_settings()
    if not settings.ai_enabled:
        return None
    outputs = {k: str(v).strip() for k, v in (agent_outputs or {}).items() if str(v).strip()}
    if not outputs:
        return None
    try:
        base_url = settings.ai_provider_base_url
        if not base_url.endswith("/"):
            base_url += "/"
        url = base_url + _COMPLETIONS_PATH
        body = json.dumps(
            {
                "model": settings.ai_model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a cloud governance assistant for a construction-tech company. "
                            "You merge several specialist analyses of ONE finding into a single short "
                            "paragraph for a human reviewer. Synthesize, do not just list. Reference "
                            "only what the analyses say. Never invent dollar or carbon numbers, and "
                            "never tell anyone to auto-execute a change. Respond with plain text only."
                        ),
                    },
                    {"role": "user", "content": build_summary_prompt(finding, outputs)},
                ],
                "temperature": 0.4,
                "max_tokens": _SUMMARY_MAX_TOKENS,
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {settings.ai_provider_api_key}",
            },
        )
        with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
            if response.status != 200:
                return None
            raw = response.read().decode("utf-8")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError):
        return None
    except Exception:  # noqa: BLE001 - defensive: AI is purely additive
        return None
    return parse_summary(raw)


def build_summary_prompt(finding, outputs: dict) -> str:
    issue_type = getattr(finding, "issue_type", "unknown")
    severity = getattr(finding, "severity", "unknown")
    blocks = "\n".join(f"- {key}: {text}" for key, text in outputs.items())
    return (
        "A deterministic rule engine detected a cloud governance issue.\n"
        f"issue_type: {issue_type}\nseverity: {severity}\n\n"
        "These specialist agents each analyzed it:\n"
        f"{blocks}\n\n"
        "Write ONE short paragraph (2-4 sentences) that synthesizes ALL of the above for a human "
        "reviewer: what they agree on, the main risk, and the headline recommendation. Plain text only."
    )


def parse_summary(raw: str) -> str | None:
    try:
        envelope = json.loads(raw)
    except (TypeError, ValueError):
        return None
    content = _extract_content(envelope)
    if not content:
        return None
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
    return text or None
```

## B4. `backend/app/services/governance.py::_maybe_enrich_recommendation` — set summary
Update import line 4:
```python
from app.agents.ai_client import generate_agent_analysis, generate_workflow_summary
from app.agents.summary import stitch_summary
```
After the existing block that sets `recommendation.ai_generated = True` (before caching back), insert:
```python
        recommendation.agent_summary = (
            generate_workflow_summary(finding, merged) or stitch_summary(merged)
        )
```
(So the full tail becomes: merge outputs → `ai_generated = True` → set `agent_summary` → cache.)

## B5. `backend/app/schemas/workflows.py` — NEW
```python
from pydantic import BaseModel, Field


class WorkflowRunRequest(BaseModel):
    rule_id: str
    agent_keys: list[str] = Field(default_factory=list)


class WorkflowRunResponse(BaseModel):
    summary: str
    agent_outputs: dict[str, str] = Field(default_factory=dict)
    ai_generated: bool = False
    finding_preview: dict = Field(default_factory=dict)
    synthetic: bool = False
```
Then in `backend/app/schemas/__init__.py`: import `WorkflowRunRequest, WorkflowRunResponse` from `app.schemas.workflows` and add both to `__all__`.

## B6. `backend/app/services/workflows_service.py` — NEW
```python
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
```

## B7. `backend/app/services/dependencies.py` — register service
```python
from app.services.workflows_service import WorkflowService
...
_workflow_service = WorkflowService(_store)
...
def get_workflow_service() -> WorkflowService:
    return _workflow_service
```

## B8. `backend/app/api/workflows_routes.py` — NEW + register in `main.py`
```python
from fastapi import APIRouter, Depends, HTTPException

from app.schemas import WorkflowRunRequest, WorkflowRunResponse
from app.services.dependencies import get_workflow_service
from app.services.workflows_service import WorkflowService

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.post("/run", response_model=WorkflowRunResponse)
def run_workflow(
    payload: WorkflowRunRequest,
    service: WorkflowService = Depends(get_workflow_service),
) -> WorkflowRunResponse:
    result = service.run(payload.rule_id, payload.agent_keys)
    if result is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    return result
```
In `backend/app/main.py`: `from app.api.workflows_routes import router as workflows_router` and `app.include_router(workflows_router)` alongside the others.

## B9. Tests — `backend/tests/test_workflow_summary.py` (NEW)
Cover (use monkeypatch on `app.agents.ai_client` symbols and the dependencies' `_store`/service fixtures already used by other tests — mirror `test_workflow_routing.py` / `test_agents_api.py` style):
- `stitch_summary({})==""`; multi-agent stitch is ordered (security before cost) and names each.
- `parse_summary` returns text from a valid OpenAI-shaped body; returns `None` on `"{}"`, on non-JSON, on empty content.
- `generate_workflow_summary` returns `None` when `ai_enabled` is False (monkeypatch settings) and when `agent_outputs` empty; never raises.
- `WorkflowService.run`: missing rule → `None`; with a seeded rule + AI stubbed to return outputs+summary → response has `summary`, `ai_generated True`, `agent_outputs`; AI-off (stub `generate_agent_analysis`→None) → `ai_generated False` and a non-empty `summary` (empty/_empty path); synthetic path used when no finding for the rule (`synthetic True`).
- route: `POST /api/workflows/run` 200 happy path; 404 for unknown rule.

**Gate:** `cd backend && .venv/bin/python -m pytest -q` — all green (84 + new).

---

# FRONTEND

## F1. `app/lib/types.ts`
In `Recommendation` add `agent_summary?: string;`. Append:
```ts
export interface WorkflowRunRequest {
  rule_id: string;
  agent_keys: string[];
}

export interface WorkflowRunResponse {
  summary: string;
  agent_outputs: Record<string, string>;
  ai_generated: boolean;
  finding_preview: Record<string, unknown>;
  synthetic: boolean;
}
```

## F2. `app/lib/api.ts` — add client (import `WorkflowRunResponse` in the type import block)
```ts
export async function runWorkflow(
  rule_id: string,
  agent_keys: string[],
): Promise<ApiResult<WorkflowRunResponse>> {
  try {
    return ok(
      await tryFetch<WorkflowRunResponse>("/api/workflows/run", {
        method: "POST",
        body: JSON.stringify({ rule_id, agent_keys }),
      }),
    );
  } catch (e) {
    return fallback(
      {
        summary:
          agent_keys.length === 0
            ? "Select one or more agents to generate a combined analysis."
            : "Offline preview — connect the backend to generate a live merged summary.",
        agent_outputs: {},
        ai_generated: false,
        finding_preview: {},
        synthetic: true,
      },
      e,
    );
  }
}
```

## F3. `app/(dashboard)/workflows/WorkflowBuilder.tsx` — NEW (replaces grid)
Client component. Props `{ rules: Rule[]; agents: Agent[] }`. Behavior:
- `selectedRuleId` state (default first rule). `keysByRule` state seeded from `rules` (`rule_id -> agent_keys`).
- Rule `<select>`. Agent chips (checkbox buttons) reflecting `keysByRule[selectedRuleId]`; toggling updates state + calls `updateRule(ruleId, { agent_keys: next })` (instant save; toast on success/offline) — same pattern as the old `WorkflowsGrid`.
- **Run ▶** button → `setRunning(true)`, `runWorkflow(selectedRuleId, currentKeys)`, store `WorkflowRunResponse`, render:
  - a highlighted **WORKFLOW SUMMARY** card showing `res.summary`, with a badge: ✨ AI-generated when `res.ai_generated`, else a neutral "offline/stitched" chip; a "synthetic sample" note when `res.synthetic`.
  - a collapsible **Agent outputs** list (`res.agent_outputs`) reusing the per-agent color treatment (`CATEGORY_COLOR`).
- Empty-selection guard: disable Run or show the empty-summary copy.
- Below the builder: a read-only **mappings table** — each rule row → comma-joined enabled agent names from `keysByRule` (or "no agents"). Use `Card` + the same table styling as the old grid.
Reuse `Card` from `@/app/components/ui`, `useToast`, `useRouter().refresh()` after save, `CATEGORY_COLOR`/`issueLabel` from `@/app/lib/format`.

## F4. `app/(dashboard)/workflows/page.tsx`
Replace `WorkflowsGrid` import/usage with `WorkflowBuilder`. Update subtitle to: "Pick a rule, choose the agents it triggers, and run it to see one merged summary of all their analysis." Keep the `MockBanner`. **Delete `app/(dashboard)/workflows/WorkflowsGrid.tsx`.**

## F5. `app/components/FindingModal.tsx` — WORKFLOW SUMMARY block
Inside the Recommendation `<section>` (the `{rec && (...)}` block), **above** the `{/* Agent outputs */}` heading, insert (only when `rec.agent_summary` is non-empty):
```tsx
{rec.agent_summary && (
  <div className="mt-4 rounded-lg border border-[#065FD433] bg-[#065FD40A] p-3">
    <div className="mb-1 flex items-center gap-2">
      <h4 className="text-[12px] font-medium tracking-label text-[#606060]">WORKFLOW SUMMARY</h4>
      {rec.ai_generated && (
        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "#065FD414", color: "#065FD4" }}>
          ✨ AI-generated
        </span>
      )}
    </div>
    <p className="text-[13px] leading-relaxed text-[#0F0F0F]">{rec.agent_summary}</p>
  </div>
)}
```

**Gate:** `node ./node_modules/next/dist/bin/next build` — clean (type-check + lint pass).

---

# Order & verification
1. B1→B9 (backend), run pytest gate, commit `feat(workflows): merged agent summary + /api/workflows/run preview (backend)`.
2. F1→F5 (frontend), run build gate, commit `feat(workflows): builder page + workflow summary in finding modal (frontend)`.
3. Adversarial review of the full diff vs this plan + the invariants; fix findings; re-run both gates.
4. Independently re-run pytest + build before claiming done.
