import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.store import InMemoryStore
from app.services.governance import GovernanceService
from app.services.rules_service import RuleService


@pytest.fixture
def store() -> InMemoryStore:
    """A fresh in-memory store (built-in rules pre-seeded by __init__)."""
    return InMemoryStore()


@pytest.fixture
def governance(store: InMemoryStore) -> GovernanceService:
    return GovernanceService(store)


@pytest.fixture
def rules_service(store: InMemoryStore) -> RuleService:
    return RuleService(store)


@pytest.fixture
def client() -> TestClient:
    """Full app with its own singleton store (seeded on startup)."""
    return TestClient(create_app())
