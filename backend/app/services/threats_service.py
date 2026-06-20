from app.schemas import ThreatReport
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
            finding,
            rec,
            self._event_for(finding),
            self.store.audit_logs,
            finding.status,
            use_ai_summary=True,
        )
        self.store.threat_reports[finding_id] = report
        return report

    def get(self, finding_id: str) -> ThreatReport | None:
        return self.store.threat_reports.get(finding_id) or self.generate(finding_id)
