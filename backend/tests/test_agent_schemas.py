from app.schemas import Agent, AgentCreate


def test_agent_defaults():
    a = Agent(
        agent_id="ag-1",
        name="Data Exposure Specialist",
        lens="exposure",
        output_key="data_exposure",
        created_at="2026-06-20T00:00:00Z",
    )
    assert a.enabled is True
    assert a.coverage_categories == []
    assert a.coverage_issue_types == []
    assert a.tone == "concise"
    assert a.extra_focus == ""


def test_agent_create_minimal():
    payload = AgentCreate(name="My Agent", lens="cost", output_key="my_agent")
    assert payload.lens == "cost"
    assert payload.template_key == "custom"
