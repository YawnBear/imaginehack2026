"""Tests for the merged workflow summary + saved-workflow CRUD + Run-all.

SAFETY: the test backend has a real AI key (ai_enabled == True), so every path
that reaches generate_workflow_summary / generate_agent_analysis is stubbed or
forced AI-off here, and WorkflowService._scan is patched so no test reads the
real snapshot file. The suite makes ZERO network calls and stays fast.
"""

from datetime import UTC, datetime

from fastapi.testclient import TestClient

import app.agents.ai_client as ai_client
import app.services.workflows_service as workflows_service
from app.agents.summary import stitch_summary
from app.agents.ai_client import generate_workflow_summary, parse_summary
from app.main import create_app
from app.services.governance import GovernanceService
from app.services.store import InMemoryStore
from app.services.workflows_service import WorkflowService


# --------------------------------------------------------------------------- #
# stitch_summary (deterministic fallback)
# --------------------------------------------------------------------------- #
def test_stitch_summary_empty_returns_empty():
    assert stitch_summary({}) == ""
    assert stitch_summary(None) == ""
    assert stitch_summary({"security": "   "}) == ""


def test_stitch_summary_orders_and_names_each_agent():
    out = stitch_summary({"cost": "wasted spend", "security": "exposed bucket"})
    # security comes before cost per _ORDER even though cost was inserted first
    assert out.index("Security:") < out.index("Cost:")
    assert "Security: exposed bucket" in out
    assert "Cost: wasted spend" in out
    assert out.startswith("2 agents reviewed this finding.")


def test_stitch_summary_singular_lead_for_one_agent():
    out = stitch_summary({"security": "exposed bucket"})
    assert out.startswith("1 agent reviewed this finding.")


# --------------------------------------------------------------------------- #
# parse_summary
# --------------------------------------------------------------------------- #
def test_parse_summary_extracts_text_from_valid_body():
    raw = '{"choices":[{"message":{"content":"This is the merged summary."}}]}'
    assert parse_summary(raw) == "This is the merged summary."


def test_parse_summary_strips_code_fence():
    raw = '{"choices":[{"message":{"content":"```\\nfenced text\\n```"}}]}'
    assert parse_summary(raw) == "fenced text"


def test_parse_summary_none_on_empty_envelope():
    assert parse_summary("{}") is None


def test_parse_summary_none_on_non_json():
    assert parse_summary("not json at all") is None


def test_parse_summary_none_on_empty_content():
    raw = '{"choices":[{"message":{"content":"   "}}]}'
    assert parse_summary(raw) is None


# --------------------------------------------------------------------------- #
# generate_workflow_summary (never raises, no network in tests)
# --------------------------------------------------------------------------- #
def test_generate_workflow_summary_none_when_ai_disabled(monkeypatch):
    settings = ai_client.get_settings()
    monkeypatch.setattr(type(settings), "ai_enabled", property(lambda self: False))
    # No network: short-circuits to None before any request.
    assert generate_workflow_summary(_finding(), {"security": "risk"}) is None


def test_generate_workflow_summary_none_when_no_outputs(monkeypatch):
    # Even with AI enabled, empty outputs short-circuit before any network call.
    settings = ai_client.get_settings()
    monkeypatch.setattr(type(settings), "ai_enabled", property(lambda self: True))
    assert generate_workflow_summary(_finding(), {}) is None
    assert generate_workflow_summary(_finding(), {"security": "  "}) is None


# --------------------------------------------------------------------------- #
# CRUD via TestClient
# --------------------------------------------------------------------------- #
def test_create_lists_and_deletes_workflow(monkeypatch):
    # _scan never reads the real file / hits the network in CRUD tests.
    monkeypatch.setattr(WorkflowService, "_scan", lambda self: 0)
    client = TestClient(create_app())

    created = client.post(
        "/api/workflows",
        json={"name": "Bucket review", "rule_id": "RULE_PUBLIC_BUCKET", "agent_keys": ["security"]},
    )
    assert created.status_code == 201
    body = created.json()
    wf_id = body["workflow_id"]
    assert body["name"] == "Bucket review"
    assert body["rule_id"] == "RULE_PUBLIC_BUCKET"
    assert body["agent_keys"] == ["security"]
    assert body["last_run"] is None

    listed = client.get("/api/workflows")
    assert listed.status_code == 200
    listed_body = listed.json()
    assert listed_body["total"] == 1
    assert any(w["workflow_id"] == wf_id for w in listed_body["items"])

    deleted = client.delete(f"/api/workflows/{wf_id}")
    assert deleted.status_code == 204

    listed_after = client.get("/api/workflows")
    assert listed_after.json()["total"] == 0


def test_delete_missing_workflow_404(monkeypatch):
    monkeypatch.setattr(WorkflowService, "_scan", lambda self: 0)
    client = TestClient(create_app())
    res = client.delete("/api/workflows/does-not-exist")
    assert res.status_code == 404


def test_create_unknown_rule_400(monkeypatch):
    monkeypatch.setattr(WorkflowService, "_scan", lambda self: 0)
    client = TestClient(create_app())
    res = client.post(
        "/api/workflows",
        json={"name": "Bad", "rule_id": "NOPE", "agent_keys": []},
    )
    assert res.status_code == 400


# --------------------------------------------------------------------------- #
# run_all
# --------------------------------------------------------------------------- #
def test_run_all_persists_last_run(monkeypatch):
    store = InMemoryStore()
    service = WorkflowService(store, GovernanceService(store))
    # Stub scan so it injects no findings via the real file; seed one directly.
    monkeypatch.setattr(WorkflowService, "_scan", lambda self: 1)
    finding = _finding(rule_id="RULE_PUBLIC_BUCKET", finding_id="real-1")
    store.findings[finding.finding_id] = finding
    monkeypatch.setattr(
        workflows_service, "generate_agent_analysis",
        lambda finding, rec, selected: {"security": "exposed bucket"},
    )
    monkeypatch.setattr(
        workflows_service, "generate_workflow_summary",
        lambda finding, outputs: "merged",
    )
    from app.schemas import WorkflowCreate

    wf = service.create(WorkflowCreate(name="W", rule_id="RULE_PUBLIC_BUCKET", agent_keys=["security"]))

    res = service.run_all()
    assert res.scanned_findings == 1
    assert len(res.workflows) == 1
    ran = res.workflows[0]
    assert ran.last_run is not None
    assert ran.last_run.summary == "merged"
    assert ran.last_run.finding_count >= 1
    assert ran.last_run.ai_generated is True
    assert ran.last_run.agent_outputs == {"security": "exposed bucket"}
    # Persisted on the store row.
    assert store.workflows[wf.workflow_id].last_run is not None
    assert store.workflows[wf.workflow_id].last_run.summary == "merged"


def test_run_all_no_matching_findings(monkeypatch):
    store = InMemoryStore()
    service = WorkflowService(store, GovernanceService(store))
    monkeypatch.setattr(WorkflowService, "_scan", lambda self: 0)
    monkeypatch.setattr(
        workflows_service, "generate_agent_analysis",
        lambda finding, rec, selected: None,
    )
    monkeypatch.setattr(
        workflows_service, "generate_workflow_summary",
        lambda finding, outputs: None,
    )
    from app.schemas import WorkflowCreate

    service.create(WorkflowCreate(name="W", rule_id="RULE_PUBLIC_BUCKET", agent_keys=["security"]))

    res = service.run_all()
    assert res.scanned_findings == 0
    assert len(res.workflows) == 1
    last_run = res.workflows[0].last_run
    assert last_run is not None
    assert last_run.finding_count == 0
    assert last_run.summary.startswith("No matching resources")


def test_run_all_route_returns_200(monkeypatch):
    monkeypatch.setattr(WorkflowService, "_scan", lambda self: 0)
    monkeypatch.setattr(
        workflows_service, "generate_agent_analysis",
        lambda finding, rec, selected: None,
    )
    monkeypatch.setattr(
        workflows_service, "generate_workflow_summary",
        lambda finding, outputs: None,
    )
    client = TestClient(create_app())
    res = client.post("/api/workflows/run-all")
    assert res.status_code == 200
    body = res.json()
    assert body["scanned_findings"] == 0
    assert body["workflows"] == []


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _finding(rule_id="R1", finding_id="f1"):
    from app.schemas import Finding

    return Finding(
        finding_id=finding_id, source_event_id="e1", resource_id="bucket-x",
        resource_type="bucket", issue_type="public_bucket", category="security",
        severity="critical", status="pending_review", rule_id=rule_id, rule_confidence=0.9,
        created_at=datetime.now(UTC), updated_at=datetime.now(UTC),
    )
