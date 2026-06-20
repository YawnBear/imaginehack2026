from datetime import datetime

from pydantic import BaseModel


class Agent(BaseModel):
    agent_id: str
    name: str
    system_prompt: str
    output_key: str  # slug of name; keys recommendation.agent_outputs
    enabled: bool = True
    created_at: datetime


class AgentCreate(BaseModel):
    name: str
    system_prompt: str
    enabled: bool = True


class AgentUpdate(BaseModel):
    name: str | None = None
    system_prompt: str | None = None
    enabled: bool | None = None


class AgentListResponse(BaseModel):
    items: list[Agent]
    total: int
