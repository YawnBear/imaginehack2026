from datetime import UTC, datetime

from app.agents.router import select_agents_for_finding
from app.agents.seed_agents import builtin_agents
from app.schemas import Finding, Rule, RuleCondition


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
    picked = select_agents_for_finding(_finding(), builtin_agents(), _rule(["security", "audit"]))
    assert {a.output_key for a in picked} == {"security", "audit"}


def test_empty_agent_keys_selects_none():
    assert select_agents_for_finding(_finding(), builtin_agents(), _rule([])) == []
