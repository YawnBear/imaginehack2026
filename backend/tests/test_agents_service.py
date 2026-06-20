from app.schemas import AgentCreate, AgentUpdate
from app.services.agents_service import AgentService
from app.services.store import InMemoryStore


def _service() -> AgentService:
    return AgentService(InMemoryStore())


def test_list_includes_seeds():
    assert _service().list_agents().total == 5


def test_templates_nonempty():
    templates = _service().get_templates()
    assert len(templates) >= 4
    assert any(t.template_key == "forensics_analyst" for t in templates)


def test_create_get_update_delete():
    svc = _service()
    created = svc.create_agent(
        AgentCreate(name="Data Exposure Specialist", lens="exposure", output_key="data_exposure",
                    coverage_issue_types=["public_bucket"]),
        actor_id="t",
    )
    assert created.agent_id.startswith("agent-")
    assert svc.list_agents().total == 6
    updated = svc.update_agent(created.agent_id, AgentUpdate(enabled=False), actor_id="t")
    assert updated.enabled is False
    assert svc.delete_agent(created.agent_id, actor_id="t") is True
    assert svc.delete_agent("nope", actor_id="t") is False


def test_preview_uses_lens_template():
    out = _service().preview(lens="cost", issue_type="idle_vm", tone="concise", extra_focus="")
    assert "$" in out.text  # cost lens references a sample savings number
