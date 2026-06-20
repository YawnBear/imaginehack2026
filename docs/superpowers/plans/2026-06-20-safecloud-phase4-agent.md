# SafeCloud Phase 4 — Real Client Agent + Closed-Loop Remediation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox (`- [ ]`) steps.

**Goal:** Ship the standalone **`safecloud-agent.py`** that runs on the client box: it pulls active config (rules/agents/policy), scans a watched `infra-snapshot.json`, posts events to the control plane, polls for **approved** remediation commands, executes them by **mutating the snapshot** (+ appending `activity.log`), and reports results — flipping the finding to `action_completed`. The next scan no longer detects the issue: detect → report → approve → agent acts → resolved, visibly. Plus an "Agent online" status chip in the dashboard.

**Architecture:** New `/api/agent/*` endpoints (token-auth via `X-Agent-Token`) that reuse the existing ingest + command queue. Pure, unit-tested agent logic (`apply_remediation`, `snapshot_to_events`) lives in `backend/app/agent/runtime.py`; the runnable `safecloud-agent.py` (stdlib only) imports it. `RemediationCommand` gains a `resource_id` so the agent knows what to mutate. Safety unchanged: the agent only executes commands that are already in the queue, which only get queued after **all required reviewers approve** (Phase 3).

**Tech Stack:** Python 3.13 / FastAPI / Pydantic v2 (+ pytest) · stdlib-only agent script · Next.js 16 / React 19 / TS. macOS; backend venv at `backend/.venv`.

**Builds on Phases 1–3** (branch `safecloud-phase1-rules`; backend 84 tests green). **Spec:** §3 architecture, §8 remediation loop, §13 Phase 4.

---

## File Structure

**Backend — create:** `app/agent/__init__.py`, `app/agent/runtime.py`, `app/api/agent_routes.py`, + tests.
**Backend — modify:** `app/schemas/threats.py` (+`resource_id` on RemediationCommand) & maybe new agent-IO schemas in `app/schemas/agent_io.py`, `app/schemas/__init__.py`, `app/core/config.py` (agent_token), `app/services/store.py` (activities + agent_last_seen), `app/services/governance.py` (set `resource_id` when queueing; add `complete_command`), `app/services/dependencies.py`, `app/main.py`.
**Repo root — create:** `safecloud-agent.py`, `watch/infra-snapshot.json`, `watch/activity.log`, `watch/generator.py`, `watch/README.md`.
**Frontend — create:** `app/components/AgentStatusChip.tsx`. **Modify:** `app/lib/types.ts`, `app/lib/api.ts`, `app/components/AppShell.tsx`.

---

## Task 1: Schemas + config + store + command resource_id

**Files:** Create `backend/app/schemas/agent_io.py`; Modify `backend/app/schemas/threats.py`, `backend/app/schemas/__init__.py`, `backend/app/core/config.py`, `backend/app/services/store.py`; Test `backend/tests/test_agent_io_schemas.py`.

- [ ] **Step 1: Failing test** — `backend/tests/test_agent_io_schemas.py`:
```python
from app.schemas import AgentConfigResponse, AgentEventsRequest, AgentStatusResponse, Activity, RemediationCommand


def test_command_has_resource_id():
    c = RemediationCommand(command_id="c1", finding_id="f1", resource_id="bucket-x",
                           action_key="restrict_public_access", destructive=False,
                           created_at="2026-06-20T00:00:00Z")
    assert c.resource_id == "bucket-x"


def test_activity_and_io_models():
    a = Activity(actor="jane", action="set_public", target_resource_id="b", timestamp="2026-06-20T00:00:00Z")
    assert a.source == "agent"
    req = AgentEventsRequest(events=[], activities=[a])
    assert len(req.activities) == 1
    status = AgentStatusResponse(online=True, last_seen="2026-06-20T00:00:00Z", agent_id="ag-1")
    assert status.online is True
```

- [ ] **Step 2: Run → fails. Step 3a:** add `resource_id: str = ""` to `RemediationCommand` in `backend/app/schemas/threats.py` (place it right after `finding_id`).

- [ ] **Step 3b: Create** `backend/app/schemas/agent_io.py`:
```python
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.events import CloudEvent


class Activity(BaseModel):
    actor: str
    action: str
    target_resource_id: str
    timestamp: datetime
    source: str = "agent"


class AgentEnrollResponse(BaseModel):
    agent_id: str
    token: str


class AgentConfigResponse(BaseModel):
    rules: list[dict[str, Any]] = Field(default_factory=list)
    agents: list[dict[str, Any]] = Field(default_factory=list)
    policy: dict[str, Any] = Field(default_factory=dict)


class AgentEventsRequest(BaseModel):
    events: list[CloudEvent] = Field(default_factory=list)
    activities: list[Activity] = Field(default_factory=list)


class AgentEventsResponse(BaseModel):
    accepted: int
    created_findings: int
    duplicate_events: int
    activities_recorded: int


class CommandResultRequest(BaseModel):
    status: str  # "completed" | "failed"
    result: str = ""


class AgentStatusResponse(BaseModel):
    online: bool
    last_seen: datetime | None = None
    agent_id: str | None = None
```

- [ ] **Step 3c: Export** — in `backend/app/schemas/__init__.py`, add an import block for the agent_io names (Activity, AgentEnrollResponse, AgentConfigResponse, AgentEventsRequest, AgentEventsResponse, CommandResultRequest, AgentStatusResponse) and add them to `__all__`.

- [ ] **Step 3d: Config** — in `backend/app/core/config.py`, add to `Settings`: `agent_token: str = "safecloud-demo-agent-token"`.

- [ ] **Step 3e: Store** — in `backend/app/services/store.py`, extend the schema import with `Activity`; in `__init__` (after the policy line) add:
```python
        self.activities: list[Activity] = []
        self.agent_last_seen: datetime | None = None
        self.agent_id: str | None = None
```
(`datetime` is already imported in store.py.)

- [ ] **Step 4: Run → passes. Step 5: Commit** `feat(agent): agent IO schemas + command resource_id + config token`.

---

## Task 2: Agent runtime (pure, tested)

**Files:** Create `backend/app/agent/__init__.py` (empty), `backend/app/agent/runtime.py`; Test `backend/tests/test_agent_runtime.py`.

- [ ] **Step 1: Failing test** — `backend/tests/test_agent_runtime.py`:
```python
from app.agent.runtime import apply_remediation, snapshot_to_events

SNAP = {
    "resources": [
        {"resource_id": "bucket-x", "resource_type": "bucket", "config": {"public_access": True}},
        {"resource_id": "vm-y", "resource_type": "vm", "config": {}, "metrics": {"avg_cpu_percent_7d": 2}},
        {"resource_id": "vol-z", "resource_type": "storage", "config": {"attached": False}},
        {"resource_id": "db-w", "resource_type": "database", "config": {"encrypted": False}},
    ]
}


def test_restrict_public_access():
    out = apply_remediation(SNAP, "restrict_public_access", "bucket-x")
    assert out["resources"][0]["config"]["public_access"] is False
    # original untouched (pure)
    assert SNAP["resources"][0]["config"]["public_access"] is True


def test_stop_vm():
    out = apply_remediation(SNAP, "stop_vm", "vm-y")
    vm = next(r for r in out["resources"] if r["resource_id"] == "vm-y")
    assert vm["config"]["status"] == "stopped"


def test_delete_storage_removes_resource():
    out = apply_remediation(SNAP, "delete_storage", "vol-z")
    assert all(r["resource_id"] != "vol-z" for r in out["resources"])


def test_plan_encryption():
    out = apply_remediation(SNAP, "plan_encryption", "db-w")
    db = next(r for r in out["resources"] if r["resource_id"] == "db-w")
    assert db["config"]["encrypted"] is True


def test_unknown_action_is_noop_tag():
    out = apply_remediation(SNAP, "tag_resource", "bucket-x")
    b = next(r for r in out["resources"] if r["resource_id"] == "bucket-x")
    assert "safecloud_remediated" in b.get("tags", [])


def test_snapshot_to_events_stamps_timestamp():
    events = snapshot_to_events(SNAP, "2026-06-20T10:00:00Z")
    assert len(events) == 4
    assert all(e["timestamp"] == "2026-06-20T10:00:00Z" for e in events)
    assert all("event_id" in e and "account_id" in e for e in events)
```

- [ ] **Step 2: Run → fails. Step 3: Implement** — `backend/app/agent/runtime.py`:
```python
"""Pure agent logic, shared by the FastAPI tests and the standalone
safecloud-agent.py script. No FastAPI / no network here."""

from copy import deepcopy
from typing import Any


def apply_remediation(snapshot: dict, action_key: str, resource_id: str) -> dict:
    """Return a NEW snapshot with the remediation applied to one resource.

    Reversible-by-design for the demo: mutates the watched infra-snapshot so the
    next scan no longer detects the issue. The original snapshot is not mutated.
    """
    snap = deepcopy(snapshot)
    resources = snap.get("resources", [])
    new_resources: list[dict] = []
    for resource in resources:
        if resource.get("resource_id") != resource_id:
            new_resources.append(resource)
            continue
        if action_key == "delete_storage":
            continue  # drop the resource entirely
        config = dict(resource.get("config", {}))
        if action_key == "restrict_public_access":
            config["public_access"] = False
        elif action_key == "stop_vm":
            config["status"] = "stopped"
            resource["metrics"] = {**resource.get("metrics", {}), "avg_cpu_percent_7d": 0}
        elif action_key == "plan_encryption":
            config["encrypted"] = True
        else:  # tag_resource / snapshot_then_flag / unknown -> tag only
            resource["tags"] = [*resource.get("tags", []), "safecloud_remediated"]
        resource["config"] = config
        new_resources.append(resource)
    snap["resources"] = new_resources
    return snap


def snapshot_to_events(snapshot: dict, timestamp: str) -> list[dict[str, Any]]:
    """Turn an infra-snapshot into CloudEvent dicts the ingest endpoint accepts."""
    events: list[dict[str, Any]] = []
    for index, resource in enumerate(snapshot.get("resources", [])):
        event = dict(resource)
        event["timestamp"] = timestamp
        event.setdefault("event_id", f"agent-{resource.get('resource_id', index)}")
        event.setdefault("provider", "agent")
        event.setdefault("account_id", "client-account")
        events.append(event)
    return events
```

- [ ] **Step 4: Run → passes. Step 5: Commit** `feat(agent): pure remediation + snapshot->events runtime`.

---

## Task 3: /api/agent/* endpoints + governance.complete_command

**Files:** Create `backend/app/api/agent_routes.py`; Modify `backend/app/services/governance.py`, `backend/app/services/dependencies.py`, `backend/app/main.py`; Test `backend/tests/test_agent_api.py`.

- [ ] **Step 1: Failing test** — `backend/tests/test_agent_api.py`:
```python
from fastapi.testclient import TestClient

from app.main import create_app

TOKEN = "safecloud-demo-agent-token"
H = {"X-Agent-Token": TOKEN}


def _client() -> TestClient:
    c = TestClient(create_app())
    c.__enter__()
    return c


def test_auth_required():
    assert _client().get("/api/agent/config").status_code == 401


def test_config_returns_rules_agents_policy():
    body = _client().get("/api/agent/config", headers=H).json()
    assert len(body["rules"]) >= 4
    assert len(body["agents"]) >= 5
    assert body["policy"]["default_mode"] == "auto"


def test_status_reflects_heartbeat():
    client = _client()
    client.get("/api/agent/config", headers=H)  # heartbeat
    status = client.get("/api/agent/status").json()
    assert status["online"] is True


def test_events_ingest_and_activities():
    client = _client()
    res = client.post("/api/agent/events", headers=H, json={
        "events": [{"event_id": "agent-b1", "account_id": "c", "resource_id": "b1",
                    "resource_type": "bucket", "environment": "production",
                    "timestamp": "2026-06-20T10:00:00Z", "config": {"public_access": True}}],
        "activities": [{"actor": "jane", "action": "set_public", "target_resource_id": "b1",
                        "timestamp": "2026-06-20T09:00:00Z"}],
    })
    assert res.status_code == 200
    assert res.json()["created_findings"] >= 1
    assert res.json()["activities_recorded"] == 1


def test_commands_and_result_completes_finding():
    client = _client()
    # approve the public_bucket finding by both reviewers to queue a command
    fid = next(f["finding_id"] for f in client.get("/api/findings").json()["items"]
               if f["issue_type"] == "public_bucket")
    for role in ("security", "devops"):
        client.patch(f"/api/findings/{fid}/review",
                     json={"decision": "approved", "reviewer_id": f"u-{role}", "reviewer_role": role, "reason": "ok"})
    cmds = client.get("/api/agent/commands", headers=H).json()["items"]
    assert len(cmds) == 1
    cid = cmds[0]["command_id"]
    assert cmds[0]["resource_id"]  # resource_id populated
    done = client.post(f"/api/agent/commands/{cid}/result", headers=H,
                       json={"status": "completed", "result": "snapshot patched"})
    assert done.status_code == 200
    # finding flips to action_completed; command no longer queued
    assert client.get(f"/api/findings/{fid}").json()["finding"]["status"] == "action_completed"
    assert client.get("/api/agent/commands", headers=H).json()["items"] == []
```

- [ ] **Step 2: Run → fails.**

- [ ] **Step 3: governance — set resource_id + add complete_command.** In `backend/app/services/governance.py`, in `_queue_remediation`, add `resource_id=finding.resource_id,` to the `RemediationCommand(...)` constructor. Then add:
```python
    def record_activity(self, activities: list) -> int:
        for activity in activities:
            self.store.activities.append(activity)
        return len(activities)

    def complete_command(self, command_id: str, status: str, result: str) -> bool:
        command = self.store.commands.get(command_id)
        if command is None:
            return False
        before = command.model_dump(mode="json")
        command.status = "completed" if status == "completed" else "failed"
        command.result = result
        command.executed_at = _now()
        self.store.commands[command_id] = command
        finding = self.store.findings.get(command.finding_id)
        if finding is not None and command.status == "completed":
            finding.status = "action_completed"
            finding.updated_at = _now()
            self.store.findings[finding.finding_id] = finding
        self._audit(
            entity_type="command",
            entity_id=command_id,
            action=f"remediation_{command.status}",
            actor_id="safecloud-agent",
            before_state=before,
            after_state=command.model_dump(mode="json"),
            metadata={"finding_id": command.finding_id},
        )
        return True
```

- [ ] **Step 4: Implement the router** — `backend/app/api/agent_routes.py`:
```python
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException

from app.core.config import get_settings
from app.schemas import (
    AgentConfigResponse,
    AgentEnrollResponse,
    AgentEventsRequest,
    AgentEventsResponse,
    AgentStatusResponse,
    CommandListResponse,
    CommandResultRequest,
)
from app.services.dependencies import get_governance_service, get_threat_service
from app.services.governance import GovernanceService
from app.services.threats_service import ThreatService

router = APIRouter(prefix="/api/agent", tags=["agent"])


def require_agent_token(
    x_agent_token: str | None = Header(default=None),
    governance: GovernanceService = Depends(get_governance_service),
) -> GovernanceService:
    if x_agent_token != get_settings().agent_token:
        raise HTTPException(status_code=401, detail="Invalid agent token")
    governance.store.agent_last_seen = datetime.now(UTC)  # heartbeat on any authed call
    return governance


@router.post("/enroll", response_model=AgentEnrollResponse)
def enroll(governance: GovernanceService = Depends(require_agent_token)) -> AgentEnrollResponse:
    if governance.store.agent_id is None:
        governance.store.agent_id = f"agent-{uuid4().hex[:8]}"
    return AgentEnrollResponse(agent_id=governance.store.agent_id, token=get_settings().agent_token)


@router.get("/config", response_model=AgentConfigResponse)
def get_config(
    governance: GovernanceService = Depends(require_agent_token),
    threats: ThreatService = Depends(get_threat_service),
) -> AgentConfigResponse:
    store = governance.store
    return AgentConfigResponse(
        rules=[r.model_dump(mode="json") for r in store.rules.values()],
        agents=[a.model_dump(mode="json") for a in store.agents.values()],
        policy=store.policy.model_dump(mode="json"),
    )


@router.post("/events", response_model=AgentEventsResponse)
def post_events(
    payload: AgentEventsRequest,
    governance: GovernanceService = Depends(require_agent_token),
) -> AgentEventsResponse:
    ingest = governance.ingest_events(payload.events, actor_id="safecloud-agent")
    recorded = governance.record_activity(payload.activities)
    return AgentEventsResponse(
        accepted=ingest.accepted,
        created_findings=ingest.created_findings,
        duplicate_events=ingest.duplicate_events,
        activities_recorded=recorded,
    )


@router.get("/commands", response_model=CommandListResponse)
def get_commands(governance: GovernanceService = Depends(require_agent_token)) -> CommandListResponse:
    queued = [c for c in governance.store.commands.values() if c.status == "queued"]
    queued.sort(key=lambda c: c.created_at)
    return CommandListResponse(items=queued, total=len(queued))


@router.post("/commands/{command_id}/result")
def post_command_result(
    command_id: str,
    payload: CommandResultRequest,
    governance: GovernanceService = Depends(require_agent_token),
) -> dict:
    if not governance.complete_command(command_id, payload.status, payload.result):
        raise HTTPException(status_code=404, detail="Command not found")
    return {"command_id": command_id, "status": payload.status}


@router.get("/status", response_model=AgentStatusResponse)
def agent_status(governance: GovernanceService = Depends(get_governance_service)) -> AgentStatusResponse:
    last = governance.store.agent_last_seen
    online = bool(last and (datetime.now(UTC) - last).total_seconds() < 60)
    return AgentStatusResponse(online=online, last_seen=last, agent_id=governance.store.agent_id)
```
> `/status` uses `get_governance_service` (no token) so the dashboard can poll it.

- [ ] **Step 5: Dependency + mount** — `get_threat_service` already exists. In `backend/app/main.py` add `from app.api.agent_routes import router as agent_router` and `app.include_router(agent_router)` after the threats router.

- [ ] **Step 6: Run → passes. Step 7: full suite. Step 8: Commit** `feat(agent): /api/agent/* endpoints + token auth + command completion`.

---

## Task 4: The standalone agent script + watch/ folder

**Files:** Create `safecloud-agent.py`, `watch/infra-snapshot.json`, `watch/activity.log`, `watch/generator.py`, `watch/README.md`.

- [ ] **Step 1: Seed snapshot** — `watch/infra-snapshot.json`:
```json
{
  "resources": [
    {"event_id": "agent-bucket-001", "provider": "agent", "account_id": "client-account", "resource_id": "bucket-project-drawings", "resource_name": "Project Drawings Bucket", "resource_type": "bucket", "environment": "production", "project_id": "proj-urban-tower", "owner_team": "Document Platform", "config": {"public_access": true}, "metrics": {}, "cost": {}},
    {"event_id": "agent-vm-001", "provider": "agent", "account_id": "client-account", "resource_id": "vm-render-worker-07", "resource_name": "Render Worker 07", "resource_type": "vm", "environment": "staging", "owner_team": "Site Reporting", "config": {"application_id": "site-reporting-api"}, "metrics": {"avg_cpu_percent_7d": 3.2, "network_in_mb_7d": 42, "network_out_mb_7d": 39}, "cost": {"monthly_usd": 96}},
    {"event_id": "agent-db-001", "provider": "agent", "account_id": "client-account", "resource_id": "db-project-claims-prod", "resource_name": "Project Claims Database", "resource_type": "database", "environment": "production", "owner_team": "Claims Platform", "config": {"encrypted": false, "engine": "postgres", "application_id": "claims-system"}, "metrics": {}, "cost": {}}
  ]
}
```

- [ ] **Step 2: Activity log seed** — `watch/activity.log`:
```text
2026-06-20T09:00:00Z jane@devops set_public bucket-project-drawings
2026-06-20T08:30:00Z system provisioned db-project-claims-prod
```

- [ ] **Step 3: The agent** — `safecloud-agent.py` (repo root):
```python
#!/usr/bin/env python3
"""SafeCloud client agent. Runs on the client box. Stdlib only.

Loop: pull config -> scan watch/infra-snapshot.json -> POST events -> poll
approved remediation commands -> apply to the snapshot (+ activity.log) ->
report result. Resolves the finding the next scan.

Usage:
  SAFECLOUD_API=http://127.0.0.1:8000 python3 safecloud-agent.py            # one cycle
  python3 safecloud-agent.py --loop 5                                       # every 5s
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "backend"))
from app.agent.runtime import apply_remediation, snapshot_to_events  # noqa: E402

BASE = os.environ.get("SAFECLOUD_API", "http://127.0.0.1:8000").rstrip("/")
TOKEN = os.environ.get("SAFECLOUD_AGENT_TOKEN", "safecloud-demo-agent-token")
WATCH = os.path.join(ROOT, "watch")
SNAP_PATH = os.path.join(WATCH, "infra-snapshot.json")
ACTIVITY_PATH = os.path.join(WATCH, "activity.log")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{BASE}{path}", data=data, method=method,
        headers={"Content-Type": "application/json", "X-Agent-Token": TOKEN},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)


def _read_snapshot():
    with open(SNAP_PATH) as fh:
        return json.load(fh)


def _write_snapshot(snap):
    with open(SNAP_PATH, "w") as fh:
        json.dump(snap, fh, indent=2)


def cycle():
    _req("POST", "/api/agent/enroll")
    config = _req("GET", "/api/agent/config")
    print(f"[agent] config: {len(config['rules'])} rules, {len(config['agents'])} agents, "
          f"policy={config['policy'].get('default_mode')}")

    snap = _read_snapshot()
    events = snapshot_to_events(snap, _now())
    ingest = _req("POST", "/api/agent/events", {"events": events, "activities": []})
    print(f"[agent] scan -> {ingest['created_findings']} new findings "
          f"({ingest['duplicate_events']} dup)")

    commands = _req("GET", "/api/agent/commands")["items"]
    for cmd in commands:
        rid = cmd.get("resource_id") or ""
        print(f"[agent] executing {cmd['action_key']} on {rid} (destructive={cmd['destructive']})")
        snap = apply_remediation(snap, cmd["action_key"], rid)
        _write_snapshot(snap)
        with open(ACTIVITY_PATH, "a") as fh:
            fh.write(f"{_now()} safecloud-agent {cmd['action_key']} {rid} per command {cmd['command_id']}\n")
        _req("POST", f"/api/agent/commands/{cmd['command_id']}/result",
             {"status": "completed", "result": f"snapshot patched: {cmd['action_key']} on {rid}"})
        print(f"[agent] done -> finding resolved on next scan")
    if not commands:
        print("[agent] no approved commands pending")


def main():
    if "--loop" in sys.argv:
        interval = int(sys.argv[sys.argv.index("--loop") + 1])
        while True:
            try:
                cycle()
            except Exception as exc:  # noqa: BLE001 - keep the agent alive
                print(f"[agent] error: {exc}")
            time.sleep(interval)
    else:
        cycle()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Generator** — `watch/generator.py`:
```python
#!/usr/bin/env python3
"""Re-inject the demo storyline into watch/infra-snapshot.json (reset to a
risky state so the detect->approve->resolve loop can be demoed again)."""
import json
import os

WATCH = os.path.dirname(os.path.abspath(__file__))
SNAP = os.path.join(WATCH, "infra-snapshot.json")


def reset():
    snapshot = {
        "resources": [
            {"event_id": "agent-bucket-001", "provider": "agent", "account_id": "client-account",
             "resource_id": "bucket-project-drawings", "resource_name": "Project Drawings Bucket",
             "resource_type": "bucket", "environment": "production", "owner_team": "Document Platform",
             "config": {"public_access": True}, "metrics": {}, "cost": {}},
        ]
    }
    with open(SNAP, "w") as fh:
        json.dump(snapshot, fh, indent=2)
    print("watch/infra-snapshot.json reset: bucket-project-drawings is public again")


if __name__ == "__main__":
    reset()
```

- [ ] **Step 5: README** — `watch/README.md`:
```markdown
# SafeCloud Agent — watched folder

`safecloud-agent.py` (repo root) reads `infra-snapshot.json` here, scans it into
the control plane, and applies approved remediations back into this file.

Demo:
1. Start the backend (`cd backend && .venv/bin/python -m uvicorn main:app --port 8000`).
2. `python3 safecloud-agent.py --loop 5` (repo root).
3. In the dashboard, approve a finding (all required reviewers).
4. Next agent cycle executes it, patches `infra-snapshot.json`, and the finding
   flips to `action_completed`.
5. `python3 watch/generator.py` to reset the storyline and demo again.
```

- [ ] **Step 6: Syntax check** (no live server): `python3 -c "import ast; ast.parse(open('safecloud-agent.py').read()); ast.parse(open('watch/generator.py').read()); print('ok')"` and validate the JSON: `python3 -c "import json; json.load(open('watch/infra-snapshot.json')); print('json ok')"`. Expected: `ok` + `json ok`.

- [ ] **Step 7: Commit** `feat(agent): standalone safecloud-agent.py + watched folder + generator`.

---

## Task 5: Frontend "Agent online" status chip

**Files:** Create `app/components/AgentStatusChip.tsx`; Modify `app/lib/types.ts`, `app/lib/api.ts`, `app/components/AppShell.tsx`.

- [ ] **Step 1: Type + api** — append to `app/lib/types.ts`:
```typescript
export interface AgentStatus {
  online: boolean;
  last_seen: string | null;
  agent_id: string | null;
}
```
In `app/lib/api.ts`, add `AgentStatus` to the type import, then append:
```typescript
export async function getAgentStatus(): Promise<ApiResult<AgentStatus>> {
  try {
    return ok(await tryFetch<AgentStatus>("/api/agent/status"));
  } catch (e) {
    return fallback({ online: false, last_seen: null, agent_id: null }, e);
  }
}
```

- [ ] **Step 2: Chip** — `app/components/AgentStatusChip.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { getAgentStatus } from "@/app/lib/api";
import type { AgentStatus } from "@/app/lib/types";

export default function AgentStatusChip() {
  const [status, setStatus] = useState<AgentStatus | null>(null);

  useEffect(() => {
    let active = true;
    const poll = () => getAgentStatus().then((r) => active && setStatus(r.data));
    poll();
    const id = setInterval(poll, 8000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const online = status?.online ?? false;
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium md:flex"
      style={{ background: online ? "#2BA64014" : "#F2F2F2", color: online ? "#1f7a3d" : "#909090" }}
      title={online ? `Agent online${status?.agent_id ? ` (${status.agent_id})` : ""}` : "Agent offline"}
    >
      <span className={`h-2 w-2 rounded-full ${online ? "bg-[#2BA640]" : "bg-[#B0B0B0]"}`} />
      Agent {online ? "online" : "offline"}
    </span>
  );
}
```

- [ ] **Step 3: Mount in shell** — in `app/components/AppShell.tsx`, import `AgentStatusChip` and render it in the top-bar right cluster (next to the "Latest scan" span, inside the `<div className="ml-auto flex items-center ...">`). Add `<AgentStatusChip />` right before the Help button.

- [ ] **Step 4: Build** `node ./node_modules/next/dist/bin/next build` — clean + all routes. **Step 5: Commit** `feat(agent): Agent online/offline status chip in the shell`.

---

## Task 6: End-to-end manual verification

- [ ] Start backend (`cd backend && .venv/bin/python -m uvicorn main:app --port 8000`). Run `python3 safecloud-agent.py` once → prints config counts + "scan -> N findings". Approve the public-bucket finding as security + devops in the dashboard. Run `python3 safecloud-agent.py` again → it executes `restrict_public_access`, patches `watch/infra-snapshot.json` (public_access=false), appends `activity.log`, finding → `action_completed`. Re-run → that finding no longer re-detects. Dashboard shows "Agent online". `python3 watch/generator.py` resets for a repeat demo.

---

## Self-Review (plan author)

- **Spec coverage:** local agent + control plane (Task 3/4, §3) ✓ · watched folder (snapshot + activity.log + generator) (Task 4, §2) ✓ · connection endpoints config/events/commands/result/status + token (Task 3, §3/§9) ✓ · agent executes approved remediation by mutating the snapshot → visible closed loop (Task 2/4, §8) ✓ · agent online chip (Task 5) ✓.
- **Safety:** the agent only fetches `status=="queued"` commands, which Phase 3 queues **only after all required reviewers approve** (destructive included). The agent never decides; it executes already-approved actions. Token-gated; `/status` is read-only/no-token for the dashboard. `apply_remediation` is pure (deepcopy) and only the agent (client side) mutates the snapshot.
- **No-regression:** new endpoints/fields are additive; `RemediationCommand.resource_id` defaults `""` so Phase 3 tests still pass; ingest reused unchanged.
- **Type consistency:** `apply_remediation(snapshot, action_key, resource_id)` and `snapshot_to_events(snapshot, timestamp)` signatures match across runtime, the agent script, and tests. `complete_command(id, status, result)` consistent between governance and the route. `agent_last_seen`/`agent_id` on the store used by `/status`.

**SafeCloud is now feature-complete across all 4 phases:** customizable rules → customizable agents → threat reports + response policy → real client agent with human-approved closed-loop remediation.
