from pydantic import BaseModel, Field


class WorkflowRunRequest(BaseModel):
    rule_id: str
    agent_keys: list[str] = Field(default_factory=list)


class WorkflowRunResponse(BaseModel):
    summary: str
    agent_outputs: dict[str, str] = Field(default_factory=dict)
    ai_generated: bool = False
    finding_preview: dict = Field(default_factory=dict)
    synthetic: bool = False
