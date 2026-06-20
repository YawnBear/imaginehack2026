from datetime import UTC, datetime

from app.agents.router import select_agents_for_finding
from app.schemas import Agent, Finding, Rule, RuleCondition


def _finding():
    return Finding(finding_id="f", source_event_id="e", resource_id="r", resource_type="bucket",
                   issue_type="public_bucket", category="security", severity="critical",
                   status="pending_review", rule_id="R1", rule_confidence=0.9,
                   created_at=datetime.now(UTC), updated_at=datetime.now(UTC))


def _rule(agent_keys):
    return Rule(rule_id="R1", name="r", resource_type="bucket", issue_type="public_bucket",
                category="security", agent_keys=agent_keys,
                conditions=[RuleCondition(field="config.public_access", operator="==", value=True)],
                created_at=datetime.now(UTC))


def test_rule_agent_keys_select_those_agents():
    picked = select_agents_for_finding(_finding(), _agents(), _rule(["security", "audit"]))
    assert {a.output_key for a in picked} == {"security", "audit"}


def test_empty_agent_keys_selects_none():
    assert select_agents_for_finding(_finding(), _agents(), _rule([])) == []


def _agents():
    now = datetime.now(UTC)
    return [
        Agent(agent_id=f"agent-{key}", name=key.title(), system_prompt=f"Analyze {key}.", output_key=key, created_at=now)
        for key in ("security", "audit")
    ]
