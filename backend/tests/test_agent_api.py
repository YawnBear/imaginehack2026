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


def test_config_returns_rules_agents():
    body = _client().get("/api/agent/config", headers=H).json()
    assert len(body["rules"]) >= 4
    assert len(body["agents"]) >= 5
    assert "policy" not in body


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
