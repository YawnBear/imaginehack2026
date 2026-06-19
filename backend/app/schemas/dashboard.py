from datetime import datetime

from pydantic import BaseModel, Field


class DashboardSummary(BaseModel):
    active_findings: int
    critical_findings: int
    pending_approvals: int
    approved_actions: int
    estimated_monthly_savings: float
    estimated_carbon_reduction_kg: float
    latest_scan_at: datetime | None = None
    findings_by_category: dict[str, int] = Field(default_factory=dict)
    findings_by_severity: dict[str, int] = Field(default_factory=dict)
