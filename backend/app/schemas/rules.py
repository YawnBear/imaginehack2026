from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

ConditionOperator = Literal[
    "==", "!=", "<", "<=", ">", ">=", "in", "not_in", "exists", "contains"
]
RuleMode = Literal["monitor", "manual", "auto"]
RuleResourceType = Literal["bucket", "vm", "storage", "database"]
RuleSeverity = Literal["critical", "high", "medium", "low"]
RuleCategory = Literal["security", "cost", "energy", "workflow", "audit"]


class RuleCondition(BaseModel):
    field: str  # dot-path: config.public_access, metrics.avg_cpu_percent_7d, environment
    operator: ConditionOperator
    value: Any = None  # not required for the "exists" operator


class Rule(BaseModel):
    rule_id: str
    name: str
    enabled: bool = True
    template_key: str = "custom"
    resource_type: RuleResourceType
    conditions: list[RuleCondition] = Field(default_factory=list)
    severity_base: RuleSeverity = "medium"
    escalate_in_prod: bool = False
    rule_confidence: float = 0.85
    category: RuleCategory = "security"
    issue_type: str
    required_reviewers: list[str] = Field(default_factory=list)
    evidence_fields: list[str] = Field(default_factory=list)
    remediation_action_key: str = "tag_resource"
    remediation_destructive: bool = False
    mode: RuleMode = "manual"
    auto_threshold: int | None = None
    created_at: datetime


class RuleCreate(BaseModel):
    name: str
    enabled: bool = True
    template_key: str = "custom"
    resource_type: RuleResourceType
    conditions: list[RuleCondition] = Field(default_factory=list)
    severity_base: RuleSeverity = "medium"
    escalate_in_prod: bool = False
    rule_confidence: float = 0.85
    category: RuleCategory = "security"
    issue_type: str
    required_reviewers: list[str] = Field(default_factory=list)
    evidence_fields: list[str] = Field(default_factory=list)
    remediation_action_key: str = "tag_resource"
    remediation_destructive: bool = False
    mode: RuleMode = "manual"
    auto_threshold: int | None = None


class RuleUpdate(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    resource_type: RuleResourceType | None = None
    conditions: list[RuleCondition] | None = None
    severity_base: RuleSeverity | None = None
    escalate_in_prod: bool | None = None
    rule_confidence: float | None = None
    category: RuleCategory | None = None
    issue_type: str | None = None
    required_reviewers: list[str] | None = None
    evidence_fields: list[str] | None = None
    remediation_action_key: str | None = None
    remediation_destructive: bool | None = None
    mode: RuleMode | None = None
    auto_threshold: int | None = None


class RuleListResponse(BaseModel):
    items: list[Rule]
    total: int


class RuleTemplate(BaseModel):
    template_key: str
    name: str
    description: str
    resource_type: RuleResourceType
    conditions: list[RuleCondition] = Field(default_factory=list)
    severity_base: RuleSeverity = "medium"
    escalate_in_prod: bool = False
    rule_confidence: float = 0.85
    category: RuleCategory = "security"
    issue_type: str
    required_reviewers: list[str] = Field(default_factory=list)
    evidence_fields: list[str] = Field(default_factory=list)
    remediation_action_key: str = "tag_resource"
    remediation_destructive: bool = False


class ClashWarning(BaseModel):
    rule_id_a: str
    rule_id_b: str
    resource_type: str
    field: str
    message: str


class RulePreviewRequest(BaseModel):
    resource_type: RuleResourceType
    conditions: list[RuleCondition] = Field(default_factory=list)


class RulePreviewResponse(BaseModel):
    match_count: int
    matched_resource_ids: list[str]
