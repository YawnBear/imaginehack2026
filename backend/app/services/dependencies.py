from app.services.governance import GovernanceService
from app.services.store import InMemoryStore

_store = InMemoryStore()
_governance_service = GovernanceService(_store)


def get_governance_service() -> GovernanceService:
    return _governance_service
