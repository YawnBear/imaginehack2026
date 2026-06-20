from app.schemas import ThreatReport


def test_threat_report_minimal():
    r = ThreatReport(report_id="t1", finding_id="f1", criticality_score=90, summary="s",
                     recommended_solution="do x", approval_status="pending_review",
                     generated_at="2026-06-20T00:00:00Z")
    assert r.criticality_score == 90
    assert r.agent_sections == {}
