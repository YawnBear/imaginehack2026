# SafeCloud Phase 1 — Customizable Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4 hardcoded detection rules with a data-driven rule engine the user can author, edit, and manage from the dashboard — template-standardized, clash-detected, with a live "matches N resources now" preview — without changing any detection behavior on the existing seed data.

**Architecture:** Introduce a `Rule` data model (template + typed conditions). Refactor `evaluate_event` to iterate stored rules instead of hardcoded `if` blocks. The 4 built-ins become pre-loaded seed `Rule` records, so detection on the seed/scan data is unchanged. Add a `RuleService` + REST CRUD + templates + clash + preview endpoints, then a Next.js **Rules** page with a New-Rule wizard. All in-memory; frontend keeps its mock fallback.

**Tech Stack:** Python 3.13, FastAPI, Pydantic v2 (backend) · pytest + Starlette `TestClient` (backend tests) · Next.js 16.2.9 / React 19 / TypeScript / Tailwind v4 (frontend). macOS dev box (`python3`, `node` via nvm; **no `uv`**).

**Spec:** `docs/superpowers/specs/2026-06-20-safecloud-custom-rules-agents-design.md` (§4 Rule model, §5 engine, §9 API, §10 frontend).

**Deliberate simplification (recorded):** data-driven rules declare a **fixed** `required_reviewers` list (the old conditional "add application_owner if app-linked / add compliance if sensitive" logic is dropped). The built-in seed rules are given the reviewer set that reproduces the current seed-data outcome. This is consistent with the spec's "standardized templates" goal; it changes reviewer routing only for non-seed events that lack those attributes.

**Evidence keys:** the data-driven engine keys evidence by the **leaf** of each field path (e.g. `cost.monthly_usd` → `monthly_usd`, `config.engine` → `engine`). The finding modal renders evidence as a generic dict, so the UI is unaffected — **but** `backend/app/agents/recommendations.py` reads `evidence.get("monthly_cost_usd")` to compute idle-VM / unused-storage savings. That key becomes `monthly_usd`, so **Task 5 also patches `recommendations.py`** (and adds a savings regression test) or the dashboard savings totals silently collapse to 0.

---

## File Structure

**Backend — create:**
- `backend/pytest.ini` — pytest config (pythonpath, testpaths).
- `backend/requirements-dev.txt` — pytest + httpx.
- `backend/tests/__init__.py` — empty.
- `backend/tests/conftest.py` — fresh-store fixtures + `TestClient`.
- `backend/app/schemas/rules.py` — `RuleCondition`, `Rule`, `RuleCreate`, `RuleUpdate`, `RuleListResponse`, `RuleTemplate`, `ClashWarning`, `RulePreviewRequest`, `RulePreviewResponse`.
- `backend/app/rules/operators.py` — `resolve_field`, `evaluate_condition`, `OPERATORS`.
- `backend/app/rules/templates.py` — `RULE_TEMPLATES`, `get_templates()`.
- `backend/app/rules/seed_rules.py` — `builtin_rules()` (the 4 migrated rules).
- `backend/app/rules/clash.py` — `detect_clashes`.
- `backend/app/services/rules_service.py` — `RuleService` (CRUD + templates + clashes + preview, audited).
- `backend/app/api/rules_routes.py` — the `/api/rules*` router.

**Backend — modify:**
- `backend/app/rules/engine.py` — `evaluate_event(event, rules)` + `build_match`.
- `backend/app/schemas/__init__.py` — export the new rule schemas.
- `backend/app/services/store.py` — add `self.rules` seeded from `builtin_rules()`.
- `backend/app/services/governance.py` — call `evaluate_event(event, list(self.store.rules.values()))`.
- `backend/app/services/dependencies.py` — add `get_rule_service()`.
- `backend/app/main.py` — `include_router(rules_router)`.

**Frontend — create:**
- `app/(dashboard)/rules/page.tsx` — server component (list + clashes).
- `app/(dashboard)/rules/RulesManager.tsx` — client component (table + New-Rule wizard).

**Frontend — modify:**
- `app/lib/types.ts` — rule types.
- `app/lib/api.ts` — rule client functions + mock fallback.
- `app/lib/mockData.ts` — `MOCK_RULES`, `MOCK_RULE_TEMPLATES`.
- `app/components/icons.tsx` — `IconRules`.
- `app/components/AppShell.tsx` — add Rules nav entry (both desktop + mobile use the same `NAV`).

---

## Task 0: Backend test harness

**Files:**
- Create: `backend/requirements-dev.txt`, `backend/pytest.ini`, `backend/tests/__init__.py`, `backend/tests/conftest.py`, `backend/tests/test_smoke.py`

- [ ] **Step 1: Create the dev requirements**

`backend/requirements-dev.txt`:
```text
pytest>=8.0,<9.0
httpx>=0.27,<1.0
```

- [ ] **Step 2: Create pytest config**

`backend/pytest.ini`:
```ini
[pytest]
pythonpath = .
testpaths = tests
addopts = -q
```

- [ ] **Step 3: Create the tests package + conftest**

`backend/tests/__init__.py`: (empty file)

`backend/tests/conftest.py`:
```python
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.store import InMemoryStore
from app.services.governance import GovernanceService

# Re-enable after Task 7 (rules_service module does not exist until then).
# from app.services.rules_service import RuleService


@pytest.fixture
def store() -> InMemoryStore:
    """A fresh in-memory store (built-in rules pre-seeded by __init__)."""
    return InMemoryStore()


@pytest.fixture
def governance(store: InMemoryStore) -> GovernanceService:
    return GovernanceService(store)


# Re-enable after Task 7:
# @pytest.fixture
# def rules_service(store: InMemoryStore) -> RuleService:
#     return RuleService(store)


@pytest.fixture
def client() -> TestClient:
    """Full app with its own singleton store (seeded on startup)."""
    return TestClient(create_app())
```

> The `rules_service` fixture + its import are **commented out** until Task 7 creates the module. pytest imports `conftest.py` during collection for the whole `tests/` dir, so an eager `from app.services.rules_service import RuleService` would break collection for **every** task before Task 7. Task 7 Step 7 uncomments both. None of the Task 0–6 tests use the `rules_service` fixture.

- [ ] **Step 4: Write a smoke test that does NOT depend on later tasks**

`backend/tests/test_smoke.py`:
```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_healthz_ok():
    client = TestClient(create_app())
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
```

- [ ] **Step 5: Build the venv and install (macOS, no uv)**

Run:
```bash
cd /Users/zhehann/Desktop/imaginehack/imaginehack2026/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
```
Expected: installs FastAPI/uvicorn/pydantic-settings + pytest/httpx with no errors.

- [ ] **Step 6: Run the smoke test**

Run: `.venv/bin/pytest tests/test_smoke.py -v`
Expected: `test_healthz_ok PASSED`. (The `rules_service` fixture is commented out in `conftest.py`, so collection succeeds with only `app.main`/`store`/`governance` imported.)

- [ ] **Step 7: Commit**

```bash
cd /Users/zhehann/Desktop/imaginehack/imaginehack2026
git add backend/requirements-dev.txt backend/pytest.ini backend/tests
git commit -m "test: bootstrap backend pytest harness"
```
> No `backend/.gitignore` is needed — the repo-root `.gitignore` already ignores `.venv/`, so `backend/.venv/` is covered. (Adding a nonexistent `backend/.gitignore` to `git add` would abort the commit with `fatal: pathspec ... did not match any files`.)

---

## Task 1: Rule schemas

**Files:**
- Create: `backend/app/schemas/rules.py`
- Modify: `backend/app/schemas/__init__.py`
- Test: `backend/tests/test_rule_schemas.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_rule_schemas.py`:
```python
from app.schemas import Rule, RuleCondition, RuleCreate


def test_rule_condition_minimal():
    c = RuleCondition(field="config.public_access", operator="==", value=True)
    assert c.field == "config.public_access"
    assert c.operator == "=="
    assert c.value is True


def test_rule_create_defaults():
    payload = RuleCreate(
        name="My Rule",
        resource_type="bucket",
        issue_type="public_bucket",
        category="security",
        conditions=[RuleCondition(field="config.public_access", operator="==", value=True)],
    )
    assert payload.enabled is True
    assert payload.mode == "manual"
    assert payload.severity_base == "medium"
    assert payload.required_reviewers == []
    assert payload.remediation_destructive is False
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_rule_schemas.py -v`
Expected: FAIL — `ImportError: cannot import name 'Rule'`.

- [ ] **Step 3: Implement the schemas**

`backend/app/schemas/rules.py`:
```python
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

ConditionOperator = Literal[
    "==", "!=", "<", "<=", ">", ">=", "in", "not_in", "exists", "contains"
]
RuleMode = Literal["monitor", "manual", "auto"]
RuleResourceType = Literal["bucket", "vm", "storage", "database"]
RuleSeverity = Literal["critical", "high", "medium", "low"]
RuleCategory = Literal["security", "cost", "energy", "workflow", "audit"]


class RuleCondition(BaseModel):
    field: str  # dot-path: config.public_access, metrics.avg_cpu_percent_7d, environment
    operator: ConditionOperator
    value: Any = None  # not required for the "exists" operator


class Rule(BaseModel):
    rule_id: str
    name: str
    enabled: bool = True
    template_key: str = "custom"
    resource_type: RuleResourceType
    conditions: list[RuleCondition] = Field(default_factory=list)
    severity_base: RuleSeverity = "medium"
    escalate_in_prod: bool = False
    rule_confidence: float = 0.85
    category: RuleCategory = "security"
    issue_type: str
    required_reviewers: list[str] = Field(default_factory=list)
    evidence_fields: list[str] = Field(default_factory=list)
    remediation_action_key: str = "tag_resource"
    remediation_destructive: bool = False
    mode: RuleMode = "manual"
    auto_threshold: int | None = None
    created_at: datetime


class RuleCreate(BaseModel):
    name: str
    enabled: bool = True
    template_key: str = "custom"
    resource_type: RuleResourceType
    conditions: list[RuleCondition] = Field(default_factory=list)
    severity_base: RuleSeverity = "medium"
    escalate_in_prod: bool = False
    rule_confidence: float = 0.85
    category: RuleCategory = "security"
    issue_type: str
    required_reviewers: list[str] = Field(default_factory=list)
    evidence_fields: list[str] = Field(default_factory=list)
    remediation_action_key: str = "tag_resource"
    remediation_destructive: bool = False
    mode: RuleMode = "manual"
    auto_threshold: int | None = None


class RuleUpdate(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    resource_type: RuleResourceType | None = None
    conditions: list[RuleCondition] | None = None
    severity_base: RuleSeverity | None = None
    escalate_in_prod: bool | None = None
    rule_confidence: float | None = None
    category: RuleCategory | None = None
    issue_type: str | None = None
    required_reviewers: list[str] | None = None
    evidence_fields: list[str] | None = None
    remediation_action_key: str | None = None
    remediation_destructive: bool | None = None
    mode: RuleMode | None = None
    auto_threshold: int | None = None


class RuleListResponse(BaseModel):
    items: list[Rule]
    total: int


class RuleTemplate(BaseModel):
    template_key: str
    name: str
    description: str
    resource_type: RuleResourceType
    conditions: list[RuleCondition] = Field(default_factory=list)
    severity_base: RuleSeverity = "medium"
    escalate_in_prod: bool = False
    rule_confidence: float = 0.85
    category: RuleCategory = "security"
    issue_type: str
    required_reviewers: list[str] = Field(default_factory=list)
    evidence_fields: list[str] = Field(default_factory=list)
    remediation_action_key: str = "tag_resource"
    remediation_destructive: bool = False


class ClashWarning(BaseModel):
    rule_id_a: str
    rule_id_b: str
    resource_type: str
    field: str
    message: str


class RulePreviewRequest(BaseModel):
    resource_type: RuleResourceType
    conditions: list[RuleCondition] = Field(default_factory=list)


class RulePreviewResponse(BaseModel):
    match_count: int
    matched_resource_ids: list[str]
```

- [ ] **Step 4: Export from the schemas package**

In `backend/app/schemas/__init__.py`, add this import block after the existing `from app.schemas.health import HealthResponse` line:
```python
from app.schemas.rules import (
    ClashWarning,
    ConditionOperator,
    Rule,
    RuleCondition,
    RuleCreate,
    RuleListResponse,
    RulePreviewRequest,
    RulePreviewResponse,
    RuleTemplate,
    RuleUpdate,
)
```
And add these names to the `__all__` list (keep it alphabetised):
```python
    "ClashWarning",
    "ConditionOperator",
    "Rule",
    "RuleCondition",
    "RuleCreate",
    "RuleListResponse",
    "RulePreviewRequest",
    "RulePreviewResponse",
    "RuleTemplate",
    "RuleUpdate",
```

- [ ] **Step 5: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_rule_schemas.py -v`
Expected: both tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/rules.py backend/app/schemas/__init__.py backend/tests/test_rule_schemas.py
git commit -m "feat(rules): add Rule data-model schemas"
```

---

## Task 2: Field resolver + operator evaluation

**Files:**
- Create: `backend/app/rules/operators.py`
- Test: `backend/tests/test_operators.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_operators.py`:
```python
from datetime import UTC, datetime

from app.rules.operators import evaluate_condition, resolve_field
from app.schemas import CloudEvent, RuleCondition


def _event(**overrides) -> CloudEvent:
    base = dict(
        event_id="e1",
        account_id="a",
        resource_id="r1",
        resource_type="vm",
        environment="production",
        timestamp=datetime.now(UTC),
        config={"application_id": "app-1", "public_access": True},
        metrics={"avg_cpu_percent_7d": 3.2},
        cost={"monthly_usd": 96},
    )
    base.update(overrides)
    return CloudEvent(**base)


def test_resolve_top_level_field():
    assert resolve_field(_event(), "resource_type") == "vm"
    assert resolve_field(_event(), "environment") == "production"


def test_resolve_nested_field():
    assert resolve_field(_event(), "config.public_access") is True
    assert resolve_field(_event(), "metrics.avg_cpu_percent_7d") == 3.2
    assert resolve_field(_event(), "cost.monthly_usd") == 96


def test_resolve_missing_field_is_none():
    assert resolve_field(_event(), "metrics.does_not_exist") is None
    assert resolve_field(_event(), "config.nope") is None


def test_eq_and_neq():
    assert evaluate_condition(_event(), RuleCondition(field="config.public_access", operator="==", value=True))
    assert evaluate_condition(_event(), RuleCondition(field="resource_type", operator="!=", value="bucket"))


def test_numeric_lte_gt():
    e = _event(metrics={"avg_cpu_percent_7d": 3.2})
    assert evaluate_condition(e, RuleCondition(field="metrics.avg_cpu_percent_7d", operator="<=", value=10))
    assert not evaluate_condition(e, RuleCondition(field="metrics.avg_cpu_percent_7d", operator=">", value=10))


def test_missing_numeric_field_does_not_match():
    e = _event(metrics={})
    assert not evaluate_condition(e, RuleCondition(field="metrics.avg_cpu_percent_7d", operator="<=", value=10))


def test_exists_and_contains():
    assert evaluate_condition(_event(), RuleCondition(field="config.application_id", operator="exists"))
    assert not evaluate_condition(_event(metrics={}), RuleCondition(field="metrics.avg_cpu_percent_7d", operator="exists"))
    assert evaluate_condition(_event(), RuleCondition(field="config.application_id", operator="contains", value="app"))


def test_in_and_not_in():
    assert evaluate_condition(_event(), RuleCondition(field="resource_type", operator="in", value=["vm", "bucket"]))
    assert evaluate_condition(_event(), RuleCondition(field="resource_type", operator="not_in", value=["bucket"]))
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_operators.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.rules.operators'`.

- [ ] **Step 3: Implement the resolver + operators**

`backend/app/rules/operators.py`:
```python
from typing import Any

from app.schemas import CloudEvent, RuleCondition

_NESTED_ROOTS = {"config", "metrics", "cost"}


def resolve_field(event: CloudEvent, path: str) -> Any:
    """Resolve a dot-path against a CloudEvent. Missing -> None.

    Top-level attrs (resource_type, environment, ...) are read directly.
    Nested paths (config.x, metrics.y, cost.z) index the dict attribute.
    """
    if "." not in path:
        return getattr(event, path, None)
    head, _, rest = path.partition(".")
    if head not in _NESTED_ROOTS:
        return None
    container = getattr(event, head, None)
    if not isinstance(container, dict):
        return None
    cursor: Any = container
    for part in rest.split("."):
        if not isinstance(cursor, dict) or part not in cursor:
            return None
        cursor = cursor[part]
    return cursor


def _to_number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _numeric_compare(actual: Any, expected: Any, fn) -> bool:
    a = _to_number(actual)
    b = _to_number(expected)
    if a is None or b is None:
        return False
    return fn(a, b)


OPERATORS = {
    "==": lambda actual, expected: actual == expected,
    "!=": lambda actual, expected: actual != expected,
    "<": lambda actual, expected: _numeric_compare(actual, expected, lambda a, b: a < b),
    "<=": lambda actual, expected: _numeric_compare(actual, expected, lambda a, b: a <= b),
    ">": lambda actual, expected: _numeric_compare(actual, expected, lambda a, b: a > b),
    ">=": lambda actual, expected: _numeric_compare(actual, expected, lambda a, b: a >= b),
    "in": lambda actual, expected: actual in expected if isinstance(expected, (list, tuple, set)) else False,
    "not_in": lambda actual, expected: actual not in expected if isinstance(expected, (list, tuple, set)) else False,
    "exists": lambda actual, expected: actual is not None,
    "contains": lambda actual, expected: (expected in actual) if isinstance(actual, (str, list, tuple, set, dict)) else False,
}


def evaluate_condition(event: CloudEvent, condition: RuleCondition) -> bool:
    actual = resolve_field(event, condition.field)
    fn = OPERATORS.get(condition.operator)
    if fn is None:
        return False
    return bool(fn(actual, condition.value))
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_operators.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/rules/operators.py backend/tests/test_operators.py
git commit -m "feat(rules): add dot-path resolver and operator evaluation"
```

---

## Task 3: Data-driven `evaluate_event`

**Files:**
- Modify: `backend/app/rules/engine.py`
- Test: `backend/tests/test_engine.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_engine.py`:
```python
from datetime import UTC, datetime

from app.rules.engine import build_match, evaluate_event
from app.schemas import CloudEvent, Rule, RuleCondition


def _now():
    return datetime.now(UTC)


def _rule(**overrides) -> Rule:
    base = dict(
        rule_id="R1",
        name="Test",
        resource_type="vm",
        issue_type="idle_vm",
        category="cost",
        severity_base="medium",
        escalate_in_prod=True,
        rule_confidence=0.9,
        required_reviewers=["devops"],
        conditions=[RuleCondition(field="metrics.avg_cpu_percent_7d", operator="<=", value=10)],
        evidence_fields=["cost.monthly_usd"],
        created_at=_now(),
    )
    base.update(overrides)
    return Rule(**base)


def _vm(env="staging", cpu=3.2) -> CloudEvent:
    return CloudEvent(
        event_id="e",
        account_id="a",
        resource_id="vm-1",
        resource_type="vm",
        environment=env,
        timestamp=_now(),
        metrics={"avg_cpu_percent_7d": cpu},
        cost={"monthly_usd": 96},
    )


def test_matching_rule_produces_match():
    matches = evaluate_event(_vm(), [_rule()])
    assert len(matches) == 1
    assert matches[0].rule_id == "R1"
    assert matches[0].issue_type == "idle_vm"


def test_non_matching_rule_is_skipped():
    assert evaluate_event(_vm(cpu=80), [_rule()]) == []


def test_disabled_rule_is_skipped():
    assert evaluate_event(_vm(), [_rule(enabled=False)]) == []


def test_wrong_resource_type_is_skipped():
    bucket = CloudEvent(event_id="e", account_id="a", resource_id="b1", resource_type="bucket", timestamp=_now())
    assert evaluate_event(bucket, [_rule()]) == []


def test_prod_escalation():
    assert build_match(_vm(env="production"), _rule()).severity == "high"
    assert build_match(_vm(env="staging"), _rule()).severity == "medium"


def test_evidence_keyed_by_leaf():
    ev = build_match(_vm(), _rule()).evidence
    assert ev["avg_cpu_percent_7d"] == 3.2  # from condition
    assert ev["monthly_usd"] == 96  # from evidence_fields
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_engine.py -v`
Expected: FAIL — `ImportError: cannot import name 'build_match'` / `evaluate_event` signature mismatch.

- [ ] **Step 3: Rewrite the engine (replace the whole file)**

`backend/app/rules/engine.py` — replace the entire contents with:
```python
from dataclasses import dataclass
from typing import Any

from app.rules.operators import evaluate_condition, resolve_field
from app.schemas import CloudEvent, Rule

_SEVERITY_LADDER = ["low", "medium", "high", "critical"]


@dataclass(frozen=True)
class RuleMatch:
    rule_id: str
    issue_type: str
    category: str
    severity: str
    evidence: dict[str, Any]
    rule_confidence: float
    required_reviewers: list[str]


def evaluate_event(event: CloudEvent, rules: list[Rule]) -> list[RuleMatch]:
    matches: list[RuleMatch] = []
    for rule in rules:
        if not rule.enabled:
            continue
        if rule.resource_type != event.resource_type:
            continue
        if all(evaluate_condition(event, condition) for condition in rule.conditions):
            matches.append(build_match(event, rule))
    return matches


def build_match(event: CloudEvent, rule: Rule) -> RuleMatch:
    severity = rule.severity_base
    if rule.escalate_in_prod and (event.environment or "").lower() == "production":
        severity = _escalate(severity)

    evidence: dict[str, Any] = {}
    for condition in rule.conditions:
        evidence[_leaf(condition.field)] = resolve_field(event, condition.field)
    for path in rule.evidence_fields:
        evidence[_leaf(path)] = resolve_field(event, path)

    return RuleMatch(
        rule_id=rule.rule_id,
        issue_type=rule.issue_type,
        category=rule.category,
        severity=severity,
        evidence=evidence,
        rule_confidence=rule.rule_confidence,
        required_reviewers=list(rule.required_reviewers),
    )


def _escalate(severity: str) -> str:
    try:
        idx = _SEVERITY_LADDER.index(severity)
    except ValueError:
        return severity
    return _SEVERITY_LADDER[min(idx + 1, len(_SEVERITY_LADDER) - 1)]


def _leaf(path: str) -> str:
    return path.rsplit(".", 1)[-1]
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_engine.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/rules/engine.py backend/tests/test_engine.py
git commit -m "feat(rules): make evaluate_event data-driven over stored rules"
```

---

## Task 4: Migrate the 4 built-ins to seed rules (parity)

**Files:**
- Create: `backend/app/rules/seed_rules.py`
- Test: `backend/tests/test_builtin_parity.py`

- [ ] **Step 1: Write the failing parity test**

`backend/tests/test_builtin_parity.py`:
```python
from app.rules.engine import evaluate_event
from app.rules.seed_rules import builtin_rules
from app.services.seed import demo_events


def _match_for(resource_id: str):
    rules = builtin_rules()
    for event in demo_events():
        if event.resource_id != resource_id:
            continue
        matches = evaluate_event(event, rules)
        assert len(matches) == 1, f"{resource_id} should fire exactly one rule"
        return matches[0]
    raise AssertionError(f"no demo event for {resource_id}")


def test_public_bucket():
    m = _match_for("bucket-project-drawings")
    assert m.issue_type == "public_bucket"
    assert m.severity == "critical"  # production
    assert m.required_reviewers == ["security", "devops"]
    assert m.rule_confidence == 0.98
    assert m.evidence["public_access"] is True


def test_idle_vm():
    m = _match_for("vm-render-worker-07")
    assert m.issue_type == "idle_vm"
    assert m.severity == "medium"  # staging
    assert "devops" in m.required_reviewers
    assert m.evidence["monthly_usd"] == 96


def test_unused_storage():
    m = _match_for("vol-legacy-survey-backup")
    assert m.issue_type == "unused_storage"
    assert m.severity == "medium"
    assert "compliance" in m.required_reviewers


def test_unencrypted_db():
    m = _match_for("db-project-claims-prod")
    assert m.issue_type == "unencrypted_database"
    assert m.severity == "critical"  # production
    assert m.required_reviewers == ["security", "devops", "application_owner", "dba"]


def test_all_four_builtins_present():
    ids = {r.rule_id for r in builtin_rules()}
    assert ids == {
        "RULE_PUBLIC_BUCKET",
        "RULE_IDLE_VM",
        "RULE_UNUSED_STORAGE",
        "RULE_UNENCRYPTED_DATABASE",
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_builtin_parity.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.rules.seed_rules'`.

- [ ] **Step 3: Implement the built-in rules**

`backend/app/rules/seed_rules.py`:
```python
from datetime import UTC, datetime

from app.schemas import Rule, RuleCondition


def builtin_rules() -> list[Rule]:
    now = datetime.now(UTC)
    return [
        Rule(
            rule_id="RULE_PUBLIC_BUCKET",
            name="Public Bucket",
            template_key="public_exposure",
            resource_type="bucket",
            conditions=[RuleCondition(field="config.public_access", operator="==", value=True)],
            severity_base="high",
            escalate_in_prod=True,
            rule_confidence=0.98,
            category="security",
            issue_type="public_bucket",
            required_reviewers=["security", "devops"],
            evidence_fields=["environment", "project_id", "owner_team"],
            remediation_action_key="restrict_public_access",
            remediation_destructive=False,
            mode="manual",
            created_at=now,
        ),
        Rule(
            rule_id="RULE_IDLE_VM",
            name="Idle VM",
            template_key="idle_resource",
            resource_type="vm",
            conditions=[
                RuleCondition(field="metrics.avg_cpu_percent_7d", operator="<=", value=10),
                RuleCondition(field="metrics.network_in_mb_7d", operator="<=", value=100),
                RuleCondition(field="metrics.network_out_mb_7d", operator="<=", value=100),
            ],
            severity_base="medium",
            escalate_in_prod=True,
            rule_confidence=0.9,
            category="cost",
            issue_type="idle_vm",
            required_reviewers=["devops", "application_owner"],
            evidence_fields=["cost.monthly_usd", "config.application_id"],
            remediation_action_key="stop_vm",
            remediation_destructive=True,
            mode="manual",
            created_at=now,
        ),
        Rule(
            rule_id="RULE_UNUSED_STORAGE",
            name="Unused Storage",
            template_key="unused_resource",
            resource_type="storage",
            conditions=[
                RuleCondition(field="config.attached", operator="==", value=False),
                RuleCondition(field="metrics.read_ops_30d", operator="==", value=0),
                RuleCondition(field="metrics.write_ops_30d", operator="==", value=0),
            ],
            severity_base="medium",
            escalate_in_prod=False,
            rule_confidence=0.88,
            category="cost",
            issue_type="unused_storage",
            required_reviewers=["devops", "project_owner", "compliance"],
            evidence_fields=["cost.monthly_usd", "config.contains_sensitive_data"],
            remediation_action_key="delete_storage",
            remediation_destructive=True,
            mode="manual",
            created_at=now,
        ),
        Rule(
            rule_id="RULE_UNENCRYPTED_DATABASE",
            name="Unencrypted Database",
            template_key="unencrypted_data",
            resource_type="database",
            conditions=[RuleCondition(field="config.encrypted", operator="==", value=False)],
            severity_base="high",
            escalate_in_prod=True,
            rule_confidence=0.97,
            category="security",
            issue_type="unencrypted_database",
            required_reviewers=["security", "devops", "application_owner", "dba"],
            evidence_fields=["environment", "config.engine", "config.application_id"],
            remediation_action_key="plan_encryption",
            remediation_destructive=False,
            mode="manual",
            created_at=now,
        ),
    ]
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_builtin_parity.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/rules/seed_rules.py backend/tests/test_builtin_parity.py
git commit -m "feat(rules): migrate 4 built-in rules to data-driven seed records"
```

---

## Task 5: Seed rules into the store + wire the engine (+ fix savings key)

**Files:**
- Modify: `backend/app/services/store.py`, `backend/app/services/governance.py`, `backend/app/agents/recommendations.py`
- Test: `backend/tests/test_ingest_uses_store_rules.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_ingest_uses_store_rules.py`:
```python
from app.services.governance import GovernanceService
from app.services.seed import demo_events
from app.services.store import InMemoryStore


def test_store_seeds_builtin_rules():
    store = InMemoryStore()
    assert len(store.rules) == 4
    assert "RULE_PUBLIC_BUCKET" in store.rules


def test_ingest_creates_findings_via_store_rules():
    store = InMemoryStore()
    service = GovernanceService(store)
    res = service.ingest_events(demo_events(), actor_id="test")
    assert res.created_findings == 4


def test_disabling_a_store_rule_suppresses_its_finding():
    store = InMemoryStore()
    store.rules["RULE_PUBLIC_BUCKET"].enabled = False
    service = GovernanceService(store)
    res = service.ingest_events(demo_events(), actor_id="test")
    assert res.created_findings == 3
    assert all(f.issue_type != "public_bucket" for f in store.findings.values())


def test_idle_vm_and_storage_savings_preserved():
    # REGRESSION GUARD: the data-driven engine keys cost.monthly_usd as
    # "monthly_usd"; recommendations.py must read that key or savings -> 0.
    store = InMemoryStore()
    service = GovernanceService(store)
    service.ingest_events(demo_events(), actor_id="test")
    recs = {f.issue_type: store.recommendations[f.finding_id] for f in store.findings.values()}
    assert recs["idle_vm"].estimated_monthly_savings == 76.8  # 96 * 0.8
    assert recs["unused_storage"].estimated_monthly_savings == 28.7  # 41 * 0.7
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_ingest_uses_store_rules.py -v`
Expected: FAIL — `AttributeError: 'InMemoryStore' object has no attribute 'rules'` (and, once the store has rules, `test_idle_vm_and_storage_savings_preserved` fails with savings `0.0` until Step 4b lands).

- [ ] **Step 3: Add `rules` to the store**

In `backend/app/services/store.py`, add the import at the top (after the existing `from app.schemas import ...` line):
```python
from app.schemas import Rule
from app.rules.seed_rules import builtin_rules
```
Then in `InMemoryStore.__init__`, add after `self.latest_scan_at = None`:
```python
        self.rules: dict[str, Rule] = {rule.rule_id: rule for rule in builtin_rules()}
```

- [ ] **Step 4: Wire the engine call in governance**

In `backend/app/services/governance.py`, find this line (currently ~line 55):
```python
            for rule_match in evaluate_event(event):
```
Replace it with:
```python
            for rule_match in evaluate_event(event, list(self.store.rules.values())):
```

- [ ] **Step 4b: Fix the savings evidence key in `recommendations.py`**

The data-driven engine keys `cost.monthly_usd` as `monthly_usd` (leaf), but `recommendations.py` reads the old `monthly_cost_usd`. In `backend/app/agents/recommendations.py`, the functions `_idle_vm` (line ~44) and `_unused_storage` (line ~63) each contain this exact line:
```python
    monthly_cost = float(finding.evidence.get("monthly_cost_usd") or 0)
```
Replace **both** occurrences with (reads the new key, still tolerates the legacy one):
```python
    monthly_cost = float(finding.evidence.get("monthly_usd") or finding.evidence.get("monthly_cost_usd") or 0)
```

- [ ] **Step 5: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_ingest_uses_store_rules.py -v`
Expected: all PASS (including `test_idle_vm_and_storage_savings_preserved`).

- [ ] **Step 6: Run the FULL backend suite (no regressions)**

Run: `.venv/bin/pytest -v`
Expected: every test from Tasks 0–5 PASS. (The `rules_service` fixture is still commented out in `conftest.py` — it gets uncommented in Task 7. Collection succeeds.)

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/store.py backend/app/services/governance.py backend/app/agents/recommendations.py backend/tests/test_ingest_uses_store_rules.py
git commit -m "feat(rules): seed built-in rules into the store, drive ingest from them, fix savings key"
```

---

## Task 6: Clash detection

**Files:**
- Create: `backend/app/rules/clash.py`
- Test: `backend/tests/test_clash.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_clash.py`:
```python
from datetime import UTC, datetime

from app.rules.clash import detect_clashes
from app.rules.seed_rules import builtin_rules
from app.schemas import Rule, RuleCondition


def _rule(rule_id, field) -> Rule:
    return Rule(
        rule_id=rule_id,
        name=rule_id,
        resource_type="vm",
        issue_type="idle_vm",
        category="cost",
        conditions=[RuleCondition(field=field, operator="<=", value=10)],
        created_at=datetime.now(UTC),
    )


def test_no_clash_among_builtins():
    # built-ins target different resource_types -> no clashes
    assert detect_clashes(builtin_rules()) == []


def test_same_resource_and_field_clashes():
    warnings = detect_clashes([_rule("A", "metrics.avg_cpu_percent_7d"), _rule("B", "metrics.avg_cpu_percent_7d")])
    assert len(warnings) == 1
    assert {warnings[0].rule_id_a, warnings[0].rule_id_b} == {"A", "B"}
    assert warnings[0].field == "metrics.avg_cpu_percent_7d"


def test_same_resource_different_field_no_clash():
    assert detect_clashes([_rule("A", "metrics.avg_cpu_percent_7d"), _rule("B", "metrics.network_in_mb_7d")]) == []


def test_disabled_rule_does_not_clash():
    a = _rule("A", "metrics.avg_cpu_percent_7d")
    b = _rule("B", "metrics.avg_cpu_percent_7d")
    b.enabled = False
    assert detect_clashes([a, b]) == []
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_clash.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.rules.clash'`.

- [ ] **Step 3: Implement clash detection**

`backend/app/rules/clash.py`:
```python
from itertools import combinations

from app.schemas import ClashWarning, Rule


def detect_clashes(rules: list[Rule]) -> list[ClashWarning]:
    """Warn when two ENABLED rules target the same resource_type and share a
    condition field — the likely source of duplicate/abnormal findings."""
    enabled = [rule for rule in rules if rule.enabled]
    warnings: list[ClashWarning] = []
    for rule_a, rule_b in combinations(enabled, 2):
        if rule_a.resource_type != rule_b.resource_type:
            continue
        fields_a = {condition.field for condition in rule_a.conditions}
        fields_b = {condition.field for condition in rule_b.conditions}
        shared = sorted(fields_a & fields_b)
        for field in shared:
            warnings.append(
                ClashWarning(
                    rule_id_a=rule_a.rule_id,
                    rule_id_b=rule_b.rule_id,
                    resource_type=rule_a.resource_type,
                    field=field,
                    message=(
                        f"'{rule_a.name}' and '{rule_b.name}' both test "
                        f"{rule_a.resource_type}.{field} — they may double-fire."
                    ),
                )
            )
    return warnings
```

> **Deliberate simplification (recorded):** spec §5 defines a clash as a shared `resource_type` **+ field/operator** overlap. This implementation is **field-level only** — it ignores operators, so two rules on the same field with provably-disjoint operators (e.g. `cpu <= 10` vs `cpu >= 90`, which can never both fire) are still flagged. This is an intentional, conservative heuristic for Phase 1 (a warning, not a hard error); operator-aware disjointness can be added later without changing the API.

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_clash.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/rules/clash.py backend/tests/test_clash.py
git commit -m "feat(rules): detect clashing rules sharing resource_type + field"
```

---

## Task 7: Templates catalog + RuleService

**Files:**
- Create: `backend/app/rules/templates.py`, `backend/app/services/rules_service.py`
- Modify: `backend/app/services/dependencies.py`
- Test: `backend/tests/test_rules_service.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_rules_service.py`:
```python
from app.schemas import RuleCondition, RuleCreate, RuleUpdate
from app.services.rules_service import RuleService
from app.services.store import InMemoryStore


def _service() -> RuleService:
    return RuleService(InMemoryStore())


def test_list_includes_builtins():
    res = _service().list_rules()
    assert res.total == 4


def test_templates_nonempty():
    templates = _service().get_templates()
    assert len(templates) >= 6
    assert any(t.template_key == "threshold_breach" for t in templates)


def test_create_then_get():
    svc = _service()
    created = svc.create_rule(
        RuleCreate(
            name="Idle Prod VM",
            resource_type="vm",
            issue_type="idle_vm",
            category="cost",
            conditions=[RuleCondition(field="metrics.avg_cpu_percent_7d", operator="<=", value=5)],
        ),
        actor_id="tester",
    )
    assert created.rule_id.startswith("rule-")
    assert svc.get_rule(created.rule_id) is not None
    assert svc.list_rules().total == 5


def test_update_rule():
    svc = _service()
    updated = svc.update_rule("RULE_PUBLIC_BUCKET", RuleUpdate(enabled=False), actor_id="tester")
    assert updated is not None
    assert updated.enabled is False


def test_delete_rule():
    svc = _service()
    assert svc.delete_rule("RULE_IDLE_VM", actor_id="tester") is True
    assert svc.get_rule("RULE_IDLE_VM") is None
    assert svc.delete_rule("does-not-exist", actor_id="tester") is False


def test_clashes_passthrough():
    assert _service().get_clashes() == []


def test_preview_counts_matches():
    svc = _service()
    # store starts with no events; ingest the demo set so preview has data
    from app.services.seed import demo_events
    svc.store.events = {e.event_id: e for e in demo_events()}
    result = svc.preview(
        resource_type="bucket",
        conditions=[RuleCondition(field="config.public_access", operator="==", value=True)],
    )
    assert result.match_count == 1
    assert "bucket-project-drawings" in result.matched_resource_ids
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_rules_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.rules_service'`.

- [ ] **Step 3: Implement the templates catalog**

`backend/app/rules/templates.py`:
```python
from app.schemas import RuleCondition, RuleTemplate

RULE_TEMPLATES: list[RuleTemplate] = [
    RuleTemplate(
        template_key="public_exposure",
        name="Public Exposure",
        description="Flag a resource that is reachable from the public internet.",
        resource_type="bucket",
        conditions=[RuleCondition(field="config.public_access", operator="==", value=True)],
        severity_base="high",
        escalate_in_prod=True,
        rule_confidence=0.98,
        category="security",
        issue_type="public_bucket",
        required_reviewers=["security", "devops"],
        evidence_fields=["environment", "project_id", "owner_team"],
        remediation_action_key="restrict_public_access",
        remediation_destructive=False,
    ),
    RuleTemplate(
        template_key="idle_resource",
        name="Idle Resource",
        description="Flag a compute resource with sustained low utilisation.",
        resource_type="vm",
        conditions=[RuleCondition(field="metrics.avg_cpu_percent_7d", operator="<=", value=10)],
        severity_base="medium",
        escalate_in_prod=True,
        rule_confidence=0.9,
        category="cost",
        issue_type="idle_vm",
        required_reviewers=["devops", "application_owner"],
        evidence_fields=["cost.monthly_usd", "config.application_id"],
        remediation_action_key="stop_vm",
        remediation_destructive=True,
    ),
    RuleTemplate(
        template_key="unused_resource",
        name="Unused Resource",
        description="Flag an unattached/idle storage volume with no recent I/O.",
        resource_type="storage",
        conditions=[
            RuleCondition(field="config.attached", operator="==", value=False),
            RuleCondition(field="metrics.read_ops_30d", operator="==", value=0),
        ],
        severity_base="medium",
        escalate_in_prod=False,
        rule_confidence=0.88,
        category="cost",
        issue_type="unused_storage",
        required_reviewers=["devops", "project_owner"],
        evidence_fields=["cost.monthly_usd", "config.contains_sensitive_data"],
        remediation_action_key="delete_storage",
        remediation_destructive=True,
    ),
    RuleTemplate(
        template_key="unencrypted_data",
        name="Unencrypted Data",
        description="Flag a datastore that is not encrypted at rest.",
        resource_type="database",
        conditions=[RuleCondition(field="config.encrypted", operator="==", value=False)],
        severity_base="high",
        escalate_in_prod=True,
        rule_confidence=0.97,
        category="security",
        issue_type="unencrypted_database",
        required_reviewers=["security", "devops", "dba"],
        evidence_fields=["environment", "config.engine"],
        remediation_action_key="plan_encryption",
        remediation_destructive=False,
    ),
    RuleTemplate(
        template_key="forbidden_config_value",
        name="Forbidden Config Value",
        description="Flag when a config field equals a value you have banned.",
        resource_type="database",
        conditions=[RuleCondition(field="config.engine", operator="==", value="mysql")],
        severity_base="medium",
        escalate_in_prod=False,
        rule_confidence=0.8,
        category="security",
        issue_type="forbidden_config",
        required_reviewers=["security"],
        evidence_fields=["environment"],
        remediation_action_key="tag_resource",
        remediation_destructive=False,
    ),
    RuleTemplate(
        template_key="threshold_breach",
        name="Threshold Breach",
        description="Flag when a numeric metric crosses a threshold you set.",
        resource_type="vm",
        conditions=[RuleCondition(field="metrics.avg_cpu_percent_7d", operator=">=", value=90)],
        severity_base="medium",
        escalate_in_prod=True,
        rule_confidence=0.75,
        category="cost",
        issue_type="threshold_breach",
        required_reviewers=["devops"],
        evidence_fields=["cost.monthly_usd"],
        remediation_action_key="tag_resource",
        remediation_destructive=False,
    ),
    RuleTemplate(
        template_key="sensitive_data_exposure",
        name="Sensitive-Data Exposure",
        description="Flag a sensitive-tagged resource that is also exposed.",
        resource_type="storage",
        conditions=[
            RuleCondition(field="config.contains_sensitive_data", operator="==", value=True),
            RuleCondition(field="config.attached", operator="==", value=False),
        ],
        severity_base="high",
        escalate_in_prod=True,
        rule_confidence=0.85,
        category="security",
        issue_type="sensitive_exposure",
        required_reviewers=["security", "compliance"],
        evidence_fields=["owner_team", "project_id"],
        remediation_action_key="snapshot_then_flag",
        remediation_destructive=False,
    ),
    RuleTemplate(
        template_key="custom",
        name="Custom Rule",
        description="Start from scratch with your own conditions.",
        resource_type="vm",
        conditions=[],
        severity_base="medium",
        escalate_in_prod=False,
        rule_confidence=0.8,
        category="security",
        issue_type="custom_finding",
        required_reviewers=["devops"],
        evidence_fields=[],
        remediation_action_key="tag_resource",
        remediation_destructive=False,
    ),
]


def get_templates() -> list[RuleTemplate]:
    return RULE_TEMPLATES
```

- [ ] **Step 4: Implement the RuleService**

`backend/app/services/rules_service.py`:
```python
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
        updated = rule.model_copy(update=updates)
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
            if event.resource_type != resource_type:
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
```

- [ ] **Step 5: Add the dependency provider**

In `backend/app/services/dependencies.py`, replace the whole file with:
```python
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
```

- [ ] **Step 6: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_rules_service.py -v`
Expected: all PASS.

- [ ] **Step 7: Uncomment the conftest fixture + run the full suite**

Now that `app.services.rules_service` exists, edit `backend/tests/conftest.py`: uncomment the import and the fixture that were commented in Task 0. The file should now have, uncommented:
```python
from app.services.rules_service import RuleService
```
and
```python
@pytest.fixture
def rules_service(store: InMemoryStore) -> RuleService:
    return RuleService(store)
```
Then run: `.venv/bin/pytest -v`
Expected: every test PASSES.

- [ ] **Step 8: Commit**

```bash
git add backend/app/rules/templates.py backend/app/services/rules_service.py backend/app/services/dependencies.py backend/tests/conftest.py backend/tests/test_rules_service.py
git commit -m "feat(rules): add template catalog and RuleService (CRUD + clash + preview)"
```

---

## Task 8: Rules REST API

**Files:**
- Create: `backend/app/api/rules_routes.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_rules_api.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_rules_api.py`:
```python
from fastapi.testclient import TestClient

from app.main import create_app


def _client() -> TestClient:
    return TestClient(create_app())


def test_list_rules():
    res = _client().get("/api/rules")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 4
    assert {r["rule_id"] for r in body["items"]} >= {"RULE_PUBLIC_BUCKET"}


def test_get_templates():
    res = _client().get("/api/rules/templates")
    assert res.status_code == 200
    assert any(t["template_key"] == "threshold_breach" for t in res.json())


def test_get_clashes_empty_by_default():
    res = _client().get("/api/rules/clashes")
    assert res.status_code == 200
    assert res.json() == []


def test_preview():
    res = _client().post(
        "/api/rules/preview",
        json={
            "resource_type": "bucket",
            "conditions": [{"field": "config.public_access", "operator": "==", "value": True}],
        },
    )
    assert res.status_code == 200
    assert res.json()["match_count"] >= 1  # seed data has the public bucket


def test_create_update_delete_roundtrip():
    client = _client()
    created = client.post(
        "/api/rules",
        json={
            "name": "Idle Prod VM",
            "resource_type": "vm",
            "issue_type": "idle_vm",
            "category": "cost",
            "conditions": [{"field": "metrics.avg_cpu_percent_7d", "operator": "<=", "value": 5}],
        },
    )
    assert created.status_code == 201
    rule_id = created.json()["rule_id"]

    patched = client.patch(f"/api/rules/{rule_id}", json={"enabled": False})
    assert patched.status_code == 200
    assert patched.json()["enabled"] is False

    deleted = client.delete(f"/api/rules/{rule_id}")
    assert deleted.status_code == 204

    missing = client.patch(f"/api/rules/{rule_id}", json={"enabled": True})
    assert missing.status_code == 404
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_rules_api.py -v`
Expected: FAIL — 404s (router not mounted).

- [ ] **Step 3: Implement the router**

`backend/app/api/rules_routes.py`:
```python
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
```

- [ ] **Step 4: Mount the router**

In `backend/app/main.py`, add the import after `from app.api.routes import router as api_router`:
```python
from app.api.rules_routes import router as rules_router
```
Then after `app.include_router(api_router)` add:
```python
    app.include_router(rules_router)
```

- [ ] **Step 5: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_rules_api.py -v`
Expected: all PASS.

- [ ] **Step 6: Run the full backend suite**

Run: `.venv/bin/pytest -v`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/rules_routes.py backend/app/main.py backend/tests/test_rules_api.py
git commit -m "feat(rules): expose /api/rules CRUD + templates + clashes + preview"
```

---

## Task 9: Manual backend smoke (live server)

**Files:** none (manual verification gate)

- [ ] **Step 1: Start the backend**

Run:
```bash
cd /Users/zhehann/Desktop/imaginehack/imaginehack2026/backend
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```
Expected: server starts, seeds 4 demo findings.

- [ ] **Step 2: Hit the new endpoints (new terminal)**

Run:
```bash
curl -s http://127.0.0.1:8000/api/rules | python3 -m json.tool | head -30
curl -s http://127.0.0.1:8000/api/rules/templates | python3 -c "import sys,json; print(len(json.load(sys.stdin)),'templates')"
curl -s -X POST http://127.0.0.1:8000/api/rules/preview -H 'Content-Type: application/json' \
  -d '{"resource_type":"bucket","conditions":[{"field":"config.public_access","operator":"==","value":true}]}'
```
Expected: 4 rules listed; ≥8 templates; preview `match_count` ≥ 1.

- [ ] **Step 3: Confirm findings still work (no regression)**

Run: `curl -s http://127.0.0.1:8000/api/dashboard/summary | python3 -m json.tool`
Expected: `active_findings` is 4 (built-in rules still detect the seed estate). Stop the server (Ctrl-C).

- [ ] **Step 4: Commit (nothing to commit — gate only)**

If clean, proceed. No commit.

---

## Task 10: Frontend types + API client + mock fallback

**Files:**
- Modify: `app/lib/types.ts`, `app/lib/api.ts`, `app/lib/mockData.ts`

- [ ] **Step 1: Add rule types**

Append to `app/lib/types.ts`:
```typescript
// ---- Custom Rules (SafeCloud Phase 1) ----
export type ConditionOperator =
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "in"
  | "not_in"
  | "exists"
  | "contains";

export type RuleMode = "monitor" | "manual" | "auto";

export interface RuleCondition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface Rule {
  rule_id: string;
  name: string;
  enabled: boolean;
  template_key: string;
  resource_type: ResourceType;
  conditions: RuleCondition[];
  severity_base: Severity;
  escalate_in_prod: boolean;
  rule_confidence: number;
  category: Category;
  issue_type: string;
  required_reviewers: string[];
  evidence_fields: string[];
  remediation_action_key: string;
  remediation_destructive: boolean;
  mode: RuleMode;
  auto_threshold: number | null;
  created_at: string;
}

export interface RuleListResponse {
  items: Rule[];
  total: number;
}

export interface RuleTemplate {
  template_key: string;
  name: string;
  description: string;
  resource_type: ResourceType;
  conditions: RuleCondition[];
  severity_base: Severity;
  escalate_in_prod: boolean;
  rule_confidence: number;
  category: Category;
  issue_type: string;
  required_reviewers: string[];
  evidence_fields: string[];
  remediation_action_key: string;
  remediation_destructive: boolean;
}

export interface ClashWarning {
  rule_id_a: string;
  rule_id_b: string;
  resource_type: string;
  field: string;
  message: string;
}

export interface RuleCreateBody {
  name: string;
  resource_type: ResourceType;
  issue_type: string;
  category: Category;
  conditions: RuleCondition[];
  enabled?: boolean;
  template_key?: string;
  severity_base?: Severity;
  escalate_in_prod?: boolean;
  rule_confidence?: number;
  required_reviewers?: string[];
  evidence_fields?: string[];
  remediation_action_key?: string;
  remediation_destructive?: boolean;
  mode?: RuleMode;
  auto_threshold?: number | null;
}

export interface RulePreviewResponse {
  match_count: number;
  matched_resource_ids: string[];
}
```

- [ ] **Step 2: Add mock rules**

First, **merge** `Rule` and `RuleTemplate` into the EXISTING top-of-file type import in `app/lib/mockData.ts` (do NOT add a second import statement — ESLint `import/first` will flag a trailing import). The existing import (around line 4) reads:
```typescript
import type { AuditLog, DashboardSummary, Finding, FindingDetail, Recommendation } from "./types";
```
Change it to:
```typescript
import type {
  AuditLog,
  DashboardSummary,
  Finding,
  FindingDetail,
  Recommendation,
  Rule,
  RuleTemplate,
} from "./types";
```
> Verify the exact names in the existing import before editing — if `mockData.ts` imports a different set, just add `Rule` and `RuleTemplate` to whatever is already there.

Then **append only the value constants** (no import line) to the bottom of `app/lib/mockData.ts`:
```typescript
export const MOCK_RULES: Rule[] = [
  {
    rule_id: "RULE_PUBLIC_BUCKET",
    name: "Public Bucket",
    enabled: true,
    template_key: "public_exposure",
    resource_type: "bucket",
    conditions: [{ field: "config.public_access", operator: "==", value: true }],
    severity_base: "high",
    escalate_in_prod: true,
    rule_confidence: 0.98,
    category: "security",
    issue_type: "public_bucket",
    required_reviewers: ["security", "devops"],
    evidence_fields: ["environment", "project_id", "owner_team"],
    remediation_action_key: "restrict_public_access",
    remediation_destructive: false,
    mode: "manual",
    auto_threshold: null,
    created_at: "2026-06-20T00:00:00Z",
  },
  {
    rule_id: "RULE_IDLE_VM",
    name: "Idle VM",
    enabled: true,
    template_key: "idle_resource",
    resource_type: "vm",
    conditions: [{ field: "metrics.avg_cpu_percent_7d", operator: "<=", value: 10 }],
    severity_base: "medium",
    escalate_in_prod: true,
    rule_confidence: 0.9,
    category: "cost",
    issue_type: "idle_vm",
    required_reviewers: ["devops", "application_owner"],
    evidence_fields: ["cost.monthly_usd"],
    remediation_action_key: "stop_vm",
    remediation_destructive: true,
    mode: "manual",
    auto_threshold: null,
    created_at: "2026-06-20T00:00:00Z",
  },
  {
    rule_id: "RULE_UNUSED_STORAGE",
    name: "Unused Storage",
    enabled: true,
    template_key: "unused_resource",
    resource_type: "storage",
    conditions: [{ field: "config.attached", operator: "==", value: false }],
    severity_base: "medium",
    escalate_in_prod: false,
    rule_confidence: 0.88,
    category: "cost",
    issue_type: "unused_storage",
    required_reviewers: ["devops", "project_owner", "compliance"],
    evidence_fields: ["cost.monthly_usd"],
    remediation_action_key: "delete_storage",
    remediation_destructive: true,
    mode: "manual",
    auto_threshold: null,
    created_at: "2026-06-20T00:00:00Z",
  },
  {
    rule_id: "RULE_UNENCRYPTED_DATABASE",
    name: "Unencrypted Database",
    enabled: true,
    template_key: "unencrypted_data",
    resource_type: "database",
    conditions: [{ field: "config.encrypted", operator: "==", value: false }],
    severity_base: "high",
    escalate_in_prod: true,
    rule_confidence: 0.97,
    category: "security",
    issue_type: "unencrypted_database",
    required_reviewers: ["security", "devops", "application_owner", "dba"],
    evidence_fields: ["environment"],
    remediation_action_key: "plan_encryption",
    remediation_destructive: false,
    mode: "manual",
    auto_threshold: null,
    created_at: "2026-06-20T00:00:00Z",
  },
];

export const MOCK_RULE_TEMPLATES: RuleTemplate[] = [
  {
    template_key: "threshold_breach",
    name: "Threshold Breach",
    description: "Flag when a numeric metric crosses a threshold you set.",
    resource_type: "vm",
    conditions: [{ field: "metrics.avg_cpu_percent_7d", operator: ">=", value: 90 }],
    severity_base: "medium",
    escalate_in_prod: true,
    rule_confidence: 0.75,
    category: "cost",
    issue_type: "threshold_breach",
    required_reviewers: ["devops"],
    evidence_fields: ["cost.monthly_usd"],
    remediation_action_key: "tag_resource",
    remediation_destructive: false,
  },
  {
    template_key: "custom",
    name: "Custom Rule",
    description: "Start from scratch with your own conditions.",
    resource_type: "vm",
    conditions: [],
    severity_base: "medium",
    escalate_in_prod: false,
    rule_confidence: 0.8,
    category: "security",
    issue_type: "custom_finding",
    required_reviewers: ["devops"],
    evidence_fields: [],
    remediation_action_key: "tag_resource",
    remediation_destructive: false,
  },
];
```

- [ ] **Step 3: Add API client functions**

In `app/lib/api.ts`, extend the type import block to include the new types:
```typescript
import type {
  AuditLog,
  AuditLogsResponse,
  ClashWarning,
  DashboardSummary,
  Finding,
  FindingDetail,
  FindingsQuery,
  FindingsResponse,
  Rule,
  RuleCreateBody,
  RuleListResponse,
  RulePreviewResponse,
  RuleTemplate,
  ReviewBody,
  ReviewResponse,
} from "./types";
```
Add to the mock-data import block (top of file):
```typescript
import { MOCK_RULES, MOCK_RULE_TEMPLATES } from "./mockData";
```
Then append these functions before the final `export const apiBaseConfigured` line:
```typescript
// ---- Rules (SafeCloud Phase 1) ----

export async function getRules(): Promise<ApiResult<RuleListResponse>> {
  try {
    return ok(await tryFetch<RuleListResponse>("/api/rules"));
  } catch (e) {
    return fallback({ items: MOCK_RULES, total: MOCK_RULES.length }, e);
  }
}

export async function getRuleTemplates(): Promise<ApiResult<RuleTemplate[]>> {
  try {
    return ok(await tryFetch<RuleTemplate[]>("/api/rules/templates"));
  } catch (e) {
    return fallback(MOCK_RULE_TEMPLATES, e);
  }
}

export async function getClashes(): Promise<ApiResult<ClashWarning[]>> {
  try {
    return ok(await tryFetch<ClashWarning[]>("/api/rules/clashes"));
  } catch (e) {
    return fallback([], e);
  }
}

export async function createRule(body: RuleCreateBody): Promise<ApiResult<Rule>> {
  try {
    return ok(
      await tryFetch<Rule>("/api/rules", { method: "POST", body: JSON.stringify(body) }),
    );
  } catch (e) {
    // Mock mode: echo a fake created rule so the UI can optimistically render.
    return fallback(
      {
        ...body,
        rule_id: `rule-mock-${Math.abs(hashString(body.name))}`,
        enabled: body.enabled ?? true,
        template_key: body.template_key ?? "custom",
        severity_base: body.severity_base ?? "medium",
        escalate_in_prod: body.escalate_in_prod ?? false,
        rule_confidence: body.rule_confidence ?? 0.8,
        required_reviewers: body.required_reviewers ?? [],
        evidence_fields: body.evidence_fields ?? [],
        remediation_action_key: body.remediation_action_key ?? "tag_resource",
        remediation_destructive: body.remediation_destructive ?? false,
        mode: body.mode ?? "manual",
        auto_threshold: body.auto_threshold ?? null,
        created_at: new Date().toISOString(),
      } as Rule,
      e,
    );
  }
}

export async function updateRule(
  id: string,
  body: Partial<RuleCreateBody> & { enabled?: boolean },
): Promise<ApiResult<Rule | null>> {
  try {
    return ok(
      await tryFetch<Rule>(`/api/rules/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    );
  } catch (e) {
    return fallback(null, e);
  }
}

export async function deleteRule(id: string): Promise<ApiResult<boolean>> {
  try {
    await tryFetch<unknown>(`/api/rules/${id}`, { method: "DELETE" });
    return ok(true);
  } catch (e) {
    return fallback(false, e);
  }
}

export async function previewRule(body: {
  resource_type: string;
  conditions: { field: string; operator: string; value?: unknown }[];
}): Promise<ApiResult<RulePreviewResponse>> {
  try {
    return ok(
      await tryFetch<RulePreviewResponse>("/api/rules/preview", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  } catch (e) {
    return fallback({ match_count: 0, matched_resource_ids: [] }, e);
  }
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
```

- [ ] **Step 4: Typecheck**

Run:
```bash
cd /Users/zhehann/Desktop/imaginehack/imaginehack2026
node ./node_modules/next/dist/bin/next build
```
Expected: TypeScript compiles with no errors. (If `next build` is slow/heavy, alternatively run `npx tsc --noEmit` — but `next build` is the project's canonical check per `ARCHITECTURE.md` §9.)

- [ ] **Step 5: Commit**

```bash
git add app/lib/types.ts app/lib/api.ts app/lib/mockData.ts
git commit -m "feat(rules): frontend rule types, API client, and mock fallback"
```

---

## Task 11: Rules nav entry + icon

**Files:**
- Modify: `app/components/icons.tsx`, `app/components/AppShell.tsx`

- [ ] **Step 1: Add an icon**

`app/components/icons.tsx` defines a private `type P = SVGProps<SVGSVGElement>` and a `base(props)` helper that sets `viewBox`/`fill`/`stroke`/`strokeWidth`/`strokeLinecap` and spreads `...props` (so `width`/`height`/`style` pass through). Every icon is a const arrow function: `export const IconX = (p: P) => (<svg {...base(p)}>…</svg>)`. **Match that exact pattern** — do NOT reference an `IconProps` type (it does not exist). Add:
```tsx
export const IconRules = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 3H5a2 2 0 0 0-2 2v4" />
    <path d="M15 3h4a2 2 0 0 1 2 2v4" />
    <path d="M9 21H5a2 2 0 0 1-2-2v-4" />
    <path d="M15 21h4a2 2 0 0 0 2-2v-4" />
    <path d="M9 9h6v6H9z" />
  </svg>
);
```
> The `viewBox`/`stroke`/`strokeWidth` come from `base(p)`, so don't repeat them on the `<svg>`. AppShell renders nav icons as `<Icon width={22} height={22} style={{ color }} />`, which `base(p)` forwards correctly.

- [ ] **Step 2: Add the nav entry**

In `app/components/AppShell.tsx`, add `IconRules` to the icon import from `./icons`, then add to the `NAV` array (after the Audit entry):
```typescript
  { href: "/rules", label: "Rules", icon: IconRules },
```

- [ ] **Step 3: Typecheck**

Run: `node ./node_modules/next/dist/bin/next build`
Expected: compiles. (The `/rules` route doesn't exist yet — Next won't error on a nav `href` to a not-yet-created route; it's just a `Link`.)

- [ ] **Step 4: Commit**

```bash
git add app/components/icons.tsx app/components/AppShell.tsx
git commit -m "feat(rules): add Rules nav entry + icon"
```

---

## Task 12: Rules page (list + clash banner)

**Files:**
- Create: `app/(dashboard)/rules/page.tsx`

- [ ] **Step 1: Create the server page**

`app/(dashboard)/rules/page.tsx`:
```tsx
import { getRules, getRuleTemplates, getClashes } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner } from "@/app/components/ui";
import RulesManager from "./RulesManager";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const [rulesRes, templatesRes, clashesRes] = await Promise.all([
    getRules(),
    getRuleTemplates(),
    getClashes(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Detection Rules"
        subtitle="Author and manage the rules the SafeCloud agent runs. Built from standardized templates — no code."
      />
      {rulesRes.mock && <MockBanner reason={rulesRes.error} />}
      <RulesManager
        initialRules={rulesRes.data.items}
        templates={templatesRes.data}
        clashes={clashesRes.data}
      />
    </div>
  );
}
```
> Verify `PageHeader` accepts `title`/`subtitle` and `MockBanner` accepts `reason` — both are confirmed exports of `layout-bits.tsx` / `ui.tsx`. If `MockBanner`'s prop differs, pass it however the existing pages (e.g. `app/(dashboard)/security/page.tsx`) pass it.

- [ ] **Step 2: (RulesManager comes next — page won't compile until Task 13.)**

Proceed directly to Task 13; they commit together.

---

## Task 13: New-Rule wizard (RulesManager client component)

**Files:**
- Create: `app/(dashboard)/rules/RulesManager.tsx`

- [ ] **Step 1: Create the client component**

`app/(dashboard)/rules/RulesManager.tsx`:
```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ClashWarning,
  ConditionOperator,
  Rule,
  RuleCondition,
  RuleTemplate,
} from "@/app/lib/types";
import { createRule, deleteRule, previewRule, updateRule } from "@/app/lib/api";
import { Card, SeverityBadge, Pill } from "@/app/components/ui";
import { useToast } from "@/app/lib/toast";

const OPERATORS: ConditionOperator[] = [
  "==", "!=", "<", "<=", ">", ">=", "in", "not_in", "exists", "contains",
];

export default function RulesManager({
  initialRules,
  templates,
  clashes,
}: {
  initialRules: Rule[];
  templates: RuleTemplate[];
  clashes: ClashWarning[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [wizardOpen, setWizardOpen] = useState(false);

  async function toggle(rule: Rule) {
    const res = await updateRule(rule.rule_id, { enabled: !rule.enabled });
    setRules((rs) =>
      rs.map((r) => (r.rule_id === rule.rule_id ? { ...r, enabled: !r.enabled } : r)),
    );
    toast(res.mock ? "Toggled (mock)" : `Rule ${rule.enabled ? "disabled" : "enabled"}`, "success");
    router.refresh();
  }

  async function remove(rule: Rule) {
    await deleteRule(rule.rule_id);
    setRules((rs) => rs.filter((r) => r.rule_id !== rule.rule_id));
    toast("Rule deleted", "success");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {clashes.length > 0 && (
        <div className="rounded-lg border border-[#FB8C00] bg-[#FFF7EC] p-3 text-[13px] text-[#8a5200]">
          <p className="font-medium">⚠ {clashes.length} rule clash{clashes.length === 1 ? "" : "es"} detected</p>
          <ul className="mt-1 list-disc pl-5">
            {clashes.map((c, i) => (
              <li key={i}>{c.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[#606060]">{rules.length} rule{rules.length === 1 ? "" : "s"}</p>
        <button
          onClick={() => setWizardOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-full bg-[#0F0F0F] px-4 text-[13px] font-medium text-white hover:bg-black"
        >
          + New Rule
        </button>
      </div>

      <Card>
        <div className="divide-y divide-[#E5E5E5]">
          {rules.map((rule) => (
            <div key={rule.rule_id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-[#0F0F0F]">{rule.name}</span>
                  <SeverityBadge severity={rule.severity_base} />
                  <Pill>{rule.resource_type}</Pill>
                  {rule.remediation_destructive && <Pill>destructive</Pill>}
                </div>
                <p className="mt-0.5 truncate text-[12px] text-[#606060]">
                  {rule.conditions.map((c) => `${c.field} ${c.operator} ${formatVal(c.value)}`).join(" AND ") || "no conditions"}
                </p>
              </div>
              <button
                onClick={() => toggle(rule)}
                className={`h-7 rounded-full px-3 text-[12px] font-medium ${rule.enabled ? "bg-[#E7F6EC] text-[#1f7a3d]" : "bg-[#F2F2F2] text-[#606060]"}`}
              >
                {rule.enabled ? "Enabled" : "Disabled"}
              </button>
              <button
                onClick={() => remove(rule)}
                className="h-7 rounded-full px-3 text-[12px] text-[#FF0000] hover:bg-[#FFECEC]"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </Card>

      {wizardOpen && (
        <RuleWizard
          templates={templates}
          onClose={() => setWizardOpen(false)}
          onCreated={(rule) => {
            setRules((rs) => [...rs, rule]);
            setWizardOpen(false);
            toast("Rule created", "success");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function formatVal(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

function RuleWizard({
  templates,
  onClose,
  onCreated,
}: {
  templates: RuleTemplate[];
  onClose: () => void;
  onCreated: (rule: Rule) => void;
}) {
  const [templateKey, setTemplateKey] = useState(templates[0]?.template_key ?? "custom");
  const template = useMemo(
    () => templates.find((t) => t.template_key === templateKey) ?? templates[0],
    [templates, templateKey],
  );

  const [name, setName] = useState("");
  const [conditions, setConditions] = useState<RuleCondition[]>(template?.conditions ?? []);
  const [preview, setPreview] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  function applyTemplate(key: string) {
    setTemplateKey(key);
    const t = templates.find((x) => x.template_key === key);
    if (t) {
      setConditions(t.conditions.length ? t.conditions : [{ field: "", operator: "==", value: "" }]);
      if (!name) setName(t.name);
    }
  }

  function setCond(i: number, patch: Partial<RuleCondition>) {
    setConditions((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  async function runPreview() {
    if (!template) return;
    const res = await previewRule({
      resource_type: template.resource_type,
      conditions: conditions.map((c) => ({ ...c, value: coerce(c.value) })),
    });
    setPreview(res.data.match_count);
  }

  async function save() {
    if (!template || !name.trim()) return;
    setSaving(true);
    try {
      const res = await createRule({
        name: name.trim(),
        template_key: template.template_key,
        resource_type: template.resource_type,
        issue_type: template.issue_type,
        category: template.category,
        conditions: conditions.map((c) => ({ ...c, value: coerce(c.value) })),
        severity_base: template.severity_base,
        escalate_in_prod: template.escalate_in_prod,
        rule_confidence: template.rule_confidence,
        required_reviewers: template.required_reviewers,
        evidence_fields: template.evidence_fields,
        remediation_action_key: template.remediation_action_key,
        remediation_destructive: template.remediation_destructive,
      });
      onCreated(res.data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 gg-scrim" onClick={onClose} />
      <div className="gg-fade-up relative z-10 w-full max-w-[560px] rounded-xl border border-[#E5E5E5] bg-white p-5 shadow-[var(--shadow-e3)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold">New Rule</h2>
          <button onClick={onClose} className="text-[#606060] hover:text-[#0F0F0F]">✕</button>
        </div>

        <label className="mt-4 block text-[12px] font-medium text-[#606060]">Template</label>
        <select
          value={templateKey}
          onChange={(e) => applyTemplate(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-[14px]"
        >
          {templates.map((t) => (
            <option key={t.template_key} value={t.template_key}>{t.name}</option>
          ))}
        </select>
        <p className="mt-1 text-[12px] text-[#606060]">{template?.description}</p>

        <label className="mt-4 block text-[12px] font-medium text-[#606060]">Rule name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Idle Prod VM"
          className="mt-1 w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-[14px]"
        />

        <div className="mt-4 flex items-center justify-between">
          <label className="text-[12px] font-medium text-[#606060]">
            Conditions ({template?.resource_type})
          </label>
          <button
            onClick={() => setConditions((cs) => [...cs, { field: "", operator: "==", value: "" }])}
            className="text-[12px] text-[#065FD4]"
          >
            + condition
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {conditions.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={c.field}
                onChange={(e) => setCond(i, { field: e.target.value })}
                placeholder="config.public_access"
                className="flex-1 rounded-lg border border-[#E5E5E5] px-2 py-1.5 text-[13px]"
              />
              <select
                value={c.operator}
                onChange={(e) => setCond(i, { operator: e.target.value as ConditionOperator })}
                className="rounded-lg border border-[#E5E5E5] px-2 py-1.5 text-[13px]"
              >
                {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
              <input
                value={c.value === undefined || c.value === null ? "" : String(c.value)}
                onChange={(e) => setCond(i, { value: e.target.value })}
                placeholder="value"
                className="w-24 rounded-lg border border-[#E5E5E5] px-2 py-1.5 text-[13px]"
              />
              <button
                onClick={() => setConditions((cs) => cs.filter((_, idx) => idx !== i))}
                className="px-1 text-[#FF0000]"
              >✕</button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={runPreview} className="h-9 rounded-full border border-[#E5E5E5] px-4 text-[13px] hover:bg-[#F2F2F2]">
            Preview matches
          </button>
          {preview !== null && (
            <span className="text-[13px] text-[#606060]">
              Matches <span className="font-bold text-[#0F0F0F]">{preview}</span> resource{preview === 1 ? "" : "s"} right now
            </span>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-full px-4 text-[13px] hover:bg-[#F2F2F2]">Cancel</button>
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="h-9 rounded-full bg-[#0F0F0F] px-5 text-[13px] font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save rule"}
          </button>
        </div>
      </div>
    </div>
  );
}

function coerce(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s !== "" && !Number.isNaN(Number(s))) return Number(s);
  return v;
}
```
> Verify the exact prop names of `Card`, `SeverityBadge`, `Pill` against `app/components/ui.tsx` (confirmed exports). `SeverityBadge` takes `severity`. The CSS classes `gg-scrim`, `gg-fade-up`, `var(--shadow-e3)` are used by the existing `FindingModal` — reuse them as-is.

- [ ] **Step 2: Typecheck + build**

Run: `node ./node_modules/next/dist/bin/next build`
Expected: compiles with no TypeScript errors and the `/rules` route is generated.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/rules/page.tsx" "app/(dashboard)/rules/RulesManager.tsx"
git commit -m "feat(rules): Rules page with list, clash banner, and New-Rule wizard"
```

---

## Task 14: End-to-end manual verification

**Files:** none (verification gate)

- [ ] **Step 1: Start both services**

Terminal 1:
```bash
cd /Users/zhehann/Desktop/imaginehack/imaginehack2026/backend
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```
Terminal 2:
```bash
cd /Users/zhehann/Desktop/imaginehack/imaginehack2026
# create app/.env.local with: NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
node ./node_modules/next/dist/bin/next dev
```

- [ ] **Step 2: Verify the Rules page (live backend)**

Open `http://localhost:3000/rules`. Confirm:
- 4 built-in rules listed (Public Bucket, Idle VM, Unused Storage, Unencrypted Database).
- No mock banner (backend is live).
- "New Rule" opens the wizard; selecting "Threshold Breach" pre-fills a condition.
- "Preview matches" returns a count from the seeded estate.
- Saving a rule adds it to the list; it persists on refresh (in-memory until backend restart).
- Toggling/deleting a rule works.

- [ ] **Step 3: Verify mock fallback (no backend)**

Stop the backend (Terminal 1 Ctrl-C). Reload `http://localhost:3000/rules`. Confirm the 4 mock rules render and a mock banner appears. The dashboard never goes blank.

- [ ] **Step 4: Confirm no regression on existing pages**

Visit `/`, `/security`, `/cost`, `/energy`, `/audit` — all still load and show findings as before.

- [ ] **Step 5: Final commit (docs)**

If you adjusted anything during verification, commit it. Otherwise the phase is complete.

```bash
git add -A
git commit -m "chore(rules): phase 1 verification pass" --allow-empty
```

---

## Self-Review (completed by plan author)

- **Spec coverage (Phase 1 scope):** data-driven engine (Tasks 2–5) ✓ · template catalog (Task 7) ✓ · structured condition builder UI (Task 13) ✓ · clash detection (Task 6, surfaced Task 12/13) ✓ · live "matches N" preview (Tasks 7, 13) ✓ · Rules CRUD API (Task 8) ✓ · Rules nav + page (Tasks 11–13) ✓ · built-ins migrated without regression (Tasks 4–5, 9, 14) ✓ · per-rule `mode`/`auto_threshold` fields carried on the model for Phase 3 ✓. **Deferred to later phases (correctly out of Phase 1 scope):** criticality scoring, threat reports, response-policy enforcement, custom agents, the real agent script. **Criticality note:** spec §13 lists "criticality" under Phase 1, but §13's Phase 3 line *also* lists "Criticality scoring + threat-report generator", and criticality is only *consumed* by threat reports (§7) and the response policy (§8) — both Phase 3. Deferring `compute_criticality` to Phase 3 is intentional (nothing in Phase 1 reads its output); the §13 Phase-1 wording is superseded by the §13 Phase-3 line.
- **Placeholder scan:** no TBD/TODO; every code step contains complete code; every test step contains real assertions.
- **Type consistency:** `evaluate_event(event, rules)` signature is consistent across engine (Task 3), governance (Task 5), and tests. `RuleMatch` fields unchanged → `governance.py` consumers untouched. Schema field names match between `schemas/rules.py` (Task 1), `seed_rules.py` (Task 4), `RuleService` (Task 7), the API (Task 8), and the TS types (Task 10). `RuleCreate` excludes `rule_id`/`created_at`; `create_rule` supplies both — consistent.

---

## Roadmap — Phases 2–4 (separate plans, authored after Phase 1 lands)

- **Phase 2 — Custom Agents:** `Agent` schema (lens/coverage/tone/extra_focus) + seed the 5 personas; refactor the master router in `agents/` to select by coverage and compile the persona into a prompt; `AgentService` + `/api/agents` CRUD + templates; **Agents** page with the clone-template wizard + sample-finding preview. Keep the "AI explains, never invents numbers" invariant.
- **Phase 3 — Threat Reports + Response Policy:** deterministic `compute_criticality`; `ThreatReport` generator (LLM "what & why" + activity-log timeline + recommended solution); `ResponsePolicy` (global + per-rule mode/threshold) enforced at finding creation; `RemediationCommand` lifecycle with the **destructive-always-gated** invariant; **Threats** page + Policy panel; auto-generate on threshold cross.
- **Phase 4 — Real SafeCloud Agent:** `safecloud-agent.py` (stdlib) + `watch/` folder (`infra-snapshot.json`, `activity.log`, `generator.py`); agent endpoints (`/api/agent/enroll|config|events|commands|status`) with `X-Agent-Token`; agent executes approved `RemediationCommand`s by mutating the snapshot (visible closed loop); "Agent online" status chip. Swap the in-process simulator for the agent — no UI changes.
