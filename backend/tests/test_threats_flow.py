from datetime import UTC, datetime

from app.schemas import Finding
from app.services.store import InMemoryStore
from app.services.threats_service import ThreatService


def _store_with_finding():
    store = InMemoryStore()
    finding = Finding(
        finding_id="finding-1",
        source_event_id="event-1",
        resource_id="bucket-1",
        resource_type="bucket",
        issue_type="public_bucket",
        category="security",
        severity="critical",
        status="pending_review",
        rule_id="rule-1",
        evidence={"public_access": True},
        rule_confidence=0.9,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    store.findings[finding.finding_id] = finding
    return store


def test_store_has_threat_collections():
    store = InMemoryStore()
    assert store.threat_reports == {}


def test_threat_service_generate_on_demand():
    store = _store_with_finding()
    svc = ThreatService(store)
    finding_id = next(iter(store.findings))
    report = svc.generate(finding_id)
    assert report is not None
    assert report.finding_id == finding_id


def test_threat_service_generates_ai_summary_override(monkeypatch):
    monkeypatch.setattr(
        "app.threats.report.generate_threat_summary",
        lambda finding, recommendation, event, score, factors: "AI service summary.",
    )
    store = _store_with_finding()
    svc = ThreatService(store)
    finding_id = next(iter(store.findings))

    report = svc.generate(finding_id)

    assert report is not None
    assert report.summary == "AI service summary."
    assert report.ai_generated is True
