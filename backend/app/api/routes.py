from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.schemas import (
    AuditLogListResponse,
    DashboardSummary,
    EventIngestRequest,
    EventIngestResponse,
    Finding,
    FindingDetail,
    FindingListResponse,
    HealthResponse,
    ReviewRequest,
    ReviewResponse,
)
from app.services.dependencies import get_governance_service
from app.services.governance import GovernanceService

router = APIRouter()


@router.get("/healthz", response_model=HealthResponse, tags=["health"])
def healthz(service: GovernanceService = Depends(get_governance_service)) -> HealthResponse:
    return HealthResponse(
        status="ok",
        database="in_memory",
        seeded=service.has_events,
    )


@router.post(
    "/api/events/ingest",
    response_model=EventIngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["events"],
)
def ingest_events(
    payload: EventIngestRequest,
    service: GovernanceService = Depends(get_governance_service),
) -> EventIngestResponse:
    return service.ingest_events(payload.events, actor_id="api-ingest")


@router.get("/api/findings", response_model=FindingListResponse, tags=["findings"])
def list_findings(
    severity: str | None = None,
    category: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    resource_type: str | None = None,
    owner_team: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    service: GovernanceService = Depends(get_governance_service),
) -> FindingListResponse:
    return service.list_findings(
        severity=severity,
        category=category,
        status=status_filter,
        resource_type=resource_type,
        owner_team=owner_team,
        page=page,
        page_size=page_size,
    )


@router.get("/api/findings/{finding_id}", response_model=FindingDetail, tags=["findings"])
def get_finding(
    finding_id: str,
    service: GovernanceService = Depends(get_governance_service),
) -> FindingDetail:
    detail = service.get_finding_detail(finding_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return detail


@router.patch(
    "/api/findings/{finding_id}/review",
    response_model=ReviewResponse,
    tags=["findings"],
)
def review_finding(
    finding_id: str,
    payload: ReviewRequest,
    service: GovernanceService = Depends(get_governance_service),
) -> ReviewResponse:
    try:
        return service.review_finding(finding_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Finding not found") from exc


@router.get("/api/dashboard/summary", response_model=DashboardSummary, tags=["dashboard"])
def dashboard_summary(
    service: GovernanceService = Depends(get_governance_service),
) -> DashboardSummary:
    return service.dashboard_summary()


@router.get("/api/audit-logs", response_model=AuditLogListResponse, tags=["audit"])
def list_audit_logs(
    entity_type: str | None = None,
    entity_id: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    service: GovernanceService = Depends(get_governance_service),
) -> AuditLogListResponse:
    return service.list_audit_logs(
        entity_type=entity_type,
        entity_id=entity_id,
        page=page,
        page_size=page_size,
    )


@router.post("/api/demo/seed", response_model=EventIngestResponse, tags=["demo"])
def seed_demo_events(
    service: GovernanceService = Depends(get_governance_service),
) -> EventIngestResponse:
    return service.ingest_events_from_seed()
