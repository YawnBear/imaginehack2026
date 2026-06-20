# Safe Cloud — Architecture & Shared Contract

> **This file is the single source of truth for everything that crosses a team boundary:**
> the data model, the API contract, enum values, the data flow, env vars, and how to run
> each part locally. If your change touches anything in here, it affects a teammate — read
> **INSTRUCTIONS.md** before editing, and announce the change.
>
> _Last reconciled against the real code: backend `backend/app/**`, frontend `app/**`._
>
> 🤖 **Coding the AI? Jump to [§12 — Hybrid AI Layer (GrafiLab)](#12-hybrid-ai-layer-grafilab--implementation-guide-for-the-next-ai-engineer).** That section is a self-contained guide: the files, the exact request shape, env config, how to correct the API, and how to extend it.

---

## 1. What we're building (one paragraph)

Safe Cloud is an **AI-assisted cloud-governance dashboard for construction orgs** (Hilti
"Secure & Energy-Aware Cloud Platforms" track). Mock cloud-scan events are ingested → a
**deterministic rule engine** detects four issue types → each finding is routed by a **master
agent** to **specialized AI agents** (Security / Cost / Energy / Workflow / Audit) that explain
impact and estimate cost + carbon savings → a **recommendation** is produced → every action goes
through a **human approval workflow** before anything is marked done → a **Next.js dashboard**
shows Security / Cost / Energy / Audit panels and a full audit trail. **AI never executes cloud
actions** — it only analyzes and recommends.

---

## 2. Tech stack (as actually built)

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | **Next.js 16.2.9**, React 19.2.4, TypeScript, **Tailwind CSS v4** (App Router) | Tokens live in `app/globals.css` `@theme` — there is **no `tailwind.config.js`**. Fonts: Roboto via `next/font`. |
| Backend | **Python FastAPI** + Uvicorn | Start: `uvicorn main:app`. `main.py` re-exports `app.main:app`. |
| Persistence | **In-memory store** (`InMemoryStore`) for the MVP/demo | Postgres (`DATABASE_URL`, SQLAlchemy/Alembic) is in `requirements.txt` but **deferred** — store is swappable behind `GovernanceService`. |
| Detection | Deterministic **rule engine** + **AI recommendation layer** | Rules are the source of truth; agents only explain/score. |
| Deploy | Frontend → **Vercel**, Backend → **Render** | Repo: `github.com/YawnBear/imaginehack2026`. |

---

## 3. Data flow

```text
Mock cloud events (seed.py / POST /api/events/ingest)
        ↓
GovernanceService.ingest_events()        ← dedup by (resource_id, issue_type, active)
        ↓
Rule engine  evaluate_event()            ← 4 deterministic rules → RuleMatch[]
        ↓
Finding created (status=pending_review)
        ↓
build_recommendation()                   ← per-issue agent_outputs (TEMPLATE) + cost/carbon estimate
        ↓
Audit log written at every step
        ↓
REST JSON  ←──────────────────────────── Next.js dashboard (fetch via NEXT_PUBLIC_API_BASE_URL)
        ↑
GET /api/findings/{id} → LAZY AI enrich   ← if AI_PROVIDER_API_KEY set: GrafiLab rewrites
  (once per finding, cached; §12)            agent_outputs TEXT only. Numbers/detection untouched.
```

---

## 4. Core data model (DTOs) — FROZEN field names & enums

These names are the contract. Backend Pydantic models (`backend/app/schemas/`) and frontend
types (`app/lib/types.ts`) **must agree exactly**. Do not rename a field on one side only.

### `CloudEvent` (ingest input)
`event_id, provider, account_id, region?, resource_id, resource_name?, resource_type,
environment?, project_id?, owner_team?, timestamp, config{}, metrics{}, cost{}`

### `Finding`
`finding_id, source_event_id, resource_id, resource_name?, resource_type, owner_team?,
issue_type, category, severity, status, rule_id, evidence{}, rule_confidence,
ai_confidence, required_reviewers[], created_at, updated_at`

### `Recommendation`
`recommendation_id, finding_id, recommended_action, rationale, risk_level,
estimated_monthly_savings, estimated_carbon_reduction_kg, confidence, agent_outputs{},
safe_to_execute, ai_generated` — **`safe_to_execute` stays `false` until all required reviewers
approve.** `ai_generated` (bool, default `false`) is `true` once the LLM has rewritten
`agent_outputs` for this finding (see §12); the frontend shows an "✨ AI-generated" badge when set.

### `ApprovalDecision`
`approval_id, finding_id, decision, reviewer_id, reviewer_role, reason, created_at`

### `AuditLog`
`audit_id, entity_type, entity_id, action, actor_id, before_state{}, after_state{},
metadata{}, created_at`

### `DashboardSummary`
`active_findings, critical_findings, pending_approvals, approved_actions,
estimated_monthly_savings, estimated_carbon_reduction_kg, latest_scan_at?,
findings_by_category{}, findings_by_severity{}`

### Enum values (EXACT strings — case-sensitive, snake_case)
| Field | Allowed values |
| --- | --- |
| `resource_type` | `bucket` · `vm` · `storage` · `database` |
| `issue_type` | `public_bucket` · `idle_vm` · `unused_storage` · `unencrypted_database` |
| `category` | `security` · `cost` · `energy` · `workflow` · `audit` |
| `severity` | `critical` · `high` · `medium` · `low` |
| `status` | `pending_review` · `approved` · `rejected` · `deferred` · `needs_more_information` · `action_completed` · `action_failed` |
| `decision` (review) | `approved` · `rejected` · `deferred` · `needs_more_information` |
| `reviewer_role` | `security` · `devops` · `application_owner` · `project_owner` · `compliance` · `dba` |

> **Currency:** backend estimates are **USD** (`estimated_monthly_savings`, and literal `$` in some
> `agent_outputs`). The frontend must display the same number it receives — either show `$`/USD, or
> convert in ONE documented place. Do not silently relabel USD as RM with no conversion.

---

## 5. REST API contract

Base URL = `NEXT_PUBLIC_API_BASE_URL` (frontend) / Render service root (backend).

| Method | Endpoint | Purpose | Response shape |
| --- | --- | --- | --- |
| `GET` | `/healthz` | Health + seed status | `{status, database, seeded}` |
| `POST` | `/api/events/ingest` | Ingest mock events | `{accepted, created_findings, duplicate_events}` (HTTP 202) |
| `GET` | `/api/findings` | List + filter + paginate | `{items: Finding[], page, page_size, total}` |
| `GET` | `/api/findings/{id}` | One finding **+ detail** | **`{finding, recommendation, approvals[], audit_logs[]}`** ⚠️ nested |
| `PATCH` | `/api/findings/{id}/review` | Submit a decision | `{finding_id, status, required_reviewers_remaining[], audit_id}` |
| `GET` | `/api/dashboard/summary` | Overview metrics | `DashboardSummary` |
| `GET` | `/api/audit-logs` | List audit logs | `{items: AuditLog[], page, page_size, total}` |
| `POST` | `/api/demo/seed` | Re-seed demo data on demand | `{accepted, created_findings, duplicate_events}` |

**`GET /api/findings` query params:** `severity, category, status, resource_type, owner_team,
page (≥1), page_size (1–100)`.

**`PATCH …/review` body:** `{decision, reviewer_id, reviewer_role, reason}` — `decision` must be
one of the four review enums (use `needs_more_information`, never `needs-info`). Approval only
flips a finding to `approved` once **every** role in `required_reviewers` has an `approved`
decision; otherwise it stays `pending_review` and `required_reviewers_remaining` lists who's left.

> ⚠️ **The `/api/findings/{id}` response is nested** (`detail.finding.*`, `detail.recommendation.*`,
> `detail.audit_logs`), NOT a flat finding. The finding-detail modal must read it that way.

---

## 6. Rule engine (source of truth for detection)

`backend/app/rules/engine.py` → `evaluate_event(event) -> RuleMatch[]`. Severity escalates to
`critical`/`high` when `environment == "production"`.

| Rule id | Triggers when | issue_type | category | Default reviewers |
| --- | --- | --- | --- | --- |
| `RULE_PUBLIC_BUCKET` | `resource_type=bucket` & `config.public_access=true` | `public_bucket` | security | security, devops |
| `RULE_IDLE_VM` | `vm` & `avg_cpu_percent_7d ≤ 10` & net in/out ≤ 100MB | `idle_vm` | cost | devops (+application_owner if `config.application_id`) |
| `RULE_UNUSED_STORAGE` | `storage` & `attached=false` & 0 read/write 30d | `unused_storage` | cost | devops, project_owner (+compliance if sensitive) |
| `RULE_UNENCRYPTED_DATABASE` | `database` & `config.encrypted=false` | `unencrypted_database` | security | security, devops, application_owner, dba |

**Dedup:** an active finding with the same `(resource_id, issue_type)` is updated, not duplicated.

---

## 7. Agent layer (hybrid: rules = truth, AI = explanation)

`backend/app/agents/recommendations.py` → `build_recommendation(finding)` selects a per-issue
builder that fills `recommended_action, rationale, risk_level, estimated_monthly_savings,
estimated_carbon_reduction_kg, confidence, agent_outputs{}`. `agent_outputs` is a free-form
`{agentName: text}` dict (keys among `security/cost/energy/workflow/audit`) — **render whatever
keys are present**, don't hard-code the set. Cost/carbon estimates derive from
`evidence.monthly_cost_usd` (idle VM ≈ 80% × cost, carbon ≈ 0.35 × savings; unused storage ≈ 70%,
carbon ≈ 0.2 × savings). Per-finding-type agent weightage is documented in `PRD.md` §13.

**This template output is the deterministic BASE and the FALLBACK.** When a real LLM key is
configured, the `agent_outputs` *text* is rewritten live by GrafiLab (**§12**) — but the
detection, severity, savings, carbon, and reviewers always come from the rules and are **never**
touched by the AI. With no key, the templates are served as-is and everything still works. This
is the hybrid contract: **rules decide WHAT is wrong and HOW MUCH it costs; the AI only explains
it better.**

---

## 8. Environment variables

**Frontend (`.env.local`)** — only public config in the browser:
`NEXT_PUBLIC_API_BASE_URL` = backend root (unset → frontend falls back to bundled mock data).

**Backend (Render env / `.env`)** — see `backend/.env.example` for the annotated template:
| Var | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | _(blank)_ | Postgres conn string; blank → in-memory store |
| `FRONTEND_ORIGIN` | _(blank)_ | Deployed frontend origin, added to CORS allow-list |
| `LOCAL_FRONTEND_ORIGIN` | `http://localhost:3000` | Dev frontend origin for CORS |
| `SEED_DATA_ENABLED` | `true` | Seed 4 demo findings on startup |
| `AI_PROVIDER_API_KEY` | _(blank/placeholder)_ | **GrafiLab key. Blank/`…REPLACE…` → AI DISABLED** (template fallback). Real key set ONLY in the Render dashboard. |
| `AI_PROVIDER_BASE_URL` | `https://console-api.grafilab.ai/api/` | LLM API base (see §12) |
| `AI_MODEL` | `grafilab-chat` | Model name passed to the LLM |

**No secrets in the frontend. Ever.** Real keys live only in the Render dashboard — `.env*` is
gitignored; only `*.env.example` (placeholders) is committed.

---

## 9. Run it locally

**Backend** (Python via `uv` on this box — `pip`/`py` are broken):
```bash
cd backend
uv venv && uv pip install -r requirements.txt
.venv/Scripts/python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
# auto-seeds 4 demo findings on startup → http://127.0.0.1:8000/healthz
```

**Frontend** (use **node**, not bun, to run next on this box):
```bash
# create app/.env.local with NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000  (or omit for mock)
node ./node_modules/next/dist/bin/next dev      # http://localhost:3000
node ./node_modules/next/dist/bin/next build    # production build / type check
```
Frontend works **standalone** (no backend) via `app/lib/mockData.ts` — critical for demo safety.

---

## 10. Deploy

- **Backend → Render Web Service** (root `= backend`). Build `pip install -r requirements.txt`,
  start `uvicorn main:app --host 0.0.0.0 --port $PORT`. Env: **`PYTHON_VERSION=3.12.7`** (required —
  code uses `datetime.UTC`, Python ≥3.11), `SEED_DATA_ENABLED=true`, `FRONTEND_ORIGIN=<vercel url>`,
  and the AI vars from §8 (set the real `AI_PROVIDER_API_KEY` here, nowhere else). Get the Render URL.
- **Frontend → Vercel** (root `=` repo root, Next.js preset). Set `NEXT_PUBLIC_API_BASE_URL` to the
  Render URL. (Alternatively keep the same-origin proxy in `next.config.ts` by setting
  `API_PROXY_TARGET=<render url>` + `NEXT_PUBLIC_API_BASE_URL=<vercel url>` — avoids CORS entirely.)
- Order: deploy Render → set its URL on Vercel → set Vercel's URL as `FRONTEND_ORIGIN` on Render.
- **Demo safety:** keep `SEED_DATA_ENABLED=true` so the dashboard is never empty; the frontend's
  mock fallback is the last line of defense if the backend is cold/down (Render free tier
  cold-starts ~30–60 s — warm it before demoing).

---

## 11. Contract invariants (do not break without coordinating)

1. Field names + enum strings in §4 are frozen — change both sides + announce.
2. `/api/findings/{id}` stays nested (§5). 3. Review uses the 4 decision enums. 4. AI never
executes actions (`safe_to_execute=false` until approved). 5. Carbon/cost are labelled
**estimates** in the UI. 6. Frontend exposes only `NEXT_PUBLIC_*`. 7. **The AI never DETECTS or
changes numbers** — rules own detection + savings + carbon; the LLM only rewrites explanation text
(§12).

---

## 12. Hybrid AI Layer (GrafiLab) — implementation guide for the next AI engineer

> **Read this whole section before touching the AI.** It is self-contained. The golden rule:
> **the rule engine is the source of truth; the LLM only rewrites the `agent_outputs` explanation
> text. The AI must NEVER create findings, change severity, or change the $/carbon numbers.** This
> is what makes the product trustworthy (and is the story judges reward). If you break that
> boundary you turn a defensible "deterministic + AI" system into "an LLM that hallucinates cloud
> bills."

### 12.1 What exists today (status)
- ✅ Wired and committed (branch `Eugine`). With a **placeholder/blank key the AI is DISABLED** and
  the app behaves exactly like the deterministic templates — so nothing is broken by default.
- ⚠️ The GrafiLab request shape is an **assumption** (OpenAI-compatible) — *no official GrafiLab API
  docs were reachable when this was built.* **Your first job is to confirm/correct it (§12.4).**

### 12.2 Files (everything AI lives here)
| File | Role |
| --- | --- |
| `backend/app/agents/ai_client.py` | The LLM client. stdlib `urllib` only (no new pip deps). `generate_agent_analysis(finding, base_recommendation) -> dict | None`. 8 s timeout, `max_tokens=600`. Returns `None` on ANY failure (disabled / timeout / non-200 / unparseable) and **never raises**. |
| `backend/app/agents/recommendations.py` | Deterministic template builders = the BASE + the FALLBACK. **Do not delete these** — they are what runs when AI is off or fails. |
| `backend/app/services/governance.py` | `_maybe_enrich_recommendation()` called from `get_finding_detail()`. **Lazy** (only on modal open), **cached** (once per finding via the `ai_generated` flag), merges AI text into `agent_outputs`. |
| `backend/app/core/config.py` | `ai_provider_api_key`, `ai_provider_base_url`, `ai_model`, and the `ai_enabled` property (the on/off gate). |
| `backend/app/schemas/findings.py` | `Recommendation.ai_generated: bool` flag. |
| `app/lib/types.ts` + `app/components/FindingModal.tsx` | Frontend: `ai_generated?` type + the "✨ AI-generated" badge. |
| `backend/.env.example` | Placeholder env template. |

### 12.3 Control flow (where the call happens)
```
GET /api/findings/{id}
  → GovernanceService.get_finding_detail(id)
      → _maybe_enrich_recommendation(finding, rec):
            if not settings.ai_enabled:        return rec           # AI OFF → template text
            if rec.ai_generated:               return rec           # already done → cached
            out = ai_client.generate_agent_analysis(finding, rec)   # the LLM call (≤8s)
            if out is None:                    return rec           # failed → keep template
            rec.agent_outputs = {**rec.agent_outputs, **out}        # MERGE text only
            rec.ai_generated = True
            store.recommendations[finding_id] = rec                 # cache back
      → return { finding, recommendation: rec, approvals, audit_logs }
```
**Why lazy, not at ingest:** a scan creates many findings at once; calling the LLM for each would
make "Run scan" take 30 s+. Enriching on first modal-open keeps scans instant and only spends
tokens on findings a human actually looks at. The first open of a finding is ~2–4 s (the frontend
already shows a loading state); subsequent opens are instant (cached).

### 12.4 The GrafiLab request shape (CONFIRM THIS FIRST)
Implemented as **OpenAI-compatible Chat Completions** (assumption — verify against GrafiLab's real
docs / dashboard):
```
POST  {AI_PROVIDER_BASE_URL}chat/completions          # base normalized to end with "/"
Headers:  Authorization: Bearer {AI_PROVIDER_API_KEY}
          Content-Type: application/json
Body:     { "model": {AI_MODEL},
            "messages": [ {"role":"system", ...}, {"role":"user", ...} ],
            "temperature": 0.4, "max_tokens": 600 }
Parse:    choices[0].message.content   (falls back to choices[0].text)
```
**To correct it without redeploying code:** the base URL and model are env-driven —
`AI_PROVIDER_BASE_URL` and `AI_MODEL`. If GrafiLab uses a different **path** (e.g.
`/api/v1/chat/completions`) or **auth header** or **body schema**, edit `ai_client.py` (it's the
only place HTTP happens). Test the raw call with curl first:
```bash
curl -X POST "https://console-api.grafilab.ai/api/chat/completions" \
  -H "Authorization: Bearer $AI_PROVIDER_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"<model>","messages":[{"role":"user","content":"ping"}]}'
```
Match `ai_client.py`'s request/parse to whatever that returns.

### 12.5 The prompt contract (what to ask the model for)
`generate_agent_analysis` builds the prompt from the finding's `issue_type, severity, evidence,
rule_id` + the deterministic `recommended_action`, and asks for a **JSON object** of per-agent
analysis keyed by agent name (`security/cost/energy/workflow/audit` — only the ones relevant to the
issue type). The parser is defensive: strips ```` ```json ```` fences, tolerates prose-wrapped JSON,
**clamps to the known agent keys**, and coerces values to strings. Keep these guarantees if you
change the prompt — the frontend renders whatever keys come back (§7), so don't emit unknown keys
or non-string values. Tell the model explicitly: *construction-aware, plain language, no
markdown, ≤2 sentences per agent, do not invent numbers — reference the evidence only.*

### 12.6 How to extend it (likely next steps)
- **Raw server logs → AI log-anomaly agent (the hybrid the team wants).** Add a normalization step
  that turns raw log lines into `CloudEvent`s (PRD "normalization layer") so the existing rules
  fire; THEN add a `log_anomaly` agent in `ai_client.py` that reads the raw log slice for issues
  the fixed rules miss, returning *candidate* findings the human must confirm — **never** auto-
  promoted to a real finding without rule/heuristic backing (keeps the safety boundary).
- **Richer recommendation rationale.** You may let the LLM rewrite `rationale` too — but keep
  `recommended_action`, `risk_level`, savings, carbon, and `required_reviewers` rule-derived.
- **Streaming / batching.** If you ever enrich at ingest, batch the calls and cap concurrency; keep
  the 8 s timeout + `None` fallback so a slow LLM never blocks the API.
- **Model routing.** Multiple `AI_MODEL`s per agent is fine — just keep it env-driven.

### 12.7 Hard rules for the AI (do not violate)
1. **No detection by AI.** Findings come only from `rules/engine.py`. The LLM explains; it does not
   decide what's wrong.
2. **No number invention.** `estimated_monthly_savings`, `estimated_carbon_reduction_kg`,
   `severity`, `confidence` are rule-derived. The LLM must not change them.
3. **Always degrade gracefully.** Any failure → `return None` → template text. The app must be
   fully usable with the AI off (this is also the demo-safety net).
4. **Never log or echo the key.** It only comes from `AI_PROVIDER_API_KEY` (Render env). Never
   commit a real `sk-…` value; only `…REPLACE_ME` placeholders go in `*.env.example`.
5. **Respect `safe_to_execute=false`.** The AI never marks anything executable or takes an action.
6. **Keep `agent_outputs` shape:** `{ knownAgentKey: shortString }`. No nested objects, no markdown.

### 12.8 Quick test checklist
- [ ] `curl` the GrafiLab endpoint directly; confirm the path/auth/body/response (§12.4).
- [ ] Reconcile `ai_client.py` to that shape.
- [ ] Set a real `AI_PROVIDER_API_KEY` + correct `AI_MODEL` locally in `backend/.env`; confirm
      `config.ai_enabled` is `True`.
- [ ] Open a finding → backend logs one outbound call → modal shows the "✨ AI-generated" badge and
      LLM text; reopen → no second call (cached).
- [ ] Blank the key → finding still opens instantly with template text, no badge, no error.
- [ ] Confirm the $/carbon/severity numbers are **identical** with AI on vs off (proves the
      boundary holds).
