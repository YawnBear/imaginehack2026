from datetime import UTC, datetime

from app.schemas import Agent

_PROMPTS = {
    "security": "You are a cloud security analyst for a construction-tech company. Explain the exposure and data-protection risk of this finding in one or two plain sentences. Reference the evidence; never invent numbers.",
    "cost": "You are a cloud cost analyst. Explain the wasted monthly spend and the saving opportunity in one or two sentences. Do not invent figures; reference the provided estimate only.",
    "energy": "You are a sustainability analyst. Explain the estimated carbon impact of this wasted resource in one or two sentences.",
    "workflow": "You are a construction-tech workflow analyst. Explain the application or project impact and downtime risk of changing this resource in one or two sentences.",
    "audit": "You are a compliance auditor. Explain the audit-trail and approval requirements for this finding in one or two sentences.",
}
_NAMES = {
    "security": "Security Analyst",
    "cost": "Cost Optimizer",
    "energy": "Carbon Analyst",
    "workflow": "Workflow Impact",
    "audit": "Compliance Auditor",
}


def builtin_agents() -> list[Agent]:
    now = datetime.now(UTC)
    return [
        Agent(agent_id=f"agent-{key}", name=_NAMES[key], system_prompt=_PROMPTS[key],
              output_key=key, enabled=True, created_at=now)
        for key in ("security", "cost", "energy", "workflow", "audit")
    ]
