from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.events import CloudEvent


class Activity(BaseModel):
    actor: str
    action: str
    target_resource_id: str
    timestamp: datetime
    source: str = "agent"


class AgentEnrollResponse(BaseModel):
    agent_id: str
    token: str


class AgentConfigResponse(BaseModel):
    rules: list[dict[str, Any]] = Field(default_factory=list)
    agents: list[dict[str, Any]] = Field(default_factory=list)


class AgentEventsRequest(BaseModel):
    events: list[CloudEvent] = Field(default_factory=list)
    activities: list[Activity] = Field(default_factory=list)


class AgentEventsResponse(BaseModel):
    accepted: int
    created_findings: int
    duplicate_events: int
    activities_recorded: int


class AgentStatusResponse(BaseModel):
    online: bool
    last_seen: datetime | None = None
    agent_id: str | None = None
