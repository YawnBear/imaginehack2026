from app.schemas import (
    CommandListResponse,
    ResponsePolicy,
    ResponsePolicyUpdate,
    ThreatListResponse,
    ThreatReport,
)
from app.services.store import InMemoryStore
from app.threats.report import build_threat_report


class ThreatService:
    def __init__(self, store: InMemoryStore) -> None:
        self.store = store

    def _event_for(self, finding):
        return self.store.events.get(finding.source_event_id)

    def generate(self, finding_id: str) -> ThreatReport | None:
        finding = self.store.findings.get(finding_id)
        if finding is None:
            return None
        rec = self.store.recommendations.get(finding_id)
        report = build_threat_report(
            finding, rec, self._event_for(finding), self.store.audit_logs, finding.status
        )
        self.store.threat_reports[finding_id] = report
        return report

    def get(self, finding_id: str) -> ThreatReport | None:
        return self.store.threat_reports.get(finding_id) or self.generate(finding_id)

    def list_reports(self) -> ThreatListResponse:
        items = sorted(
            self.store.threat_reports.values(),
            key=lambda r: r.criticality_score,
            reverse=True,
        )
        return ThreatListResponse(items=items, total=len(items))

    def get_policy(self) -> ResponsePolicy:
        return self.store.policy

    def update_policy(self, payload: ResponsePolicyUpdate) -> ResponsePolicy:
        updates = payload.model_dump(exclude_unset=True)
        self.store.policy = self.store.policy.model_copy(update=updates)
        return self.store.policy

    def list_commands(self) -> CommandListResponse:
        items = sorted(
            self.store.commands.values(), key=lambda c: c.created_at, reverse=True
        )
        return CommandListResponse(items=items, total=len(items))
