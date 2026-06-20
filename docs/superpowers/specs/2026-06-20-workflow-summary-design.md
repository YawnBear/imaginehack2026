# SafeCloud — Workflows as saved entities (create → list → Run all → summarize)

> Design spec. Status: **approved 2026-06-20 (revamp)**. Supersedes the earlier "builder + /run preview"
> take. A **Workflow** is now a first-class, persisted entity (name + rule + agents). The page is a
> list of workflow cards created via a modal; one global **Run all** button re-scans the logs and
> fills every card with a merged summary of its agents.

---

## 1. Summary

A **Workflow** = `{ name, rule, agents[] }`, saved server-side (Postgres `sc_workflows` + in-memory).
The Workflows page:

- **`+ Create workflow`** button → modal asking **name + which rule + which agents** → **Save** (no
  per-card run). The saved workflow appears as a **card** in the list.
- One big **Run all** button (top-right). Pressing it pings the backend, which **re-scans the logs**
  (`watch/infra-snapshot.json` → rule engine → findings), then for **each** workflow runs its agents
  over its rule's findings and **synthesizes one merged summary**. Each card fills in with its own
  summary (+ expandable agent outputs). Results **persist** (survive reload and backend restart).

Reused from the prior build (kept): the **summarizer** (`generate_workflow_summary` + deterministic
`stitch_summary`), the `agent_summary` field + **WORKFLOW SUMMARY** block in the finding modal, and the
typed `sc_*` Postgres store. This feature is **decoupled** from the live per-finding analysis — creating
a workflow does not change `rule.agent_keys` routing.

Safety invariant unchanged: **rules own detection + all numbers; the LLM only writes/merges text.**

---

## 2. Locked decisions (from the grill)

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Workflow is… | a **saved entity** `{workflow_id, name, rule_id, agent_keys[], created_at, last_run?}`. Multiple per rule allowed. |
| 2 | Create UX | **`+ Create workflow` → modal** (name + rule `<select>` + agent checkboxes) → Save. No per-card run button. |
| 3 | Run | a single **Run all** button (top-right) runs **every** workflow. |
| 4 | Run-all output | shown **on each workflow card** (its own merged summary + expandable agent outputs). |
| 5 | Scan source | Run all **re-scans `watch/infra-snapshot.json`** server-side (snapshot → rule engine → findings), then per-workflow agents + summary. |
| 6 | Persistence | both the **workflow definitions** and their **last-run results** persist (Postgres `sc_workflows` + in-memory); Run all overwrites each `last_run`. |
| 7 | Coupling | **decoupled** from the live findings pipeline; keep the existing finding-modal WORKFLOW SUMMARY block as-is. |
| 8 | DB | **keep** the typed `sc_*` tables; add `sc_workflows`. |

---

## 3. Architecture

```
Create:  modal {name, rule, agents} ─POST /api/workflows─► store.workflows[id]  (persisted card)

Run all (POST /api/workflows/run-all):
  1) SCAN: read watch/infra-snapshot.json → snapshot_to_events → governance.ingest_events
           → rule engine (evaluate_event) upserts findings   (dedup by stable event_id)
  2) for each workflow W (rule R, agents A…):
        findings_R = active findings where rule_id == R
        rep        = newest(findings_R)            # representative resource
        outputs    = generate_agent_analysis(rep, build_recommendation(rep), A)   # text only
        summary    = generate_workflow_summary(rep, outputs) or stitch_summary(outputs)
        W.last_run = {ran_at, finding_count=len(findings_R), summary, agent_outputs, ai_generated}
        persist W
  3) return {scanned_findings, workflows:[W…]}     # cards re-render with last_run
```

Both the workflow row and its `last_run` are stored, so a reload/restart still shows the cards with
their latest summaries. Run all is idempotent on the snapshot (stable `event_id` → findings update,
not duplicate).

---

## 4. Components

### Backend
1. **`schemas/workflows.py`** (REWRITE) — `WorkflowRun{ran_at, finding_count, summary, agent_outputs, ai_generated}`, `Workflow{workflow_id, name, rule_id, agent_keys[], created_at, last_run?}`, `WorkflowCreate{name, rule_id, agent_keys[]}`, `WorkflowListResponse`, `WorkflowRunAllResponse{scanned_findings, workflows[]}`. Update `schemas/__init__.py` exports (drop the old `WorkflowRunRequest/Response`).
2. **`services/store.py`** — add `self.workflows: dict[str, Workflow] = {}` to `InMemoryStore`.
3. **`services/pg_store.py`** — add `sc_workflows` table (`workflow_id` pk, `name`, `rule_id`, `agent_keys` jsonb, `created_at`, `last_run` jsonb) + `self.workflows = TableDict(..., "workflow_id", Workflow)`; import `Workflow`.
4. **`services/workflows_service.py`** (REWRITE) — `WorkflowService(store, governance)` with `list()`, `create(payload)`, `delete(id)`, and `run_all()`:
   - `_scan()` reads `watch/infra-snapshot.json` (path resolved from repo root; missing file → 0, no crash), `snapshot_to_events`, `governance.ingest_events([CloudEvent(**e)…], actor_id="workflow-run")`, returns `created_findings`.
   - `_run_one(wf)` selects active findings for `wf.rule_id`; empty → a "no matching resources" `WorkflowRun`; else newest finding → `generate_agent_analysis` (enabled agents whose `output_key ∈ wf.agent_keys`) → summary via summarizer-or-stitch. Never raises.
5. **`api/workflows_routes.py`** (REWRITE) — `GET /api/workflows` (list), `POST /api/workflows` (create; 400 if `rule_id` unknown), `DELETE /api/workflows/{id}` (404 if absent), `POST /api/workflows/run-all`.
6. **`services/dependencies.py`** — `WorkflowService(_store, _governance_service)`.

### Frontend
7. **`app/lib/types.ts`** — drop old `WorkflowRunRequest/Response`; add `WorkflowRun`, `Workflow`, `WorkflowCreateBody`, `WorkflowListResponse`, `WorkflowRunAllResponse`. Keep `agent_summary?` on `Recommendation`.
8. **`app/lib/api.ts`** — drop `runWorkflow`; add `getWorkflows()`, `createWorkflow(body)`, `deleteWorkflow(id)`, `runAllWorkflows()` (mock fallbacks).
9. **`app/(dashboard)/workflows/WorkflowsManager.tsx`** (NEW; delete `WorkflowBuilder.tsx`) — client component:
   - top bar: title + **`+ Create workflow`** + **`Run all ▶`** (spinner while running; toast with `scanned_findings`).
   - grid of **workflow cards**: name, rule name, agent chips; `last_run` summary block (✨ AI/offline badge, `finding_count`, relative `ran_at`) or "Not run yet"; a delete (✕) control.
   - **Create modal**: name text input, rule `<select>` (from `rules`), agent checkbox chips (from `agents`), Save/Cancel. Save → `createWorkflow` → prepend card.
10. **`app/(dashboard)/workflows/page.tsx`** — server component fetches `getWorkflows`, `getRules`, `getAgents`; renders `<WorkflowsManager workflows rules agents />`; updated subtitle; keep `MockBanner`.
11. **`app/components/FindingModal.tsx`** — unchanged (the WORKFLOW SUMMARY block stays).

---

## 5. Persistence (the part that was asked about)

Two things persist, both in the `sc_*` Postgres tables (and the in-memory store for tests/no-DB):
- **Workflow definitions** (`sc_workflows`): name, rule, agents — written on modal Save; this is why cards survive a reload. Deleted only via the ✕ control.
- **Last-run results** (the `last_run` JSONB column on the same row): `ran_at`, `finding_count`, `summary`, `agent_outputs`, `ai_generated` — written by Run all, **overwritten** each run. This is why a card still shows its summary after a reload/restart rather than going blank.

---

## 6. Error handling & safety

- `_scan()` tolerates a missing/unreadable snapshot (returns 0); `generate_agent_analysis`/`generate_workflow_summary` never raise → deterministic fallbacks. `run_all` always returns 200.
- A workflow whose rule matches nothing → honest "No matching resources found in the latest scan."
- No numbers produced/mutated by the LLM; detection stays 100% rule-driven. `sc_*` tables never touch the teammate's tables.

---

## 7. Testing

Backend pytest (keep the suite green; **rewrite** the old single-`run` tests, **keep** the summarizer/stitch unit tests). AI is ON in the test env → every test touching `run_all`/agents MUST monkeypatch `generate_agent_analysis` + `generate_workflow_summary` (network-free, fast):
- CRUD: create → list → delete; create with unknown rule → 400.
- `run_all`: with `_scan` and AI stubbed → each workflow gets a `last_run` (summary + finding_count) and is persisted to `store.workflows`; rule with no findings → "no matching resources" summary; never 500.
- route: `GET/POST/DELETE /api/workflows` + `POST /api/workflows/run-all`.

Frontend: clean `node ./node_modules/next/dist/bin/next build`. Manual: create a workflow via modal → card appears; Run all → cards fill with summaries; reload → cards + summaries persist.

## 8. Out of scope
Editing a workflow in place (delete + recreate for now), per-workflow run buttons, scheduling/auto-run, streaming summaries, aggregating multiple findings per rule into one narrative (uses the newest representative finding + a count).
