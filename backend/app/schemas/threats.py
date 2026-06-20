from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ResponseMode = Literal["monitor", "manual", "auto"]
CommandStatus = Literal["queued", "in_progress", "completed", "failed"]


class TimelineEntry(BaseModel):
    actor: str
    action: str
    target_resource_id: str
    timestamp: datetime
    note: str = ""


class ThreatReport(BaseModel):
    report_id: str
    finding_id: str
    criticality_score: int
    criticality_factors: dict[str, int] = Field(default_factory=dict)
    summary: str
    timeline: list[TimelineEntry] = Field(default_factory=list)
    recommended_solution: str
    agent_sections: dict[str, str] = Field(default_factory=dict)
    approval_status: str
    ai_generated: bool = False
    generated_at: datetime


class ThreatListResponse(BaseModel):
    items: list[ThreatReport]
    total: int


class ResponsePolicy(BaseModel):
    default_mode: ResponseMode = "auto"
    auto_threshold: int = 75
    notify: list[str] = Field(default_factory=list)


class ResponsePolicyUpdate(BaseModel):
    default_mode: ResponseMode | None = None
    auto_threshold: int | None = None
    notify: list[str] | None = None


class RemediationCommand(BaseModel):
    command_id: str
    finding_id: str
    resource_id: str = ""
    action_key: str
    destructive: bool
    status: CommandStatus = "queued"
    approved_by: list[str] = Field(default_factory=list)
    result: str = ""
    created_at: datetime
    executed_at: datetime | None = None


class CommandListResponse(BaseModel):
    items: list[RemediationCommand]
    total: int
