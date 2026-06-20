from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


ResourceType = str
SourceType = Literal["asset_scan", "cloud_event"]


class CloudEvent(BaseModel):
    event_id: str
    source_type: SourceType = "asset_scan"
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


class SourceRecordCounts(BaseModel):
    cloud_events: int = 0
    scanned_assets: int = 0


class EventIngestResponse(BaseModel):
    accepted: int
    created_findings: int
    duplicate_events: int
    updated_findings: int = 0
    agent_runs: int = 0
    source_records: SourceRecordCounts = Field(default_factory=SourceRecordCounts)
