from datetime import UTC, datetime

from app.schemas import CloudEvent


def demo_events() -> list[CloudEvent]:
    timestamp = datetime.now(UTC)
    return [
        CloudEvent(
            event_id="evt-public-bucket-001",
            provider="mock",
            account_id="demo-account",
            region="ap-southeast-1",
            resource_id="bucket-project-drawings",
            resource_name="Project Drawings Bucket",
            resource_type="bucket",
            environment="production",
            project_id="proj-urban-tower",
            owner_team="Document Platform",
            timestamp=timestamp,
            config={"public_access": True},
        ),
        CloudEvent(
            event_id="evt-idle-vm-001",
            provider="mock",
            account_id="demo-account",
            region="ap-southeast-1",
            resource_id="vm-render-worker-07",
            resource_name="Render Worker 07",
            resource_type="vm",
            environment="staging",
            project_id="proj-highway-audit",
            owner_team="Site Reporting",
            timestamp=timestamp,
            config={"application_id": "site-reporting-api"},
            metrics={
                "avg_cpu_percent_7d": 3.2,
                "network_in_mb_7d": 42,
                "network_out_mb_7d": 39,
            },
            cost={"monthly_usd": 96},
        ),
        CloudEvent(
            event_id="evt-unused-storage-001",
            provider="mock",
            account_id="demo-account",
            region="ap-southeast-1",
            resource_id="vol-legacy-survey-backup",
            resource_name="Legacy Survey Backup Volume",
            resource_type="storage",
            environment="production",
            project_id="proj-hospital-wing",
            owner_team="Survey Data",
            timestamp=timestamp,
            config={"attached": False, "contains_sensitive_data": True},
            metrics={"read_ops_30d": 0, "write_ops_30d": 0},
            cost={"monthly_usd": 41},
        ),
        CloudEvent(
            event_id="evt-unencrypted-db-001",
            provider="mock",
            account_id="demo-account",
            region="ap-southeast-1",
            resource_id="db-project-claims-prod",
            resource_name="Project Claims Database",
            resource_type="database",
            environment="production",
            project_id="proj-claims-system",
            owner_team="Claims Platform",
            timestamp=timestamp,
            config={
                "encrypted": False,
                "engine": "postgres",
                "application_id": "claims-system",
            },
        ),
    ]


def seed_builtin_configuration(
    store,
    *,
    rules: bool = True,
    agents: bool = True,
    workflows: bool = True,
) -> None:
    if rules:
        from app.rules.seed_rules import builtin_rules

        existing_rules = set(store.rules.keys())
        for rule in builtin_rules():
            if rule.rule_id not in existing_rules:
                store.rules[rule.rule_id] = rule
                existing_rules.add(rule.rule_id)

    if agents:
        from app.agents.seed_agents import builtin_agents

        existing_agents = set(store.agents.keys())
        for agent in builtin_agents():
            if agent.output_key not in existing_agents:
                store.agents[agent.output_key] = agent
                existing_agents.add(agent.output_key)

    if workflows:
        from app.services.seed_workflows import builtin_workflows

        existing_workflows = set(store.workflows.keys())
        for workflow in builtin_workflows():
            if workflow.workflow_id not in existing_workflows:
                store.workflows[workflow.workflow_id] = workflow
                existing_workflows.add(workflow.workflow_id)
