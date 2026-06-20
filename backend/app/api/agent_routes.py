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
)
from app.services.dependencies import get_governance_service
from app.services.governance import GovernanceService

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
) -> AgentConfigResponse:
    store = governance.store
    return AgentConfigResponse(
        rules=[r.model_dump(mode="json") for r in store.rules.values()],
        agents=[a.model_dump(mode="json") for a in store.agents.values()],
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


@router.get("/status", response_model=AgentStatusResponse)
def agent_status(governance: GovernanceService = Depends(get_governance_service)) -> AgentStatusResponse:
    last = governance.store.agent_last_seen
    online = bool(last and (datetime.now(UTC) - last).total_seconds() < 60)
    return AgentStatusResponse(online=online, last_seen=last, agent_id=governance.store.agent_id)
