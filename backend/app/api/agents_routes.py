from fastapi import APIRouter, Depends, HTTPException, status

from app.agents import ai_client
from app.core.config import get_settings
from app.schemas import (
    Agent,
    AgentCreate,
    AgentGenerateRequest,
    AgentGenerateResponse,
    AgentListResponse,
    AgentUpdate,
)
from app.services.agents_service import AgentService
from app.services.dependencies import get_agent_service

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("", response_model=AgentListResponse)
def list_agents(service: AgentService = Depends(get_agent_service)) -> AgentListResponse:
    return service.list_agents()


@router.post("", response_model=Agent, status_code=status.HTTP_201_CREATED)
def create_agent(payload: AgentCreate, service: AgentService = Depends(get_agent_service)) -> Agent:
    return service.create_agent(payload, actor_id="dashboard")


@router.post("/generate", response_model=AgentGenerateResponse)
def generate_agent(payload: AgentGenerateRequest) -> AgentGenerateResponse:
    """Conversationally draft a SafeCloud-native agent system prompt from NLP.

    Reuses the OpenAI-compatible AI client (apikey.fun proxy -> claude-opus-4-8).
    Degrades gracefully: returns ``ai_enabled=False`` with a friendly message when
    no AI key is configured, so the UI can fall back to manual entry.
    """
    if not get_settings().ai_enabled:
        return AgentGenerateResponse(
            reply=(
                "AI generation is off because no AI key is configured on the backend. "
                "You can still write the system prompt yourself in Manual mode."
            ),
            name="",
            system_prompt="",
            ai_enabled=False,
        )
    draft = ai_client.generate_subagent_draft(
        payload.messages, payload.current_name, payload.current_system_prompt
    )
    if draft is None:
        return AgentGenerateResponse(
            reply=(
                "Sorry — I couldn't generate a prompt just now. Please try again, "
                "or switch to Manual mode to write it yourself."
            ),
            name="",
            system_prompt="",
            ai_enabled=True,
        )
    return AgentGenerateResponse(
        reply=draft["reply"],
        name=draft["name"],
        system_prompt=draft["system_prompt"],
        ai_enabled=True,
    )


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
