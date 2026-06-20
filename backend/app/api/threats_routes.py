from fastapi import APIRouter, Depends, HTTPException

from app.schemas import ThreatReport
from app.services.dependencies import get_threat_service
from app.services.threats_service import ThreatService

router = APIRouter(tags=["threats"])


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
