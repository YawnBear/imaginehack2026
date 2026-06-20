from datetime import UTC, datetime

from app.agents.router import build_agent_outputs
from app.agents.seed_agents import builtin_agents
from app.schemas import Finding, Recommendation, Rule, RuleCondition


def _finding():
    return Finding(finding_id="f", source_event_id="e", resource_id="r", resource_type="bucket",
                   issue_type="public_bucket", category="security", severity="critical",
                   status="pending_review", rule_id="R1", rule_confidence=0.9,
                   created_at=datetime.now(UTC), updated_at=datetime.now(UTC))


def _rec():
    return Recommendation(recommendation_id="r", finding_id="f", recommended_action="x",
                          rationale="y", risk_level="critical", confidence=0.9)


def _rule(agent_keys):
    return Rule(rule_id="R1", name="r", resource_type="bucket", issue_type="public_bucket",
                category="security", agent_keys=agent_keys,
                conditions=[RuleCondition(field="config.public_access", operator="==", value=True)],
                created_at=datetime.now(UTC))


def test_rule_agent_keys_override_coverage():
    out = build_agent_outputs(_finding(), _rec(), builtin_agents(), _rule(["security"]))
    assert set(out.keys()) == {"security"}  # only the rule's chosen agent


def test_empty_agent_keys_falls_back_to_coverage():
    out = build_agent_outputs(_finding(), _rec(), builtin_agents(), _rule([]))
    assert set(out.keys()) == {"security", "workflow", "audit"}  # coverage default
