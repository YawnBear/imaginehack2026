# CloudOps Guardian

SafeCloud hackathon project for finding wasteful cloud resources, estimating carbon impact, and turning raw cloud signals into clear sustainability recommendations.

## Problem Statement

Cloud platforms make it easy to provision infrastructure, but much harder to see what is being wasted.

- Idle VMs, unused storage, and unnecessary traffic quietly increase operational cost.
- Wasteful cloud usage also increases estimated carbon emissions.
- Existing tooling can be complex, provider-specific, or focused on raw metrics instead of actionable next steps.

## Our Solution

CloudOps Guardian, built as the SafeCloud project, is a demo-friendly cloud governance dashboard that turns mock cloud operations into visible sustainability insights.

- It ingests mock AWS-like cloud activity logs, scanned asset data, and local snapshot data.
- A deterministic rule engine detects waste and risk patterns such as idle compute, unused storage, public buckets, and unencrypted databases.
- A carbon and savings estimator attaches directional impact numbers to findings.
- An optional AI recommendation layer rewrites findings into clear, user-friendly guidance for human reviewers.
- A Next.js dashboard visualizes findings, estimated emissions, recommendations, workflows, and audit history.

The system is designed for hackathon safety: it works without real AWS access and does not automatically execute cloud changes.

## Key Features

- Mock AWS-like cloud activity logs from seeded database rows.
- Asset scanner mock data through `scanned_asset_data` and `watch/infra-snapshot.json`.
- Rule-based detection engine with editable rules and templates.
- Idle VM detection using low CPU and low network activity thresholds.
- Unused storage detection using unattached volumes and no read/write activity.
- Network traffic signals are captured for VM analysis; direct high-traffic emission rules are planned/demo-mode.
- Carbon emission and reduction estimates for sustainability prioritization.
- AI-powered recommendation text and specialist agent summaries, with deterministic fallback.
- Dashboard for overview, threats, energy, workflows, rules, agents, and audit logs.
- Hackathon-friendly mock mode through bundled frontend sample data and optional backend seed data.

## Tech Stack

### Frontend

- Next.js `16.2.9` with App Router.
- React `19.2.4` and React DOM `19.2.4`.
- TypeScript `5`.
- Tailwind CSS `4` through `@tailwindcss/postcss`.
- ESLint `9` with `eslint-config-next`.
- Custom React/SVG charts and dashboard components.
- `next/font` using Roboto and Roboto Mono.

### Backend

- FastAPI `>=0.115,<1.0`.
- Uvicorn `>=0.30,<1.0` ASGI server.
- Pydantic Settings `>=2.4,<3.0` for environment configuration.
- python-dotenv `>=1.0,<2.0` for local `.env` loading.
- SQLAlchemy `>=2.0,<3.0` with psycopg `>=3.2,<4.0`.
- Alembic `>=1.13,<2.0` scaffold for future migrations.
- pytest `>=8.0,<9.0` and httpx `>=0.27,<1.0` for backend tests.

### Data and Storage

- Default local mode: in-memory backend store.
- Optional PostgreSQL-compatible database through `DATABASE_URL`.
- PostgreSQL app tables are namespaced as `sc_*`.
- Optional read-only source tables: `cloud_events`, `scanned_asset_data`, and `energy`.
- The code comments mention Supabase-compatible connection behavior, but the repo does not use a Supabase client library.

### AI Provider

- OpenAI-compatible chat completions client implemented with Python stdlib `urllib.request`.
- Configurable through `AI_PROVIDER_API_KEY`, `AI_PROVIDER_BASE_URL`, and `AI_MODEL`.
- The included example points to GrafiLab-compatible settings.
- AI is optional. If the key is blank or still a placeholder, the backend falls back to deterministic recommendations.

### Deployment

- Frontend: standard Next.js app, suitable for Vercel.
- Backend: FastAPI service with Render settings documented in `backend/README.md`.
- No `vercel.json`, `render.yaml`, Dockerfile, or docker-compose file is currently committed.

## Repository Layout

```text
.
|-- app/                         # Next.js dashboard
|   |-- (dashboard)/              # Dashboard routes: overview, energy, rules, agents, etc.
|   |-- components/               # UI, charts, findings, exports, assistant components
|   `-- lib/                      # Typed API client, mock data, formatting, types
|-- backend/
|   |-- app/
|   |   |-- api/                  # FastAPI routes
|   |   |-- agent/                # Pure snapshot-to-event scanner logic
|   |   |-- agents/               # AI client, recommendation builders, seed agents
|   |   |-- rules/                # Rule engine, operators, templates, seed rules
|   |   |-- schemas/              # Pydantic API/domain schemas
|   |   `-- services/             # Governance, stores, scan sources, workflows
|   |-- scripts/                  # Optional DB setup and mock data seed scripts
|   |-- tests/                    # Backend test suite
|   `-- main.py                   # FastAPI entrypoint wrapper
|-- watch/                        # Local mock scanner snapshot and reset script
|-- public/                       # Static assets
|-- safecloud-agent.py            # Standalone local scanner client
`-- README.md
```

## System Architecture

```text
Mock AWS-like logs       Scanned asset rows       Local snapshot file
cloud_events table       scanned_asset_data       watch/infra-snapshot.json
        |                        |                         |
        |                        |                         |
        +----------+-------------+-------------+-----------+
                   |                           |
                   v                           v
          FastAPI ingestion APIs        safecloud-agent.py
          /api/scan/run                 /api/agent/events
                   |                           |
                   +-------------+-------------+
                                 |
                                 v
                       Governance Service
                                 |
        +------------------------+------------------------+
        |                        |                        |
        v                        v                        v
   Rule Engine          Recommendation Engine       Carbon/Energy Summary
   rules/operators      savings + CO2e estimates    energy table or events
        |                        |                        |
        +------------------------+------------------------+
                                 |
                                 v
                  Optional AI Recommendation Service
                  OpenAI-compatible chat completions
                                 |
                                 v
          In-memory store or PostgreSQL sc_* tables
                                 |
                                 v
                         Next.js Dashboard
```

### Main Components

- Frontend dashboard: Next.js routes for overview, threats, energy, workflows, rules, agents, audit logs, and search.
- Backend API: FastAPI app serving findings, dashboard summaries, energy summaries, rules, agents, workflows, audit logs, scanner endpoints, and source-table readers.
- Mock log generator/scanner: database seed scripts, `watch/generator.py`, and `safecloud-agent.py`.
- Rule engine: evaluates configured rules against normalized `CloudEvent` objects.
- Carbon estimation engine: estimates savings and CO2e reductions from findings and reads `energy` table summaries when available.
- AI recommendation service: optional LLM layer for clearer recommendation text and agent summaries.
- Database/storage: in-memory by default, PostgreSQL-compatible storage when `DATABASE_URL` is configured.

## Workflow

1. Mock cloud logs, scanned assets, or local snapshot resources are generated.
2. The backend receives events through `/api/events/ingest`, `/api/scan/run`, or `/api/agent/events`.
3. Scanner/source adapters normalize rows into the shared `CloudEvent` schema.
4. The rule engine checks each event for abnormal, risky, or wasteful resources.
5. Matching rules create or update findings.
6. The recommendation builder estimates savings and carbon reduction where applicable.
7. Optional AI agents rewrite the analysis text into plain-English recommendations.
8. Findings, recommendations, workflow runs, and audit entries are stored.
9. The frontend dashboard displays waste, emissions, status, and recommended actions.
10. Users review findings and can approve, reject, defer, or request more information.

## Rule Engine Logic

Rules are data-driven. Each rule includes:

- `source_type`: `asset_scan` or `cloud_event`.
- `resource_type`: for example `vm`, `storage`, `bucket`, `database`, `identity`, `network`, or `audit`.
- `conditions`: dot-path checks such as `metrics.avg_cpu_percent_7d <= 10`.
- `severity_base`: starting severity.
- `escalate_in_prod`: raises severity by one level for production resources.
- `rule_confidence`: confidence assigned by the deterministic engine.
- `required_reviewers`: roles that must approve a finding.
- `evidence_fields`: fields copied into the finding evidence.

Important built-in rules include:

- Public bucket: `config.public_access == true`.
- Idle VM: `metrics.avg_cpu_percent_7d <= 10`, `metrics.network_in_mb_7d <= 100`, and `metrics.network_out_mb_7d <= 100`.
- Unused storage: `config.attached == false`, `metrics.read_ops_30d == 0`, and `metrics.write_ops_30d == 0`.
- Unencrypted database: `config.encrypted == false`.
- Failed login: failed `ConsoleLogin` cloud event.
- IAM policy change: successful high-risk IAM actions such as `AttachRolePolicy`, `PutRolePolicy`, `CreatePolicy`, or `CreateAccessKey`.
- Firewall ingress change: successful `AuthorizeSecurityGroupIngress`.
- Bucket policy change: successful `PutBucketPolicy`.
- Audit logging change: actions such as `StopLogging`, `DeleteTrail`, or `UpdateTrail`.
- Database change: successful database create, modify, or delete events.

Supported condition operators include `==`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `not_in`, `exists`, and `contains`.

## Carbon Estimation

Carbon numbers are hackathon estimates intended for prioritization, not billing-grade measurements.

The current recommendation model uses these formulas for resource cleanup findings:

```text
Idle VM estimated monthly savings = monthly_usd * 0.80
Idle VM estimated carbon reduction = estimated_monthly_savings * 0.35

Unused storage estimated monthly savings = monthly_usd * 0.70
Unused storage estimated carbon reduction = estimated_monthly_savings * 0.20
```

The Energy dashboard can also read a PostgreSQL `energy` table with:

- `current_footprint_kg`
- `estimated_reduction_kg`
- `projected_footprint_kg`
- `emission`
- `operation`
- `time`

The UI describes the intended estimation model as:

```text
kWh x grid carbon-intensity
```

with Cloud Carbon Footprint-style coefficients. In demo mode, the seeded `energy` table provides daily operation-level history for `idle VM`, `Unused Storage`, and `idle database`.

## AI Recommendation

AI is optional and additive. The deterministic rule engine remains the source of truth.

The backend AI client:

- Calls an OpenAI-compatible `chat/completions` endpoint.
- Uses `AI_PROVIDER_BASE_URL` plus the `chat/completions` path.
- Sends `AI_MODEL` as the model name.
- Uses `AI_PROVIDER_API_KEY` as the bearer token.
- Never changes severity, savings, carbon numbers, reviewers, or execution safety.
- Returns `None` on failure so deterministic fallback text is used.

Environment variables used by the AI layer:

```env
AI_PROVIDER_API_KEY=your-ai-provider-key
AI_PROVIDER_BASE_URL=https://console-api.grafilab.ai/api/
AI_MODEL=grafilab-chat
```

The AI turns detected issues into clear sustainability and governance recommendations, such as why a VM is wasteful, what approval is needed, and what a safe next action could be.

## Installation

### 1. Clone the repository

```bash
git clone <repo-url>
cd imaginehack2026
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Configure frontend environment

Create `.env.local` in the repo root:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_ENABLE_MOCK_FALLBACK=true
API_PROXY_TARGET=http://127.0.0.1:8000
```

`NEXT_PUBLIC_ENABLE_MOCK_FALLBACK=true` lets the dashboard show bundled demo data if the backend is unavailable or empty.

### 4. Install backend dependencies

```bash
cd backend
python -m venv .venv
```

On Windows PowerShell:

```powershell
.\.venv\Scripts\activate
```

On macOS/Linux:

```bash
source .venv/bin/activate
```

Then install the backend packages:

```bash
pip install -r requirements.txt
```

For tests, also install:

```bash
pip install -r requirements-dev.txt
```

### 5. Configure backend environment

From the repo root, copy the backend example file:

```bash
cp backend/.env.example backend/.env
```

On Windows PowerShell:

```powershell
Copy-Item backend\.env.example backend\.env
```

Leave `DATABASE_URL` blank for the in-memory demo store, or set it to a PostgreSQL-compatible URL.

Fresh in-memory note: `SEED_DATA_ENABLED=true` seeds demo events on backend startup,
while rules, agents, and workflows are managed state. For guaranteed judge-facing
data with zero setup, keep `NEXT_PUBLIC_ENABLE_MOCK_FALLBACK=true`; for a live
backend demo, create rules through the Rules UI/API or use a PostgreSQL database
that already contains the SafeCloud configuration.

### 6. Run the backend

From the `backend` directory:

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

API docs will be available at:

```text
http://127.0.0.1:8000/docs
```

Health check:

```text
http://127.0.0.1:8000/healthz
```

### 7. Run the frontend

From the repo root:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

### 8. Optional: run scanner/mock helpers

Reset the local snapshot storyline:

```bash
python watch/generator.py
```

Run one scanner cycle against the backend:

```bash
python safecloud-agent.py
```

Run scanner loop every 5 seconds:

```bash
python safecloud-agent.py --loop 5
```

### 9. Optional: database setup and seed scripts

If you are using PostgreSQL and the `backend/scripts` files are present in your checkout:

```bash
cd backend
python scripts/create_tables.py
python scripts/seed_safecloud_mock_data.py
python scripts/check_db.py
```

These scripts read `DATABASE_URL` from the process environment, `backend/.env`, `.env.local`, or `.env`.

## Environment Variables

Use placeholder values only. Do not commit real secrets.

### Frontend `.env.local`

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_ENABLE_MOCK_FALLBACK=true
API_PROXY_TARGET=http://127.0.0.1:8000
```

### Backend `backend/.env`

```env
AI_PROVIDER_API_KEY=your-ai-provider-key
AI_PROVIDER_BASE_URL=https://console-api.grafilab.ai/api/
AI_MODEL=grafilab-chat

DATABASE_URL=
FRONTEND_ORIGIN=http://localhost:3000
LOCAL_FRONTEND_ORIGIN=http://localhost:3000
SEED_DATA_ENABLED=true
```

### Optional scanner environment

```env
SAFECLOUD_API=http://127.0.0.1:8000
SAFECLOUD_AGENT_TOKEN=safecloud-demo-agent-token
SAFECLOUD_SNAPSHOT=watch/infra-snapshot.json
```

Notes:

- `DATABASE_URL` blank means in-memory mode.
- `AI_PROVIDER_API_KEY` blank or placeholder means AI is disabled and deterministic fallback text is used.
- `FRONTEND_ORIGIN` and `LOCAL_FRONTEND_ORIGIN` control backend CORS origins.
- `API_PROXY_TARGET` controls Next.js rewrites for `/api/*` and `/healthz`.

## Demo Guide

### Fastest judge demo

1. Set `NEXT_PUBLIC_ENABLE_MOCK_FALLBACK=true` in `.env.local`.
2. Run the frontend with `npm run dev`.
3. Open `http://localhost:3000`.
4. Show the dashboard summary, findings table, Energy page, Rules page, Agents page, and Audit log.
5. Explain that the bundled demo data represents realistic cloud waste and risk scenarios without requiring real AWS access.

### Backend-powered demo

1. Start the backend:

   ```bash
   cd backend
   uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```

2. Start the frontend:

   ```bash
   npm run dev
   ```

3. Generate or reset local scanner data:

   ```bash
   python watch/generator.py
   ```

4. Run the scanner:

   ```bash
   python safecloud-agent.py
   ```

5. In the dashboard, click Run scan or refresh the overview.
6. Highlight detected waste such as idle VMs and unused storage.
7. Open a finding to show evidence, recommendation, estimated savings, estimated carbon reduction, reviewers, and audit history.
8. Show that AI can improve explanation text when configured, while deterministic rules own the numbers.
9. Explain the estimated carbon reduction as a directional planning metric, not a certified emissions report.

If a brand-new in-memory backend shows no live findings, switch to the fastest
judge demo or create detection rules first. This is expected because the current
backend treats rule configuration as editable application state.

### What to tell judges

- "We turn invisible cloud waste into visible cost and sustainability signals."
- "The demo uses realistic mock logs and scanned asset rows, so it is safe to run without cloud credentials."
- "Rules detect the issue; AI explains it; humans approve the next action."
- "The architecture can later plug into real AWS, GCP, or Azure APIs."

## Useful API Endpoints

```text
GET  /healthz
POST /api/events/ingest
POST /api/scan/run
POST /api/demo/seed
GET  /api/dashboard/summary
GET  /api/energy/summary
GET  /api/findings
GET  /api/findings/{finding_id}
PATCH /api/findings/{finding_id}/review
GET  /api/rules
POST /api/rules
GET  /api/rules/templates
POST /api/rules/preview
GET  /api/agents
POST /api/agents/generate
GET  /api/workflows
POST /api/workflows/run-all
GET  /api/audit-logs
GET  /api/cloud-events
GET  /api/scanned-assets
```

## Testing and Quality Checks

Frontend lint and design token check:

```bash
npm run lint
```

Backend tests:

```bash
cd backend
pytest
```

The backend test suite forces `DATABASE_URL=""` so tests do not touch a real database.

## Selling Points

- Turns invisible cloud waste into visible sustainability insights.
- Works without real AWS access using realistic mock logs, scanned assets, and snapshots.
- Combines deterministic rule detection, carbon estimation, and optional AI explanation.
- Produces actionable recommendations instead of raw metrics only.
- Keeps safety boundaries clear: AI explains, rules decide, humans approve.
- Easy to demo locally and extend toward real cloud provider APIs later.

## Future Improvements

- Real AWS, GCP, and Azure integrations.
- More accurate regional carbon intensity and provider-specific emissions modeling.
- Automated remediation with approval gates and rollback plans.
- Historical trend tracking for waste, spend, emissions, and remediation outcomes.
- Cost-saving estimation based on live instance/storage pricing.
- Team notifications through Slack, Teams, email, or ticketing tools.
- More network traffic rules for high-egress emissions and anomaly detection.
- Production-ready database migrations and deployment manifests.

## Team / Hackathon Note

This project was built for a short hackathon competition. It uses mock data to simulate real cloud operations safely, so judges and developers can explore the full workflow without connecting real cloud accounts or exposing secrets.
