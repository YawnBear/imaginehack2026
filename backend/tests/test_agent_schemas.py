from app.schemas import Agent, AgentCreate


def test_agent_defaults():
    a = Agent(
        agent_id="ag-1",
        name="Data Exposure Specialist",
        system_prompt="You are a security analyst. Explain the exposure in one sentence.",
        output_key="data_exposure",
        created_at="2026-06-20T00:00:00Z",
    )
    assert a.enabled is True
    assert a.system_prompt.startswith("You are")
    assert a.output_key == "data_exposure"


def test_agent_create_minimal():
    payload = AgentCreate(name="My Agent", system_prompt="You are a cost analyst.")
    assert payload.name == "My Agent"
    assert payload.system_prompt == "You are a cost analyst."
    assert payload.enabled is True
