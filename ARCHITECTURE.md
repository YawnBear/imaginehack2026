# GreenGuard Cloud — Architecture & Shared Contract

> **This file is the single source of truth for everything that crosses a team boundary:**
> the data model, the API contract, enum values, the data flow, env vars, and how to run
> each part locally. If your change touches anything in here, it affects a teammate — read
> **INSTRUCTIONS.md** before editing, and announce the change.
>
> _Last reconciled against the real code: backend `backend/app/**`, frontend `app/**`._

---

## 1. What we're building (one paragraph)

GreenGuard Cloud is an **AI-assisted cloud-governance dashboard for construction orgs** (Hilti
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
build_recommendation()                   ← per-issue agent_outputs + cost/carbon estimate
        ↓
Audit log written at every step
        ↓
REST JSON  ←──────────────────────────── Next.js dashboard (fetch via NEXT_PUBLIC_API_BASE_URL)
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
safe_to_execute` — **`safe_to_execute` stays `false` until all required reviewers approve.**

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

## 7. Agent layer

`backend/app/agents/recommendations.py` → `build_recommendation(finding)` selects a per-issue
builder that fills `recommended_action, rationale, risk_level, estimated_monthly_savings,
estimated_carbon_reduction_kg, confidence, agent_outputs{}`. `agent_outputs` is a free-form
`{agentName: text}` dict (keys among `security/cost/energy/workflow/audit`) — **render whatever
keys are present**, don't hard-code the set. Cost/carbon estimates derive from
`evidence.monthly_cost_usd` (idle VM ≈ 80% × cost, carbon ≈ 0.35 × savings; unused storage ≈ 70%,
carbon ≈ 0.2 × savings). Per-finding-type agent weightage is documented in `PRD.md` §13.

---

## 8. Environment variables

**Frontend (`.env.local`)** — only public config in the browser:
`NEXT_PUBLIC_API_BASE_URL` = backend root (unset → frontend falls back to bundled mock data).

**Backend (Render env / `.env`)**:
`DATABASE_URL?`, `FRONTEND_ORIGIN` (CORS allow), `LOCAL_FRONTEND_ORIGIN` (default
`http://localhost:3000`), `AI_PROVIDER_API_KEY?`, `SEED_DATA_ENABLED` (default `true`).
**No secrets in the frontend. Ever.**

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

- **Frontend → Vercel** (root `=` repo root, Next.js preset). Set `NEXT_PUBLIC_API_BASE_URL` to the Render URL.
- **Backend → Render Web Service** (root `= backend`). Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`. Set CORS env to the Vercel origin.
- **Demo safety:** keep `SEED_DATA_ENABLED=true` so the dashboard is never empty; the frontend's mock fallback is the last line of defense if the backend is cold/down.

---

## 11. Contract invariants (do not break without coordinating)

1. Field names + enum strings in §4 are frozen — change both sides + announce.
2. `/api/findings/{id}` stays nested (§5). 3. Review uses the 4 decision enums. 4. AI never
executes actions (`safe_to_execute=false` until approved). 5. Carbon/cost are labelled
**estimates** in the UI. 6. Frontend exposes only `NEXT_PUBLIC_*`.
