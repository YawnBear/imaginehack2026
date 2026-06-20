from fastapi.testclient import TestClient

from app.main import create_app
from app.services import dependencies
from app.services.seed import seed_builtin_configuration


def _client(*, seed_builtins: bool = False) -> TestClient:
    if seed_builtins:
        seed_builtin_configuration(dependencies._store, agents=False, workflows=False)
    c = TestClient(create_app())
    c.__enter__()  # fire startup
    return c


def test_generate_report_for_finding():
    client = _client(seed_builtins=True)
    fid = client.get("/api/findings").json()["items"][0]["finding_id"]
    res = client.post(f"/api/findings/{fid}/threat-report")
    assert res.status_code == 200
    assert res.json()["finding_id"] == fid
    assert "criticality_score" in res.json()


def test_get_report_404_for_unknown():
    assert _client().get("/api/findings/nope/threat-report").status_code == 404
