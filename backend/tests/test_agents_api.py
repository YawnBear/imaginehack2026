from fastapi.testclient import TestClient

from app.main import create_app


def _client() -> TestClient:
    c = TestClient(create_app())
    c.__enter__()  # fire startup so the singleton store is seeded
    return c


def test_list_agents():
    # >= 5 (not == 5): the API tests share the singleton store; assert the 5
    # seeds are present rather than an exact count that other tests can perturb.
    res = _client().get("/api/agents")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] >= 5
    assert {a["output_key"] for a in body["items"]} >= {"security", "cost", "energy", "workflow", "audit"}


def test_templates():
    res = _client().get("/api/agents/templates")
    assert res.status_code == 200
    assert any(t["template_key"] == "forensics_analyst" for t in res.json())


def test_preview():
    res = _client().post(
        "/api/agents/preview",
        json={"lens": "cost", "issue_type": "idle_vm", "tone": "concise", "extra_focus": ""},
    )
    assert res.status_code == 200
    assert "$" in res.json()["text"]


def test_create_update_delete():
    client = _client()
    created = client.post(
        "/api/agents",
        json={"name": "Data Exposure Specialist", "lens": "exposure", "output_key": "data_exposure",
              "coverage_issue_types": ["public_bucket"]},
    )
    assert created.status_code == 201
    agent_id = created.json()["agent_id"]
    patched = client.patch(f"/api/agents/{agent_id}", json={"enabled": False})
    assert patched.status_code == 200
    assert patched.json()["enabled"] is False
    assert client.delete(f"/api/agents/{agent_id}").status_code == 204
    assert client.patch(f"/api/agents/{agent_id}", json={"enabled": True}).status_code == 404
