from app.core.config import get_settings
from app.services.agents_service import AgentService
from app.services.governance import GovernanceService
from app.services.rules_service import RuleService
from app.services.store import InMemoryStore
from app.services.threats_service import ThreatService
from app.services.workflows_service import WorkflowService

_settings = get_settings()
if _settings.database_url:
    from app.services.pg_store import PostgresStore

    _store = PostgresStore(_settings.database_url)
else:
    _store = InMemoryStore()

_governance_service = GovernanceService(_store)
_rule_service = RuleService(_store)
_agent_service = AgentService(_store)
_threat_service = ThreatService(_store)
_workflow_service = WorkflowService(_store, _governance_service)


def get_governance_service() -> GovernanceService:
    return _governance_service


def get_rule_service() -> RuleService:
    return _rule_service


def get_agent_service() -> AgentService:
    return _agent_service


def get_threat_service() -> ThreatService:
    return _threat_service


def get_workflow_service() -> WorkflowService:
    return _workflow_service
