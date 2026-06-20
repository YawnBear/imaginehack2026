from app.services.governance import GovernanceService
from app.services.seed import demo_events, seed_builtin_configuration
from app.services.store import InMemoryStore
from app.services.threats_service import ThreatService


def _seeded():
    store = InMemoryStore()
    seed_builtin_configuration(store, agents=False, workflows=False)
    GovernanceService(store).ingest_events(demo_events(), actor_id="t")
    return store


def test_store_has_threat_collections():
    store = InMemoryStore()
    assert store.threat_reports == {}


def test_threat_service_generate_on_demand():
    store = _seeded()
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
    store = _seeded()
    svc = ThreatService(store)
    finding_id = next(iter(store.findings))

    report = svc.generate(finding_id)

    assert report is not None
    assert report.summary == "AI service summary."
    assert report.ai_generated is True
