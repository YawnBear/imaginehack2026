from fastapi.testclient import TestClient

from app.main import create_app


def _client() -> TestClient:
    c = TestClient(create_app())
    c.__enter__()  # fire startup
    return c


def test_list_agents():
    res = _client().get("/api/agents")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 0
    assert body["items"] == []


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
    output_key = body["output_key"]
    assert body["system_prompt"] == "You are a data exposure specialist."
    patched = client.patch(
        f"/api/agents/{agent_id}",
        json={
            "name": "Exposure Review Agent",
            "system_prompt": "You review findings for public data exposure.",
            "enabled": False,
        },
    )
    assert patched.status_code == 200
    patched_body = patched.json()
    assert patched_body["name"] == "Exposure Review Agent"
    assert patched_body["system_prompt"] == "You review findings for public data exposure."
    assert patched_body["enabled"] is False
    assert patched_body["output_key"] == output_key
    assert client.delete(f"/api/agents/{agent_id}").status_code == 204
    assert client.patch(f"/api/agents/{agent_id}", json={"enabled": True}).status_code == 404
