from datetime import UTC, datetime

import app.agents.recommendations as recommendations
from app.schemas import Finding


def _finding(issue_type="idle_vm") -> Finding:
    return Finding(
        finding_id="f1",
        source_event_id="e1",
        resource_id="i-render-1",
        resource_name="Render worker",
        resource_type="vm",
        owner_team="BIM",
        issue_type=issue_type,
        category="cost",
        severity="medium",
        status="pending_review",
        rule_id="RULE_IDLE_VM",
        evidence={"monthly_usd": 100, "avg_cpu": 1.2},
        rule_confidence=0.9,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def test_build_recommendation_uses_ai_text_when_available(monkeypatch):
    monkeypatch.setattr(
        recommendations,
        "generate_recommendation_text",
        lambda finding, payload: {
            "recommended_action": "Ask the BIM owner to stop the render worker after review.",
            "rationale": "The provided evidence shows low utilisation on a named render VM.",
        },
    )

    rec = recommendations.build_recommendation(_finding())

    assert rec.recommended_action == "Ask the BIM owner to stop the render worker after review."
    assert rec.rationale == "The provided evidence shows low utilisation on a named render VM."
    assert rec.estimated_monthly_savings == 80
    assert rec.estimated_carbon_reduction_kg == 28
    assert rec.risk_level == "medium"
    assert rec.safe_to_execute is False
    assert rec.ai_generated is True


def test_build_recommendation_falls_back_when_ai_unavailable(monkeypatch):
    monkeypatch.setattr(recommendations, "generate_recommendation_text", lambda finding, payload: None)

    rec = recommendations.build_recommendation(_finding())

    assert rec.recommended_action == "Stop or resize the VM after owner validation confirms it is not needed."
    assert rec.rationale == "The VM has very low CPU and network usage over the observed period."
    assert rec.ai_generated is False
