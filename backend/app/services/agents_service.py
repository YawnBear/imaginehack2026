from datetime import UTC, datetime
from uuid import uuid4

from app.agents.router import LENS_TEMPLATES, issue_label
from app.agents.templates import get_agent_templates
from app.schemas import (
    Agent,
    AgentCreate,
    AgentListResponse,
    AgentPreviewResponse,
    AgentTemplate,
    AgentUpdate,
    AuditLog,
    Finding,
    Recommendation,
)
from app.services.store import InMemoryStore

# Representative sample numbers so the preview's cost/carbon lenses show figures.
_SAMPLE_SAVINGS = 76.8
_SAMPLE_CARBON = 26.88

_ISSUE_CATEGORY = {
    "public_bucket": "security",
    "idle_vm": "cost",
    "unused_storage": "cost",
    "unencrypted_database": "security",
}


class AgentService:
    def __init__(self, store: InMemoryStore) -> None:
        self.store = store

    def list_agents(self) -> AgentListResponse:
        items = list(self.store.agents.values())
        items.sort(key=lambda a: a.created_at)
        return AgentListResponse(items=items, total=len(items))

    def get_agent(self, agent_id: str) -> Agent | None:
        for agent in self.store.agents.values():
            if agent.agent_id == agent_id:
                return agent
        return None

    def get_templates(self) -> list[AgentTemplate]:
        return get_agent_templates()

    def create_agent(self, payload: AgentCreate, actor_id: str) -> Agent:
        agent = Agent(
            agent_id=f"agent-{uuid4().hex[:10]}",
            created_at=datetime.now(UTC),
            **payload.model_dump(),
        )
        # store key is output_key; de-collide if needed.
        key = agent.output_key
        if key in self.store.agents:
            key = f"{key}-{uuid4().hex[:4]}"
            agent.output_key = key
        self.store.agents[key] = agent
        self._audit("agent_created", agent.agent_id, actor_id, after=agent.model_dump(mode="json"))
        return agent

    def update_agent(self, agent_id: str, payload: AgentUpdate, actor_id: str) -> Agent | None:
        for store_key, agent in list(self.store.agents.items()):
            if agent.agent_id != agent_id:
                continue
            before = agent.model_dump(mode="json")
            updates = payload.model_dump(exclude_unset=True)
            updated = agent.model_copy(update=updates)
            # output_key is immutable (not in AgentUpdate), so store_key never
            # changes — update in place; no re-keying, no collision risk.
            self.store.agents[store_key] = updated
            self._audit("agent_updated", agent_id, actor_id, before=before, after=updated.model_dump(mode="json"))
            return updated
        return None

    def delete_agent(self, agent_id: str, actor_id: str) -> bool:
        for store_key, agent in list(self.store.agents.items()):
            if agent.agent_id == agent_id:
                del self.store.agents[store_key]
                self._audit("agent_deleted", agent_id, actor_id, before=agent.model_dump(mode="json"))
                return True
        return False

    def preview(self, lens: str, issue_type: str, tone: str, extra_focus: str) -> AgentPreviewResponse:
        template = LENS_TEMPLATES.get(lens)
        if template is None:
            return AgentPreviewResponse(text="(unknown lens)")
        finding = Finding(
            finding_id="sample",
            source_event_id="sample",
            resource_id="sample-resource",
            resource_type="bucket",
            issue_type=issue_type,
            category=_ISSUE_CATEGORY.get(issue_type, "security"),
            severity="high",
            status="pending_review",
            rule_id="SAMPLE",
            rule_confidence=0.9,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        rec = Recommendation(
            recommendation_id="sample",
            finding_id="sample",
            recommended_action=f"Remediate {issue_label(issue_type)} after approval.",
            rationale="sample",
            risk_level="high",
            estimated_monthly_savings=_SAMPLE_SAVINGS,
            estimated_carbon_reduction_kg=_SAMPLE_CARBON,
            confidence=0.9,
        )
        text = template(finding, rec)
        if extra_focus.strip():
            text += f" (Focus: {extra_focus.strip()}.)"
        return AgentPreviewResponse(text=text)

    def _audit(self, action: str, entity_id: str, actor_id: str, before: dict | None = None, after: dict | None = None) -> None:
        self.store.audit_logs.append(
            AuditLog(
                audit_id=f"audit-{uuid4().hex[:10]}",
                entity_type="agent",
                entity_id=entity_id,
                action=action,
                actor_id=actor_id,
                before_state=before or {},
                after_state=after or {},
                metadata={},
                created_at=datetime.now(UTC),
            )
        )
