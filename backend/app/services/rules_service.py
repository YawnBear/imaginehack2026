from datetime import UTC, datetime
from uuid import uuid4

from app.rules.clash import detect_clashes
from app.rules.operators import evaluate_condition
from app.rules.templates import get_templates
from app.schemas import (
    AuditLog,
    ClashWarning,
    Rule,
    RuleCondition,
    RuleCreate,
    RuleListResponse,
    RulePreviewResponse,
    RuleTemplate,
    RuleUpdate,
)
from app.services.store import InMemoryStore


class RuleService:
    def __init__(self, store: InMemoryStore) -> None:
        self.store = store

    def list_rules(self) -> RuleListResponse:
        items = list(self.store.rules.values())
        items.sort(key=lambda rule: rule.created_at)
        return RuleListResponse(items=items, total=len(items))

    def get_rule(self, rule_id: str) -> Rule | None:
        return self.store.rules.get(rule_id)

    def get_templates(self) -> list[RuleTemplate]:
        return get_templates()

    def get_clashes(self) -> list[ClashWarning]:
        return detect_clashes(list(self.store.rules.values()))

    def create_rule(self, payload: RuleCreate, actor_id: str) -> Rule:
        rule = Rule(
            rule_id=f"rule-{uuid4().hex[:10]}",
            created_at=datetime.now(UTC),
            **payload.model_dump(),
        )
        self.store.rules[rule.rule_id] = rule
        self._audit("rule_created", rule.rule_id, actor_id, after=rule.model_dump(mode="json"))
        return rule

    def update_rule(self, rule_id: str, payload: RuleUpdate, actor_id: str) -> Rule | None:
        rule = self.store.rules.get(rule_id)
        if rule is None:
            return None
        before = rule.model_dump(mode="json")
        updates = payload.model_dump(exclude_unset=True)
        updated = Rule.model_validate({**rule.model_dump(), **updates})
        self.store.rules[rule_id] = updated
        self._audit(
            "rule_updated", rule_id, actor_id, before=before, after=updated.model_dump(mode="json")
        )
        return updated

    def delete_rule(self, rule_id: str, actor_id: str) -> bool:
        rule = self.store.rules.pop(rule_id, None)
        if rule is None:
            return False
        self._audit("rule_deleted", rule_id, actor_id, before=rule.model_dump(mode="json"))
        return True

    def preview(
        self, resource_type: str, conditions: list[RuleCondition]
    ) -> RulePreviewResponse:
        matched: list[str] = []
        for event in self.store.events.values():
            if resource_type is not None and event.resource_type != resource_type:
                continue
            if all(evaluate_condition(event, condition) for condition in conditions):
                matched.append(event.resource_id)
        # de-dup while preserving order
        seen: set[str] = set()
        unique = [rid for rid in matched if not (rid in seen or seen.add(rid))]
        return RulePreviewResponse(match_count=len(unique), matched_resource_ids=unique)

    def _audit(
        self, action: str, entity_id: str, actor_id: str, before: dict | None = None, after: dict | None = None
    ) -> None:
        self.store.audit_logs.append(
            AuditLog(
                audit_id=f"audit-{uuid4().hex[:10]}",
                entity_type="rule",
                entity_id=entity_id,
                action=action,
                actor_id=actor_id,
                before_state=before or {},
                after_state=after or {},
                metadata={},
                created_at=datetime.now(UTC),
            )
        )
