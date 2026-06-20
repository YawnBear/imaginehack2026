from datetime import UTC, datetime

from app.agents.ai_client import build_prompt, generate_agent_analysis, parse_response
from app.schemas import Agent, Finding, Recommendation


def _agent(output_key, lens) -> Agent:
    return Agent(
        agent_id=f"ag-{output_key}",
        name=f"{output_key} agent",
        lens=lens,
        output_key=output_key,
        extra_focus="flag tender drawings",
        created_at=datetime.now(UTC),
    )


def _finding() -> Finding:
    return Finding(
        finding_id="f1", source_event_id="e1", resource_id="bucket-x",
        resource_type="bucket", issue_type="public_bucket", category="security",
        severity="critical", status="pending_review", rule_id="R", rule_confidence=0.9,
        created_at=datetime.now(UTC), updated_at=datetime.now(UTC),
    )


def _rec() -> Recommendation:
    return Recommendation(
        recommendation_id="r1", finding_id="f1", recommended_action="Restrict.",
        rationale="why", risk_level="critical", confidence=0.9,
    )


def test_prompt_mentions_each_agent_key():
    agents = [_agent("security", "exposure"), _agent("audit", "compliance")]
    prompt = build_prompt(_finding(), _rec(), agents)
    assert "security" in prompt and "audit" in prompt
    assert "flag tender drawings" in prompt  # extra_focus surfaced


def test_parse_clamps_to_allowed_keys():
    allowed = {"security", "audit"}
    raw = '{"choices":[{"message":{"content":"{\\"security\\":\\"risk\\",\\"cost\\":\\"nope\\"}"}}]}'
    out = parse_response(raw, allowed)
    assert out == {"security": "risk"}  # "cost" dropped (not in allowed)


def test_generate_returns_none_when_ai_disabled():
    # No AI key configured in tests -> ai_enabled is False -> None.
    assert generate_agent_analysis(_finding(), _rec(), [_agent("security", "exposure")]) is None
