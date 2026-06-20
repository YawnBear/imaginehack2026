# SafeCloud — Workflow Summary (rule → agents → one merged output)

> Design spec. Status: **approved 2026-06-20**. Builds on Phase 6 (grid-only routing). Adds a
> **synthesized summary** that merges every selected agent's analysis into one cohesive paragraph,
> shown both on each finding and previewable live from a redesigned Workflows page.

---

## 1. Summary

Today a rule triggers a set of agents (its `agent_keys`); each agent produces a *separate* blurb
(LLM rewrites text only — numbers stay rule-based) and the finding modal renders them as separate
"AGENT ANALYSIS" cards. The Workflows page is a bare rules × agents checkbox grid.

This feature adds **one merged summary of all the selected agents together**:

- A new **summarizer** step runs after the per-agent blurbs and merges them (plus the finding
  context) into a single cohesive paragraph via a dedicated LLM call, with a deterministic stitch
  fallback when AI is off or fails.
- The summary is stored on each finding's recommendation (`agent_summary`) and shown in the finding
  modal as a **WORKFLOW SUMMARY** block *above* the existing per-agent cards.
- The **Workflows page becomes a builder**: pick one rule → check the agents it triggers → **Run ▶**
  to preview the merged summary live (against a real or synthetic finding), with a compact read-only
  mappings table below showing every rule → its agents.

The safety invariant is unchanged: **rules own detection and all numbers; both LLM calls only
produce/merge explanation text, clamped and non-raising.** The page preview persists nothing.

---

## 2. Locked decisions (from the brainstorming grill)

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Where the merged summary lives | **On findings + page preview.** Real field on every recommendation (shown in the finding modal) AND a live Run button on the Workflows page. |
| 2 | Workflows page layout | **Builder + mappings table.** Focused single-rule builder card on top; compact read-only rule→agents table below. |
| 3 | How the summary is generated | **Dedicated summarizer call.** A second short LLM call merges all per-agent blurbs + finding into one paragraph. Deterministic stitch fallback when AI off/fails. |
| 4 | Run preview target | Newest **real** finding for that rule if one exists, else a **synthetic** representative finding built from the rule. Read-only — persists nothing, always returns 200. |
| 5 | Agent selection in builder | Toggling an agent **saves immediately** to `rule.agent_keys` (reuses `updateRule`, keeps the real routing + mappings table live). Run previews the current saved selection. |

---

## 3. Architecture

```
                            ┌──────────── existing ────────────┐
ingest → rule engine → Finding → build_recommendation (numbers) │
                                                                 │  (lazy, once per finding)
finding detail fetch ──► _maybe_enrich_recommendation ───────────┘
        1) generate_agent_analysis  → per-agent blurbs (existing)
        2) generate_workflow_summary → ONE merged paragraph  ◄── NEW
           (fallback: stitch_summary)
        → recommendation.agent_summary  (cached)

Workflows page (builder) ──► POST /api/workflows/run {rule_id, agent_keys}  ◄── NEW
        builds representative finding (real-or-synthetic)
        → generate_agent_analysis(selected) → generate_workflow_summary
        → {summary, agent_outputs, ai_generated, finding_preview}   (NOT persisted)
```

Two planes of the same logic: the lazy enrichment path writes `agent_summary` onto stored
recommendations; the `/run` path computes the same thing on demand for an arbitrary
(rule, agent_keys) pair without touching the store.

---

## 4. Components

### Backend

1. **`schemas/findings.py`** — add `agent_summary: str = ""` to `Recommendation`. (Backward
   compatible default; no migration — store is in-memory/Postgres JSON.)
2. **`agents/ai_client.py`** — new `generate_workflow_summary(finding, agent_outputs) -> str | None`.
   A single OpenAI-compatible `chat/completions` call mirroring `generate_agent_analysis`'s transport
   (stdlib `urllib`, 8s timeout, bounded `max_tokens`, **never raises** — returns `None` on any
   failure). System prompt: *merge these per-agent analyses into one short paragraph for a human
   reviewer; reference only what the agents said; invent no numbers; never tell anyone to
   auto-execute.* Returns plain text from `choices[0].message.content` (reuse `_extract_content`).
3. **`agents/recommendations.py`** (or a small helper module) — `stitch_summary(agent_outputs: dict)
   -> str`: deterministic merge used when AI is off / returns `None` / there are no outputs. Joins
   the per-agent blurbs in `AGENT_ORDER` with connective phrasing; empty dict → "" .
4. **`services/governance.py::_maybe_enrich_recommendation`** — after merging the per-agent
   `ai_outputs`, set `recommendation.agent_summary = generate_workflow_summary(...) or
   stitch_summary(recommendation.agent_outputs)`. Stays inside the existing `ai_generated` once-only
   gate. Numbers untouched. (When AI is disabled the method returns early as today → `agent_summary`
   stays "" → modal hides the block.)
5. **`schemas/workflows.py`** (new) — `WorkflowRunRequest{rule_id: str, agent_keys: list[str]}` and
   `WorkflowRunResponse{summary: str, agent_outputs: dict[str,str], ai_generated: bool,
   finding_preview: dict, synthetic: bool}`. Export from `schemas/__init__.py`.
6. **`services/workflows_service.py`** (new) — `WorkflowService(store)` with
   `run(rule_id, agent_keys) -> WorkflowRunResponse`:
   - 404 (via `None`) if the rule doesn't exist.
   - representative finding = newest stored finding with that `rule_id`, else
     `_synthetic_finding(rule)` built from the rule's `issue_type/category/severity_base/
     resource_type` + placeholder evidence.
   - `rec = build_recommendation(finding)`; `selected = [enabled agents whose output_key ∈
     agent_keys]`; `ai_outputs = generate_agent_analysis(finding, rec, selected)` (may be `None`);
     `outputs = ai_outputs or {}`; `summary = generate_workflow_summary(finding, outputs) or
     stitch_summary(outputs)`. Always returns 200-able data.
7. **`api/workflows_routes.py`** (new) — `POST /api/workflows/run`; register in `main.py`
   (`include_router(workflows_router)`). 404 when rule missing.

### Frontend

8. **`app/lib/types.ts`** — `agent_summary?: string` on `Recommendation`; add `WorkflowRunRequest` /
   `WorkflowRunResponse` interfaces.
9. **`app/lib/api.ts`** — `runWorkflow(rule_id, agent_keys): Promise<ApiResult<WorkflowRunResponse>>`
   posting `/api/workflows/run`, mock fallback returns an offline stub summary.
10. **`app/(dashboard)/workflows/WorkflowBuilder.tsx`** (new) — client component:
    - rule `<select>` (from `rules`), agent checkbox chips (from `agents`); toggling persists via
      `updateRule(rule_id, { agent_keys })` (same instant-save as today) and updates local state.
    - **Run ▶** → `runWorkflow(rule_id, selectedKeys)`; renders the returned `summary` in a
      highlighted card with the ✨ AI/offline badge, plus a collapsible list of the per-agent
      `agent_outputs`. Loading + empty-selection states.
    - Below: read-only **mappings table** — every rule → comma-joined agent names (empty = "no
      agents").
11. **`app/(dashboard)/workflows/page.tsx`** — render `<WorkflowBuilder rules agents />`; updated
    subtitle. The old `WorkflowsGrid.tsx` is removed (its instant-save toggle logic moves into the
    builder).
12. **`app/components/FindingModal.tsx`** — inside the Recommendation `<section>`, above the
    "AGENT ANALYSIS" cards, render a **WORKFLOW SUMMARY** block when `rec.agent_summary` is non-empty,
    reusing the existing `rec.ai_generated` ✨ badge.

---

## 5. Data flow

- **Real finding:** ingest → finding → (lazy, on detail fetch) enrich → per-agent outputs +
  `agent_summary` cached once → modal shows WORKFLOW SUMMARY then per-agent cards.
- **Page preview:** builder Run → `POST /api/workflows/run` → live per-agent + summarizer over the
  chosen agents against a representative finding → summary rendered inline; **nothing persisted.**

---

## 6. Error handling & safety

- Both `generate_agent_analysis` and `generate_workflow_summary` return `None` on any failure →
  deterministic fallbacks; neither raises.
- `/api/workflows/run` always returns 200 with *some* summary (AI or stitched); only a missing rule
  is a 404. Empty agent selection → empty `agent_outputs` and a stitched summary noting no agents
  were selected.
- No numbers are produced or altered by either LLM call; detection stays 100% rule-driven.
- The preview path never writes to the store (no finding/recommendation/audit rows created).

---

## 7. Testing

**Backend pytest (keep the 84 green; add):**
- `stitch_summary`: empty → ""; multi-agent → ordered, mentions each agent.
- `generate_workflow_summary`: parses plain-text content; returns `None` on bad/empty body (monkeypatched transport); never raises.
- enrichment: with AI stubbed, `recommendation.agent_summary` is set and cached once; with AI off, stays "".
- `WorkflowService.run`: real-finding path and synthetic-finding path both return a summary; missing rule → `None`; AI-off path returns stitched summary; never 500.
- route: `POST /api/workflows/run` 200 happy path + 404 missing rule.

**Frontend:** clean `next build` + lint. Manual: builder Run renders a summary; toggling agents persists; finding modal shows WORKFLOW SUMMARY above per-agent cards.

---

## 8. Out of scope

Threat-report `agent_sections` (unchanged), per-agent card styling overhaul, persisting preview runs,
streaming the summary, multi-rule batch runs.
