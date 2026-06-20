from fastapi.testclient import TestClient

from app.main import create_app


def _client() -> TestClient:
    c = TestClient(create_app())
    c.__enter__()  # fire startup seeding
    return c


def test_generate_report_for_finding():
    client = _client()
    fid = client.get("/api/findings").json()["items"][0]["finding_id"]
    res = client.post(f"/api/findings/{fid}/threat-report")
    assert res.status_code == 200
    assert res.json()["finding_id"] == fid
    assert "criticality_score" in res.json()


def test_get_report_404_for_unknown():
    assert _client().get("/api/findings/nope/threat-report").status_code == 404
