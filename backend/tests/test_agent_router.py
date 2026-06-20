from datetime import UTC, datetime

from app.agents.router import select_agents_for_finding
from app.schemas import Agent, Finding, Rule, RuleCondition


def _agent(output_key, enabled=True) -> Agent:
    return Agent(
        agent_id=f"ag-{output_key}",
        name=output_key,
        system_prompt=f"You are the {output_key} agent.",
        output_key=output_key,
        enabled=enabled,
        created_at=datetime.now(UTC),
    )


def _finding() -> Finding:
    return Finding(
        finding_id="f1",
        source_event_id="e1",
        resource_id="bucket-x",
        resource_type="bucket",
        issue_type="public_bucket",
        category="security",
        severity="critical",
        status="pending_review",
        rule_id="R",
        rule_confidence=0.9,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _rule(agent_keys) -> Rule:
    return Rule(
        rule_id="R",
        name="r",
        resource_type="bucket",
        issue_type="public_bucket",
        category="security",
        agent_keys=agent_keys,
        conditions=[RuleCondition(field="config.public_access", operator="==", value=True)],
        created_at=datetime.now(UTC),
    )


def test_rule_agent_keys_select_matching_agents():
    agents = [_agent("security"), _agent("cost")]
    picked = select_agents_for_finding(_finding(), agents, _rule(["security"]))
    assert [a.output_key for a in picked] == ["security"]


def test_empty_agent_keys_selects_none():
    agents = [_agent("security"), _agent("cost")]
    assert select_agents_for_finding(_finding(), agents, _rule([])) == []


def test_disabled_agent_excluded():
    agents = [_agent("security", enabled=False)]
    assert select_agents_for_finding(_finding(), agents, _rule(["security"])) == []
