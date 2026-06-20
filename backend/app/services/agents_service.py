from datetime import UTC, datetime
from uuid import uuid4

from app.schemas import Agent, AgentCreate, AgentListResponse, AgentUpdate, AuditLog
from app.services.store import InMemoryStore


def _slug(name: str) -> str:
    s = "".join(c if c.isalnum() else "_" for c in name.lower()).strip("_")
    return s or "agent"


class AgentService:
    def __init__(self, store: InMemoryStore) -> None:
        self.store = store

    def list_agents(self) -> AgentListResponse:
        items = sorted(self.store.agents.values(), key=lambda a: a.created_at)
        return AgentListResponse(items=items, total=len(items))

    def get_agent(self, agent_id: str) -> Agent | None:
        for agent in self.store.agents.values():
            if agent.agent_id == agent_id:
                return agent
        return None

    def create_agent(self, payload: AgentCreate, actor_id: str) -> Agent:
        key = _slug(payload.name)
        if key in self.store.agents:
            key = f"{key}_{uuid4().hex[:4]}"
        agent = Agent(agent_id=f"agent-{uuid4().hex[:10]}", output_key=key,
                      created_at=datetime.now(UTC), **payload.model_dump())
        self.store.agents[key] = agent
        self._audit("agent_created", agent.agent_id, actor_id, after=agent.model_dump(mode="json"))
        return agent

    def update_agent(self, agent_id: str, payload: AgentUpdate, actor_id: str) -> Agent | None:
        for store_key, agent in list(self.store.agents.items()):
            if agent.agent_id != agent_id:
                continue
            before = agent.model_dump(mode="json")
            updated = agent.model_copy(update=payload.model_dump(exclude_unset=True))
            self.store.agents[store_key] = updated  # output_key immutable
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

    def _audit(self, action, entity_id, actor_id, before=None, after=None) -> None:
        self.store.audit_logs.append(AuditLog(
            audit_id=f"audit-{uuid4().hex[:10]}", entity_type="agent", entity_id=entity_id,
            action=action, actor_id=actor_id, before_state=before or {}, after_state=after or {},
            metadata={}, created_at=datetime.now(UTC)))
