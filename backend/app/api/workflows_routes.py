from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas import (
    Workflow,
    WorkflowCreate,
    WorkflowListResponse,
    WorkflowRunAllResponse,
)
from app.services.dependencies import get_workflow_service
from app.services.workflows_service import WorkflowService

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.get("", response_model=WorkflowListResponse)
def list_workflows(service: WorkflowService = Depends(get_workflow_service)) -> WorkflowListResponse:
    return service.list()


@router.post("", response_model=Workflow, status_code=status.HTTP_201_CREATED)
def create_workflow(
    payload: WorkflowCreate, service: WorkflowService = Depends(get_workflow_service)
) -> Workflow:
    if not service.rule_exists(payload.rule_id):
        raise HTTPException(status_code=400, detail="Unknown rule_id")
    return service.create(payload)


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow(
    workflow_id: str, service: WorkflowService = Depends(get_workflow_service)
) -> None:
    if not service.delete(workflow_id):
        raise HTTPException(status_code=404, detail="Workflow not found")


@router.post("/run-all", response_model=WorkflowRunAllResponse)
def run_all(service: WorkflowService = Depends(get_workflow_service)) -> WorkflowRunAllResponse:
    return service.run_all()
