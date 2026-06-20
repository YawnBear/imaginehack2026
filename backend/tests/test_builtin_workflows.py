from app.agents.seed_agents import builtin_agents
from app.rules.seed_rules import builtin_rules
from app.services.seed_workflows import builtin_workflows


def test_builtin_workflows_cover_each_builtin_rule():
    assert builtin_rules() == []
    assert builtin_workflows() == []


def test_builtin_workflows_use_existing_agent_keys():
    assert builtin_agents() == []
    assert builtin_workflows() == []
