from fastapi.testclient import TestClient

from app.main import create_app


def _client() -> TestClient:
    client = TestClient(create_app())
    client.__enter__()  # fire startup events (seeds demo data into the singleton store)
    return client


def test_list_rules():
    res = _client().get("/api/rules")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 10
    assert {r["rule_id"] for r in body["items"]} >= {"RULE_PUBLIC_BUCKET", "RULE_FAILED_LOGIN"}


def test_get_templates():
    res = _client().get("/api/rules/templates")
    assert res.status_code == 200
    assert any(t["template_key"] == "threshold_breach" for t in res.json())


def test_get_clashes_empty_by_default():
    res = _client().get("/api/rules/clashes")
    assert res.status_code == 200
    assert res.json() == []


def test_preview():
    res = _client().post(
        "/api/rules/preview",
        json={
            "resource_type": "bucket",
            "conditions": [{"field": "config.public_access", "operator": "==", "value": True}],
        },
    )
    assert res.status_code == 200
    assert res.json()["match_count"] >= 1  # seed data has the public bucket


def test_create_update_delete_roundtrip():
    client = _client()
    created = client.post(
        "/api/rules",
        json={
            "name": "Idle Prod VM",
            "resource_type": "vm",
            "issue_type": "idle_vm",
            "category": "cost",
            "conditions": [{"field": "metrics.avg_cpu_percent_7d", "operator": "<=", "value": 5}],
        },
    )
    assert created.status_code == 201
    rule_id = created.json()["rule_id"]

    patched = client.patch(f"/api/rules/{rule_id}", json={"enabled": False})
    assert patched.status_code == 200
    assert patched.json()["enabled"] is False

    deleted = client.delete(f"/api/rules/{rule_id}")
    assert deleted.status_code == 204

    missing = client.patch(f"/api/rules/{rule_id}", json={"enabled": True})
    assert missing.status_code == 404
