from datetime import UTC, datetime

from app.agents.router import build_agent_outputs, issue_label, select_agents
from app.schemas import Agent, Finding, Recommendation


def _agent(output_key, lens, cats=None, issues=None, enabled=True) -> Agent:
    return Agent(
        agent_id=f"ag-{output_key}",
        name=output_key,
        lens=lens,
        output_key=output_key,
        enabled=enabled,
        coverage_categories=cats or [],
        coverage_issue_types=issues or [],
        created_at=datetime.now(UTC),
    )


def _finding(category="security", issue_type="public_bucket") -> Finding:
    return Finding(
        finding_id="f1",
        source_event_id="e1",
        resource_id="bucket-x",
        resource_type="bucket",
        issue_type=issue_type,
        category=category,
        severity="critical",
        status="pending_review",
        rule_id="R",
        rule_confidence=0.9,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _rec() -> Recommendation:
    return Recommendation(
        recommendation_id="r1",
        finding_id="f1",
        recommended_action="Restrict.",
        rationale="why",
        risk_level="critical",
        estimated_monthly_savings=76.8,
        estimated_carbon_reduction_kg=26.88,
        confidence=0.9,
    )


def test_select_by_category():
    agents = [_agent("security", "exposure", cats=["security"]), _agent("cost", "cost", cats=["cost"])]
    picked = select_agents(_finding(category="security"), agents)
    assert [a.output_key for a in picked] == ["security"]


def test_select_by_issue_type():
    agents = [_agent("energy", "carbon", issues=["idle_vm"])]
    assert select_agents(_finding(category="cost", issue_type="idle_vm"), agents)
    assert not select_agents(_finding(category="cost", issue_type="public_bucket"), agents)


def test_disabled_agent_not_selected():
    agents = [_agent("security", "exposure", cats=["security"], enabled=False)]
    assert select_agents(_finding(), agents) == []


def test_build_agent_outputs_keys_and_text():
    agents = [
        _agent("cost", "cost", cats=["cost"]),
        _agent("energy", "carbon", issues=["idle_vm"]),
    ]
    out = build_agent_outputs(_finding(category="cost", issue_type="idle_vm"), _rec(), agents)
    assert set(out.keys()) == {"cost", "energy"}
    assert "76.8" in out["cost"]  # cost lens references the savings number
    assert all(isinstance(v, str) and v for v in out.values())


def test_issue_label():
    assert issue_label("public_bucket") == "Public Bucket"
