from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


ResourceType = Literal["bucket", "vm", "storage", "database"]


class CloudEvent(BaseModel):
    event_id: str
    provider: str = "mock"
    account_id: str
    region: str | None = None
    resource_id: str
    resource_name: str | None = None
    resource_type: ResourceType
    environment: str | None = "unknown"
    project_id: str | None = None
    owner_team: str | None = None
    timestamp: datetime
    config: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)
    cost: dict[str, Any] = Field(default_factory=dict)


class EventIngestRequest(BaseModel):
    events: list[CloudEvent]


class EventIngestResponse(BaseModel):
    accepted: int
    created_findings: int
    duplicate_events: int
