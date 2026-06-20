from pathlib import Path
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.schemas import Finding
from app.services import dependencies


def _client() -> TestClient:
    client = TestClient(create_app())
    client.__enter__()
    return client


def test_settings_loads_repo_and_backend_env_files():
    env_files = [Path(item) for item in Settings.model_config["env_file"]]

    assert any(path.name == ".env" and path.parent.name != "backend" for path in env_files)
    assert any(path.name == ".env.local" and path.parent.name != "backend" for path in env_files)
    assert any(path.name == ".env" and path.parent.name == "backend" for path in env_files)
    assert any(path.name == ".env.local" and path.parent.name == "backend" for path in env_files)


def test_findings_support_backend_q_filter():
    client = _client()
    dependencies._store.findings["finding-claims"] = Finding(
        finding_id="finding-claims",
        source_event_id="event-claims",
        resource_id="database-claims",
        resource_type="database",
        issue_type="unencrypted_database",
        category="security",
        severity="high",
        status="pending_review",
        rule_id="rule-claims",
        evidence={"project_id": "claims"},
        rule_confidence=0.9,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    res = client.get("/api/findings?q=claims")

    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["resource_id"] == "database-claims"


def test_scan_run_endpoint_returns_ingest_response():
    client = _client()
    res = client.post("/api/scan/run")

    assert res.status_code == 200
    body = res.json()
    assert {
        "accepted",
        "created_findings",
        "duplicate_events",
        "updated_findings",
        "agent_runs",
        "source_records",
    } <= set(body)
    assert set(body["source_records"]) == {"cloud_events", "scanned_assets"}


def test_energy_summary_endpoint_returns_database_driven_shape():
    client = _client()
    res = client.get("/api/energy/summary")

    assert res.status_code == 200
    body = res.json()
    assert set(body) == {
        "current_footprint_kg",
        "projected_footprint_kg",
        "estimated_reduction_kg",
        "by_operation",
        "history",
    }
    assert isinstance(body["history"], list)


def test_reviewer_roles_are_derived_from_rules():
    client = _client()
    res = client.get("/api/reviewer-roles")

    assert res.status_code == 200
    roles = {item["role"] for item in res.json()}
    assert {"security", "devops", "application_owner", "project_owner", "compliance", "dba"} <= roles
