from fastapi import APIRouter, Depends, HTTPException

from app.schemas import (
    CommandListResponse,
    ResponsePolicy,
    ResponsePolicyUpdate,
    ThreatListResponse,
    ThreatReport,
)
from app.services.dependencies import get_threat_service
from app.services.threats_service import ThreatService

router = APIRouter(tags=["threats"])


@router.get("/api/threats", response_model=ThreatListResponse)
def list_threats(service: ThreatService = Depends(get_threat_service)) -> ThreatListResponse:
    return service.list_reports()


@router.get("/api/policy", response_model=ResponsePolicy)
def get_policy(service: ThreatService = Depends(get_threat_service)) -> ResponsePolicy:
    return service.get_policy()


@router.put("/api/policy", response_model=ResponsePolicy)
def update_policy(
    payload: ResponsePolicyUpdate,
    service: ThreatService = Depends(get_threat_service),
) -> ResponsePolicy:
    return service.update_policy(payload)


@router.get("/api/commands", response_model=CommandListResponse)
def list_commands(service: ThreatService = Depends(get_threat_service)) -> CommandListResponse:
    return service.list_commands()


@router.get("/api/findings/{finding_id}/threat-report", response_model=ThreatReport)
def get_threat_report(
    finding_id: str, service: ThreatService = Depends(get_threat_service)
) -> ThreatReport:
    report = service.get(finding_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return report


@router.post("/api/findings/{finding_id}/threat-report", response_model=ThreatReport)
def generate_threat_report(
    finding_id: str, service: ThreatService = Depends(get_threat_service)
) -> ThreatReport:
    report = service.generate(finding_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return report
