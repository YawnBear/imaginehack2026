from app.schemas import AgentTemplate

AGENT_TEMPLATES: list[AgentTemplate] = [
    AgentTemplate(
        template_key="security_analyst",
        name="Security Analyst",
        description="Explains exposure and data-protection risk on security findings.",
        lens="exposure",
        output_key="security",
        coverage_categories=["security"],
        tone="construction-aware",
    ),
    AgentTemplate(
        template_key="compliance_auditor",
        name="Compliance Auditor",
        description="Checks audit trail and approval readiness.",
        lens="compliance",
        output_key="audit",
        coverage_issue_types=["public_bucket", "unused_storage", "unencrypted_database"],
        tone="detailed",
    ),
    AgentTemplate(
        template_key="cost_optimizer",
        name="Cost Optimizer",
        description="Estimates and explains monthly cloud waste.",
        lens="cost",
        output_key="cost",
        coverage_categories=["cost"],
        tone="executive",
    ),
    AgentTemplate(
        template_key="carbon_analyst",
        name="Carbon Analyst",
        description="Explains the estimated carbon impact of reclaiming a resource.",
        lens="carbon",
        output_key="energy",
        coverage_issue_types=["idle_vm", "unused_storage"],
        tone="concise",
    ),
    AgentTemplate(
        template_key="forensics_analyst",
        name="Forensics Analyst",
        description="Traces who changed a resource and when from the activity history.",
        lens="forensics",
        output_key="forensics",
        coverage_categories=["security"],
        tone="detailed",
    ),
    AgentTemplate(
        template_key="custom",
        name="Custom Agent",
        description="Start from scratch — pick a lens and coverage.",
        lens="exposure",
        output_key="custom_agent",
        tone="concise",
    ),
]


def get_agent_templates() -> list[AgentTemplate]:
    return AGENT_TEMPLATES
