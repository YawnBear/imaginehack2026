# SafeCloud — Customizable Rules, Agents, Threat Reports & Agent-Executed Remediation

> Design spec. Status: **approved 2026-06-20**. Supersedes the static GreenGuard MVP by adding a
> client-side agent (data plane), user-authored rules and AI agents, a threat-report view, a
> configurable response policy, and a closed-loop human-approved remediation flow.
>
> Renaming: **GreenGuard → SafeCloud** (per `QUESTIONS.md`).

---

## 1. Summary

Today the product is a **control plane only**: mock cloud events → 4 hardcoded rules → findings →
recommendations with 5 hardcoded agent personas → human review → audit. Everything is in-memory,
with a mock-data fallback so the demo never breaks. Rules and agents cannot be edited from the UI,
nothing is scanned for real, and nothing is remediated.

This spec adds a coherent capability layer with two planes:

- **Control plane** — the existing FastAPI + Next.js dashboard: authoring, storage, approvals,
  reports. Stays in-memory.
- **Data plane** — a new standalone `safecloud-agent.py` that runs on the client's own box, watches
  a folder, runs the rule engine locally, ships findings up, and executes approved remediations by
  mutating the watched state (visible closed loop).

Six components: (1) client agent, (2) dashboard⇄agent connection, (3) customizable rules,
(4) customizable AI agents, (5) threat reports, (6) configurable response policy + human-in-the-loop
shutdown approval.

---

## 2. Locked decisions (from the brainstorming grill)

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Agent model | **Local agent + cloud control plane.** New `safecloud-agent.py` pulls config, scans locally, posts findings, executes approved shutdowns. |
| 2 | Scan source | **Watched folder**: `infra-snapshot.json` + `activity.log` + a scripted-storyline `generator.py`. |
| 3 | Rule authoring | **Template catalog + structured condition builder.** Typed fields only, no free-form code. Clash detection + live "matches N resources now" preview. |
| 4 | Agent authoring | **Persona templates + structured lens config.** Name + lens + coverage + tone + bounded extra-focus → compiled to a system prompt. Master router auto-invokes by coverage. |
| 5 | Threat report | Auto-generated when `criticality ≥ policy threshold` (else on-demand). Lives in a dedicated **Threats** page + deep-link from findings. 5 sections (below). |
| 6 | Response policy | Configurable threshold. Per-rule mode + global default: `monitor` / `manual` / `auto`. **Auto-escalates freely (report + flag + notify); destructive execution ALWAYS human-gated; only safe/reversible actions may auto-execute.** Criticality = deterministic 0–100. |
| 7 | Remediation exec | **Agent mutates the watched snapshot** → visible detect → report → approve → act → resolve loop. |
| 8 | Build order | **Control-plane first**: Rules → Agents → Threats+Policy → real agent last. In-process simulator stands in for the agent during Phases 1–3 using the same endpoints. |

**Assumed defaults (approved):** keep in-memory store (no Postgres); polling REST + static agent
token for the connection; keep the existing 6 reviewer roles for now.

---

## 3. Architecture

```text
                          CONTROL PLANE (existing, in-memory)
   Next.js dashboard  <-- REST -->  FastAPI
     Rules / Agents / Threats / Policy / Findings / Audit
                                    |
                                    |  agent endpoints (new)
                                    v
   GET  /api/agent/config      (rules + agents + policy to run)
   POST /api/agent/events      (CloudEvents + activity entries)
   GET  /api/agent/commands    (queued remediation commands)
   POST /api/agent/commands/{id}/result
   GET  /api/agent/status      (drives "agent online" chip)
                                    ^
                                    |  polling REST + agent token
                                    |
                          DATA PLANE (new)
   safecloud-agent.py  on the client box
     - poll config         - run rule engine LOCALLY
     - read watch/ folder  - post events/findings up
     - poll commands       - execute approved remediation
   watch/
     infra-snapshot.json   <- resources + config + metrics
     activity.log          <- actor, action, target, ts
     generator.py          <- injects the demo storyline
```

**De-risking "agent last":** during Phases 1–3, an **in-process simulator** (a backend module)
calls the same `GovernanceService` methods the real agent's endpoints will. The dashboard works
end-to-end before the external agent exists; Phase 4 swaps the simulator for `safecloud-agent.py`
with no UI changes.

---

## 4. Data model — new in-memory collections + Pydantic/TS schemas

All names are the cross-boundary contract; backend `schemas/` and frontend `lib/types.ts` must
agree exactly (same discipline as `ARCHITECTURE.md` §4).

### `Rule` (data-driven; replaces the hardcoded engine logic)
```
rule_id, name, enabled(bool), template_key,
resource_type,                       # bucket|vm|storage|database
conditions[]: { field, operator, value },   # field = dot-path; ANDed
operator ∈ { ==, !=, <, <=, >, >=, in, not_in, exists, contains }
severity_base,                       # critical|high|medium|low
escalate_in_prod(bool),              # bump severity when environment==production
rule_confidence(0-1),                # template default, editable; carried onto the finding
category,                            # security|cost|energy|workflow|audit
issue_type,                          # snake_case label (built-in or custom)
required_reviewers[],                # reviewer_role enum values
remediation: { action_key, destructive(bool) },
mode,                                # monitor|manual|auto  (overrides policy default)
auto_threshold(int|null),           # per-rule override of policy.auto_threshold
created_at
```

**Field dot-paths** resolve into the `CloudEvent` (`config.*`, `metrics.*`, `cost.*`, and
top-level `environment`, `resource_type`, …).

**Rule templates (static catalog):** Public Exposure · Idle Resource · Unused Resource ·
Unencrypted Data · Forbidden Config Value · Threshold Breach · Sensitive-Data Exposure · Custom.
A template pre-fills `resource_type`, `conditions`, `severity_base`, `category`, `issue_type`,
default reviewers, and `remediation`; the user edits typed fields only.

**Remediation action catalog (static):**
| action_key | destructive | effect on snapshot |
| --- | --- | --- |
| `restrict_public_access` | no (reversible) | `config.public_access = false` |
| `tag_resource` | no | adds a tag |
| `snapshot_then_flag` | no | records a snapshot marker |
| `plan_encryption` | no | flags for encryption (no destructive change) |
| `stop_vm` | **yes** | `status = stopped` |
| `delete_storage` | **yes** | removes the volume |

### `Agent` (custom AI agent)
```
agent_id, name, enabled,
lens,                  # Exposure|Encryption|Cost|Carbon|Compliance|WorkflowImpact|Forensics
coverage: { categories[], issue_types[] },   # which findings it analyzes
tone,                  # preset string
extra_focus,           # bounded free-text (compiled into the system prompt)
template_key, created_at
```
The 5 existing personas (security/cost/energy/workflow/audit) are pre-loaded as seed `Agent`
records so nothing regresses.

### `ResponsePolicy` (global singleton; rules may override)
```
default_mode,          # monitor|manual|auto
auto_threshold(int 0-100),
auto_safe_actions[],   # action_keys allowed to auto-execute (safe ones only)
destructive_locked = true,   # INVARIANT: destructive actions never auto-execute
notify[]               # reviewer_roles to notify on auto-escalate
```

### `ThreatReport`
```
report_id, finding_id, criticality_score(0-100), criticality_factors{},
summary,               # LLM "what & why", grounded in evidence + rule
timeline[]: { actor, action, target_resource_id, timestamp, note },  # from activities
recommended_solution,  # from recommendation
agent_sections{},      # per-agent contributions
approval_status, ai_generated(bool), generated_at
```

### `RemediationCommand`
```
command_id, finding_id, action_key, params{}, target_resource_id,
status,                # queued|in_progress|completed|failed
approved_by[],         # reviewer roles that approved
result, created_at, executed_at
```

### `Activity` (ingested from the agent's activity.log)
```
activity_id, actor, action, target_resource_id, timestamp, source
```

### New `InMemoryStore` collections
`rules: dict[id]`, `agents: dict[id]`, `policy: ResponsePolicy` (singleton),
`threat_reports: dict[finding_id]`, `commands: dict[id]`, `activities: list`,
`agent_registry: dict[agent_token -> {agent_id, last_seen}]`.

---

## 5. Rule engine refactor (data-driven, no regressions)

`backend/app/rules/engine.py`:
- `evaluate_event(event, rules) -> list[RuleMatch]` — iterate **enabled** rules; for each, evaluate
  every condition via a generic dot-path resolver + operator table; all conditions AND. On full
  match, build `RuleMatch` (carry `rule_id, issue_type, category, severity, evidence,
  rule_confidence, required_reviewers`). Severity bumps when `escalate_in_prod` and
  `environment == "production"`.
- **The 4 hardcoded rules are migrated to seed `Rule` records** in the new format — identical
  detection behavior, now editable.
- `detect_clashes(rules) -> list[ClashWarning]` — warn when two enabled rules share `resource_type`
  + overlapping `field`/`operator` (powers the "[!] clashes with Idle VM" chip and a Rules-page
  banner).
- `compute_criticality(finding, event) -> (score:int, factors:dict)` — **deterministic** 0–100 from
  severity weight × exposure (public/internet-reachable) × data-sensitivity × environment (prod) ×
  blast-radius (app-linked / shared). Number is rule-owned; the LLM only narrates it.

---

## 6. Agent layer refactor (custom agents)

`backend/app/agents/`:
- Master router selects every **enabled `Agent` whose `coverage` matches** the finding's
  `category`/`issue_type`.
- For each, compile `lens + tone + extra_focus` into a system prompt; call the existing GrafiLab
  client; return `agent_outputs` keyed by agent name. Per-lens **deterministic template remains the
  fallback** (AI off / timeout / parse failure).
- **Hard invariant preserved:** the AI explains; it never detects, never creates findings, never
  changes `severity`, `estimated_monthly_savings`, `estimated_carbon_reduction_kg`, or criticality.

---

## 7. Threat report generator

`generate_threat_report(finding) -> ThreatReport`:
1. **Criticality** — deterministic score + factor breakdown (§5).
2. **Summary ("what & why")** — LLM, grounded strictly in `evidence` + the triggering rule.
3. **Timeline / trace** — rebuilt from `store.activities` filtered to `target_resource_id`: who
   created it, who made it dangerous, when the agent detected it (the demo's "jane@devops set
   public at 14:02" story).
4. **Recommended solution** — from the recommendation (`recommended_action` + the gated
   remediation action).
5. **Approval status** — required reviewers + who's signed.

Auto-generated when `criticality ≥ effective auto_threshold` and mode ≠ `monitor`; otherwise an
on-demand "Generate report" button. Cached per finding (`ai_generated` flag, same lazy pattern as
today's recommendation enrichment).

---

## 8. Response policy + remediation loop

**On finding creation:** resolve effective mode (rule override → policy default).
- `monitor` → record only, no report, no escalation.
- `criticality ≥ threshold` (and mode ≠ monitor) → auto-generate report + flag human-in-the-loop +
  notify `policy.notify` roles.

**Remediation:**
- The recommendation carries `remediation { action_key, destructive }`.
- **Destructive** (`stop_vm`, `delete_storage`) → requires **ALL** `required_reviewers` to approve
  before a `RemediationCommand` is queued. Never auto-executes (invariant).
- **Safe** action + rule mode `auto` + criticality ≥ threshold → command **auto-queued** (still
  fully audited, `safe_to_execute` semantics respected).
- Agent (or simulator) executes the command → **patches `infra-snapshot.json`** + appends
  `activity.log` (`safecloud-agent restricted bucket per approval #N`) → posts result → finding →
  `action_completed`. The next scan confirms the issue is resolved.

---

## 9. API additions

**Authoring (control plane):**
| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/rules` | list / create rule |
| GET/PATCH/DELETE | `/api/rules/{id}` | get / update / delete (or disable) |
| GET | `/api/rules/templates` | static template catalog |
| GET | `/api/rules/clashes` | current clash warnings |
| POST | `/api/rules/preview` | "matches N resources now" against the current snapshot |
| GET/POST | `/api/agents` | list / create agent |
| GET/PATCH/DELETE | `/api/agents/{id}` | get / update / delete |
| GET | `/api/agents/templates` | persona templates |
| GET/PUT | `/api/policy` | get / update response policy |
| GET | `/api/threats` | list threat reports |
| GET/POST | `/api/findings/{id}/threat-report` | get / generate report |

**Agent (data plane):** `POST /api/agent/enroll`, `GET /api/agent/config`,
`POST /api/agent/events`, `GET /api/agent/commands`, `POST /api/agent/commands/{id}/result`,
`GET /api/agent/status`. All authenticated by a static agent token (header `X-Agent-Token`).

Existing endpoints (`/api/findings`, `/review`, `/dashboard/summary`, `/api/audit-logs`,
`/api/events/ingest`, `/api/demo/seed`) are unchanged.

---

## 10. Frontend additions

- **Nav** (`AppShell.tsx` `NAV[]`): add **Rules**, **Agents**, **Threats** (+ icons in
  `icons.tsx`). Policy = a panel on the Rules page + a global-default control.
- **Rules page** (`app/(dashboard)/rules/page.tsx`): list with clash warnings + "New Rule" wizard
  (template picker → structured form → live `matches N` preview).
- **Agents page** (`app/(dashboard)/agents/page.tsx`): list + "New Agent" (clone template →
  lens/coverage/tone/extra-focus → preview output on a sample finding).
- **Threats page** (`app/(dashboard)/threats/page.tsx`): report list w/ criticality badges + full
  5-section report view + inline approve/reject (reusing the `FindingModal` approval pattern).
- **Agent status chip** in the shell ("Agent online · last seen 3s ago" / "offline").
- **API client** (`app/lib/api.ts`): new functions following the existing `ApiResult<T>` +
  `tryFetch` + mock-fallback pattern; new types in `app/lib/types.ts`. Built on existing
  `ui.tsx` / `layout-bits.tsx` / `charts.tsx` / `toast.tsx` primitives.

---

## 11. Demo storyline (the generator)

`watch/generator.py` starts from a normal `infra-snapshot.json`, then injects, with actor+timestamp
in `activity.log`:
1. `jane@devops` flips `bucket-project-drawings` to public at T+0 → critical public-bucket finding.
2. An idle prod render VM → cost/energy finding.
3. An unencrypted prod claims DB → critical security finding.

Live demo: **Run scan → critical findings → auto threat reports → approve → agent restricts/stops →
rescan → resolved.** The frontend mock fallback (`mockData.ts`) still guarantees the dashboard is
never blank if the backend/agent is cold.

---

## 12. Safety invariants (carried forward + new)

1. **AI never detects or changes numbers.** Rules own detection, severity, savings, carbon,
   criticality. LLM only writes explanation text.
2. **Destructive execution is always human-gated.** `destructive_locked = true` is non-negotiable;
   only safe/reversible actions may auto-execute.
3. **`safe_to_execute` stays false** until all required reviewers approve.
4. **Degrade gracefully** — AI off/timeout → template text; backend cold → frontend mock fallback.
5. **No secrets in the frontend.** Agent auth is a token from backend env; real LLM key only in
   Render env.
6. **Audit everything** — rule/agent/policy edits, report generation, command queue/execute all
   write audit logs.

---

## 13. Build sequence (control-plane first)

1. **Phase 1 — Rules.** Data-driven engine + clash + criticality; migrate the 4 built-ins to seed
   records; Rules CRUD API; Rules UI (wizard + clash + preview). In-process simulator drives scans.
2. **Phase 2 — Agents.** Custom `Agent` model + master router by coverage; Agents CRUD API; Agents
   UI; migrate the 5 personas to seed records.
3. **Phase 3 — Threats + Policy.** Criticality scoring + threat-report generator; `ResponsePolicy`
   + remediation-command flow (destructive-gated); Threats UI + Policy panel. Execution simulated
   in-process.
4. **Phase 4 — Real agent (last).** `safecloud-agent.py` + `watch/` folder + `generator.py` +
   agent endpoints + token auth + status chip. Swap the in-process simulator for the real agent —
   no UI changes.

Each phase ends demo-able. Stopping after any phase still tells a coherent story.

---

## 14. Out of scope (YAGNI for the hackathon)

- Postgres / persistence beyond in-memory.
- Real cloud-provider SDK integration (the agent reads the watched folder, not AWS/Azure/GCP APIs).
- Full RBAC / real auth (reviewer roles remain demo-switchable; agent uses a static token).
- Multi-agent fleet management, agent versioning, mTLS.
- Free-form rule DSL or raw agent system-prompt authoring (explicitly rejected for standardization).
