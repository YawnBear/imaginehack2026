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


def test_create_update_delete():
    client = _client()
    created = client.post(
        "/api/agents",
        json={"name": "Data Exposure Specialist",
              "system_prompt": "You are a data exposure specialist."},
    )
    assert created.status_code == 201
    body = created.json()
    agent_id = body["agent_id"]
    assert body["system_prompt"] == "You are a data exposure specialist."
    patched = client.patch(f"/api/agents/{agent_id}", json={"enabled": False})
    assert patched.status_code == 200
    assert patched.json()["enabled"] is False
    assert client.delete(f"/api/agents/{agent_id}").status_code == 204
    assert client.patch(f"/api/agents/{agent_id}", json={"enabled": True}).status_code == 404
