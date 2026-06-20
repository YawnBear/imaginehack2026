from datetime import datetime

from pydantic import BaseModel, Field


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
