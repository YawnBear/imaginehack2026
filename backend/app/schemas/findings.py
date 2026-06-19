from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


ReviewDecision = Literal["approved", "rejected", "deferred", "needs_more_information"]


class Recommendation(BaseModel):
    recommendation_id: str
    finding_id: str
    recommended_action: str
    rationale: str
    risk_level: str
    estimated_monthly_savings: float = 0
    estimated_carbon_reduction_kg: float = 0
    confidence: float
    agent_outputs: dict[str, Any] = Field(default_factory=dict)
    safe_to_execute: bool = False


class Finding(BaseModel):
    finding_id: str
    source_event_id: str
    resource_id: str
    resource_name: str | None = None
    resource_type: str
    owner_team: str | None = None
    issue_type: str
    category: str
    severity: str
    status: str
    rule_id: str
    evidence: dict[str, Any] = Field(default_factory=dict)
    rule_confidence: float
    ai_confidence: float = 0
    required_reviewers: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ApprovalDecision(BaseModel):
    approval_id: str
    finding_id: str
    decision: ReviewDecision
    reviewer_id: str
    reviewer_role: str
    reason: str
    created_at: datetime


class ReviewRequest(BaseModel):
    decision: ReviewDecision
    reviewer_id: str
    reviewer_role: str
    reason: str


class ReviewResponse(BaseModel):
    finding_id: str
    status: str
    required_reviewers_remaining: list[str]
    audit_id: str


class FindingDetail(BaseModel):
    finding: Finding
    recommendation: Recommendation | None = None
    approvals: list[ApprovalDecision] = Field(default_factory=list)
    audit_logs: list[Any] = Field(default_factory=list)


class FindingListResponse(BaseModel):
    items: list[Finding]
    page: int
    page_size: int
    total: int
