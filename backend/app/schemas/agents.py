from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

AgentLens = Literal[
    "exposure", "encryption", "cost", "carbon", "compliance", "workflow", "forensics"
]
AgentTone = Literal["concise", "detailed", "executive", "construction-aware"]


class Agent(BaseModel):
    agent_id: str
    name: str
    enabled: bool = True
    lens: AgentLens
    output_key: str  # the key used in recommendation.agent_outputs (e.g. "security")
    coverage_categories: list[str] = Field(default_factory=list)
    coverage_issue_types: list[str] = Field(default_factory=list)
    tone: AgentTone = "concise"
    extra_focus: str = ""
    template_key: str = "custom"
    created_at: datetime


class AgentCreate(BaseModel):
    name: str
    lens: AgentLens
    output_key: str
    enabled: bool = True
    coverage_categories: list[str] = Field(default_factory=list)
    coverage_issue_types: list[str] = Field(default_factory=list)
    tone: AgentTone = "concise"
    extra_focus: str = ""
    template_key: str = "custom"


class AgentUpdate(BaseModel):
    # NOTE: output_key is intentionally NOT updatable. The store is keyed by
    # output_key, so allowing a rename would let a PATCH collide with (and
    # silently clobber) another agent. output_key is immutable post-create.
    name: str | None = None
    lens: AgentLens | None = None
    enabled: bool | None = None
    coverage_categories: list[str] | None = None
    coverage_issue_types: list[str] | None = None
    tone: AgentTone | None = None
    extra_focus: str | None = None


class AgentListResponse(BaseModel):
    items: list[Agent]
    total: int


class AgentTemplate(BaseModel):
    template_key: str
    name: str
    description: str
    lens: AgentLens
    output_key: str
    coverage_categories: list[str] = Field(default_factory=list)
    coverage_issue_types: list[str] = Field(default_factory=list)
    tone: AgentTone = "concise"
    extra_focus: str = ""


class AgentPreviewRequest(BaseModel):
    lens: AgentLens
    issue_type: str = "public_bucket"
    tone: AgentTone = "concise"
    extra_focus: str = ""


class AgentPreviewResponse(BaseModel):
    text: str
