from app.schemas import AgentCreate, AgentUpdate
from app.services.agents_service import AgentService
from app.services.store import InMemoryStore


def _service() -> AgentService:
    return AgentService(InMemoryStore())


def test_list_includes_seeds():
    assert _service().list_agents().total == 5


def test_create_get_update_delete():
    svc = _service()
    created = svc.create_agent(
        AgentCreate(name="Data Exposure Specialist",
                    system_prompt="You are a data exposure specialist."),
        actor_id="t",
    )
    assert created.agent_id.startswith("agent-")
    assert created.output_key == "data_exposure_specialist"
    assert created.system_prompt == "You are a data exposure specialist."
    assert svc.get_agent(created.agent_id).agent_id == created.agent_id
    assert svc.list_agents().total == 6
    updated = svc.update_agent(created.agent_id, AgentUpdate(enabled=False), actor_id="t")
    assert updated.enabled is False
    assert updated.output_key == "data_exposure_specialist"  # immutable
    assert svc.delete_agent(created.agent_id, actor_id="t") is True
    assert svc.delete_agent("nope", actor_id="t") is False
