from datetime import datetime

from pydantic import BaseModel, Field


class WorkflowRun(BaseModel):
    """Persisted result of the last Run-all for one workflow."""
    ran_at: datetime | None = None
    finding_count: int = 0
    summary: str = ""
    agent_outputs: dict[str, str] = Field(default_factory=dict)
    ai_generated: bool = False


class Workflow(BaseModel):
    workflow_id: str
    name: str
    rule_id: str
    agent_keys: list[str] = Field(default_factory=list)
    created_at: datetime
    last_run: WorkflowRun | None = None


class WorkflowCreate(BaseModel):
    name: str
    rule_id: str
    agent_keys: list[str] = Field(default_factory=list)


class WorkflowUpdate(BaseModel):
    name: str | None = None
    rule_id: str | None = None
    agent_keys: list[str] | None = None


class WorkflowListResponse(BaseModel):
    items: list[Workflow]
    total: int


class WorkflowRunAllResponse(BaseModel):
    scanned_findings: int
    workflows: list[Workflow]
