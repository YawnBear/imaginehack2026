from app.agents.seed_agents import builtin_agents
from app.rules.seed_rules import builtin_rules
from app.services.seed_workflows import builtin_workflows


def test_builtin_workflows_cover_each_builtin_rule():
    rule_ids = {rule.rule_id for rule in builtin_rules()}
    workflow_rule_ids = {workflow.rule_id for workflow in builtin_workflows()}

    assert workflow_rule_ids == rule_ids


def test_builtin_workflows_use_existing_agent_keys():
    agent_keys = {agent.output_key for agent in builtin_agents()}

    for workflow in builtin_workflows():
        assert workflow.agent_keys
        assert set(workflow.agent_keys) <= agent_keys
