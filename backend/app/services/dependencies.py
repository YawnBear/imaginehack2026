from app.services.governance import GovernanceService
from app.services.rules_service import RuleService
from app.services.store import InMemoryStore

_store = InMemoryStore()
_governance_service = GovernanceService(_store)
_rule_service = RuleService(_store)


def get_governance_service() -> GovernanceService:
    return _governance_service


def get_rule_service() -> RuleService:
    return _rule_service
