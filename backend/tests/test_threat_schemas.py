from app.schemas import ResponsePolicy, RemediationCommand, ThreatReport, TimelineEntry


def test_policy_defaults():
    p = ResponsePolicy()
    assert p.default_mode == "auto"
    assert p.auto_threshold == 75


def test_threat_report_minimal():
    r = ThreatReport(report_id="t1", finding_id="f1", criticality_score=90, summary="s",
                     recommended_solution="do x", approval_status="pending_review",
                     generated_at="2026-06-20T00:00:00Z")
    assert r.criticality_score == 90
    assert r.agent_sections == {}


def test_command_defaults():
    c = RemediationCommand(command_id="c1", finding_id="f1", action_key="stop_vm",
                           destructive=True, created_at="2026-06-20T00:00:00Z")
    assert c.status == "queued"
    assert c.approved_by == []
