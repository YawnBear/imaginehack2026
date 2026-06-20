from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException

from app.core.config import get_settings
from app.schemas import (
    AgentConfigResponse,
    AgentEnrollResponse,
    AgentEventsRequest,
    AgentEventsResponse,
    AgentStatusResponse,
    CommandListResponse,
    CommandResultRequest,
)
from app.services.dependencies import get_governance_service, get_threat_service
from app.services.governance import GovernanceService
from app.services.threats_service import ThreatService

router = APIRouter(prefix="/api/agent", tags=["agent"])


def require_agent_token(
    x_agent_token: str | None = Header(default=None),
    governance: GovernanceService = Depends(get_governance_service),
) -> GovernanceService:
    if x_agent_token != get_settings().agent_token:
        raise HTTPException(status_code=401, detail="Invalid agent token")
    governance.store.agent_last_seen = datetime.now(UTC)  # heartbeat on any authed call
    return governance


@router.post("/enroll", response_model=AgentEnrollResponse)
def enroll(governance: GovernanceService = Depends(require_agent_token)) -> AgentEnrollResponse:
    if governance.store.agent_id is None:
        governance.store.agent_id = f"agent-{uuid4().hex[:8]}"
    return AgentEnrollResponse(agent_id=governance.store.agent_id, token=get_settings().agent_token)


@router.get("/config", response_model=AgentConfigResponse)
def get_config(
    governance: GovernanceService = Depends(require_agent_token),
    threats: ThreatService = Depends(get_threat_service),
) -> AgentConfigResponse:
    store = governance.store
    return AgentConfigResponse(
        rules=[r.model_dump(mode="json") for r in store.rules.values()],
        agents=[a.model_dump(mode="json") for a in store.agents.values()],
        policy=store.policy.model_dump(mode="json"),
    )


@router.post("/events", response_model=AgentEventsResponse)
def post_events(
    payload: AgentEventsRequest,
    governance: GovernanceService = Depends(require_agent_token),
) -> AgentEventsResponse:
    ingest = governance.ingest_events(payload.events, actor_id="safecloud-agent")
    recorded = governance.record_activity(payload.activities)
    return AgentEventsResponse(
        accepted=ingest.accepted,
        created_findings=ingest.created_findings,
        duplicate_events=ingest.duplicate_events,
        activities_recorded=recorded,
    )


@router.get("/commands", response_model=CommandListResponse)
def get_commands(governance: GovernanceService = Depends(require_agent_token)) -> CommandListResponse:
    queued = [c for c in governance.store.commands.values() if c.status == "queued"]
    queued.sort(key=lambda c: c.created_at)
    return CommandListResponse(items=queued, total=len(queued))


@router.post("/commands/{command_id}/result")
def post_command_result(
    command_id: str,
    payload: CommandResultRequest,
    governance: GovernanceService = Depends(require_agent_token),
) -> dict:
    if not governance.complete_command(command_id, payload.status, payload.result):
        raise HTTPException(status_code=404, detail="Command not found")
    return {"command_id": command_id, "status": payload.status}


@router.get("/status", response_model=AgentStatusResponse)
def agent_status(governance: GovernanceService = Depends(get_governance_service)) -> AgentStatusResponse:
    last = governance.store.agent_last_seen
    online = bool(last and (datetime.now(UTC) - last).total_seconds() < 60)
    return AgentStatusResponse(online=online, last_seen=last, agent_id=governance.store.agent_id)
