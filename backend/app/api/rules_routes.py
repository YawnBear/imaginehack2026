from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas import (
    ClashWarning,
    Rule,
    RuleCreate,
    RuleListResponse,
    RulePreviewRequest,
    RulePreviewResponse,
    RuleTemplate,
    RuleUpdate,
)
from app.services.dependencies import get_rule_service
from app.services.rules_service import RuleService

router = APIRouter(prefix="/api/rules", tags=["rules"])


# NOTE: literal paths (/templates, /clashes, /preview) MUST be declared before
# the /{rule_id} catch-all so Starlette matches them first.
@router.get("/templates", response_model=list[RuleTemplate])
def list_templates(service: RuleService = Depends(get_rule_service)) -> list[RuleTemplate]:
    return service.get_templates()


@router.get("/clashes", response_model=list[ClashWarning])
def list_clashes(service: RuleService = Depends(get_rule_service)) -> list[ClashWarning]:
    return service.get_clashes()


@router.post("/preview", response_model=RulePreviewResponse)
def preview_rule(
    payload: RulePreviewRequest,
    service: RuleService = Depends(get_rule_service),
) -> RulePreviewResponse:
    return service.preview(payload.resource_type, payload.conditions)


@router.get("", response_model=RuleListResponse)
def list_rules(service: RuleService = Depends(get_rule_service)) -> RuleListResponse:
    return service.list_rules()


@router.post("", response_model=Rule, status_code=status.HTTP_201_CREATED)
def create_rule(
    payload: RuleCreate,
    service: RuleService = Depends(get_rule_service),
) -> Rule:
    return service.create_rule(payload, actor_id="dashboard")


@router.get("/{rule_id}", response_model=Rule)
def get_rule(rule_id: str, service: RuleService = Depends(get_rule_service)) -> Rule:
    rule = service.get_rule(rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.patch("/{rule_id}", response_model=Rule)
def update_rule(
    rule_id: str,
    payload: RuleUpdate,
    service: RuleService = Depends(get_rule_service),
) -> Rule:
    updated = service.update_rule(rule_id, payload, actor_id="dashboard")
    if updated is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    return updated


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: str, service: RuleService = Depends(get_rule_service)) -> None:
    if not service.delete_rule(rule_id, actor_id="dashboard"):
        raise HTTPException(status_code=404, detail="Rule not found")
