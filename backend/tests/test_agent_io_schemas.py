from app.schemas import AgentEventsRequest, AgentStatusResponse, Activity


def test_activity_and_io_models():
    a = Activity(actor="jane", action="set_public", target_resource_id="b", timestamp="2026-06-20T00:00:00Z")
    assert a.source == "agent"
    req = AgentEventsRequest(events=[], activities=[a])
    assert len(req.activities) == 1
    status = AgentStatusResponse(online=True, last_seen="2026-06-20T00:00:00Z", agent_id="ag-1")
    assert status.online is True
