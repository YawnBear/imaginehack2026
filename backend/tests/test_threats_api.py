from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas import Finding
from app.services import dependencies


def _client() -> TestClient:
    c = TestClient(create_app())
    c.__enter__()
    return c


def test_generate_report_for_finding():
    client = _client()
    finding = Finding(
        finding_id="finding-1",
        source_event_id="event-1",
        resource_id="bucket-1",
        resource_type="bucket",
        issue_type="public_bucket",
        category="security",
        severity="critical",
        status="pending_review",
        rule_id="rule-1",
        evidence={"public_access": True},
        rule_confidence=0.9,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    dependencies._store.findings[finding.finding_id] = finding
    res = client.post(f"/api/findings/{finding.finding_id}/threat-report")
    assert res.status_code == 200
    assert res.json()["finding_id"] == finding.finding_id
    assert "criticality_score" in res.json()


def test_get_report_404_for_unknown():
    assert _client().get("/api/findings/nope/threat-report").status_code == 404
