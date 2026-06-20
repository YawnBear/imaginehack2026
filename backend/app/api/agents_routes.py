from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas import Agent, AgentCreate, AgentListResponse, AgentUpdate
from app.services.agents_service import AgentService
from app.services.dependencies import get_agent_service

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("", response_model=AgentListResponse)
def list_agents(service: AgentService = Depends(get_agent_service)) -> AgentListResponse:
    return service.list_agents()


@router.post("", response_model=Agent, status_code=status.HTTP_201_CREATED)
def create_agent(payload: AgentCreate, service: AgentService = Depends(get_agent_service)) -> Agent:
    return service.create_agent(payload, actor_id="dashboard")


@router.get("/{agent_id}", response_model=Agent)
def get_agent(agent_id: str, service: AgentService = Depends(get_agent_service)) -> Agent:
    agent = service.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=Agent)
def update_agent(agent_id: str, payload: AgentUpdate, service: AgentService = Depends(get_agent_service)) -> Agent:
    updated = service.update_agent(agent_id, payload, actor_id="dashboard")
    if updated is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return updated


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(agent_id: str, service: AgentService = Depends(get_agent_service)) -> None:
    if not service.delete_agent(agent_id, actor_id="dashboard"):
        raise HTTPException(status_code=404, detail="Agent not found")
