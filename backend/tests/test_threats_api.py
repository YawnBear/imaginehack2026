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
