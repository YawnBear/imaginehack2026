# Product Requirements Document: Safe Cloud MVP

## 1. Summary

Safe Cloud is an AI-assisted cloud governance dashboard for construction organizations. It helps teams detect cloud security risks, reduce unused cloud resources, estimate cost savings, estimate carbon impact, and route every recommended action through human approval before remediation.

This MVP uses mock cloud-provider events first, while keeping the data interface compatible with future AWS, Azure, and GCP connectors. The product pairs a deterministic rule engine with AI-assisted explanation and recommendation generation. AI agents may analyze, prioritize, and recommend actions, but they must not directly delete, stop, encrypt, or modify cloud resources.

The requested implementation stack is:

| Layer | MVP Choice |
| --- | --- |
| Frontend | Next.js `16.2.9`, React `19.2.4`, TypeScript, Tailwind CSS v4, App Router |
| Backend | Python FastAPI deployed as a Render Web Service |
| Database | Render Postgres |
| Scheduled ingestion | Render Cron Job for mock scan/event ingestion |
| API contract | REST JSON API consumed by the Next.js frontend |
| AI/rules | Deterministic rule engine plus AI recommendation layer |
| Deployment config | Frontend uses `NEXT_PUBLIC_API_BASE_URL`; backend uses Render environment variables |

Source basis: this PRD is generated from the existing `plan.md` and preserves that file unchanged.

## 2. Problem Statement

Construction organizations often use cloud services for project documents, reports, design files, collaboration tools, databases, and operational workflows. These environments can grow quickly and become hard to govern. Temporary resources may remain active after projects end, storage may become unused, databases may be misconfigured, and cloud buckets may accidentally expose sensitive documents.

The core problems are:

1. Public cloud buckets can expose construction documents or project data.
2. Idle virtual machines continue consuming cost and energy.
3. Unused storage volumes and backups create waste.
4. Unencrypted databases create security and compliance risk.
5. DevOps, security, developers, finance, ESG, and project owners each have only part of the context.
6. Existing monitoring tools often detect issues but do not provide workflow-aware recommendations, reviewer routing, approval status, or audit trails.

Safe Cloud solves this by turning cloud scan events into explainable findings, assigning reviewer ownership, estimating impact, and requiring approval before any action is taken.

## 3. Goals and Non-Goals

### Goals

1. Detect four MVP issue types: public bucket, idle VM, unused storage, and unencrypted database.
2. Normalize cloud scan events into a consistent internal schema.
3. Generate findings with evidence, severity, and confidence.
4. Use specialized AI agents to explain impact and recommend safe next steps.
5. Estimate cost savings and carbon reduction where relevant.
6. Route findings to required reviewers based on issue type, resource metadata, and risk.
7. Support approve, reject, defer, and request-more-information decisions.
8. Maintain a searchable audit trail for scan events, findings, recommendations, approvals, and actions.
9. Provide a Next.js dashboard with security, cost, energy, and audit views.
10. Deploy the backend on Render with a production-shaped API and database setup.

### Non-Goals for MVP

1. No direct autonomous cloud remediation.
2. No real cloud credentials required for the demo.
3. No full multi-cloud production connector in the first build.
4. No advanced compliance framework mapping.
5. No exact physical data-center energy measurement.
6. No complex no-code rule builder.
7. No deep BIM or construction project-management integration.

## 4. Target Users

| User Group | Primary Need | MVP Permissions |
| --- | --- | --- |
| DevOps / Cloud Operations | Validate infrastructure risk and execute approved actions manually | View all findings, approve infra actions, mark actions complete |
| Security / Compliance | Review exposure and data-protection risks | View security findings, approve/reject security actions |
| Application Developers / Owners | Confirm whether resources are required by application logic | View assigned findings, approve/reject/defer app-impact actions |
| Project Managers / Business Owners | Confirm whether resources support active construction workflows | Review project-linked resources and business impact |
| Finance / Operations | Understand potential cost savings | View cost findings and savings estimates |
| Sustainability / ESG | Track estimated energy and carbon reduction | View energy panel and carbon estimates |
| Auditors / Management | Review traceability and governance history | View audit logs and export-ready reports |

## 5. MVP Scope

### In Scope

1. Mock event ingestion using normalized cloud-provider events.
2. Rule engine for:
   - Public bucket risk
   - Idle virtual machine
   - Unused storage
   - Unencrypted database
3. Findings store backed by Render Postgres.
4. Master agent routing to specialized agents.
5. Specialized AI outputs for security, cost, energy, workflow impact, and audit readiness.
6. Recommendation engine that combines rule evidence and AI analysis.
7. Required reviewer assignment.
8. Human approval workflow.
9. Dashboard with overview, security, cost, energy, and audit panels.
10. Search and filters for severity, category, approval status, owner, and resource type.
11. Seed data for hackathon demo.

### Out of Scope

1. Production cloud account onboarding.
2. Real cloud remediation execution.
3. Direct write access to customer cloud resources.
4. Long-running worker orchestration beyond the MVP cron ingestion job.
5. Full RBAC implementation beyond role fields and approval checks required for the demo.

## 6. Core User Journeys

### Journey A: Security Officer Reviews Public Bucket

1. A mock cloud scan event indicates a bucket is public.
2. The rule engine creates a critical or high-severity finding.
3. The security agent explains exposure risk and sensitive-data impact.
4. The recommendation engine suggests restricting public access after owner validation.
5. The dashboard shows required reviewers: Security and DevOps.
6. The Security Officer approves, rejects, defers, or requests more information.
7. The audit log records the decision.

### Journey B: DevOps Engineer Reviews Idle VM

1. A mock usage event reports low CPU and network usage over a threshold window.
2. The rule engine creates an idle VM finding.
3. The cost and energy agents estimate monthly savings and carbon reduction.
4. The workflow impact agent checks application tags and project ownership.
5. The DevOps Engineer reviews the finding and routes it to an application owner if needed.
6. No shutdown action is marked complete until the required approval is recorded.

### Journey C: Application Owner Validates Impact

1. A finding is assigned to an application owner because metadata links it to an app.
2. The owner reviews evidence, resource tags, suggested action, and confidence.
3. The owner approves, rejects, defers, or requests more information.
4. The decision and reason are stored in the audit trail.

### Journey D: ESG Officer Tracks Estimated Carbon Reduction

1. The energy panel aggregates estimated energy and carbon impact.
2. The dashboard separates estimated active waste from approved reduction.
3. The ESG officer views trend charts and resource-type breakdowns.
4. The UI clearly labels all carbon values as estimates.

## 7. Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-001 | The system shall ingest mock cloud scan events through the backend API or scheduled job. | Must |
| FR-002 | The system shall normalize incoming events into a standard schema. | Must |
| FR-003 | The rule engine shall detect public bucket findings. | Must |
| FR-004 | The rule engine shall detect idle VM findings. | Must |
| FR-005 | The rule engine shall detect unused storage findings. | Must |
| FR-006 | The rule engine shall detect unencrypted database findings. | Must |
| FR-007 | The system shall store findings with source evidence. | Must |
| FR-008 | The system shall route findings to specialized AI agents. | Must |
| FR-009 | AI agents shall generate explanations, impact summaries, confidence, and recommendations. | Must |
| FR-010 | The recommendation engine shall assign severity, priority, required reviewers, and next action. | Must |
| FR-011 | The system shall require human approval before remediation is recorded as completed. | Must |
| FR-012 | Reviewers shall be able to approve, reject, defer, or request more information. | Must |
| FR-013 | The dashboard shall show overview metrics. | Must |
| FR-014 | The dashboard shall show security findings. | Must |
| FR-015 | The dashboard shall show cost findings. | Must |
| FR-016 | The dashboard shall show energy and carbon estimates. | Must |
| FR-017 | The dashboard shall show audit history. | Must |
| FR-018 | The system shall support filters by severity, category, approval status, owner, and resource type. | Should |
| FR-019 | The system shall expose audit logs through an API endpoint. | Must |
| FR-020 | The system shall provide seed data for a reliable demo. | Must |

## 8. Non-Functional Requirements

### Security

1. Cloud credentials are not required for the MVP and must not be stored in the frontend.
2. Backend secrets must be stored as Render environment variables.
3. The frontend may only expose public configuration such as `NEXT_PUBLIC_API_BASE_URL`.
4. Approval mutations must be validated on the backend.
5. Audit records must not be editable through normal review actions.

### Reliability

1. Ingestion failures must be logged.
2. Duplicate events must not create duplicate active findings for the same resource, issue type, and source window.
3. The dashboard must show the latest successful scan time.
4. Seed data must support a stable hackathon demo even if the scheduled ingestion job has not run.

### Explainability

1. Each finding must show the triggering rule.
2. Each recommendation must show supporting evidence.
3. AI confidence and rule confidence must be separate.
4. Findings with incomplete metadata must show uncertainty and allow reviewers to request more information.

### Safety

1. AI agents must not execute cloud actions.
2. Destructive recommendations must require stronger approval.
3. Production resources must require additional owner validation.
4. The UI must warn when an action may affect application or project workflows.

## 9. Technical Architecture

### High-Level Architecture

```text
Mock Cloud Event Source / Future Cloud Provider
        |
        v
Render Cron Job or POST /api/events/ingest
        |
        v
FastAPI Backend on Render
        |
        +--> Normalization Layer
        +--> Deterministic Rule Engine
        +--> Master Agent Router
        +--> Specialized AI Agents
        +--> Recommendation Engine
        +--> Approval Workflow
        +--> Audit Logger
        |
        v
Render Postgres
        |
        v
Next.js App Router Frontend
        |
        v
Security, Cost, Energy, Approval, and Audit Dashboard
```

### Frontend

The frontend uses the existing Next.js app stack:

| Item | Requirement |
| --- | --- |
| Framework | Next.js `16.2.9` with App Router |
| React | React `19.2.4` and React DOM `19.2.4` |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Data access | Fetch from FastAPI backend using `NEXT_PUBLIC_API_BASE_URL` |
| Rendering model | Server Components for initial data loading where practical; Client Components for tabs, filters, approval forms, and charts |
| Error states | Dashboard panels must include loading, empty, and API-error states |
| Security | No backend secrets or cloud-provider credentials in client code |

Next.js implementation guidance:

1. Keep route-level pages under `app/`.
2. Use Server Components by default for page shells and initial dashboard data.
3. Use Client Components only for interactive controls such as filters, tabs, modals, and review actions.
4. If Next.js Route Handlers are added later, use them only as a backend-for-frontend proxy, not as the primary backend. The primary backend for this PRD is FastAPI on Render.

### Backend

The backend is a FastAPI service deployed as a Render Web Service.

| Item | Requirement |
| --- | --- |
| Runtime | Python 3 |
| Framework | FastAPI |
| Server | Uvicorn |
| Render start command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Validation | Pydantic request and response models |
| Persistence | SQLAlchemy or SQLModel with Render Postgres |
| Migrations | Alembic |
| Health check | `GET /healthz` returns service and database status |
| CORS | Allow the deployed Next.js frontend origin and local development origin |
| Secrets | Use Render environment variables |

### Database

Render Postgres stores:

1. Raw cloud events
2. Normalized events
3. Findings
4. Agent outputs
5. Recommendations
6. Approval decisions
7. Audit logs
8. Users and role metadata for demo approval routing

### AI and Rules

The MVP uses a hybrid model:

1. Rule engine performs deterministic detection.
2. Master agent selects relevant specialized agents.
3. Specialized agents generate explanations and impact estimates.
4. Recommendation engine combines rule output and agent output.
5. Approval workflow prevents action completion until required reviewers approve.

Specialized agents:

| Agent | Responsibility |
| --- | --- |
| Security Agent | Explains exposure, encryption, compliance, and sensitive-data risk |
| Cost Agent | Estimates monthly waste and cost savings |
| Energy Agent | Estimates energy and carbon impact |
| Workflow Impact Agent | Identifies app, project, environment, owner, and downtime risk |
| Audit Agent | Checks approval requirements, traceability, and audit readiness |

## 10. Public API Interfaces

Base URL:

```text
${NEXT_PUBLIC_API_BASE_URL}
```

### Endpoint Summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/healthz` | Backend and database health check |
| `POST` | `/api/events/ingest` | Ingest one or more mock cloud events |
| `GET` | `/api/findings` | List findings with filters and pagination |
| `GET` | `/api/findings/{id}` | Get one finding with recommendation and audit history |
| `PATCH` | `/api/findings/{id}/review` | Submit approve, reject, defer, or needs-info decision |
| `GET` | `/api/dashboard/summary` | Get overview metrics for dashboard cards and charts |
| `GET` | `/api/audit-logs` | List audit logs with filters |

### `POST /api/events/ingest`

Request:

```json
{
  "events": [
    {
      "event_id": "evt-001",
      "provider": "aws",
      "account_id": "demo-account",
      "region": "ap-southeast-1",
      "resource_id": "bucket-project-drawings",
      "resource_name": "Project Drawings Bucket",
      "resource_type": "bucket",
      "environment": "production",
      "project_id": "proj-123",
      "owner_team": "Document Platform",
      "timestamp": "2026-06-20T00:00:00Z",
      "config": {
        "public_access": true
      },
      "metrics": {},
      "cost": {}
    }
  ]
}
```

Response:

```json
{
  "accepted": 1,
  "created_findings": 1,
  "duplicate_events": 0
}
```

### `GET /api/findings`

Query parameters:

| Parameter | Type | Description |
| --- | --- | --- |
| `severity` | string | `critical`, `high`, `medium`, `low` |
| `category` | string | `security`, `cost`, `energy`, `workflow`, `audit` |
| `status` | string | Approval or action status |
| `resource_type` | string | `bucket`, `vm`, `storage`, `database` |
| `owner_team` | string | Owner/team filter |
| `page` | number | 1-based page number |
| `page_size` | number | Number of records per page |

Response:

```json
{
  "items": [],
  "page": 1,
  "page_size": 20,
  "total": 0
}
```

### `PATCH /api/findings/{id}/review`

Request:

```json
{
  "decision": "approved",
  "reviewer_id": "user-security-001",
  "reviewer_role": "security",
  "reason": "Evidence confirms public access risk. DevOps approval still required before action."
}
```

Valid decisions:

| Decision | Meaning |
| --- | --- |
| `approved` | Reviewer approves the recommendation |
| `rejected` | Reviewer rejects the recommendation |
| `deferred` | Reviewer postpones the action |
| `needs_more_information` | Reviewer requests additional context |

Response:

```json
{
  "finding_id": "find-001",
  "status": "pending_review",
  "required_reviewers_remaining": ["devops"],
  "audit_id": "audit-101"
}
```

## 11. Core DTOs

### `CloudEvent`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `event_id` | string | Yes | Unique source event ID |
| `provider` | string | Yes | `aws`, `azure`, `gcp`, or `mock` |
| `account_id` | string | Yes | Cloud account or tenant ID |
| `region` | string | No | Cloud region |
| `resource_id` | string | Yes | Provider resource identifier |
| `resource_name` | string | No | Human-readable name |
| `resource_type` | string | Yes | `bucket`, `vm`, `storage`, `database` |
| `environment` | string | No | `production`, `staging`, `development`, or unknown |
| `project_id` | string | No | Construction project or business project ID |
| `owner_team` | string | No | Owning team if known |
| `timestamp` | datetime | Yes | Event time |
| `config` | object | Yes | Provider configuration fields |
| `metrics` | object | No | Usage metrics |
| `cost` | object | No | Cost data |

### `Finding`

| Field | Type | Description |
| --- | --- | --- |
| `finding_id` | string | Unique finding ID |
| `source_event_id` | string | Linked cloud event |
| `resource_id` | string | Affected resource |
| `resource_type` | string | Resource category |
| `issue_type` | string | Public bucket, idle VM, unused storage, or unencrypted DB |
| `category` | string | Security, cost, energy, workflow, or audit |
| `severity` | string | Critical, high, medium, or low |
| `status` | string | Current approval/action status |
| `rule_id` | string | Triggered deterministic rule |
| `evidence` | object | Supporting facts |
| `rule_confidence` | number | Confidence in deterministic detection |
| `ai_confidence` | number | Confidence in AI recommendation |
| `required_reviewers` | string[] | Required reviewer roles |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |

### `Recommendation`

| Field | Type | Description |
| --- | --- | --- |
| `recommendation_id` | string | Unique recommendation ID |
| `finding_id` | string | Linked finding |
| `recommended_action` | string | Proposed next step |
| `rationale` | string | Explanation for the action |
| `risk_level` | string | Low, medium, high, or critical |
| `estimated_monthly_savings` | number | Estimated cost savings |
| `estimated_carbon_reduction_kg` | number | Estimated CO2e reduction |
| `confidence` | number | Recommendation confidence |
| `agent_outputs` | object | Summaries from specialized agents |
| `safe_to_execute` | boolean | Must remain false until approvals are complete |

### `ApprovalDecision`

| Field | Type | Description |
| --- | --- | --- |
| `approval_id` | string | Unique approval decision ID |
| `finding_id` | string | Linked finding |
| `decision` | string | Approved, rejected, deferred, or needs more information |
| `reviewer_id` | string | User making the decision |
| `reviewer_role` | string | Reviewer role |
| `reason` | string | Decision rationale |
| `created_at` | datetime | Decision timestamp |

### `AuditLog`

| Field | Type | Description |
| --- | --- | --- |
| `audit_id` | string | Unique audit log ID |
| `entity_type` | string | Event, finding, recommendation, approval, or action |
| `entity_id` | string | Linked entity ID |
| `action` | string | Action performed |
| `actor_id` | string | User or system actor |
| `before_state` | object | State before change |
| `after_state` | object | State after change |
| `metadata` | object | Additional context |
| `created_at` | datetime | Audit timestamp |

### `DashboardSummary`

| Field | Type | Description |
| --- | --- | --- |
| `active_findings` | number | Total active findings |
| `critical_findings` | number | Count of critical findings |
| `pending_approvals` | number | Count awaiting review |
| `approved_actions` | number | Count approved |
| `estimated_monthly_savings` | number | Total projected savings |
| `estimated_carbon_reduction_kg` | number | Total projected CO2e reduction |
| `latest_scan_at` | datetime | Latest successful scan timestamp |
| `findings_by_category` | object | Category counts |
| `findings_by_severity` | object | Severity counts |

## 12. Rule Engine Requirements

| Rule | Trigger | Severity Default | Required Reviewers |
| --- | --- | --- | --- |
| Public bucket | `resource_type = bucket` and `config.public_access = true` | Critical for production, high otherwise | Security, DevOps |
| Idle VM | `resource_type = vm` and low CPU/network usage over threshold window | Medium by default, high if production | DevOps, Application Owner if app-linked |
| Unused storage | `resource_type = storage` and unattached or no read/write activity | Medium | DevOps, Project Owner, Compliance if sensitive |
| Unencrypted DB | `resource_type = database` and `config.encrypted = false` | High, critical if production | Security, DevOps, Application Owner, DBA |

Deduplication rule: if an active finding already exists for the same `resource_id`, `issue_type`, and source scan window, the backend updates evidence and timestamps instead of creating a duplicate active finding.

## 13. Dashboard Requirements

### Overview Dashboard

Must show:

1. Total active findings
2. Critical findings
3. Pending approvals
4. Approved actions
5. Estimated monthly cost savings
6. Estimated carbon reduction
7. Latest scan timestamp
8. Findings by category
9. Findings by severity

### Security Panel

Must show public bucket and unencrypted database findings with:

1. Finding ID
2. Resource
3. Severity
4. Evidence
5. Explanation
6. Required reviewers
7. Approval status
8. Recommended action

### Cost Panel

Must show idle VM and unused storage findings with:

1. Current estimated monthly cost
2. Estimated savings
3. Optimization strategy
4. Risk level
5. Required reviewers
6. Approval status

### Energy Panel

Must show:

1. Estimated carbon footprint trend
2. Estimated reduction after approved actions
3. Energy impact by resource type
4. Before/after comparison
5. Clear label that all values are estimates

### Audit Panel

Must show:

1. Scan event history
2. Finding history
3. Recommendation history
4. Approval history
5. Action history
6. Before and after states where available

## 14. Five-Member Task Division

| Member | Role | Main Responsibilities | Deliverables | Depends On |
| --- | --- | --- | --- | --- |
| Member 1 | Product / UX Lead | Own PRD polish, personas, user flows, dashboard wireframes, demo story, success metrics, reviewer-role definitions | Final PRD, wireframe checklist, demo script, acceptance checklist | All members for feasibility feedback |
| Member 2 | Frontend Engineer | Build Next.js dashboard with overview, security, cost, energy, audit, filters, finding details, approval UI, loading and error states | Working Next.js UI connected to API, reusable dashboard components, frontend env config | Member 3 API contract, Member 1 wireframes |
| Member 3 | Backend / API Engineer | Build FastAPI service, database models, migrations, REST endpoints, approval workflow, audit logger, CORS, health check | Render-ready FastAPI backend, API schemas, database migration, seed endpoint or seed script | Member 4 rule outputs, Member 5 Render env |
| Member 4 | AI / Rules Engineer | Build mock event ingestion data, normalization, four deterministic rules, master-agent routing, specialized agent outputs, scoring, recommendation generation | Rule engine, sample events, agent output format, scoring logic, recommendation generator | Member 3 DTOs, Member 1 risk rules |
| Member 5 | QA / DevOps / Integration | Configure Render service, Render Postgres, Render Cron Job, environment variables, seed data, integration tests, demo reliability checks | Render deployment checklist, seeded demo environment, test report, runbook | Members 2 and 3 deployable services |

### Detailed Task Breakdown

#### Member 1: Product / UX Lead

1. Validate the MVP story: "detect, explain, approve, audit."
2. Define role-based review scenarios for Security, DevOps, App Owner, Project Owner, Finance, and ESG.
3. Produce wireframes for:
   - Overview dashboard
   - Finding list
   - Finding detail
   - Approval modal or panel
   - Audit log
4. Write demo script with at least four findings, one per rule.
5. Define acceptance checklist for final presentation.

#### Member 2: Frontend Engineer

1. Build App Router dashboard routes and page structure.
2. Create API client using `NEXT_PUBLIC_API_BASE_URL`.
3. Build panels for overview, security, cost, energy, and audit.
4. Implement filters for severity, category, status, owner, and resource type.
5. Implement finding detail view.
6. Implement review actions that call `PATCH /api/findings/{id}/review`.
7. Add loading, empty, and error states for every panel.
8. Ensure no secrets are exposed to the browser.

#### Member 3: Backend / API Engineer

1. Create FastAPI application structure.
2. Define Pydantic DTOs for public API payloads.
3. Define SQLAlchemy or SQLModel models for events, findings, recommendations, approvals, audit logs, and demo users.
4. Add Alembic migrations.
5. Implement endpoints listed in this PRD.
6. Add CORS configuration for local and deployed frontend origins.
7. Add `/healthz` endpoint.
8. Ensure approval decisions write audit log records.
9. Ensure remediation status cannot become action-completed without required approval.

#### Member 4: AI / Rules Engineer

1. Create mock cloud event fixtures for all four rule types.
2. Build normalization functions from raw event shape to `CloudEvent`.
3. Implement public bucket, idle VM, unused storage, and unencrypted DB rules.
4. Implement master-agent routing based on finding type.
5. Generate structured outputs from Security, Cost, Energy, Workflow Impact, and Audit agents.
6. Implement recommendation scoring and reviewer assignment.
7. Return confidence and uncertainty when metadata is incomplete.
8. Provide deterministic fallback recommendation text for demo reliability.

#### Member 5: QA / DevOps / Integration

1. Create Render backend service configuration.
2. Create Render Postgres database and configure `DATABASE_URL`.
3. Configure Render Cron Job for scheduled mock ingestion.
4. Configure frontend environment variable `NEXT_PUBLIC_API_BASE_URL`.
5. Build seed-data setup for repeatable demos.
6. Test API endpoints against frontend flows.
7. Verify dashboard loads with seeded data.
8. Prepare rollback and demo recovery steps.

## 15. Suggested Hackathon Build Sequence

| Phase | Outcome | Owners |
| --- | --- | --- |
| Phase 1: Contract and seed data | DTOs, API contract, mock events, wireframes | Members 1, 3, 4 |
| Phase 2: Core vertical slice | One public bucket finding flows from ingestion to dashboard to approval to audit | Members 2, 3, 4 |
| Phase 3: Complete MVP breadth | All four rules, all dashboard panels, Render deploy, reliable demo | All members |

## 16. Acceptance Criteria

1. `PRD.md` exists at the repository root.
2. `plan.md` remains unchanged.
3. The PRD explicitly specifies Next.js as frontend and Render-hosted FastAPI as backend.
4. The PRD includes Render Postgres and Render Cron Job in the architecture.
5. The PRD documents the required public endpoints.
6. The PRD documents `CloudEvent`, `Finding`, `Recommendation`, `ApprovalDecision`, `AuditLog`, and `DashboardSummary`.
7. The PRD assigns clear work to exactly five team members.
8. The MVP scope includes four rules: public bucket, idle VM, unused storage, and unencrypted database.
9. The PRD states that AI agents cannot directly execute remediation.
10. The PRD includes dashboard, approval workflow, audit log, risks, and success metrics.

## 17. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| LLM recommendation is inaccurate | Users may lose trust or choose unsafe action | Treat rule engine as source of truth, show confidence, require human approval |
| Missing metadata causes wrong routing | Findings may go to wrong reviewer | Show uncertainty and allow needs-more-information decision |
| Too many findings overwhelm users | Reviewers may ignore alerts | Use severity, priority score, filters, and category panels |
| Demo backend deploy fails | Presentation risk | Seed local data and keep a local fallback runbook |
| Render cron job not triggered before demo | Dashboard may look empty | Include seed script or seed endpoint controlled by backend team |
| Carbon estimate challenged | ESG numbers may be seen as unreliable | Label values as estimates and show calculation assumptions |
| Dangerous remediation implied | Users may think AI can modify cloud resources | UI and PRD must state that action execution is human-approved/manual in MVP |
| Frontend exposes secrets | Security risk | Only expose `NEXT_PUBLIC_API_BASE_URL`; keep all secret values on backend |

## 18. Success Metrics

| Metric | Target for MVP Demo |
| --- | --- |
| Findings generated from seed data | At least 4, one per rule |
| Dashboard panels populated | Overview, security, cost, energy, audit |
| Approval actions supported | Approve, reject, defer, needs more information |
| Audit completeness | Every ingest, finding, recommendation, and approval writes an audit record |
| Recommendation explainability | Every finding includes evidence, rationale, confidence, and required reviewers |
| Demo reliability | Full vertical flow works from seeded event to audit log |
| Deployment readiness | Backend can run on Render with documented env vars and start command |

## 19. Environment Variables

### Frontend

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Public URL for the Render FastAPI backend |

### Backend

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Render Postgres connection string |
| `FRONTEND_ORIGIN` | Allowed deployed frontend origin for CORS |
| `LOCAL_FRONTEND_ORIGIN` | Allowed local frontend origin for development |
| `AI_PROVIDER_API_KEY` | Optional AI provider key for recommendation generation |
| `SEED_DATA_ENABLED` | Enables controlled seed/demo setup in non-production demo environments |

## 20. Open Questions

1. Which real cloud provider should be implemented first after the mock MVP?
2. What carbon estimation formula should be used for production reporting?
3. Should approved actions remain manual forever, or should future versions support controlled low-risk automation?
4. What authentication provider should be used after the hackathon demo?
5. Which project-management or ticketing system should receive findings in a future version?

## 21. References

1. Existing source plan: `plan.md`
2. Render FastAPI deployment docs: https://render.com/docs/deploy-fastapi
3. Render Postgres docs: https://render.com/docs/postgresql
4. Render Cron Jobs docs: https://render.com/docs/cronjobs
5. Installed frontend stack: `package.json`
