from datetime import UTC, datetime

from app.schemas import Agent


def builtin_agents() -> list[Agent]:
    now = datetime.now(UTC)
    return [
        Agent(
            agent_id="agent-security",
            name="Security Analyst",
            lens="exposure",
            output_key="security",
            coverage_categories=["security"],
            coverage_issue_types=[],
            tone="construction-aware",
            template_key="security_analyst",
            created_at=now,
        ),
        Agent(
            agent_id="agent-cost",
            name="Cost Optimizer",
            lens="cost",
            output_key="cost",
            coverage_categories=["cost"],
            coverage_issue_types=[],
            tone="executive",
            template_key="cost_optimizer",
            created_at=now,
        ),
        Agent(
            agent_id="agent-energy",
            name="Carbon Analyst",
            lens="carbon",
            output_key="energy",
            coverage_categories=[],
            coverage_issue_types=["idle_vm", "unused_storage"],
            tone="concise",
            template_key="carbon_analyst",
            created_at=now,
        ),
        Agent(
            agent_id="agent-workflow",
            name="Workflow Impact",
            lens="workflow",
            output_key="workflow",
            coverage_categories=[],
            coverage_issue_types=["public_bucket", "idle_vm", "unencrypted_database"],
            tone="construction-aware",
            template_key="workflow_impact",
            created_at=now,
        ),
        Agent(
            agent_id="agent-audit",
            name="Compliance Auditor",
            lens="compliance",
            output_key="audit",
            coverage_categories=[],
            coverage_issue_types=["public_bucket", "unused_storage", "unencrypted_database"],
            tone="detailed",
            template_key="compliance_auditor",
            created_at=now,
        ),
    ]
