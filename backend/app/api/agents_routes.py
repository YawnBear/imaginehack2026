from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas import (
    Agent,
    AgentCreate,
    AgentListResponse,
    AgentPreviewRequest,
    AgentPreviewResponse,
    AgentTemplate,
    AgentUpdate,
)
from app.services.agents_service import AgentService
from app.services.dependencies import get_agent_service

router = APIRouter(prefix="/api/agents", tags=["agents"])


# Literal paths before the /{agent_id} catch-all.
@router.get("/templates", response_model=list[AgentTemplate])
def list_templates(service: AgentService = Depends(get_agent_service)) -> list[AgentTemplate]:
    return service.get_templates()


@router.post("/preview", response_model=AgentPreviewResponse)
def preview_agent(
    payload: AgentPreviewRequest,
    service: AgentService = Depends(get_agent_service),
) -> AgentPreviewResponse:
    return service.preview(payload.lens, payload.issue_type, payload.tone, payload.extra_focus)


@router.get("", response_model=AgentListResponse)
def list_agents(service: AgentService = Depends(get_agent_service)) -> AgentListResponse:
    return service.list_agents()


@router.post("", response_model=Agent, status_code=status.HTTP_201_CREATED)
def create_agent(
    payload: AgentCreate,
    service: AgentService = Depends(get_agent_service),
) -> Agent:
    return service.create_agent(payload, actor_id="dashboard")


@router.get("/{agent_id}", response_model=Agent)
def get_agent(agent_id: str, service: AgentService = Depends(get_agent_service)) -> Agent:
    agent = service.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=Agent)
def update_agent(
    agent_id: str,
    payload: AgentUpdate,
    service: AgentService = Depends(get_agent_service),
) -> Agent:
    updated = service.update_agent(agent_id, payload, actor_id="dashboard")
    if updated is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return updated


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(agent_id: str, service: AgentService = Depends(get_agent_service)) -> None:
    if not service.delete_agent(agent_id, actor_id="dashboard"):
        raise HTTPException(status_code=404, detail="Agent not found")
