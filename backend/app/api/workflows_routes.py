from fastapi import APIRouter, Depends, HTTPException

from app.schemas import WorkflowRunRequest, WorkflowRunResponse
from app.services.dependencies import get_workflow_service
from app.services.workflows_service import WorkflowService

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.post("/run", response_model=WorkflowRunResponse)
def run_workflow(
    payload: WorkflowRunRequest,
    service: WorkflowService = Depends(get_workflow_service),
) -> WorkflowRunResponse:
    result = service.run(payload.rule_id, payload.agent_keys)
    if result is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    return result
