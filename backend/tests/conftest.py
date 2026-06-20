import os

# The test suite must NEVER touch the real database. Force the in-memory store
# by clearing DATABASE_URL BEFORE app modules (and pydantic settings) load.
os.environ["DATABASE_URL"] = ""
os.environ["AI_PROVIDER_API_KEY"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402
from app.services import dependencies
from app.services.store import InMemoryStore
from app.services.governance import GovernanceService
from app.services.rules_service import RuleService


@pytest.fixture(autouse=True)
def _reset_singleton_store() -> None:
    """Reset the module-level singleton store before each test.

    Tests that drive the full app via ``create_app()`` share the singleton
    store defined in ``app.services.dependencies``. Without a reset, state
    mutated by one test (approved findings, queued commands, agent heartbeat)
    leaks into later tests. Re-initialising the existing instance in place keeps
    all service singletons pointing at the same (now-clean) store.
    """
    dependencies._store.__init__()


@pytest.fixture
def store() -> InMemoryStore:
    """A fresh in-memory store with no built-in configuration."""
    return InMemoryStore()


@pytest.fixture
def governance(store: InMemoryStore) -> GovernanceService:
    return GovernanceService(store)


@pytest.fixture
def rules_service(store: InMemoryStore) -> RuleService:
    return RuleService(store)


@pytest.fixture
def client() -> TestClient:
    """Full app with its own singleton store."""
    return TestClient(create_app())
