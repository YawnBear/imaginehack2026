"""Tests for the merged workflow summary + /api/workflows/run preview.

SAFETY: the test backend has a real AI key (ai_enabled == True), so every path
that reaches WorkflowService.run / generate_workflow_summary / generate_agent_analysis
is stubbed or forced AI-off here. The suite makes ZERO network calls.
"""

from datetime import UTC, datetime

from fastapi.testclient import TestClient

import app.agents.ai_client as ai_client
import app.services.workflows_service as workflows_service
from app.agents.summary import stitch_summary
from app.agents.ai_client import generate_workflow_summary, parse_summary
from app.main import create_app
from app.schemas import Rule, RuleCondition
from app.services import dependencies
from app.services.store import InMemoryStore
from app.services.workflows_service import WorkflowService


# --------------------------------------------------------------------------- #
# B2: stitch_summary (deterministic fallback)
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
# B3: parse_summary
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
# B3: generate_workflow_summary (never raises, no network in tests)
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
# B6: WorkflowService.run
# --------------------------------------------------------------------------- #
def test_run_missing_rule_returns_none():
    store = InMemoryStore()
    assert WorkflowService(store).run("DOES_NOT_EXIST", ["security"]) is None


def test_run_with_ai_outputs(monkeypatch):
    store = InMemoryStore()
    monkeypatch.setattr(
        workflows_service, "generate_agent_analysis",
        lambda finding, rec, selected: {"security": "exposed", "audit": "needs approval"},
    )
    monkeypatch.setattr(
        workflows_service, "generate_workflow_summary",
        lambda finding, outputs: "Merged summary paragraph.",
    )
    res = WorkflowService(store).run("RULE_PUBLIC_BUCKET", ["security", "audit"])
    assert res is not None
    assert res.summary == "Merged summary paragraph."
    assert res.ai_generated is True
    assert res.agent_outputs == {"security": "exposed", "audit": "needs approval"}


def test_run_falls_back_to_stitch_when_summarizer_none(monkeypatch):
    store = InMemoryStore()
    monkeypatch.setattr(
        workflows_service, "generate_agent_analysis",
        lambda finding, rec, selected: {"security": "exposed", "cost": "wasted"},
    )
    monkeypatch.setattr(
        workflows_service, "generate_workflow_summary",
        lambda finding, outputs: None,
    )
    res = WorkflowService(store).run("RULE_PUBLIC_BUCKET", ["security", "cost"])
    assert res.ai_generated is True
    assert res.summary.startswith("2 agents reviewed this finding.")


def test_run_ai_off_returns_empty_path_summary(monkeypatch):
    store = InMemoryStore()
    monkeypatch.setattr(
        workflows_service, "generate_agent_analysis",
        lambda finding, rec, selected: None,
    )
    res = WorkflowService(store).run("RULE_PUBLIC_BUCKET", ["security", "audit"])
    assert res.ai_generated is False
    assert res.agent_outputs == {}
    assert res.summary  # non-empty empty-path copy
    assert "No analysis text was generated" in res.summary


def test_run_no_agents_selected_empty_summary(monkeypatch):
    store = InMemoryStore()
    monkeypatch.setattr(
        workflows_service, "generate_agent_analysis",
        lambda finding, rec, selected: None,
    )
    res = WorkflowService(store).run("RULE_PUBLIC_BUCKET", [])
    assert res.ai_generated is False
    assert "No agents are selected" in res.summary


def test_run_synthetic_when_no_finding(monkeypatch):
    store = InMemoryStore()  # no findings ingested
    monkeypatch.setattr(
        workflows_service, "generate_agent_analysis",
        lambda finding, rec, selected: None,
    )
    res = WorkflowService(store).run("RULE_PUBLIC_BUCKET", ["security"])
    assert res.synthetic is True
    assert res.finding_preview.get("finding_id", "").startswith("preview-")


def test_run_real_finding_used_when_present(monkeypatch):
    store = InMemoryStore()
    finding = _finding(rule_id="RULE_PUBLIC_BUCKET", finding_id="real-1")
    store.findings[finding.finding_id] = finding
    monkeypatch.setattr(
        workflows_service, "generate_agent_analysis",
        lambda finding, rec, selected: None,
    )
    res = WorkflowService(store).run("RULE_PUBLIC_BUCKET", ["security"])
    assert res.synthetic is False
    assert res.finding_preview.get("finding_id") == "real-1"


# --------------------------------------------------------------------------- #
# B8: route POST /api/workflows/run
# --------------------------------------------------------------------------- #
def test_route_happy_path(monkeypatch):
    monkeypatch.setattr(
        workflows_service, "generate_agent_analysis",
        lambda finding, rec, selected: {"security": "exposed"},
    )
    monkeypatch.setattr(
        workflows_service, "generate_workflow_summary",
        lambda finding, outputs: "A merged summary.",
    )
    client = TestClient(create_app())
    res = client.post(
        "/api/workflows/run",
        json={"rule_id": "RULE_PUBLIC_BUCKET", "agent_keys": ["security"]},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["summary"] == "A merged summary."
    assert body["ai_generated"] is True
    assert body["agent_outputs"] == {"security": "exposed"}


def test_route_404_unknown_rule(monkeypatch):
    # Stub AI off so even if it reached run() there's no network; rule is missing
    # so it 404s before any AI call anyway.
    monkeypatch.setattr(
        workflows_service, "generate_agent_analysis",
        lambda finding, rec, selected: None,
    )
    client = TestClient(create_app())
    res = client.post(
        "/api/workflows/run",
        json={"rule_id": "NOPE", "agent_keys": ["security"]},
    )
    assert res.status_code == 404


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
