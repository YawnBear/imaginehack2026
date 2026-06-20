from app.schemas import ReviewRequest
from app.services.governance import GovernanceService
from app.services.seed import demo_events
from app.services.store import InMemoryStore
from app.services.threats_service import ThreatService


def _seeded():
    store = InMemoryStore()
    GovernanceService(store).ingest_events(demo_events(), actor_id="t")
    return store


def test_store_has_threat_collections():
    store = InMemoryStore()
    assert store.threat_reports == {}
    assert store.commands == {}
    assert store.policy.default_mode == "auto"


def test_auto_escalation_generates_reports_for_critical():
    store = _seeded()
    # public_bucket (95) and unencrypted_database (75) are >= 75 threshold.
    scores = sorted(r.criticality_score for r in store.threat_reports.values())
    assert len(store.threat_reports) == 2
    assert scores == [75, 95]


def test_monitor_mode_suppresses_auto_reports():
    store = InMemoryStore()
    store.policy = store.policy.model_copy(update={"default_mode": "monitor"})
    GovernanceService(store).ingest_events(demo_events(), actor_id="t")
    assert store.threat_reports == {}


def test_threat_service_generate_on_demand():
    store = _seeded()
    svc = ThreatService(store)
    finding_id = next(iter(store.findings))
    report = svc.generate(finding_id)
    assert report is not None
    assert report.finding_id == finding_id


def test_full_approval_queues_remediation_command():
    store = _seeded()
    gov = GovernanceService(store)
    # pick the public_bucket finding (reviewers: security, devops)
    fid = next(f.finding_id for f in store.findings.values() if f.issue_type == "public_bucket")
    gov.review_finding(fid, ReviewRequest(decision="approved", reviewer_id="u1", reviewer_role="security", reason="ok"))
    assert not store.commands  # not all reviewers yet
    gov.review_finding(fid, ReviewRequest(decision="approved", reviewer_id="u2", reviewer_role="devops", reason="ok"))
    cmds = [c for c in store.commands.values() if c.finding_id == fid]
    assert len(cmds) == 1
    assert cmds[0].action_key == "restrict_public_access"
    assert cmds[0].status == "queued"
