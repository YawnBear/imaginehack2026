from datetime import UTC, datetime

from app.agents.ai_client import (
    build_prompt,
    generate_agent_analysis,
    generate_recommendation_text,
    generate_threat_summary,
    parse_recommendation_text,
    parse_response,
)
from app.schemas import Agent, Finding, Recommendation


def _agent(output_key, system_prompt) -> Agent:
    return Agent(
        agent_id=f"ag-{output_key}",
        name=f"{output_key} agent",
        system_prompt=system_prompt,
        output_key=output_key,
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
    agents = [
        _agent("security", "You are a security analyst. Flag tender drawings."),
        _agent("audit", "You are a compliance auditor. List approvals."),
    ]
    prompt = build_prompt(_finding(), _rec(), agents)
    assert "security" in prompt and "audit" in prompt
    assert "You are a security analyst. Flag tender drawings." in prompt
    assert "You are a compliance auditor. List approvals." in prompt


def test_parse_clamps_to_allowed_keys():
    allowed = {"security", "audit"}
    raw = '{"choices":[{"message":{"content":"{\\"security\\":\\"risk\\",\\"cost\\":\\"nope\\"}"}}]}'
    out = parse_response(raw, allowed)
    assert out == {"security": "risk"}  # "cost" dropped (not in allowed)


def test_parse_recommendation_text_extracts_expected_fields():
    raw = (
        '{"choices":[{"message":{"content":"{\\"recommended_action\\":\\"Review bucket policy.\\",'
        '\\"rationale\\":\\"The evidence says public access is enabled.\\",'
        '\\"confidence\\":0.1}"}}]}'
    )
    out = parse_recommendation_text(raw)
    assert out == {
        "recommended_action": "Review bucket policy.",
        "rationale": "The evidence says public access is enabled.",
    }


def test_generate_returns_none_when_ai_disabled(monkeypatch):
    # With AI disabled, generation short-circuits to None (deterministic, no
    # network). Force ai_enabled off so the test is independent of any key.
    import app.agents.ai_client as ai_client

    settings = ai_client.get_settings()
    monkeypatch.setattr(type(settings), "ai_enabled", property(lambda self: False))
    agent = _agent("security", "You are a security analyst.")
    assert generate_agent_analysis(_finding(), _rec(), [agent]) is None


def test_generate_recommendation_text_none_when_ai_disabled(monkeypatch):
    import app.agents.ai_client as ai_client

    settings = ai_client.get_settings()
    monkeypatch.setattr(type(settings), "ai_enabled", property(lambda self: False))
    assert generate_recommendation_text(_finding(), {"recommended_action": "Fallback"}) is None


def test_generate_threat_summary_none_when_ai_disabled(monkeypatch):
    import app.agents.ai_client as ai_client

    settings = ai_client.get_settings()
    monkeypatch.setattr(type(settings), "ai_enabled", property(lambda self: False))
    assert generate_threat_summary(_finding(), _rec(), None, 80, {"severity": 20}) is None
