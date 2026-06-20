# SafeCloud Phase 3 — Threat Reports + Response Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a deterministic **criticality score**, an auto/on-demand **Threat Report** (why it triggered + a who/when timeline + recommended solution + the agent sections), a configurable **Response Policy** (monitor/manual/auto with a criticality threshold), and a **RemediationCommand** that is queued only after all required reviewers approve (destructive actions always human-gated). Surface it all in a **Threats** page + a **Policy** panel.

**Architecture:** Pure functions `compute_criticality(finding, event)` and `build_threat_report(...)`; a `ThreatService` for on-demand generation + policy + command listing; governance hooks that (a) auto-generate a report at ingest when policy is `auto` and `criticality ≥ threshold`, and (b) queue a `RemediationCommand` when a finding reaches `approved`. Numbers stay rule/criticality-owned; the LLM is not required (deterministic summary is the base, same safety boundary as Phases 1–2). Frontend: Threats nav + page + Policy panel, all on the existing `ApiResult`/mock-fallback + `ui.tsx` patterns.

**Tech Stack:** Python 3.13 / FastAPI / Pydantic v2 (+ pytest, bootstrapped) · Next.js 16.2.9 / React 19 / TS / Tailwind v4. macOS; backend venv at `backend/.venv`.

**Builds on Phases 1–2** (branch `safecloud-phase1-rules`; backend currently 66 tests green). **Spec:** §5 (criticality), §7 (threat report), §8 (policy + remediation), §13 Phase 3.

**Demo default (recorded):** the seeded `ResponsePolicy` defaults to `default_mode="auto", auto_threshold=75` so the Threats page is populated out of the box (the 2 critical seed findings auto-generate reports). The spec's design-time "manual" default is changeable live in the Policy panel.

**Criticality formula (0–100, deterministic):** severity (critical 40 / high 30 / medium 18 / low 8) + internet_exposure 25 (public_access or `public_bucket`) + data_sensitivity 15 (`contains_sensitive_data` or `unencrypted_database`/`public_bucket`) + production 15 + blast_radius 5 (`application_id` present), capped at 100. Each contribution is recorded in `criticality_factors`.

---

## File Structure

**Backend — create:** `app/schemas/threats.py`, `app/threats/__init__.py`, `app/threats/criticality.py`, `app/threats/report.py`, `app/services/threats_service.py`, `app/api/threats_routes.py`, + test files.
**Backend — modify:** `app/schemas/__init__.py` (exports), `app/services/store.py` (threat_reports/policy/commands), `app/services/governance.py` (auto-escalate at ingest + queue command at approval), `app/services/dependencies.py` (get_threat_service), `app/main.py` (mount router).
**Frontend — create:** `app/(dashboard)/threats/page.tsx`, `app/(dashboard)/threats/ThreatsView.tsx`.
**Frontend — modify:** `app/lib/types.ts`, `app/lib/api.ts`, `app/lib/mockData.ts`, `app/components/icons.tsx`, `app/components/AppShell.tsx`.

---

## Task 1: Threat/policy schemas

**Files:** Create `backend/app/schemas/threats.py`; Modify `backend/app/schemas/__init__.py`; Test `backend/tests/test_threat_schemas.py`.

- [ ] **Step 1: Failing test** — `backend/tests/test_threat_schemas.py`:
```python
from app.schemas import ResponsePolicy, RemediationCommand, ThreatReport, TimelineEntry


def test_policy_defaults():
    p = ResponsePolicy()
    assert p.default_mode == "auto"
    assert p.auto_threshold == 75


def test_threat_report_minimal():
    r = ThreatReport(report_id="t1", finding_id="f1", criticality_score=90, summary="s",
                     recommended_solution="do x", approval_status="pending_review",
                     generated_at="2026-06-20T00:00:00Z")
    assert r.criticality_score == 90
    assert r.agent_sections == {}


def test_command_defaults():
    c = RemediationCommand(command_id="c1", finding_id="f1", action_key="stop_vm",
                           destructive=True, created_at="2026-06-20T00:00:00Z")
    assert c.status == "queued"
    assert c.approved_by == []
```

- [ ] **Step 2: Run → fails** (`.venv/bin/pytest tests/test_threat_schemas.py -v`).

- [ ] **Step 3: Implement** — `backend/app/schemas/threats.py`:
```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ResponseMode = Literal["monitor", "manual", "auto"]
CommandStatus = Literal["queued", "in_progress", "completed", "failed"]


class TimelineEntry(BaseModel):
    actor: str
    action: str
    target_resource_id: str
    timestamp: datetime
    note: str = ""


class ThreatReport(BaseModel):
    report_id: str
    finding_id: str
    criticality_score: int
    criticality_factors: dict[str, int] = Field(default_factory=dict)
    summary: str
    timeline: list[TimelineEntry] = Field(default_factory=list)
    recommended_solution: str
    agent_sections: dict[str, str] = Field(default_factory=dict)
    approval_status: str
    ai_generated: bool = False
    generated_at: datetime


class ThreatListResponse(BaseModel):
    items: list[ThreatReport]
    total: int


class ResponsePolicy(BaseModel):
    default_mode: ResponseMode = "auto"
    auto_threshold: int = 75
    notify: list[str] = Field(default_factory=list)


class ResponsePolicyUpdate(BaseModel):
    default_mode: ResponseMode | None = None
    auto_threshold: int | None = None
    notify: list[str] | None = None


class RemediationCommand(BaseModel):
    command_id: str
    finding_id: str
    action_key: str
    destructive: bool
    status: CommandStatus = "queued"
    approved_by: list[str] = Field(default_factory=list)
    result: str = ""
    created_at: datetime
    executed_at: datetime | None = None


class CommandListResponse(BaseModel):
    items: list[RemediationCommand]
    total: int
```

- [ ] **Step 4: Export** — in `backend/app/schemas/__init__.py`, add after the agents import block:
```python
from app.schemas.threats import (
    CommandListResponse,
    RemediationCommand,
    ResponseMode,
    ResponsePolicy,
    ResponsePolicyUpdate,
    ThreatListResponse,
    ThreatReport,
    TimelineEntry,
)
```
and add these names to `__all__`:
```python
    "CommandListResponse",
    "RemediationCommand",
    "ResponseMode",
    "ResponsePolicy",
    "ResponsePolicyUpdate",
    "ThreatListResponse",
    "ThreatReport",
    "TimelineEntry",
```

- [ ] **Step 5: Run → passes. Step 6: Commit** `feat(threats): add threat report / policy / command schemas`.

---

## Task 2: Criticality scoring

**Files:** Create `backend/app/threats/__init__.py` (empty), `backend/app/threats/criticality.py`; Test `backend/tests/test_criticality.py`.

- [ ] **Step 1: Failing test** — `backend/tests/test_criticality.py`:
```python
from datetime import UTC, datetime

from app.schemas import CloudEvent, Finding
from app.threats.criticality import compute_criticality


def _finding(**kw) -> Finding:
    base = dict(finding_id="f", source_event_id="e", resource_id="r", resource_type="bucket",
                issue_type="public_bucket", category="security", severity="critical",
                status="pending_review", rule_id="R", rule_confidence=0.9,
                evidence={"public_access": True, "environment": "production"},
                created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
    base.update(kw)
    return Finding(**base)


def _event(env="production") -> CloudEvent:
    return CloudEvent(event_id="e", account_id="a", resource_id="r", resource_type="bucket",
                      environment=env, timestamp=datetime.now(UTC))


def test_public_prod_bucket_is_high():
    score, factors = compute_criticality(_finding(), _event())
    assert score == 95  # 40 sev + 25 exposure + 15 sensitivity + 15 prod
    assert factors["severity"] == 40
    assert factors["internet_exposure"] == 25


def test_low_severity_low_score():
    score, _ = compute_criticality(
        _finding(severity="low", issue_type="idle_vm", category="cost",
                 evidence={"environment": "staging"}),
        _event(env="staging"),
    )
    assert score == 8


def test_score_capped_at_100():
    score, _ = compute_criticality(
        _finding(evidence={"public_access": True, "contains_sensitive_data": True,
                           "environment": "production", "application_id": "app"}),
        _event(),
    )
    assert score == 100  # 40+25+15+15+5 = 100
```

- [ ] **Step 2: Run → fails. Step 3: Implement** — `backend/app/threats/criticality.py`:
```python
from app.schemas import CloudEvent, Finding

_SEVERITY = {"critical": 40, "high": 30, "medium": 18, "low": 8}


def compute_criticality(finding: Finding, event: CloudEvent | None) -> tuple[int, dict[str, int]]:
    factors: dict[str, int] = {"severity": _SEVERITY.get(finding.severity, 10)}
    evidence = finding.evidence or {}

    env = (getattr(event, "environment", None) or evidence.get("environment") or "").lower()
    if bool(evidence.get("public_access")) or finding.issue_type == "public_bucket":
        factors["internet_exposure"] = 25
    if bool(evidence.get("contains_sensitive_data")) or finding.issue_type in {
        "unencrypted_database",
        "public_bucket",
    }:
        factors["data_sensitivity"] = 15
    if env == "production":
        factors["production"] = 15
    if evidence.get("application_id"):
        factors["blast_radius"] = 5

    return min(100, sum(factors.values())), factors
```

(Also create empty `backend/app/threats/__init__.py`.)

- [ ] **Step 4: Run → passes. Step 5: Commit** `feat(threats): deterministic criticality scoring`.

---

## Task 3: Threat report builder

**Files:** Create `backend/app/threats/report.py`; Test `backend/tests/test_threat_report.py`.

- [ ] **Step 1: Failing test** — `backend/tests/test_threat_report.py`:
```python
from datetime import UTC, datetime

from app.schemas import AuditLog, CloudEvent, Finding, Recommendation
from app.threats.report import build_threat_report


def _finding() -> Finding:
    return Finding(finding_id="f1", source_event_id="e1", resource_id="bucket-x",
                   resource_type="bucket", issue_type="public_bucket", category="security",
                   severity="critical", status="pending_review", rule_id="R", rule_confidence=0.9,
                   evidence={"public_access": True, "environment": "production"},
                   created_at=datetime.now(UTC), updated_at=datetime.now(UTC))


def _event() -> CloudEvent:
    return CloudEvent(event_id="e1", account_id="a", resource_id="bucket-x", resource_type="bucket",
                      environment="production", owner_team="Docs", timestamp=datetime.now(UTC))


def _rec() -> Recommendation:
    return Recommendation(recommendation_id="r1", finding_id="f1",
                          recommended_action="Restrict public access.", rationale="why",
                          risk_level="critical", confidence=0.9,
                          agent_outputs={"security": "exposure risk"})


def _audit() -> list[AuditLog]:
    return [AuditLog(audit_id="a1", entity_type="finding", entity_id="f1", action="finding_created",
                     actor_id="system-seed", created_at=datetime.now(UTC))]


def test_report_has_score_solution_and_timeline():
    report = build_threat_report(_finding(), _rec(), _event(), _audit(), "pending_review")
    assert report.criticality_score == 95
    assert report.recommended_solution == "Restrict public access."
    assert report.agent_sections == {"security": "exposure risk"}
    assert len(report.timeline) >= 2  # synthetic origin + finding_created audit
    assert report.timeline == sorted(report.timeline, key=lambda e: e.timestamp)


def test_summary_override_marks_ai_generated():
    report = build_threat_report(_finding(), _rec(), _event(), _audit(), "approved",
                                 summary_override="LLM text")
    assert report.summary == "LLM text"
    assert report.ai_generated is True
```

- [ ] **Step 2: Run → fails. Step 3: Implement** — `backend/app/threats/report.py`:
```python
from datetime import UTC, datetime
from uuid import uuid4

from app.schemas import (
    AuditLog,
    CloudEvent,
    Finding,
    Recommendation,
    ThreatReport,
    TimelineEntry,
)
from app.threats.criticality import compute_criticality


def _issue_label(issue_type: str) -> str:
    return issue_type.replace("_", " ").title()


def build_timeline(
    finding: Finding, event: CloudEvent | None, audit_logs: list[AuditLog]
) -> list[TimelineEntry]:
    entries: list[TimelineEntry] = []
    if event is not None:
        entries.append(
            TimelineEntry(
                actor=event.owner_team or "unknown",
                action="resource_entered_risky_state",
                target_resource_id=finding.resource_id,
                timestamp=event.timestamp,
                note=f"{_issue_label(finding.issue_type)} condition present.",
            )
        )
    for log in audit_logs:
        if log.entity_id in {finding.finding_id, finding.source_event_id}:
            entries.append(
                TimelineEntry(
                    actor=log.actor_id,
                    action=log.action,
                    target_resource_id=finding.resource_id,
                    timestamp=log.created_at,
                )
            )
    entries.sort(key=lambda e: e.timestamp)
    return entries


def build_threat_report(
    finding: Finding,
    recommendation: Recommendation | None,
    event: CloudEvent | None,
    audit_logs: list[AuditLog],
    approval_status: str,
    summary_override: str | None = None,
) -> ThreatReport:
    score, factors = compute_criticality(finding, event)
    recommended = (
        recommendation.recommended_action
        if recommendation
        else "Review and remediate after approval."
    )
    agent_sections = dict(recommendation.agent_outputs) if recommendation else {}
    why = ", ".join(f"{k.replace('_', ' ')} (+{v})" for k, v in factors.items())
    summary = summary_override or (
        f"{_issue_label(finding.issue_type)} detected on {finding.resource_id} "
        f"({finding.severity}). Criticality {score}/100 — driven by {why}. "
        f"Evidence: {dict(finding.evidence)}."
    )
    return ThreatReport(
        report_id=f"threat-{uuid4().hex[:10]}",
        finding_id=finding.finding_id,
        criticality_score=score,
        criticality_factors=factors,
        summary=summary,
        timeline=build_timeline(finding, event, audit_logs),
        recommended_solution=recommended,
        agent_sections=agent_sections,
        approval_status=approval_status,
        ai_generated=bool(summary_override),
        generated_at=datetime.now(UTC),
    )
```

- [ ] **Step 4: Run → passes. Step 5: Commit** `feat(threats): threat report builder with criticality + timeline`.

---

## Task 4: Store + ThreatService + governance hooks

**Files:** Create `backend/app/services/threats_service.py`; Modify `backend/app/services/store.py`, `backend/app/services/governance.py`, `backend/app/services/dependencies.py`; Test `backend/tests/test_threats_flow.py`.

- [ ] **Step 1: Failing test** — `backend/tests/test_threats_flow.py`:
```python
from app.schemas import ReviewRequest
from app.services.governance import GovernanceService
from app.services.seed import demo_events
from app.services.store import InMemoryStore
from app.services.threats_service import ThreatService


def _seeded():
    store = InMemoryStore()
    GovernanceService(store).ingest_events(demo_events(), actor_id="t")
    return store


def test_store_has_threat_collections():
    store = InMemoryStore()
    assert store.threat_reports == {}
    assert store.commands == {}
    assert store.policy.default_mode == "auto"


def test_auto_escalation_generates_reports_for_critical():
    store = _seeded()
    # public_bucket (95) and unencrypted_database (75) are >= 75 threshold.
    scores = sorted(r.criticality_score for r in store.threat_reports.values())
    assert len(store.threat_reports) == 2
    assert scores == [75, 95]


def test_monitor_mode_suppresses_auto_reports():
    store = InMemoryStore()
    store.policy = store.policy.model_copy(update={"default_mode": "monitor"})
    GovernanceService(store).ingest_events(demo_events(), actor_id="t")
    assert store.threat_reports == {}


def test_threat_service_generate_on_demand():
    store = _seeded()
    svc = ThreatService(store)
    finding_id = next(iter(store.findings))
    report = svc.generate(finding_id)
    assert report is not None
    assert report.finding_id == finding_id


def test_full_approval_queues_remediation_command():
    store = _seeded()
    gov = GovernanceService(store)
    # pick the public_bucket finding (reviewers: security, devops)
    fid = next(f.finding_id for f in store.findings.values() if f.issue_type == "public_bucket")
    gov.review_finding(fid, ReviewRequest(decision="approved", reviewer_id="u1", reviewer_role="security", reason="ok"))
    assert not store.commands  # not all reviewers yet
    gov.review_finding(fid, ReviewRequest(decision="approved", reviewer_id="u2", reviewer_role="devops", reason="ok"))
    cmds = [c for c in store.commands.values() if c.finding_id == fid]
    assert len(cmds) == 1
    assert cmds[0].action_key == "restrict_public_access"
    assert cmds[0].status == "queued"
```

- [ ] **Step 2: Run → fails.**

- [ ] **Step 3: Add store collections** — in `backend/app/services/store.py`, extend the schema import to include the new names (merge into the existing `from app.schemas import Agent, Rule` line → `from app.schemas import Agent, RemediationCommand, ResponsePolicy, Rule, ThreatReport`). In `__init__`, after `self.agents = {...}` add:
```python
        self.threat_reports: dict[str, ThreatReport] = {}
        self.commands: dict[str, RemediationCommand] = {}
        self.policy: ResponsePolicy = ResponsePolicy()
```

- [ ] **Step 4: Implement ThreatService** — `backend/app/services/threats_service.py`:
```python
from app.schemas import (
    CommandListResponse,
    ResponsePolicy,
    ResponsePolicyUpdate,
    ThreatListResponse,
    ThreatReport,
)
from app.services.store import InMemoryStore
from app.threats.report import build_threat_report


class ThreatService:
    def __init__(self, store: InMemoryStore) -> None:
        self.store = store

    def _event_for(self, finding):
        return self.store.events.get(finding.source_event_id)

    def generate(self, finding_id: str) -> ThreatReport | None:
        finding = self.store.findings.get(finding_id)
        if finding is None:
            return None
        rec = self.store.recommendations.get(finding_id)
        report = build_threat_report(
            finding, rec, self._event_for(finding), self.store.audit_logs, finding.status
        )
        self.store.threat_reports[finding_id] = report
        return report

    def get(self, finding_id: str) -> ThreatReport | None:
        return self.store.threat_reports.get(finding_id) or self.generate(finding_id)

    def list_reports(self) -> ThreatListResponse:
        items = sorted(
            self.store.threat_reports.values(),
            key=lambda r: r.criticality_score,
            reverse=True,
        )
        return ThreatListResponse(items=items, total=len(items))

    def get_policy(self) -> ResponsePolicy:
        return self.store.policy

    def update_policy(self, payload: ResponsePolicyUpdate) -> ResponsePolicy:
        updates = payload.model_dump(exclude_unset=True)
        self.store.policy = self.store.policy.model_copy(update=updates)
        return self.store.policy

    def list_commands(self) -> CommandListResponse:
        items = sorted(
            self.store.commands.values(), key=lambda c: c.created_at, reverse=True
        )
        return CommandListResponse(items=items, total=len(items))
```

- [ ] **Step 5: Governance — auto-escalate at ingest.** In `backend/app/services/governance.py`, add imports at the top:
```python
from app.schemas import RemediationCommand
from app.threats.criticality import compute_criticality
from app.threats.report import build_threat_report
```
Inside `ingest_events`, find the `recommendation_generated` audit call (the second `self._audit(...)` inside the `for rule_match` loop). **Immediately after that audit call (still inside the `for rule_match` loop)**, add:
```python
                score, _factors = compute_criticality(finding, event)
                if self.store.policy.default_mode == "auto" and score >= self.store.policy.auto_threshold:
                    report = build_threat_report(
                        finding, recommendation, event, self.store.audit_logs, finding.status
                    )
                    self.store.threat_reports[finding.finding_id] = report
                    self._audit(
                        entity_type="threat_report",
                        entity_id=report.report_id,
                        action="threat_report_auto_generated",
                        actor_id="response-policy",
                        after_state={"criticality_score": score},
                        metadata={"finding_id": finding.finding_id},
                    )
```

- [ ] **Step 6: Governance — queue command on full approval.** In `review_finding`, find:
```python
        if review.decision == "approved":
            remaining = self._remaining_reviewers(finding_id, finding.required_reviewers)
            finding.status = "approved" if not remaining else "pending_review"
```
Replace with:
```python
        if review.decision == "approved":
            remaining = self._remaining_reviewers(finding_id, finding.required_reviewers)
            finding.status = "approved" if not remaining else "pending_review"
            if finding.status == "approved" and not any(
                cmd.finding_id == finding_id for cmd in self.store.commands.values()
            ):
                self._queue_remediation(finding, review.reviewer_id)
```
Then add this method to `GovernanceService` (e.g. right before `_remaining_reviewers`):
```python
    def _queue_remediation(self, finding: Finding, actor_id: str) -> None:
        rule = self.store.rules.get(finding.rule_id)
        action_key = rule.remediation_action_key if rule else "tag_resource"
        destructive = rule.remediation_destructive if rule else False
        approved_roles = [
            approval.reviewer_role
            for approval in self.store.approvals.values()
            if approval.finding_id == finding.finding_id and approval.decision == "approved"
        ]
        command = RemediationCommand(
            command_id=f"cmd-{uuid4().hex[:10]}",
            finding_id=finding.finding_id,
            action_key=action_key,
            destructive=destructive,
            approved_by=approved_roles,
            created_at=_now(),
        )
        self.store.commands[command.command_id] = command
        self._audit(
            entity_type="command",
            entity_id=command.command_id,
            action="remediation_command_queued",
            actor_id=actor_id,
            after_state=command.model_dump(mode="json"),
            metadata={"finding_id": finding.finding_id},
        )
```

- [ ] **Step 7: Dependency provider** — in `backend/app/services/dependencies.py`, add `from app.services.threats_service import ThreatService`, then `_threat_service = ThreatService(_store)` after `_store`, and:
```python
def get_threat_service() -> ThreatService:
    return _threat_service
```

- [ ] **Step 8: Run → passes** (`.venv/bin/pytest tests/test_threats_flow.py -v`). **Step 9: full suite** `.venv/bin/pytest -q -p no:warnings`. **Step 10: Commit** `feat(threats): store collections, ThreatService, auto-escalation + command queueing`.

---

## Task 5: Threats / Policy / Commands REST API

**Files:** Create `backend/app/api/threats_routes.py`; Modify `backend/app/main.py`; Test `backend/tests/test_threats_api.py`.

- [ ] **Step 1: Failing test** — `backend/tests/test_threats_api.py`:
```python
from fastapi.testclient import TestClient

from app.main import create_app


def _client() -> TestClient:
    c = TestClient(create_app())
    c.__enter__()  # fire startup seeding
    return c


def test_list_threats_populated_by_auto_policy():
    res = _client().get("/api/threats")
    assert res.status_code == 200
    assert res.json()["total"] == 2  # 2 critical seed findings auto-escalate


def test_get_policy_and_update():
    client = _client()
    assert client.get("/api/policy").json()["default_mode"] == "auto"
    patched = client.put("/api/policy", json={"auto_threshold": 90})
    assert patched.status_code == 200
    assert patched.json()["auto_threshold"] == 90


def test_generate_report_for_finding():
    client = _client()
    fid = client.get("/api/findings").json()["items"][0]["finding_id"]
    res = client.post(f"/api/findings/{fid}/threat-report")
    assert res.status_code == 200
    assert res.json()["finding_id"] == fid
    assert "criticality_score" in res.json()


def test_get_report_404_for_unknown():
    assert _client().get("/api/findings/nope/threat-report").status_code == 404


def test_list_commands_empty_initially():
    res = _client().get("/api/commands")
    assert res.status_code == 200
    assert res.json()["total"] == 0
```

- [ ] **Step 2: Run → fails. Step 3: Implement** — `backend/app/api/threats_routes.py`:
```python
from fastapi import APIRouter, Depends, HTTPException

from app.schemas import (
    CommandListResponse,
    ResponsePolicy,
    ResponsePolicyUpdate,
    ThreatListResponse,
    ThreatReport,
)
from app.services.dependencies import get_threat_service
from app.services.threats_service import ThreatService

router = APIRouter(tags=["threats"])


@router.get("/api/threats", response_model=ThreatListResponse)
def list_threats(service: ThreatService = Depends(get_threat_service)) -> ThreatListResponse:
    return service.list_reports()


@router.get("/api/policy", response_model=ResponsePolicy)
def get_policy(service: ThreatService = Depends(get_threat_service)) -> ResponsePolicy:
    return service.get_policy()


@router.put("/api/policy", response_model=ResponsePolicy)
def update_policy(
    payload: ResponsePolicyUpdate,
    service: ThreatService = Depends(get_threat_service),
) -> ResponsePolicy:
    return service.update_policy(payload)


@router.get("/api/commands", response_model=CommandListResponse)
def list_commands(service: ThreatService = Depends(get_threat_service)) -> CommandListResponse:
    return service.list_commands()


@router.get("/api/findings/{finding_id}/threat-report", response_model=ThreatReport)
def get_threat_report(
    finding_id: str, service: ThreatService = Depends(get_threat_service)
) -> ThreatReport:
    report = service.get(finding_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return report


@router.post("/api/findings/{finding_id}/threat-report", response_model=ThreatReport)
def generate_threat_report(
    finding_id: str, service: ThreatService = Depends(get_threat_service)
) -> ThreatReport:
    report = service.generate(finding_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return report
```

- [ ] **Step 4: Mount** — in `backend/app/main.py`, add `from app.api.threats_routes import router as threats_router` near the other route imports, and `app.include_router(threats_router)` after the agents router include.

- [ ] **Step 5: Run → passes. Step 6: full suite. Step 7: Commit** `feat(threats): expose /api/threats + /api/policy + /api/commands + per-finding report`.

---

## Task 6: Frontend types + API client + mock fallback

**Files:** Modify `app/lib/types.ts`, `app/lib/api.ts`, `app/lib/mockData.ts`.

- [ ] **Step 1: Types** — append to `app/lib/types.ts`:
```typescript
// ---- Threats + Policy (SafeCloud Phase 3) ----
export type ResponseMode = "monitor" | "manual" | "auto";

export interface TimelineEntry {
  actor: string;
  action: string;
  target_resource_id: string;
  timestamp: string;
  note: string;
}

export interface ThreatReport {
  report_id: string;
  finding_id: string;
  criticality_score: number;
  criticality_factors: Record<string, number>;
  summary: string;
  timeline: TimelineEntry[];
  recommended_solution: string;
  agent_sections: Record<string, string>;
  approval_status: string;
  ai_generated: boolean;
  generated_at: string;
}

export interface ThreatListResponse {
  items: ThreatReport[];
  total: number;
}

export interface ResponsePolicy {
  default_mode: ResponseMode;
  auto_threshold: number;
  notify: string[];
}

export interface RemediationCommand {
  command_id: string;
  finding_id: string;
  action_key: string;
  destructive: boolean;
  status: string;
  approved_by: string[];
  result: string;
  created_at: string;
  executed_at: string | null;
}
```

- [ ] **Step 2: Mock data** — in `app/lib/mockData.ts`, merge `ResponsePolicy`, `ThreatReport` into the existing top `import type { ... } from "./types"` block, then append:
```typescript
export const MOCK_THREATS: ThreatReport[] = [
  {
    report_id: "threat-mock-1", finding_id: "FND-1042", criticality_score: 95,
    criticality_factors: { severity: 40, internet_exposure: 25, data_sensitivity: 15, production: 15 },
    summary: "Public Bucket detected on bucket-project-drawings (critical). Criticality 95/100 — driven by severity (+40), internet exposure (+25), data sensitivity (+15), production (+15).",
    timeline: [
      { actor: "Document Platform", action: "resource_entered_risky_state", target_resource_id: "bucket-project-drawings", timestamp: "2026-06-20T09:00:00Z", note: "Public Bucket condition present." },
      { actor: "system-seed", action: "finding_created", target_resource_id: "bucket-project-drawings", timestamp: "2026-06-20T09:05:00Z", note: "" },
    ],
    recommended_solution: "Restrict public access after Security and DevOps validate intended exposure.",
    agent_sections: { security: "Public bucket access is a direct exposure risk." },
    approval_status: "pending_review", ai_generated: false, generated_at: "2026-06-20T09:05:00Z",
  },
  {
    report_id: "threat-mock-2", finding_id: "FND-1045", criticality_score: 75,
    criticality_factors: { severity: 40, data_sensitivity: 15, production: 15, blast_radius: 5 },
    summary: "Unencrypted Database detected on db-project-claims-prod (critical). Criticality 75/100.",
    timeline: [
      { actor: "Claims Platform", action: "resource_entered_risky_state", target_resource_id: "db-project-claims-prod", timestamp: "2026-06-20T08:00:00Z", note: "Unencrypted Database condition present." },
    ],
    recommended_solution: "Plan encryption or migration during an approved maintenance window.",
    agent_sections: { security: "Unencrypted databases create data-protection and compliance risk." },
    approval_status: "pending_review", ai_generated: false, generated_at: "2026-06-20T08:05:00Z",
  },
];

export const MOCK_POLICY: ResponsePolicy = { default_mode: "auto", auto_threshold: 75, notify: [] };
```
> The mock finding IDs (`FND-1042`, `FND-1045`) should match IDs already in `MOCK_FINDINGS`; if those exact IDs differ, use any two real mock finding IDs.

- [ ] **Step 3: API client** — in `app/lib/api.ts`, extend the type + mockData import blocks (add `ThreatListResponse, ThreatReport, ResponsePolicy` and `MOCK_THREATS, MOCK_POLICY`), then append:
```typescript
// ---- Threats + Policy (SafeCloud Phase 3) ----

export async function getThreats(): Promise<ApiResult<ThreatListResponse>> {
  try {
    return ok(await tryFetch<ThreatListResponse>("/api/threats"));
  } catch (e) {
    return fallback({ items: MOCK_THREATS, total: MOCK_THREATS.length }, e);
  }
}

export async function getThreatReport(findingId: string): Promise<ApiResult<ThreatReport | null>> {
  try {
    return ok(await tryFetch<ThreatReport>(`/api/findings/${findingId}/threat-report`));
  } catch (e) {
    return fallback(MOCK_THREATS.find((t) => t.finding_id === findingId) ?? null, e);
  }
}

export async function generateThreatReport(findingId: string): Promise<ApiResult<ThreatReport | null>> {
  try {
    return ok(await tryFetch<ThreatReport>(`/api/findings/${findingId}/threat-report`, { method: "POST" }));
  } catch (e) {
    return fallback(MOCK_THREATS.find((t) => t.finding_id === findingId) ?? null, e);
  }
}

export async function getPolicy(): Promise<ApiResult<ResponsePolicy>> {
  try {
    return ok(await tryFetch<ResponsePolicy>("/api/policy"));
  } catch (e) {
    return fallback(MOCK_POLICY, e);
  }
}

export async function updatePolicy(body: Partial<ResponsePolicy>): Promise<ApiResult<ResponsePolicy>> {
  try {
    return ok(await tryFetch<ResponsePolicy>("/api/policy", { method: "PUT", body: JSON.stringify(body) }));
  } catch (e) {
    return fallback({ ...MOCK_POLICY, ...body }, e);
  }
}
```

- [ ] **Step 4: Typecheck** `node ./node_modules/next/dist/bin/next build`. **Step 5: Commit** `feat(threats): frontend types, API client, mock fallback`.

---

## Task 7: Threats nav + icon

**Files:** Modify `app/components/icons.tsx`, `app/components/AppShell.tsx`.

- [ ] **Step 1: Icon** — in `app/components/icons.tsx`, following the `(p: P) => (<svg {...base(p)}>…)` pattern (no `IconProps`):
```tsx
export const IconThreats = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" />
    <path d="M12 8v5" />
    <path d="M12 16h.01" />
  </svg>
);
```

- [ ] **Step 2: Nav** — in `app/components/AppShell.tsx`, add `IconThreats` to the `./icons` import and add to `NAV` after the Agents entry:
```typescript
  { href: "/threats", label: "Threats", icon: IconThreats },
```

- [ ] **Step 3: Typecheck. Step 4: Commit** `feat(threats): add Threats nav entry + icon`.

---

## Task 8: Threats page + Policy panel

**Files:** Create `app/(dashboard)/threats/page.tsx`, `app/(dashboard)/threats/ThreatsView.tsx`.

- [ ] **Step 1: Server page** — `app/(dashboard)/threats/page.tsx`:
```tsx
import { getThreats, getPolicy } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner } from "@/app/components/ui";
import ThreatsView from "./ThreatsView";

export const dynamic = "force-dynamic";

export default async function ThreatsPage() {
  const [threatsRes, policyRes] = await Promise.all([getThreats(), getPolicy()]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Threats"
        subtitle="Auto-generated threat reports for high-criticality findings, and the response policy that controls them."
      />
      {threatsRes.mock && <MockBanner reason={threatsRes.error} />}
      <ThreatsView initialThreats={threatsRes.data.items} initialPolicy={policyRes.data} />
    </div>
  );
}
```

- [ ] **Step 2: Client view** — `app/(dashboard)/threats/ThreatsView.tsx`:
```tsx
"use client";

import { useState } from "react";
import type { ResponseMode, ResponsePolicy, ThreatReport } from "@/app/lib/types";
import { updatePolicy } from "@/app/lib/api";
import { Card, SectionTitle } from "@/app/components/ui";
import { relativeTime } from "@/app/lib/format";
import { useToast } from "@/app/lib/toast";

const MODES: ResponseMode[] = ["monitor", "manual", "auto"];

function critColor(score: number): string {
  if (score >= 80) return "#FF0000";
  if (score >= 60) return "#FB8C00";
  if (score >= 35) return "#065FD4";
  return "#606060";
}

export default function ThreatsView({
  initialThreats,
  initialPolicy,
}: {
  initialThreats: ThreatReport[];
  initialPolicy: ResponsePolicy;
}) {
  const { toast } = useToast();
  const [policy, setPolicy] = useState<ResponsePolicy>(initialPolicy);
  const [selected, setSelected] = useState<ThreatReport | null>(initialThreats[0] ?? null);

  async function savePolicy(patch: Partial<ResponsePolicy>) {
    const next = { ...policy, ...patch };
    setPolicy(next);
    const res = await updatePolicy(patch);
    toast(res.mock ? "Policy updated (offline)" : "Response policy updated", res.mock ? "info" : "success");
  }

  return (
    <div className="space-y-5">
      {/* Policy panel */}
      <Card>
        <SectionTitle>Response policy</SectionTitle>
        <div className="mt-3 flex flex-wrap items-end gap-6">
          <div>
            <label className="block text-[12px] font-medium text-[#606060]">Default mode</label>
            <div className="mt-1 flex gap-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => savePolicy({ default_mode: m })}
                  className={`rounded-full px-3 py-1 text-[13px] font-medium capitalize ${policy.default_mode === m ? "bg-[#0F0F0F] text-white" : "bg-[#F2F2F2] text-[#0F0F0F]"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="block text-[12px] font-medium text-[#606060]">
              Auto threshold — criticality ≥ <span className="font-bold text-[#0F0F0F]">{policy.auto_threshold}</span>
            </label>
            <input
              type="range" min={0} max={100} value={policy.auto_threshold}
              onChange={(e) => setPolicy({ ...policy, auto_threshold: Number(e.target.value) })}
              onMouseUp={(e) => savePolicy({ auto_threshold: Number((e.target as HTMLInputElement).value) })}
              className="mt-2 w-full"
            />
          </div>
        </div>
        <p className="mt-3 text-[12px] text-[#606060]">
          In <strong>auto</strong> mode, findings at or above the threshold auto-generate a threat report and flag a human.
          Destructive remediation always requires human approval, regardless of mode.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* List */}
        <Card>
          <SectionTitle>Active threats ({initialThreats.length})</SectionTitle>
          <div className="mt-2 space-y-1">
            {initialThreats.length === 0 && (
              <p className="text-[13px] text-[#606060]">No threat reports yet. Set policy to auto and run a scan, or open a finding to generate one.</p>
            )}
            {initialThreats.map((t) => (
              <button
                key={t.report_id}
                onClick={() => setSelected(t)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${selected?.report_id === t.report_id ? "bg-[#F2F2F2]" : "hover:bg-[#F8F8F8]"}`}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white"
                  style={{ background: critColor(t.criticality_score) }}
                >
                  {t.criticality_score}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[#0F0F0F]">{t.finding_id}</span>
                  <span className="block truncate text-[12px] text-[#606060]">{t.recommended_solution}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>

        {/* Detail */}
        {selected ? (
          <Card>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-lg text-[16px] font-bold text-white" style={{ background: critColor(selected.criticality_score) }}>
                {selected.criticality_score}
              </span>
              <div>
                <SectionTitle>Threat report — {selected.finding_id}</SectionTitle>
                <p className="text-[12px] text-[#606060]">
                  Criticality {selected.criticality_score}/100 · {selected.approval_status.replace(/_/g, " ")} · generated {relativeTime(selected.generated_at)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <section>
                <h4 className="text-[12px] font-medium tracking-label text-[#606060]">WHY THIS TRIGGERED</h4>
                <p className="mt-1 text-[13px] leading-relaxed text-[#0F0F0F]">{selected.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(selected.criticality_factors).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-[#F2F2F2] px-2 py-0.5 text-[11px] text-[#0F0F0F]">
                      {k.replace(/_/g, " ")} +{v}
                    </span>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="text-[12px] font-medium tracking-label text-[#606060]">TIMELINE</h4>
                <ol className="mt-2 space-y-2 border-l border-[#E5E5E5] pl-4">
                  {selected.timeline.map((e, i) => (
                    <li key={i} className="relative text-[13px]">
                      <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-[#065FD4]" />
                      <span className="font-medium text-[#0F0F0F]">{e.action.replace(/_/g, " ")}</span>
                      <span className="text-[#606060]"> · {e.actor} · {relativeTime(e.timestamp)}</span>
                      {e.note && <span className="block text-[12px] text-[#606060]">{e.note}</span>}
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h4 className="text-[12px] font-medium tracking-label text-[#606060]">RECOMMENDED SOLUTION</h4>
                <p className="mt-1 text-[13px] text-[#0F0F0F]">{selected.recommended_solution}</p>
              </section>

              {Object.keys(selected.agent_sections).length > 0 && (
                <section>
                  <h4 className="text-[12px] font-medium tracking-label text-[#606060]">AGENT ANALYSIS</h4>
                  <div className="mt-2 space-y-2">
                    {Object.entries(selected.agent_sections).map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-[#F8F8F8] p-3 text-[13px]">
                        <span className="mr-2 rounded px-2 py-0.5 text-[11px] font-medium capitalize" style={{ background: "#065FD414", color: "#065FD4" }}>{k}</span>
                        {v}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </Card>
        ) : (
          <Card><p className="text-[13px] text-[#606060]">Select a threat to see its report.</p></Card>
        )}
      </div>
    </div>
  );
}
```
> `SectionTitle` is an existing export of `ui.tsx`; `relativeTime` of `format.ts`. Verify both before use (they are confirmed exports).

- [ ] **Step 3: Build** `node ./node_modules/next/dist/bin/next build` — expect clean compile + `/threats` route. **Step 4: Commit** `feat(threats): Threats page with report view + policy panel`.

---

## Task 9: End-to-end manual verification

- [ ] Start backend + frontend; open `/threats` → 2 auto-generated reports (criticality 95 + 75); click each → summary + factor chips + timeline + recommended solution + agent sections. Change policy mode/threshold → persists. Open a finding on `/security`, approve as all required reviewers (switch role in profile menu) → a `RemediationCommand` is queued (visible via `GET /api/commands`). Stop backend → `/threats` shows mock reports + banner. `/`, `/security`, `/rules`, `/agents` still load.

---

## Self-Review (plan author)

- **Spec coverage:** criticality (Task 2, §5) ✓ · threat report = why + timeline + solution + agent sections + criticality (Task 3, §7) ✓ · response policy monitor/manual/auto + threshold (Tasks 1/4/5, §8) ✓ · auto-escalation at ingest (Task 4) ✓ · RemediationCommand queued only on full approval, destructive flag carried, execution deferred to Phase 4 agent (Task 4, §8) ✓ · Threats page + Policy panel + deep data (Tasks 6–8, §10) ✓.
- **Safety:** criticality + all numbers are deterministic/rule-owned; the threat summary is deterministic (LLM `summary_override` optional, marks `ai_generated`); destructive commands are still gated behind full human approval (queued only at `status==approved`); nothing auto-executes (execution is Phase 4). No safety-invariant change.
- **No-regression:** Tasks 4/5 re-run the full suite; criticality/report are additive; governance hooks only add (don't alter existing approval/savings logic). The auto-escalation only fires in `auto` mode.
- **Type consistency:** `compute_criticality`/`build_threat_report`/`build_timeline` signatures consistent across criticality.py, report.py, ThreatService, governance, and tests. `ResponsePolicy.default_mode` default `"auto"` is consistent between schema, store seed, mock, and the policy tests. Store keys: threat_reports by finding_id, commands by command_id.

---

## Roadmap — Phase 4

Real `safecloud-agent.py` + `watch/` folder + `/api/agent/*` (config/events/commands/result/status) + `X-Agent-Token`. The agent polls `GET /api/commands` (the queued RemediationCommands this phase creates), executes the approved action by mutating `infra-snapshot.json` + appending `activity.log`, and POSTs the result → finding `action_completed`. The activity log then enriches the threat-report timeline built in Task 3.
