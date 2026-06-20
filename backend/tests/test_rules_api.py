from fastapi.testclient import TestClient

from app.main import create_app


def _client() -> TestClient:
    client = TestClient(create_app())
    client.__enter__()  # fire startup events
    return client


def test_list_rules():
    res = _client().get("/api/rules")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 0
    assert body["items"] == []


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
    created_body = created.json()
    rule_id = created_body["rule_id"]

    patched = client.patch(
        f"/api/rules/{rule_id}",
        json={
            "name": "Idle Production VM",
            "enabled": False,
            "conditions": [{"field": "metrics.avg_cpu_percent_7d", "operator": "<=", "value": 3}],
        },
    )
    assert patched.status_code == 200
    patched_body = patched.json()
    assert patched_body["name"] == "Idle Production VM"
    assert patched_body["enabled"] is False
    assert patched_body["conditions"] == [
        {"field": "metrics.avg_cpu_percent_7d", "operator": "<=", "value": 3}
    ]
    assert patched_body["issue_type"] == created_body["issue_type"]
    assert patched_body["category"] == created_body["category"]
    assert patched_body["resource_type"] == created_body["resource_type"]

    deleted = client.delete(f"/api/rules/{rule_id}")
    assert deleted.status_code == 204

    missing = client.patch(f"/api/rules/{rule_id}", json={"enabled": True})
    assert missing.status_code == 404
