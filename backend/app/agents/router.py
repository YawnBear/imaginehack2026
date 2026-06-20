"""Data-driven agent routing: which agents analyze a finding, and the
deterministic per-lens base text. The LLM (ai_client) later rewrites this text;
the numbers always come from the rules."""

from typing import Any, Callable

from app.schemas import Agent, Finding, Recommendation


def issue_label(issue_type: str) -> str:
    return issue_type.replace("_", " ").title()


def select_agents(finding: Finding, agents: list[Agent]) -> list[Agent]:
    """Enabled agents whose coverage matches the finding's category or issue_type."""
    picked = [
        agent
        for agent in agents
        if agent.enabled
        and (
            finding.category in agent.coverage_categories
            or finding.issue_type in agent.coverage_issue_types
        )
    ]
    picked.sort(key=lambda a: a.created_at)
    return picked


def _exposure(f: Finding, r: Recommendation) -> str:
    return (
        f"{issue_label(f.issue_type)} on {f.resource_id} is a {f.severity} exposure / "
        "data-protection risk. Validate intended access before any change."
    )


def _encryption(f: Finding, r: Recommendation) -> str:
    return (
        f"{f.resource_id} is not encrypted at rest — a compliance and data-protection "
        "risk. Plan encryption in an approved maintenance window."
    )


def _cost(f: Finding, r: Recommendation) -> str:
    return (
        f"Estimated monthly waste on {f.resource_id} is about ${r.estimated_monthly_savings}. "
        "Confirm the resource is unused before reclaiming it."
    )


def _carbon(f: Finding, r: Recommendation) -> str:
    return (
        f"Reclaiming {f.resource_id} avoids roughly {r.estimated_carbon_reduction_kg} kg CO2e "
        "per month (estimate)."
    )


def _compliance(f: Finding, r: Recommendation) -> str:
    return (
        f"{issue_label(f.issue_type)} needs a full audit trail and the listed approvals "
        "before any remediation is recorded."
    )


def _workflow(f: Finding, r: Recommendation) -> str:
    return (
        f"Check application ownership and downtime impact for {f.resource_id} before "
        "changing it — it may support an active project workflow."
    )


def _forensics(f: Finding, r: Recommendation) -> str:
    return (
        f"Trace who changed {f.resource_id} and when from the activity history before "
        "deciding on remediation."
    )


LENS_TEMPLATES: dict[str, Callable[[Finding, Recommendation], str]] = {
    "exposure": _exposure,
    "encryption": _encryption,
    "cost": _cost,
    "carbon": _carbon,
    "compliance": _compliance,
    "workflow": _workflow,
    "forensics": _forensics,
}


def build_agent_outputs(
    finding: Finding, recommendation: Recommendation, agents: list[Agent]
) -> dict[str, str]:
    """Deterministic per-agent base text, keyed by each selected agent's output_key."""
    outputs: dict[str, Any] = {}
    for agent in select_agents(finding, agents):
        template = LENS_TEMPLATES.get(agent.lens)
        if template is None:
            continue
        outputs[agent.output_key] = template(finding, recommendation)
    return outputs
