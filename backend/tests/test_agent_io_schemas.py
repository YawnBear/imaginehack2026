from app.schemas import AgentConfigResponse, AgentEventsRequest, AgentStatusResponse, Activity, RemediationCommand


def test_command_has_resource_id():
    c = RemediationCommand(command_id="c1", finding_id="f1", resource_id="bucket-x",
                           action_key="restrict_public_access", destructive=False,
                           created_at="2026-06-20T00:00:00Z")
    assert c.resource_id == "bucket-x"


def test_activity_and_io_models():
    a = Activity(actor="jane", action="set_public", target_resource_id="b", timestamp="2026-06-20T00:00:00Z")
    assert a.source == "agent"
    req = AgentEventsRequest(events=[], activities=[a])
    assert len(req.activities) == 1
    status = AgentStatusResponse(online=True, last_seen="2026-06-20T00:00:00Z", agent_id="ag-1")
    assert status.online is True
