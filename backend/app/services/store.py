from datetime import datetime

from app.schemas import ApprovalDecision, AuditLog, CloudEvent, Finding, Recommendation
from app.schemas import Activity, Agent, Rule, ThreatReport, Workflow
from app.rules.seed_rules import builtin_rules
from app.agents.seed_agents import builtin_agents


class InMemoryStore:
    def __init__(self) -> None:
        self.events: dict[str, CloudEvent] = {}
        self.findings: dict[str, Finding] = {}
        self.recommendations: dict[str, Recommendation] = {}
        self.approvals: dict[str, ApprovalDecision] = {}
        self.audit_logs: list[AuditLog] = []
        self.latest_scan_at: datetime | None = None
        self.rules: dict[str, Rule] = {rule.rule_id: rule for rule in builtin_rules()}
        self.agents: dict[str, Agent] = {agent.output_key: agent for agent in builtin_agents()}
        self.threat_reports: dict[str, ThreatReport] = {}
        self.workflows: dict[str, Workflow] = {}
        self.activities: list[Activity] = []
        self.agent_last_seen: datetime | None = None
        self.agent_id: str | None = None

    def find_active_duplicate(self, resource_id: str, issue_type: str) -> Finding | None:
        for finding in self.findings.values():
            if (
                finding.resource_id == resource_id
                and finding.issue_type == issue_type
                and finding.status not in {"rejected", "action_completed"}
            ):
                return finding
        return None
