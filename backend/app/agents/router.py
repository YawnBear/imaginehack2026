"""Routing only: which agents analyze a finding = its rule's agent_keys.
No coverage, no deterministic text. Agent text is produced solely by the LLM
(ai_client) from each agent's system_prompt; with no AI key, there is none."""

from app.schemas import Agent, Finding


def select_agents_for_finding(finding: Finding, agents: list[Agent], rule) -> list[Agent]:
    keys = list(getattr(rule, "agent_keys", None) or [])
    by_key = {a.output_key: a for a in agents if a.enabled}
    return [by_key[k] for k in keys if k in by_key]
