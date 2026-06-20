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
