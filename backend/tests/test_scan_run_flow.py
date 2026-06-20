from datetime import UTC, datetime
from decimal import Decimal

from app.schemas import Agent, Recommendation, Rule, RuleCondition, Workflow
from app.services.governance import GovernanceService
from app.services.store import InMemoryStore


def _asset_row(**overrides):
    row = {
        "id": "asset-1",
        "asset_id": "i-render-1",
        "asset_name": "Render worker",
        "asset_type": "VM",
        "provider": "AWS",
        "cloud_account_id": "acct-1",
        "region": "ap-southeast-1",
        "environment": "development",
        "owner_team": "BIM",
        "business_service": "Rendering",
        "public_exposure": False,
        "encryption_status": "encrypted",
        "resource_status": "running",
        "utilisation_percentage": Decimal("1.8"),
        "estimated_cost": Decimal("118.40"),
        "estimated_carbon_impact": Decimal("18.72"),
        "last_scanned_at": datetime(2026, 6, 20, tzinfo=UTC),
        "installed_software": [],
        "raw_scan_payload": {
            "metrics": {
                "cpu_utilization_avg": 1.8,
                "network_in_mb_per_day_avg": 1.2,
                "network_out_mb_per_day_avg": 1.1,
            }
        },
    }
    row.update(overrides)
    return row


def _cloud_row(**overrides):
    row = {
        "id": "cloud-1",
        "provider": "AWS",
        "cloud_account_id": "acct-1",
        "event_type": "login attempt",
        "event_source": "CloudTrail",
        "asset_id": None,
        "actor_id": "arn:aws:iam::acct-1:user/alex",
        "actor_type": "IAMUser",
        "action": "ConsoleLogin",
        "event_timestamp": datetime(2026, 6, 20, tzinfo=UTC),
        "ip_address": "203.0.113.10",
        "status": "Failed",
        "raw_payload": {"awsRegion": "ap-southeast-1"},
    }
    row.update(overrides)
    return row


def test_run_scan_reads_assets_and_cloud_events_and_passes_full_context(monkeypatch):
    store = InMemoryStore()
    _add_scan_config(store)
    service = GovernanceService(store)
    asset_rows = [
        _asset_row(),
        _asset_row(id="asset-ignored", asset_id="custom-1", asset_type="custom service"),
    ]
    cloud_rows = [_cloud_row()]
    captured = []

    store.scan_source_rows = lambda: asset_rows
    store.cloud_event_source_rows = lambda: cloud_rows

    def fail_if_seeded():
        raise AssertionError("Run scan must not write to public.energy")

    store.seed_energy_snapshots = fail_if_seeded
    _add_workflow(store, "wf-idle", "RULE_IDLE_VM", ["energy"])
    _add_workflow(store, "wf-login", "RULE_FAILED_LOGIN", ["audit"])

    def fake_agent_analysis(finding, recommendation, agents, context=None):
        captured.append(
            {
                "issue_type": finding.issue_type,
                "agent_keys": [agent.output_key for agent in agents],
                "context": context,
            }
        )
        return {agent.output_key: f"{agent.output_key} analysis" for agent in agents}

    monkeypatch.setattr(
        "app.services.governance.generate_agent_analysis",
        fake_agent_analysis,
    )

    result = service.run_scan_from_database_sources()

    assert result.source_records.scanned_assets == 2
    assert result.source_records.cloud_events == 1
    assert result.accepted == 2
    assert result.created_findings == 2
    assert result.updated_findings == 0
    assert result.agent_runs == 2

    by_issue = {item["issue_type"]: item for item in captured}
    assert by_issue["idle_vm"]["agent_keys"] == ["energy"]
    assert by_issue["failed_login"]["agent_keys"] == ["audit"]
    assert len(by_issue["idle_vm"]["context"]["scanned_assets"]) == 2
    assert len(by_issue["failed_login"]["context"]["scanned_assets"]) == 2
    assert by_issue["idle_vm"]["context"]["triggering_source"]["id"] == "asset-1"
    assert by_issue["failed_login"]["context"]["triggering_source"]["id"] == "cloud-1"
    assert store.workflows["wf-idle"].last_run is not None
    assert store.workflows["wf-idle"].last_run.agent_outputs == {"energy": "energy analysis"}
    assert store.workflows["wf-login"].last_run is not None
    assert store.workflows["wf-login"].last_run.agent_outputs == {"audit": "audit analysis"}


def test_run_scan_reprocesses_seen_sources_and_updates_existing_findings(monkeypatch):
    store = InMemoryStore()
    _add_scan_config(store)
    service = GovernanceService(store)
    asset_rows = [_asset_row()]
    cloud_rows = [_cloud_row()]
    calls = []

    store.scan_source_rows = lambda: asset_rows
    store.cloud_event_source_rows = lambda: cloud_rows
    _add_workflow(store, "wf-idle", "RULE_IDLE_VM", ["energy"])
    _add_workflow(store, "wf-login", "RULE_FAILED_LOGIN", ["audit"])

    def fake_agent_analysis(finding, recommendation, agents, context=None):
        calls.append((finding.issue_type, context))
        return {agent.output_key: "analysis" for agent in agents}

    monkeypatch.setattr(
        "app.services.governance.generate_agent_analysis",
        fake_agent_analysis,
    )

    first = service.run_scan_from_database_sources()
    second = service.run_scan_from_database_sources()

    assert first.created_findings == 2
    assert second.created_findings == 0
    assert second.updated_findings == 2
    assert second.duplicate_events == 2
    assert second.agent_runs == 2
    assert len(calls) == 4


def test_run_scan_without_matching_workflows_does_not_run_agents(monkeypatch):
    store = InMemoryStore()
    _add_scan_config(store, agents=False)
    service = GovernanceService(store)
    store.scan_source_rows = lambda: [_asset_row()]
    store.cloud_event_source_rows = lambda: [_cloud_row()]

    def fail_if_called(*args, **kwargs):
        raise AssertionError("scan-time agents should be routed by workflows only")

    monkeypatch.setattr(
        "app.services.governance.generate_agent_analysis",
        fail_if_called,
    )

    result = service.run_scan_from_database_sources()

    assert result.created_findings == 2
    assert result.agent_runs == 0


def test_energy_summary_uses_operation_history_and_table_totals():
    store = InMemoryStore()
    service = GovernanceService(store)
    timestamp = datetime(2026, 6, 20, tzinfo=UTC)
    store.energy_source_summary = lambda: {
        "by_operation": {"idle VM": 18.72, "idle database": 41.82},
        "current_footprint_kg": 60.54,
        "estimated_reduction_kg": 12.5,
        "projected_footprint_kg": 48.04,
        "history": [{"label": "Jun 20", "timestamp": timestamp, "value_kg": 60.54}],
    }

    summary = service.dashboard_energy_summary()

    assert summary.by_operation == {"idle VM": 18.72, "idle database": 41.82}
    assert summary.current_footprint_kg == 60.54
    assert summary.estimated_reduction_kg == 12.5
    assert summary.projected_footprint_kg == 48.04
    assert summary.history[0].value_kg == 60.54


def test_energy_summary_defaults_reductions_to_zero_when_energy_has_none():
    store = InMemoryStore()
    service = GovernanceService(store)
    store.energy_source_summary = lambda: {
        "by_operation": {"idle VM": 20.0},
        "history": [],
    }
    store.recommendations["finding-1"] = Recommendation(
        recommendation_id="rec-1",
        finding_id="finding-1",
        recommended_action="Different fallback value",
        rationale="Should not be used when energy carries reduction data.",
        risk_level="medium",
        estimated_monthly_savings=0,
        estimated_carbon_reduction_kg=99,
        confidence=0.9,
    )

    summary = service.dashboard_energy_summary()

    assert summary.current_footprint_kg == 20.0
    assert summary.estimated_reduction_kg == 0
    assert summary.projected_footprint_kg == 20.0


def _add_workflow(store: InMemoryStore, workflow_id: str, rule_id: str, agent_keys: list[str]) -> None:
    store.workflows[workflow_id] = Workflow(
        workflow_id=workflow_id,
        name=workflow_id,
        rule_id=rule_id,
        agent_keys=agent_keys,
        created_at=datetime(2026, 6, 20, tzinfo=UTC),
    )


def _add_scan_config(store: InMemoryStore, *, agents: bool = True) -> None:
    now = datetime(2026, 6, 20, tzinfo=UTC)
    store.rules["RULE_IDLE_VM"] = Rule(
        rule_id="RULE_IDLE_VM",
        name="Idle VM",
        resource_type="vm",
        issue_type="idle_vm",
        category="cost",
        conditions=[RuleCondition(field="metrics.avg_cpu_percent_7d", operator="<=", value=10)],
        evidence_fields=["cost.monthly_usd"],
        created_at=now,
    )
    store.rules["RULE_FAILED_LOGIN"] = Rule(
        rule_id="RULE_FAILED_LOGIN",
        name="Failed Console Login",
        source_type="cloud_event",
        resource_type="identity",
        issue_type="failed_login",
        category="security",
        conditions=[
            RuleCondition(field="config.action", operator="==", value="ConsoleLogin"),
            RuleCondition(field="config.status", operator="!=", value="Success"),
        ],
        created_at=now,
    )
    if not agents:
        return
    store.agents["energy"] = Agent(
        agent_id="agent-energy",
        name="Energy",
        system_prompt="Analyze energy impact.",
        output_key="energy",
        created_at=now,
    )
    store.agents["audit"] = Agent(
        agent_id="agent-audit",
        name="Audit",
        system_prompt="Analyze audit impact.",
        output_key="audit",
        created_at=now,
    )
