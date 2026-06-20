# SafeCloud Phase 2 — Customizable AI Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user define their own AI analysis agents from the dashboard — each with a Name, a **lens** (analytical angle), **coverage** (which finding categories/issue-types it analyzes), a tone, and a bounded extra-focus note — standardized via persona templates. Make agent routing **data-driven** so a finding's `agent_outputs` come from the enabled agents whose coverage matches it, instead of a hardcoded per-issue map.

**Architecture:** Add an `Agent` data model + a data-driven **router** (`select_agents` + `build_agent_outputs`) that replaces the hardcoded agent maps in `recommendations.py` and `ai_client.py`. The 5 existing personas (security/cost/energy/workflow/audit) become pre-loaded seed `Agent` records whose coverage **reproduces today's exact per-issue agent selection**. The LLM enrichment becomes agent-driven (prompt built from the selected agents' personas; output clamped to their keys). The deterministic per-lens template is the base + fallback (AI explains, never invents numbers). Then an `AgentService` + `/api/agents` CRUD + an **Agents** page with a clone-template wizard and a sample-finding preview.

**Tech Stack:** Python 3.13 / FastAPI / Pydantic v2 (+ pytest, already bootstrapped in Phase 1) · Next.js 16.2.9 / React 19 / TS / Tailwind v4. macOS (`python3`, `node`; no `uv`). Backend venv already exists at `backend/.venv` (Phase 1).

**Builds on Phase 1** (branch `safecloud-phase1-rules`, 13 commits, 42 backend tests green). **Spec:** `docs/superpowers/specs/2026-06-20-safecloud-custom-rules-agents-design.md` §6 (custom agents), §2 decision 4, §13 Phase 2.

**Deliberate change (recorded):** the deterministic `agent_outputs` text moves from hand-written per-issue lines (in `recommendations.py`) to **per-lens templates** keyed by each matching agent's `output_key`. The seed agents reproduce the exact same *set of keys* per issue type (proven by a parity test), so the modal renders the same sections; only the fallback *wording* changes (and the LLM rewrites it anyway when enabled). The numeric fields (savings/carbon/risk/confidence/severity) are untouched — same safety boundary as Phase 1.

---

## Agent → coverage design (the core idea)

Selection rule: an agent analyzes a finding when **`finding.category ∈ agent.coverage_categories` OR `finding.issue_type ∈ agent.coverage_issue_types`**. The 5 seed personas are configured so this reproduces the existing `_RELEVANT_AGENTS` map in `ai_client.py`:

| Seed agent (`output_key`) | lens | coverage_categories | coverage_issue_types |
| --- | --- | --- | --- |
| `security` | `exposure` | `["security"]` | `[]` |
| `cost` | `cost` | `["cost"]` | `[]` |
| `energy` | `carbon` | `[]` | `["idle_vm","unused_storage"]` |
| `workflow` | `workflow` | `[]` | `["public_bucket","idle_vm","unencrypted_database"]` |
| `audit` | `compliance` | `[]` | `["public_bucket","unused_storage","unencrypted_database"]` |

Resulting selection per issue type (verified in Task 3's parity test):
- `public_bucket` (cat security) → security, workflow, audit
- `idle_vm` (cat cost) → cost, energy, workflow
- `unused_storage` (cat cost) → cost, energy, audit
- `unencrypted_database` (cat security) → security, workflow, audit

These match the current `_RELEVANT_AGENTS` sets exactly.

---

## File Structure

**Backend — create:**
- `backend/app/schemas/agents.py` — `Agent`, `AgentCreate`, `AgentUpdate`, `AgentListResponse`, `AgentTemplate`, `AgentPreviewRequest`, `AgentPreviewResponse`, `AgentLens`.
- `backend/app/agents/router.py` — `select_agents`, `build_agent_outputs`, `LENS_TEMPLATES`, `issue_label`.
- `backend/app/agents/seed_agents.py` — `builtin_agents()` (the 5 personas).
- `backend/app/agents/templates.py` — `AGENT_TEMPLATES`, `get_agent_templates()`.
- `backend/app/services/agents_service.py` — `AgentService` (CRUD + templates + preview, audited).
- `backend/app/api/agents_routes.py` — the `/api/agents*` router.
- Test files per task under `backend/tests/`.

**Backend — modify:**
- `backend/app/schemas/__init__.py` — export the new agent schemas.
- `backend/app/services/store.py` — add `self.agents` seeded from `builtin_agents()`.
- `backend/app/agents/recommendations.py` — drop the baked `agent_outputs` from the builders (keep numbers); make the `pop` default to `{}`.
- `backend/app/services/governance.py` — populate `agent_outputs` via `build_agent_outputs` at ingest; pass selected agents into AI enrichment.
- `backend/app/agents/ai_client.py` — `generate_agent_analysis(finding, recommendation, agents)` builds the prompt from the selected agents' personas and clamps output to their `output_key`s.
- `backend/app/services/dependencies.py` — add `get_agent_service()`.
- `backend/app/main.py` — `include_router(agents_router)`.

**Frontend — create:**
- `app/(dashboard)/agents/page.tsx` — server component (list + templates).
- `app/(dashboard)/agents/AgentsManager.tsx` — client component (table + clone-template wizard + sample preview).

**Frontend — modify:**
- `app/lib/types.ts` — agent types.
- `app/lib/api.ts` — agent client functions + mock fallback.
- `app/lib/mockData.ts` — `MOCK_AGENTS`, `MOCK_AGENT_TEMPLATES`.
- `app/components/icons.tsx` — `IconAgents`.
- `app/components/AppShell.tsx` — add Agents nav entry.

---

## Task 0: Confirm Phase 1 baseline is green

**Files:** none (gate)

- [ ] **Step 1: Confirm the backend suite + build are green before starting**

Run:
```bash
cd /Users/zhehann/Desktop/imaginehack/imaginehack2026/backend && .venv/bin/pytest -q -p no:warnings 2>&1 | tail -2
cd /Users/zhehann/Desktop/imaginehack/imaginehack2026 && node ./node_modules/next/dist/bin/next build 2>&1 | grep -E "Compiled|error" | head
```
Expected: pytest all-pass (42 dots), `✓ Compiled successfully`. If not green, STOP — Phase 1 must be clean first.

---

## Task 1: Agent schemas

**Files:**
- Create: `backend/app/schemas/agents.py`
- Modify: `backend/app/schemas/__init__.py`
- Test: `backend/tests/test_agent_schemas.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_agent_schemas.py`:
```python
from app.schemas import Agent, AgentCreate


def test_agent_defaults():
    a = Agent(
        agent_id="ag-1",
        name="Data Exposure Specialist",
        lens="exposure",
        output_key="data_exposure",
        created_at="2026-06-20T00:00:00Z",
    )
    assert a.enabled is True
    assert a.coverage_categories == []
    assert a.coverage_issue_types == []
    assert a.tone == "concise"
    assert a.extra_focus == ""


def test_agent_create_minimal():
    payload = AgentCreate(name="My Agent", lens="cost", output_key="my_agent")
    assert payload.lens == "cost"
    assert payload.template_key == "custom"
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_agent_schemas.py -v`
Expected: FAIL — `ImportError: cannot import name 'Agent'`.

- [ ] **Step 3: Implement the schemas**

`backend/app/schemas/agents.py`:
```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

AgentLens = Literal[
    "exposure", "encryption", "cost", "carbon", "compliance", "workflow", "forensics"
]
AgentTone = Literal["concise", "detailed", "executive", "construction-aware"]


class Agent(BaseModel):
    agent_id: str
    name: str
    enabled: bool = True
    lens: AgentLens
    output_key: str  # the key used in recommendation.agent_outputs (e.g. "security")
    coverage_categories: list[str] = Field(default_factory=list)
    coverage_issue_types: list[str] = Field(default_factory=list)
    tone: AgentTone = "concise"
    extra_focus: str = ""
    template_key: str = "custom"
    created_at: datetime


class AgentCreate(BaseModel):
    name: str
    lens: AgentLens
    output_key: str
    enabled: bool = True
    coverage_categories: list[str] = Field(default_factory=list)
    coverage_issue_types: list[str] = Field(default_factory=list)
    tone: AgentTone = "concise"
    extra_focus: str = ""
    template_key: str = "custom"


class AgentUpdate(BaseModel):
    # NOTE: output_key is intentionally NOT updatable. The store is keyed by
    # output_key, so allowing a rename would let a PATCH collide with (and
    # silently clobber) another agent. output_key is immutable post-create.
    name: str | None = None
    lens: AgentLens | None = None
    enabled: bool | None = None
    coverage_categories: list[str] | None = None
    coverage_issue_types: list[str] | None = None
    tone: AgentTone | None = None
    extra_focus: str | None = None


class AgentListResponse(BaseModel):
    items: list[Agent]
    total: int


class AgentTemplate(BaseModel):
    template_key: str
    name: str
    description: str
    lens: AgentLens
    output_key: str
    coverage_categories: list[str] = Field(default_factory=list)
    coverage_issue_types: list[str] = Field(default_factory=list)
    tone: AgentTone = "concise"
    extra_focus: str = ""


class AgentPreviewRequest(BaseModel):
    lens: AgentLens
    issue_type: str = "public_bucket"
    tone: AgentTone = "concise"
    extra_focus: str = ""


class AgentPreviewResponse(BaseModel):
    text: str
```

- [ ] **Step 4: Export from the schemas package**

In `backend/app/schemas/__init__.py`, add after the `from app.schemas.rules import (...)` block:
```python
from app.schemas.agents import (
    Agent,
    AgentCreate,
    AgentLens,
    AgentListResponse,
    AgentPreviewRequest,
    AgentPreviewResponse,
    AgentTemplate,
    AgentUpdate,
)
```
And add these names to the `__all__` list:
```python
    "Agent",
    "AgentCreate",
    "AgentLens",
    "AgentListResponse",
    "AgentPreviewRequest",
    "AgentPreviewResponse",
    "AgentTemplate",
    "AgentUpdate",
```

- [ ] **Step 5: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_agent_schemas.py -v`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/agents.py backend/app/schemas/__init__.py backend/tests/test_agent_schemas.py
git commit -m "feat(agents): add Agent data-model schemas"
```

---

## Task 2: Lens templates + agent selection (router)

**Files:**
- Create: `backend/app/agents/router.py`
- Test: `backend/tests/test_agent_router.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_agent_router.py`:
```python
from datetime import UTC, datetime

from app.agents.router import build_agent_outputs, issue_label, select_agents
from app.schemas import Agent, Finding, Recommendation


def _agent(output_key, lens, cats=None, issues=None, enabled=True) -> Agent:
    return Agent(
        agent_id=f"ag-{output_key}",
        name=output_key,
        lens=lens,
        output_key=output_key,
        enabled=enabled,
        coverage_categories=cats or [],
        coverage_issue_types=issues or [],
        created_at=datetime.now(UTC),
    )


def _finding(category="security", issue_type="public_bucket") -> Finding:
    return Finding(
        finding_id="f1",
        source_event_id="e1",
        resource_id="bucket-x",
        resource_type="bucket",
        issue_type=issue_type,
        category=category,
        severity="critical",
        status="pending_review",
        rule_id="R",
        rule_confidence=0.9,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _rec() -> Recommendation:
    return Recommendation(
        recommendation_id="r1",
        finding_id="f1",
        recommended_action="Restrict.",
        rationale="why",
        risk_level="critical",
        estimated_monthly_savings=76.8,
        estimated_carbon_reduction_kg=26.88,
        confidence=0.9,
    )


def test_select_by_category():
    agents = [_agent("security", "exposure", cats=["security"]), _agent("cost", "cost", cats=["cost"])]
    picked = select_agents(_finding(category="security"), agents)
    assert [a.output_key for a in picked] == ["security"]


def test_select_by_issue_type():
    agents = [_agent("energy", "carbon", issues=["idle_vm"])]
    assert select_agents(_finding(category="cost", issue_type="idle_vm"), agents)
    assert not select_agents(_finding(category="cost", issue_type="public_bucket"), agents)


def test_disabled_agent_not_selected():
    agents = [_agent("security", "exposure", cats=["security"], enabled=False)]
    assert select_agents(_finding(), agents) == []


def test_build_agent_outputs_keys_and_text():
    agents = [
        _agent("cost", "cost", cats=["cost"]),
        _agent("energy", "carbon", issues=["idle_vm"]),
    ]
    out = build_agent_outputs(_finding(category="cost", issue_type="idle_vm"), _rec(), agents)
    assert set(out.keys()) == {"cost", "energy"}
    assert "76.8" in out["cost"]  # cost lens references the savings number
    assert all(isinstance(v, str) and v for v in out.values())


def test_issue_label():
    assert issue_label("public_bucket") == "Public Bucket"
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_agent_router.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.agents.router'`.

- [ ] **Step 3: Implement the router**

`backend/app/agents/router.py`:
```python
"""Data-driven agent routing: which agents analyze a finding, and the
deterministic per-lens base text. The LLM (ai_client) later rewrites this text;
the numbers always come from the rules."""

from typing import Any, Callable

from app.schemas import Agent, Finding, Recommendation


def issue_label(issue_type: str) -> str:
    return issue_type.replace("_", " ").title()


def select_agents(finding: Finding, agents: list[Agent]) -> list[Agent]:
    """Enabled agents whose coverage matches the finding's category or issue_type."""
    picked = [
        agent
        for agent in agents
        if agent.enabled
        and (
            finding.category in agent.coverage_categories
            or finding.issue_type in agent.coverage_issue_types
        )
    ]
    picked.sort(key=lambda a: a.created_at)
    return picked


def _exposure(f: Finding, r: Recommendation) -> str:
    return (
        f"{issue_label(f.issue_type)} on {f.resource_id} is a {f.severity} exposure / "
        "data-protection risk. Validate intended access before any change."
    )


def _encryption(f: Finding, r: Recommendation) -> str:
    return (
        f"{f.resource_id} is not encrypted at rest — a compliance and data-protection "
        "risk. Plan encryption in an approved maintenance window."
    )


def _cost(f: Finding, r: Recommendation) -> str:
    return (
        f"Estimated monthly waste on {f.resource_id} is about ${r.estimated_monthly_savings}. "
        "Confirm the resource is unused before reclaiming it."
    )


def _carbon(f: Finding, r: Recommendation) -> str:
    return (
        f"Reclaiming {f.resource_id} avoids roughly {r.estimated_carbon_reduction_kg} kg CO2e "
        "per month (estimate)."
    )


def _compliance(f: Finding, r: Recommendation) -> str:
    return (
        f"{issue_label(f.issue_type)} needs a full audit trail and the listed approvals "
        "before any remediation is recorded."
    )


def _workflow(f: Finding, r: Recommendation) -> str:
    return (
        f"Check application ownership and downtime impact for {f.resource_id} before "
        "changing it — it may support an active project workflow."
    )


def _forensics(f: Finding, r: Recommendation) -> str:
    return (
        f"Trace who changed {f.resource_id} and when from the activity history before "
        "deciding on remediation."
    )


LENS_TEMPLATES: dict[str, Callable[[Finding, Recommendation], str]] = {
    "exposure": _exposure,
    "encryption": _encryption,
    "cost": _cost,
    "carbon": _carbon,
    "compliance": _compliance,
    "workflow": _workflow,
    "forensics": _forensics,
}


def build_agent_outputs(
    finding: Finding, recommendation: Recommendation, agents: list[Agent]
) -> dict[str, str]:
    """Deterministic per-agent base text, keyed by each selected agent's output_key."""
    outputs: dict[str, Any] = {}
    for agent in select_agents(finding, agents):
        template = LENS_TEMPLATES.get(agent.lens)
        if template is None:
            continue
        outputs[agent.output_key] = template(finding, recommendation)
    return outputs
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_agent_router.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/agents/router.py backend/tests/test_agent_router.py
git commit -m "feat(agents): data-driven agent selection + per-lens base text"
```

---

## Task 3: Seed the 5 personas + store collection (parity)

**Files:**
- Create: `backend/app/agents/seed_agents.py`
- Modify: `backend/app/services/store.py`
- Test: `backend/tests/test_agent_parity.py`

- [ ] **Step 1: Write the failing parity test**

`backend/tests/test_agent_parity.py`:
```python
from datetime import UTC, datetime

from app.agents.router import select_agents
from app.agents.seed_agents import builtin_agents
from app.schemas import Finding
from app.services.store import InMemoryStore

# The legacy hardcoded map this must reproduce (ai_client._RELEVANT_AGENTS).
EXPECTED = {
    ("security", "public_bucket"): {"security", "workflow", "audit"},
    ("cost", "idle_vm"): {"cost", "energy", "workflow"},
    ("cost", "unused_storage"): {"cost", "energy", "audit"},
    ("security", "unencrypted_database"): {"security", "workflow", "audit"},
}


def _finding(category, issue_type) -> Finding:
    return Finding(
        finding_id="f",
        source_event_id="e",
        resource_id="r",
        resource_type="bucket",
        issue_type=issue_type,
        category=category,
        severity="high",
        status="pending_review",
        rule_id="R",
        rule_confidence=0.9,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def test_builtin_agents_present():
    keys = {a.output_key for a in builtin_agents()}
    assert keys == {"security", "cost", "energy", "workflow", "audit"}


def test_selection_reproduces_legacy_map():
    agents = builtin_agents()
    for (category, issue_type), expected in EXPECTED.items():
        picked = {a.output_key for a in select_agents(_finding(category, issue_type), agents)}
        assert picked == expected, f"{issue_type}: {picked} != {expected}"


def test_store_seeds_agents():
    store = InMemoryStore()
    assert len(store.agents) == 5
    assert "security" in store.agents
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_agent_parity.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.agents.seed_agents'`.

- [ ] **Step 3: Implement the seed personas**

`backend/app/agents/seed_agents.py`:
```python
from datetime import UTC, datetime

from app.schemas import Agent


def builtin_agents() -> list[Agent]:
    now = datetime.now(UTC)
    return [
        Agent(
            agent_id="agent-security",
            name="Security Analyst",
            lens="exposure",
            output_key="security",
            coverage_categories=["security"],
            coverage_issue_types=[],
            tone="construction-aware",
            template_key="security_analyst",
            created_at=now,
        ),
        Agent(
            agent_id="agent-cost",
            name="Cost Optimizer",
            lens="cost",
            output_key="cost",
            coverage_categories=["cost"],
            coverage_issue_types=[],
            tone="executive",
            template_key="cost_optimizer",
            created_at=now,
        ),
        Agent(
            agent_id="agent-energy",
            name="Carbon Analyst",
            lens="carbon",
            output_key="energy",
            coverage_categories=[],
            coverage_issue_types=["idle_vm", "unused_storage"],
            tone="concise",
            template_key="carbon_analyst",
            created_at=now,
        ),
        Agent(
            agent_id="agent-workflow",
            name="Workflow Impact",
            lens="workflow",
            output_key="workflow",
            coverage_categories=[],
            coverage_issue_types=["public_bucket", "idle_vm", "unencrypted_database"],
            tone="construction-aware",
            template_key="workflow_impact",
            created_at=now,
        ),
        Agent(
            agent_id="agent-audit",
            name="Compliance Auditor",
            lens="compliance",
            output_key="audit",
            coverage_categories=[],
            coverage_issue_types=["public_bucket", "unused_storage", "unencrypted_database"],
            tone="detailed",
            template_key="compliance_auditor",
            created_at=now,
        ),
    ]
```

- [ ] **Step 4: Add `agents` to the store**

In `backend/app/services/store.py`: change the existing line 4 `from app.schemas import Rule` to `from app.schemas import Agent, Rule` (merge — do not add a third `from app.schemas import` line), and add the seed import next to the existing `from app.rules.seed_rules import builtin_rules`:
```python
from app.agents.seed_agents import builtin_agents
```

In `InMemoryStore.__init__`, after the `self.rules = {...}` line added in Phase 1, add:
```python
        self.agents: dict[str, Agent] = {agent.output_key: agent for agent in builtin_agents()}
```
> Note: agents are keyed by `output_key` (unique, human-meaningful) in the store dict.

- [ ] **Step 5: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_agent_parity.py -v`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/agents/seed_agents.py backend/app/services/store.py backend/tests/test_agent_parity.py
git commit -m "feat(agents): seed 5 personas reproducing the legacy per-issue agent map"
```

---

## Task 4: Wire the router into ingest (replace baked agent_outputs)

**Files:**
- Modify: `backend/app/agents/recommendations.py`, `backend/app/services/governance.py`
- Test: `backend/tests/test_ingest_agent_outputs.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_ingest_agent_outputs.py`:
```python
from app.services.governance import GovernanceService
from app.services.seed import demo_events
from app.services.store import InMemoryStore


def _ingest():
    store = InMemoryStore()
    service = GovernanceService(store)
    service.ingest_events(demo_events(), actor_id="test")
    return store


def test_agent_outputs_keys_match_coverage():
    store = _ingest()
    by_issue = {f.issue_type: store.recommendations[f.finding_id] for f in store.findings.values()}
    assert set(by_issue["public_bucket"].agent_outputs.keys()) == {"security", "workflow", "audit"}
    assert set(by_issue["idle_vm"].agent_outputs.keys()) == {"cost", "energy", "workflow"}
    assert set(by_issue["unused_storage"].agent_outputs.keys()) == {"cost", "energy", "audit"}
    assert set(by_issue["unencrypted_database"].agent_outputs.keys()) == {"security", "workflow", "audit"}


def test_savings_still_preserved():
    store = _ingest()
    by_issue = {f.issue_type: store.recommendations[f.finding_id] for f in store.findings.values()}
    assert by_issue["idle_vm"].estimated_monthly_savings == 76.8
    assert by_issue["unused_storage"].estimated_monthly_savings == 28.7


def test_disabling_an_agent_drops_its_section():
    store = InMemoryStore()
    store.agents["workflow"].enabled = False
    service = GovernanceService(store)
    service.ingest_events(demo_events(), actor_id="test")
    bucket = next(
        store.recommendations[f.finding_id]
        for f in store.findings.values()
        if f.issue_type == "public_bucket"
    )
    assert "workflow" not in bucket.agent_outputs
    assert "security" in bucket.agent_outputs
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_ingest_agent_outputs.py -v`
Expected: FAIL — the keys won't match (today's baked map differs / extra keys), and the disable test fails because routing isn't agent-driven yet.

- [ ] **Step 3: Drop the baked `agent_outputs` from the builders**

In `backend/app/agents/recommendations.py`:

(a) Change the `pop` to tolerate a missing key. Find:
```python
        agent_outputs=payload.pop("agent_outputs"),
```
Replace with:
```python
        agent_outputs=payload.pop("agent_outputs", {}),
```

(b) Remove the `"agent_outputs": { ... }` entry from **each** builder (`_public_bucket`, `_idle_vm`, `_unused_storage`, `_unencrypted_database`, `_generic`). For example `_public_bucket` becomes:
```python
def _public_bucket(finding: Finding) -> dict:
    return {
        "recommended_action": "Restrict public access after Security and DevOps validate intended exposure.",
        "rationale": "The bucket is publicly accessible and may expose construction documents or project data.",
        "risk_level": finding.severity,
        "estimated_monthly_savings": 0,
        "estimated_carbon_reduction_kg": 0,
        "confidence": 0.9,
    }
```
Apply the same deletion (remove only the `"agent_outputs": {...}` block, keep every other key) to `_idle_vm`, `_unused_storage`, `_unencrypted_database`, and `_generic`. Leave the savings/carbon math in `_idle_vm`/`_unused_storage` untouched.

- [ ] **Step 4: Populate `agent_outputs` from the router at ingest**

In `backend/app/services/governance.py`, add the import near the other agent imports at the top:
```python
from app.agents.router import build_agent_outputs
```
Then in `ingest_events`, find:
```python
                recommendation = build_recommendation(finding)
                finding.ai_confidence = recommendation.confidence
```
Replace with:
```python
                recommendation = build_recommendation(finding)
                recommendation.agent_outputs = build_agent_outputs(
                    finding, recommendation, list(self.store.agents.values())
                )
                finding.ai_confidence = recommendation.confidence
```

- [ ] **Step 5: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_ingest_agent_outputs.py -v`
Expected: all PASS.

- [ ] **Step 6: Run the full backend suite (no regressions)**

Run: `.venv/bin/pytest -q -p no:warnings`
Expected: all pass (Phase 1's 42 + the new agent tests). The Phase 1 savings test still passes (numbers untouched).

- [ ] **Step 7: Commit**

```bash
git add backend/app/agents/recommendations.py backend/app/services/governance.py backend/tests/test_ingest_agent_outputs.py
git commit -m "feat(agents): drive agent_outputs from data-driven router at ingest"
```

---

## Task 5: Make the LLM enrichment agent-driven

**Files:**
- Modify: `backend/app/agents/ai_client.py`, `backend/app/services/governance.py`
- Test: `backend/tests/test_ai_client_agents.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_ai_client_agents.py`:
```python
from datetime import UTC, datetime

from app.agents.ai_client import build_prompt, generate_agent_analysis, parse_response
from app.schemas import Agent, Finding, Recommendation


def _agent(output_key, lens) -> Agent:
    return Agent(
        agent_id=f"ag-{output_key}",
        name=f"{output_key} agent",
        lens=lens,
        output_key=output_key,
        extra_focus="flag tender drawings",
        created_at=datetime.now(UTC),
    )


def _finding() -> Finding:
    return Finding(
        finding_id="f1", source_event_id="e1", resource_id="bucket-x",
        resource_type="bucket", issue_type="public_bucket", category="security",
        severity="critical", status="pending_review", rule_id="R", rule_confidence=0.9,
        created_at=datetime.now(UTC), updated_at=datetime.now(UTC),
    )


def _rec() -> Recommendation:
    return Recommendation(
        recommendation_id="r1", finding_id="f1", recommended_action="Restrict.",
        rationale="why", risk_level="critical", confidence=0.9,
    )


def test_prompt_mentions_each_agent_key():
    agents = [_agent("security", "exposure"), _agent("audit", "compliance")]
    prompt = build_prompt(_finding(), _rec(), agents)
    assert "security" in prompt and "audit" in prompt
    assert "flag tender drawings" in prompt  # extra_focus surfaced


def test_parse_clamps_to_allowed_keys():
    allowed = {"security", "audit"}
    raw = '{"choices":[{"message":{"content":"{\\"security\\":\\"risk\\",\\"cost\\":\\"nope\\"}"}}]}'
    out = parse_response(raw, allowed)
    assert out == {"security": "risk"}  # "cost" dropped (not in allowed)


def test_generate_returns_none_when_ai_disabled():
    # No AI key configured in tests -> ai_enabled is False -> None.
    assert generate_agent_analysis(_finding(), _rec(), [_agent("security", "exposure")]) is None
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_ai_client_agents.py -v`
Expected: FAIL — `ImportError: cannot import name 'build_prompt'` (current names are private `_build_prompt`/`_parse_response` with different signatures).

- [ ] **Step 3: Refactor `ai_client.py` to be agent-driven**

In `backend/app/agents/ai_client.py`:

(a) Delete the `_RELEVANT_AGENTS` and `_ALL_AGENTS` module constants (lines ~43–51). This is only safe because steps (c) and (d) below **wholesale-replace** `_build_prompt` (which read them) and `_parse_response` (which read `_ALL_AGENTS`). After all four sub-steps, **`grep -n "_RELEVANT_AGENTS\|_ALL_AGENTS\|_build_prompt\|_parse_response" backend/app/agents/ai_client.py` must return zero hits** — confirm before committing.

(b) Replace the `generate_agent_analysis` signature and body's prompt/parse calls. Change:
```python
def generate_agent_analysis(finding: Any, base_recommendation: Any) -> dict | None:
```
to:
```python
def generate_agent_analysis(finding: Any, base_recommendation: Any, agents: list | None = None) -> dict | None:
```
Inside it, replace `prompt = _build_prompt(finding, base_recommendation)` with:
```python
        agents = agents or []
        if not agents:
            return None
        prompt = build_prompt(finding, base_recommendation, agents)
```
and replace the final `return _parse_response(raw, finding)` with:
```python
    allowed = {getattr(a, "output_key", "") for a in agents}
    return parse_response(raw, allowed)
```

(c) Replace the `_build_prompt` function with a public, agent-driven `build_prompt`:
```python
def build_prompt(finding: Any, base_recommendation: Any, agents: list) -> str:
    issue_type = getattr(finding, "issue_type", "unknown")
    severity = getattr(finding, "severity", "unknown")
    rule_id = getattr(finding, "rule_id", "unknown")
    evidence = getattr(finding, "evidence", {}) or {}
    recommended_action = getattr(base_recommendation, "recommended_action", "")
    try:
        evidence_text = json.dumps(evidence, default=str)
    except (TypeError, ValueError):
        evidence_text = str(evidence)

    persona_lines = []
    keys = []
    for agent in agents:
        key = getattr(agent, "output_key", "")
        keys.append(key)
        lens = getattr(agent, "lens", "")
        name = getattr(agent, "name", key)
        tone = getattr(agent, "tone", "concise")
        extra = getattr(agent, "extra_focus", "") or ""
        line = f'- "{key}": persona "{name}", lens={lens}, tone={tone}.'
        if extra:
            line += f" Extra focus: {extra}."
        persona_lines.append(line)
    personas = "\n".join(persona_lines)

    return (
        "A deterministic rule engine detected a cloud governance issue.\n"
        f"issue_type: {issue_type}\n"
        f"severity: {severity}\n"
        f"rule_id: {rule_id}\n"
        f"evidence: {evidence_text}\n"
        f"deterministic_recommended_action: {recommended_action}\n\n"
        "Write a concise, construction-aware analysis for the human reviewers, "
        "one entry per agent below, each writing from its own lens:\n"
        f"{personas}\n\n"
        "Return ONLY a JSON object whose keys are exactly these agent keys: "
        f"{keys}. Each value is one or two plain-English sentences from that "
        "agent's perspective. Do NOT include dollar amounts, carbon figures, or "
        "approval counts (those are provided separately). Do NOT instruct anyone "
        "to execute the change automatically — a human approves it. "
        'Example shape: {"security": "...", "audit": "..."}'
    )
```

(d) Replace `_parse_response(raw, finding)` with a public `parse_response(raw, allowed_keys)`:
```python
def parse_response(raw: str, allowed_keys: set) -> dict | None:
    """Robustly extract the per-agent dict, clamped to allowed_keys."""
    try:
        envelope = json.loads(raw)
    except (TypeError, ValueError):
        return None
    content = _extract_content(envelope)
    if not content:
        return None
    parsed = _loads_json_object(content)
    if not isinstance(parsed, dict) or not parsed:
        return None
    cleaned: dict[str, str] = {}
    for key, value in parsed.items():
        agent_key = str(key).strip()
        if agent_key not in allowed_keys:
            continue
        if isinstance(value, (list, tuple)):
            text = " ".join(str(item).strip() for item in value if str(item).strip())
        else:
            text = str(value).strip()
        if text:
            cleaned[agent_key] = text
    return cleaned or None
```
Leave `_extract_content` and `_loads_json_object` unchanged.

- [ ] **Step 4: Pass the selected agents from governance**

In `backend/app/services/governance.py`, add to the imports near `from app.agents.router import build_agent_outputs`:
```python
from app.agents.router import build_agent_outputs, select_agents
```
Then in `_maybe_enrich_recommendation`, find:
```python
        ai_outputs = generate_agent_analysis(finding, recommendation)
```
Replace with:
```python
        selected = select_agents(finding, list(self.store.agents.values()))
        ai_outputs = generate_agent_analysis(finding, recommendation, selected)
```

- [ ] **Step 5: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_ai_client_agents.py -v`
Expected: all PASS.

- [ ] **Step 6: Full suite**

Run: `.venv/bin/pytest -q -p no:warnings`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/agents/ai_client.py backend/app/services/governance.py backend/tests/test_ai_client_agents.py
git commit -m "feat(agents): make LLM enrichment agent-driven (persona prompt + key clamp)"
```

---

## Task 6: Agent templates + AgentService

**Files:**
- Create: `backend/app/agents/templates.py`, `backend/app/services/agents_service.py`
- Modify: `backend/app/services/dependencies.py`
- Test: `backend/tests/test_agents_service.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_agents_service.py`:
```python
from app.schemas import AgentCreate, AgentUpdate
from app.services.agents_service import AgentService
from app.services.store import InMemoryStore


def _service() -> AgentService:
    return AgentService(InMemoryStore())


def test_list_includes_seeds():
    assert _service().list_agents().total == 5


def test_templates_nonempty():
    templates = _service().get_templates()
    assert len(templates) >= 4
    assert any(t.template_key == "forensics_analyst" for t in templates)


def test_create_get_update_delete():
    svc = _service()
    created = svc.create_agent(
        AgentCreate(name="Data Exposure Specialist", lens="exposure", output_key="data_exposure",
                    coverage_issue_types=["public_bucket"]),
        actor_id="t",
    )
    assert created.agent_id.startswith("agent-")
    assert svc.list_agents().total == 6
    updated = svc.update_agent(created.agent_id, AgentUpdate(enabled=False), actor_id="t")
    assert updated.enabled is False
    assert svc.delete_agent(created.agent_id, actor_id="t") is True
    assert svc.delete_agent("nope", actor_id="t") is False


def test_preview_uses_lens_template():
    out = _service().preview(lens="cost", issue_type="idle_vm", tone="concise", extra_focus="")
    assert "$" in out.text  # cost lens references a sample savings number
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_agents_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.agents_service'`.

- [ ] **Step 3: Implement the templates catalog**

`backend/app/agents/templates.py`:
```python
from app.schemas import AgentTemplate

AGENT_TEMPLATES: list[AgentTemplate] = [
    AgentTemplate(
        template_key="security_analyst",
        name="Security Analyst",
        description="Explains exposure and data-protection risk on security findings.",
        lens="exposure",
        output_key="security",
        coverage_categories=["security"],
        tone="construction-aware",
    ),
    AgentTemplate(
        template_key="compliance_auditor",
        name="Compliance Auditor",
        description="Checks audit trail and approval readiness.",
        lens="compliance",
        output_key="audit",
        coverage_issue_types=["public_bucket", "unused_storage", "unencrypted_database"],
        tone="detailed",
    ),
    AgentTemplate(
        template_key="cost_optimizer",
        name="Cost Optimizer",
        description="Estimates and explains monthly cloud waste.",
        lens="cost",
        output_key="cost",
        coverage_categories=["cost"],
        tone="executive",
    ),
    AgentTemplate(
        template_key="carbon_analyst",
        name="Carbon Analyst",
        description="Explains the estimated carbon impact of reclaiming a resource.",
        lens="carbon",
        output_key="energy",
        coverage_issue_types=["idle_vm", "unused_storage"],
        tone="concise",
    ),
    AgentTemplate(
        template_key="forensics_analyst",
        name="Forensics Analyst",
        description="Traces who changed a resource and when from the activity history.",
        lens="forensics",
        output_key="forensics",
        coverage_categories=["security"],
        tone="detailed",
    ),
    AgentTemplate(
        template_key="custom",
        name="Custom Agent",
        description="Start from scratch — pick a lens and coverage.",
        lens="exposure",
        output_key="custom_agent",
        tone="concise",
    ),
]


def get_agent_templates() -> list[AgentTemplate]:
    return AGENT_TEMPLATES
```

- [ ] **Step 4: Implement the AgentService**

`backend/app/services/agents_service.py`:
```python
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
```

- [ ] **Step 5: Add the dependency provider**

In `backend/app/services/dependencies.py`, add the import and a provider. After the `_rule_service = RuleService(_store)` line add:
```python
from app.services.agents_service import AgentService
_agent_service = AgentService(_store)
```
> Put the `from app.services.agents_service import AgentService` import at the top with the other imports; the `_agent_service = ...` assignment goes after `_store` is created. Then add at the bottom:
```python
def get_agent_service() -> AgentService:
    return _agent_service
```

- [ ] **Step 6: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_agents_service.py -v`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/agents/templates.py backend/app/services/agents_service.py backend/app/services/dependencies.py backend/tests/test_agents_service.py
git commit -m "feat(agents): add persona templates and AgentService (CRUD + preview)"
```

---

## Task 7: Agents REST API

**Files:**
- Create: `backend/app/api/agents_routes.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_agents_api.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_agents_api.py`:
```python
from fastapi.testclient import TestClient

from app.main import create_app


def _client() -> TestClient:
    c = TestClient(create_app())
    c.__enter__()  # fire startup so the singleton store is seeded
    return c


def test_list_agents():
    # >= 5 (not == 5): the API tests share the singleton store; assert the 5
    # seeds are present rather than an exact count that other tests can perturb.
    res = _client().get("/api/agents")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] >= 5
    assert {a["output_key"] for a in body["items"]} >= {"security", "cost", "energy", "workflow", "audit"}


def test_templates():
    res = _client().get("/api/agents/templates")
    assert res.status_code == 200
    assert any(t["template_key"] == "forensics_analyst" for t in res.json())


def test_preview():
    res = _client().post(
        "/api/agents/preview",
        json={"lens": "cost", "issue_type": "idle_vm", "tone": "concise", "extra_focus": ""},
    )
    assert res.status_code == 200
    assert "$" in res.json()["text"]


def test_create_update_delete():
    client = _client()
    created = client.post(
        "/api/agents",
        json={"name": "Data Exposure Specialist", "lens": "exposure", "output_key": "data_exposure",
              "coverage_issue_types": ["public_bucket"]},
    )
    assert created.status_code == 201
    agent_id = created.json()["agent_id"]
    patched = client.patch(f"/api/agents/{agent_id}", json={"enabled": False})
    assert patched.status_code == 200
    assert patched.json()["enabled"] is False
    assert client.delete(f"/api/agents/{agent_id}").status_code == 204
    assert client.patch(f"/api/agents/{agent_id}", json={"enabled": True}).status_code == 404
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_agents_api.py -v`
Expected: FAIL — 404s (router not mounted).

- [ ] **Step 3: Implement the router**

`backend/app/api/agents_routes.py`:
```python
from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas import (
    Agent,
    AgentCreate,
    AgentListResponse,
    AgentPreviewRequest,
    AgentPreviewResponse,
    AgentTemplate,
    AgentUpdate,
)
from app.services.agents_service import AgentService
from app.services.dependencies import get_agent_service

router = APIRouter(prefix="/api/agents", tags=["agents"])


# Literal paths before the /{agent_id} catch-all.
@router.get("/templates", response_model=list[AgentTemplate])
def list_templates(service: AgentService = Depends(get_agent_service)) -> list[AgentTemplate]:
    return service.get_templates()


@router.post("/preview", response_model=AgentPreviewResponse)
def preview_agent(
    payload: AgentPreviewRequest,
    service: AgentService = Depends(get_agent_service),
) -> AgentPreviewResponse:
    return service.preview(payload.lens, payload.issue_type, payload.tone, payload.extra_focus)


@router.get("", response_model=AgentListResponse)
def list_agents(service: AgentService = Depends(get_agent_service)) -> AgentListResponse:
    return service.list_agents()


@router.post("", response_model=Agent, status_code=status.HTTP_201_CREATED)
def create_agent(
    payload: AgentCreate,
    service: AgentService = Depends(get_agent_service),
) -> Agent:
    return service.create_agent(payload, actor_id="dashboard")


@router.get("/{agent_id}", response_model=Agent)
def get_agent(agent_id: str, service: AgentService = Depends(get_agent_service)) -> Agent:
    agent = service.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=Agent)
def update_agent(
    agent_id: str,
    payload: AgentUpdate,
    service: AgentService = Depends(get_agent_service),
) -> Agent:
    updated = service.update_agent(agent_id, payload, actor_id="dashboard")
    if updated is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return updated


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(agent_id: str, service: AgentService = Depends(get_agent_service)) -> None:
    if not service.delete_agent(agent_id, actor_id="dashboard"):
        raise HTTPException(status_code=404, detail="Agent not found")
```

- [ ] **Step 4: Mount the router**

In `backend/app/main.py`, add after the `from app.api.rules_routes import router as rules_router` line:
```python
from app.api.agents_routes import router as agents_router
```
Then after `app.include_router(rules_router)` add:
```python
    app.include_router(agents_router)
```

- [ ] **Step 5: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_agents_api.py -v`
Expected: all PASS.

- [ ] **Step 6: Full backend suite**

Run: `.venv/bin/pytest -q -p no:warnings`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/agents_routes.py backend/app/main.py backend/tests/test_agents_api.py
git commit -m "feat(agents): expose /api/agents CRUD + templates + preview"
```

---

## Task 8: Frontend types + API client + mock fallback

**Files:**
- Modify: `app/lib/types.ts`, `app/lib/api.ts`, `app/lib/mockData.ts`

- [ ] **Step 1: Add agent types**

Append to `app/lib/types.ts`:
```typescript
// ---- Custom Agents (SafeCloud Phase 2) ----
export type AgentLens =
  | "exposure"
  | "encryption"
  | "cost"
  | "carbon"
  | "compliance"
  | "workflow"
  | "forensics";

export type AgentTone = "concise" | "detailed" | "executive" | "construction-aware";

export interface Agent {
  agent_id: string;
  name: string;
  enabled: boolean;
  lens: AgentLens;
  output_key: string;
  coverage_categories: string[];
  coverage_issue_types: string[];
  tone: AgentTone;
  extra_focus: string;
  template_key: string;
  created_at: string;
}

export interface AgentListResponse {
  items: Agent[];
  total: number;
}

export interface AgentTemplate {
  template_key: string;
  name: string;
  description: string;
  lens: AgentLens;
  output_key: string;
  coverage_categories: string[];
  coverage_issue_types: string[];
  tone: AgentTone;
  extra_focus: string;
}

export interface AgentCreateBody {
  name: string;
  lens: AgentLens;
  output_key: string;
  enabled?: boolean;
  coverage_categories?: string[];
  coverage_issue_types?: string[];
  tone?: AgentTone;
  extra_focus?: string;
  template_key?: string;
}

export interface AgentPreviewResponse {
  text: string;
}
```

- [ ] **Step 2: Add mock agents**

In `app/lib/mockData.ts`, merge `Agent` and `AgentTemplate` into the existing top-of-file `import type { ... } from "./types";` block (alongside `Rule`, `RuleTemplate` added in Phase 1 — do NOT add a new import statement). Then append the value constants to the bottom of the file:
```typescript
export const MOCK_AGENTS: Agent[] = [
  { agent_id: "agent-security", name: "Security Analyst", enabled: true, lens: "exposure", output_key: "security", coverage_categories: ["security"], coverage_issue_types: [], tone: "construction-aware", template_key: "security_analyst", created_at: "2026-06-20T00:00:00Z" },
  { agent_id: "agent-cost", name: "Cost Optimizer", enabled: true, lens: "cost", output_key: "cost", coverage_categories: ["cost"], coverage_issue_types: [], tone: "executive", template_key: "cost_optimizer", created_at: "2026-06-20T00:00:00Z" },
  { agent_id: "agent-energy", name: "Carbon Analyst", enabled: true, lens: "carbon", output_key: "energy", coverage_categories: [], coverage_issue_types: ["idle_vm", "unused_storage"], tone: "concise", template_key: "carbon_analyst", created_at: "2026-06-20T00:00:00Z" },
  { agent_id: "agent-workflow", name: "Workflow Impact", enabled: true, lens: "workflow", output_key: "workflow", coverage_categories: [], coverage_issue_types: ["public_bucket", "idle_vm", "unencrypted_database"], tone: "construction-aware", template_key: "workflow_impact", created_at: "2026-06-20T00:00:00Z" },
  { agent_id: "agent-audit", name: "Compliance Auditor", enabled: true, lens: "compliance", output_key: "audit", coverage_categories: [], coverage_issue_types: ["public_bucket", "unused_storage", "unencrypted_database"], tone: "detailed", template_key: "compliance_auditor", created_at: "2026-06-20T00:00:00Z" },
];

export const MOCK_AGENT_TEMPLATES: AgentTemplate[] = [
  { template_key: "security_analyst", name: "Security Analyst", description: "Explains exposure and data-protection risk.", lens: "exposure", output_key: "security", coverage_categories: ["security"], coverage_issue_types: [], tone: "construction-aware", extra_focus: "" },
  { template_key: "forensics_analyst", name: "Forensics Analyst", description: "Traces who changed a resource and when.", lens: "forensics", output_key: "forensics", coverage_categories: ["security"], coverage_issue_types: [], tone: "detailed", extra_focus: "" },
  { template_key: "custom", name: "Custom Agent", description: "Start from scratch — pick a lens and coverage.", lens: "exposure", output_key: "custom_agent", coverage_categories: [], coverage_issue_types: [], tone: "concise", extra_focus: "" },
];
```

- [ ] **Step 3: Add API client functions**

In `app/lib/api.ts`, extend the `import type { ... } from "./types"` block with `Agent`, `AgentCreateBody`, `AgentListResponse`, `AgentPreviewResponse`, `AgentTemplate`; extend the `import { ... } from "./mockData"` block with `MOCK_AGENTS`, `MOCK_AGENT_TEMPLATES`. Then append before `export const apiBaseConfigured`:
```typescript
// ---- Agents (SafeCloud Phase 2) ----

export async function getAgents(): Promise<ApiResult<AgentListResponse>> {
  try {
    return ok(await tryFetch<AgentListResponse>("/api/agents"));
  } catch (e) {
    return fallback({ items: MOCK_AGENTS, total: MOCK_AGENTS.length }, e);
  }
}

export async function getAgentTemplates(): Promise<ApiResult<AgentTemplate[]>> {
  try {
    return ok(await tryFetch<AgentTemplate[]>("/api/agents/templates"));
  } catch (e) {
    return fallback(MOCK_AGENT_TEMPLATES, e);
  }
}

export async function createAgent(body: AgentCreateBody): Promise<ApiResult<Agent>> {
  try {
    return ok(await tryFetch<Agent>("/api/agents", { method: "POST", body: JSON.stringify(body) }));
  } catch (e) {
    return fallback(
      {
        ...body,
        agent_id: `agent-mock-${Math.abs(hashString(body.name))}`,
        enabled: body.enabled ?? true,
        coverage_categories: body.coverage_categories ?? [],
        coverage_issue_types: body.coverage_issue_types ?? [],
        tone: body.tone ?? "concise",
        extra_focus: body.extra_focus ?? "",
        template_key: body.template_key ?? "custom",
        created_at: new Date().toISOString(),
      } as Agent,
      e,
    );
  }
}

export async function updateAgent(
  id: string,
  body: Partial<AgentCreateBody> & { enabled?: boolean },
): Promise<ApiResult<Agent | null>> {
  try {
    return ok(await tryFetch<Agent>(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
  } catch (e) {
    return fallback(null, e);
  }
}

export async function deleteAgent(id: string): Promise<ApiResult<boolean>> {
  try {
    await tryFetch<unknown>(`/api/agents/${id}`, { method: "DELETE" });
    return ok(true);
  } catch (e) {
    return fallback(false, e);
  }
}

export async function previewAgent(body: {
  lens: string;
  issue_type: string;
  tone: string;
  extra_focus: string;
}): Promise<ApiResult<AgentPreviewResponse>> {
  try {
    return ok(await tryFetch<AgentPreviewResponse>("/api/agents/preview", { method: "POST", body: JSON.stringify(body) }));
  } catch (e) {
    return fallback({ text: "Preview unavailable offline." }, e);
  }
}
```
> `hashString` already exists in `api.ts` (added in Phase 1). Reuse it; do not redefine.

- [ ] **Step 4: Typecheck**

Run: `cd /Users/zhehann/Desktop/imaginehack/imaginehack2026 && node ./node_modules/next/dist/bin/next build`
Expected: compiles, no TS errors.

- [ ] **Step 5: Commit**

```bash
git add app/lib/types.ts app/lib/api.ts app/lib/mockData.ts
git commit -m "feat(agents): frontend agent types, API client, and mock fallback"
```

---

## Task 9: Agents nav entry + icon

**Files:**
- Modify: `app/components/icons.tsx`, `app/components/AppShell.tsx`

- [ ] **Step 1: Add an icon**

In `app/components/icons.tsx`, following the existing `export const IconX = (p: P) => (<svg {...base(p)}>…</svg>)` pattern (private `type P = SVGProps<SVGSVGElement>` + `base(p)` helper — there is NO `IconProps` type), add:
```tsx
export const IconAgents = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M19 7l1.5-1.5M5 7L3.5 5.5" />
  </svg>
);
```

- [ ] **Step 2: Add the nav entry**

In `app/components/AppShell.tsx`, add `IconAgents` to the `./icons` import, then add to the `NAV` array right after the Rules entry:
```typescript
  { href: "/agents", label: "Agents", icon: IconAgents },
```

- [ ] **Step 3: Typecheck**

Run: `node ./node_modules/next/dist/bin/next build`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add app/components/icons.tsx app/components/AppShell.tsx
git commit -m "feat(agents): add Agents nav entry + icon"
```

---

## Task 10: Agents page + clone-template wizard

**Files:**
- Create: `app/(dashboard)/agents/page.tsx`, `app/(dashboard)/agents/AgentsManager.tsx`

- [ ] **Step 1: Create the server page**

`app/(dashboard)/agents/page.tsx`:
```tsx
import { getAgents, getAgentTemplates } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner } from "@/app/components/ui";
import AgentsManager from "./AgentsManager";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const [agentsRes, templatesRes] = await Promise.all([getAgents(), getAgentTemplates()]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Agents"
        subtitle="Add specialized analysis agents. Each agent analyzes the findings its coverage matches and writes its own section of the report."
      />
      {agentsRes.mock && <MockBanner reason={agentsRes.error} />}
      <AgentsManager initialAgents={agentsRes.data.items} templates={templatesRes.data} />
    </div>
  );
}
```

- [ ] **Step 2: Create the client component**

`app/(dashboard)/agents/AgentsManager.tsx`:
```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Agent, AgentLens, AgentTemplate, AgentTone } from "@/app/lib/types";
import { createAgent, deleteAgent, previewAgent, updateAgent } from "@/app/lib/api";
import { Card, Pill } from "@/app/components/ui";
import { useToast } from "@/app/lib/toast";

const LENSES: AgentLens[] = ["exposure", "encryption", "cost", "carbon", "compliance", "workflow", "forensics"];
const TONES: AgentTone[] = ["concise", "detailed", "executive", "construction-aware"];
// Only "security" and "cost" are real finding categories the engine emits;
// energy/workflow/audit are agent output_keys, not finding categories, so
// they'd never match as a category — use issue-type coverage for those.
const CATEGORIES = ["security", "cost"];
const ISSUE_TYPES = ["public_bucket", "idle_vm", "unused_storage", "unencrypted_database"];

export default function AgentsManager({
  initialAgents,
  templates,
}: {
  initialAgents: Agent[];
  templates: AgentTemplate[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [open, setOpen] = useState(false);

  async function toggle(agent: Agent) {
    const res = await updateAgent(agent.agent_id, { enabled: !agent.enabled });
    if (res.mock || !res.data) {
      toast("Couldn't update agent (offline)", "error");
      return;
    }
    setAgents((as) => as.map((a) => (a.agent_id === agent.agent_id ? { ...a, enabled: !a.enabled } : a)));
    toast(`Agent ${agent.enabled ? "disabled" : "enabled"}`, "success");
    router.refresh();
  }

  async function remove(agent: Agent) {
    const res = await deleteAgent(agent.agent_id);
    if (res.mock || !res.data) {
      toast("Couldn't delete agent (offline)", "error");
      return;
    }
    setAgents((as) => as.filter((a) => a.agent_id !== agent.agent_id));
    toast("Agent deleted", "success");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[#606060]">{agents.length} agent{agents.length === 1 ? "" : "s"}</p>
        <button
          onClick={() => setOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-full bg-[#0F0F0F] px-4 text-[13px] font-medium text-white hover:bg-black"
        >
          + New Agent
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {agents.map((agent) => (
          <Card key={agent.agent_id}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-[#0F0F0F]">{agent.name}</span>
                  <Pill>{agent.lens}</Pill>
                </div>
                <p className="mt-1 text-[12px] text-[#606060]">
                  Covers:{" "}
                  {[...agent.coverage_categories.map((c) => `cat:${c}`), ...agent.coverage_issue_types].join(", ") || "nothing"}
                </p>
                {agent.extra_focus && (
                  <p className="mt-0.5 text-[12px] italic text-[#606060]">“{agent.extra_focus}”</p>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => toggle(agent)}
                className={`h-7 rounded-full px-3 text-[12px] font-medium ${agent.enabled ? "bg-[#E7F6EC] text-[#1f7a3d]" : "bg-[#F2F2F2] text-[#606060]"}`}
              >
                {agent.enabled ? "Enabled" : "Disabled"}
              </button>
              <button
                onClick={() => remove(agent)}
                className="h-7 rounded-full px-3 text-[12px] text-[#FF0000] hover:bg-[#FFECEC]"
              >
                Delete
              </button>
            </div>
          </Card>
        ))}
      </div>

      {open && (
        <AgentWizard
          templates={templates}
          onClose={() => setOpen(false)}
          onCreated={(agent) => {
            setAgents((as) => [...as, agent]);
            setOpen(false);
            toast("Agent created", "success");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "agent";
}

function AgentWizard({
  templates,
  onClose,
  onCreated,
}: {
  templates: AgentTemplate[];
  onClose: () => void;
  onCreated: (a: Agent) => void;
}) {
  const [templateKey, setTemplateKey] = useState(templates[0]?.template_key ?? "custom");
  const template = useMemo(
    () => templates.find((t) => t.template_key === templateKey) ?? templates[0],
    [templates, templateKey],
  );
  const [name, setName] = useState(template?.name ?? "");
  const [lens, setLens] = useState<AgentLens>(template?.lens ?? "exposure");
  const [tone, setTone] = useState<AgentTone>(template?.tone ?? "concise");
  const [cats, setCats] = useState<string[]>(template?.coverage_categories ?? []);
  const [issues, setIssues] = useState<string[]>(template?.coverage_issue_types ?? []);
  const [extraFocus, setExtraFocus] = useState("");
  const [previewIssue, setPreviewIssue] = useState("public_bucket");
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function applyTemplate(key: string) {
    setTemplateKey(key);
    const t = templates.find((x) => x.template_key === key);
    if (t) {
      setName(t.name);
      setLens(t.lens);
      setTone(t.tone);
      setCats(t.coverage_categories);
      setIssues(t.coverage_issue_types);
    }
  }

  function toggleIn(list: string[], value: string, set: (v: string[]) => void) {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  async function runPreview() {
    const res = await previewAgent({ lens, issue_type: previewIssue, tone, extra_focus: extraFocus });
    setPreview(res.data.text);
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await createAgent({
        name: name.trim(),
        lens,
        output_key: slugify(name),
        tone,
        coverage_categories: cats,
        coverage_issue_types: issues,
        extra_focus: extraFocus.trim(),
        template_key: template?.template_key ?? "custom",
      });
      onCreated(res.data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 gg-scrim" onClick={onClose} />
      <div className="gg-fade-up relative z-10 max-h-[88vh] w-full max-w-[580px] overflow-y-auto rounded-xl border border-[#E5E5E5] bg-white p-5 shadow-[var(--shadow-e3)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold">New Agent</h2>
          <button onClick={onClose} className="text-[#606060] hover:text-[#0F0F0F]">✕</button>
        </div>

        <label className="mt-4 block text-[12px] font-medium text-[#606060]">Clone template</label>
        <select value={templateKey} onChange={(e) => applyTemplate(e.target.value)} className="mt-1 w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-[14px]">
          {templates.map((t) => <option key={t.template_key} value={t.template_key}>{t.name}</option>)}
        </select>
        <p className="mt-1 text-[12px] text-[#606060]">{template?.description}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] font-medium text-[#606060]">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-[14px]" />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#606060]">Lens</label>
            <select value={lens} onChange={(e) => setLens(e.target.value as AgentLens)} className="mt-1 w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-[14px]">
              {LENSES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <label className="mt-4 block text-[12px] font-medium text-[#606060]">Tone</label>
        <select value={tone} onChange={(e) => setTone(e.target.value as AgentTone)} className="mt-1 w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-[14px]">
          {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <label className="mt-4 block text-[12px] font-medium text-[#606060]">Coverage — categories</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => toggleIn(cats, c, setCats)} className={`rounded-full px-3 py-1 text-[12px] ${cats.includes(c) ? "bg-[#0F0F0F] text-white" : "bg-[#F2F2F2] text-[#0F0F0F]"}`}>{c}</button>
          ))}
        </div>

        <label className="mt-3 block text-[12px] font-medium text-[#606060]">Coverage — issue types</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {ISSUE_TYPES.map((i) => (
            <button key={i} onClick={() => toggleIn(issues, i, setIssues)} className={`rounded-full px-3 py-1 text-[12px] ${issues.includes(i) ? "bg-[#0F0F0F] text-white" : "bg-[#F2F2F2] text-[#0F0F0F]"}`}>{i}</button>
          ))}
        </div>

        <label className="mt-4 block text-[12px] font-medium text-[#606060]">Extra focus (optional)</label>
        <input value={extraFocus} onChange={(e) => setExtraFocus(e.target.value)} placeholder="e.g. flag any tender drawings or contract data" className="mt-1 w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-[14px]" />

        <div className="mt-4 rounded-lg bg-[#F8F8F8] p-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-[#606060]">Preview on</span>
            <select value={previewIssue} onChange={(e) => setPreviewIssue(e.target.value)} className="rounded-lg border border-[#E5E5E5] px-2 py-1 text-[12px]">
              {ISSUE_TYPES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            <button onClick={runPreview} className="ml-auto h-8 rounded-full border border-[#E5E5E5] bg-white px-3 text-[12px] hover:bg-[#F2F2F2]">Preview</button>
          </div>
          {preview && <p className="mt-2 text-[13px] leading-relaxed text-[#0F0F0F]">{preview}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-full px-4 text-[13px] hover:bg-[#F2F2F2]">Cancel</button>
          <button onClick={save} disabled={saving || !name.trim()} className="h-9 rounded-full bg-[#0F0F0F] px-5 text-[13px] font-medium text-white hover:bg-black disabled:opacity-50">
            {saving ? "Saving…" : "Save agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `node ./node_modules/next/dist/bin/next build`
Expected: compiles, `/agents` route generated.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/agents/page.tsx" "app/(dashboard)/agents/AgentsManager.tsx"
git commit -m "feat(agents): Agents page with list + clone-template wizard + sample preview"
```

---

## Task 11: End-to-end manual verification

**Files:** none (gate)

- [ ] **Step 1: Start both services**

```bash
# Terminal 1
cd /Users/zhehann/Desktop/imaginehack/imaginehack2026/backend && .venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
# Terminal 2 (app/.env.local has NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000)
cd /Users/zhehann/Desktop/imaginehack/imaginehack2026 && node ./node_modules/next/dist/bin/next dev
```

- [ ] **Step 2: Verify the Agents page**

Open `http://localhost:3000/agents`. Confirm: 5 seed agents listed; "New Agent" opens the wizard; cloning "Forensics Analyst" pre-fills lens/coverage; "Preview" returns grounded text; saving adds the agent; toggle/delete work.

- [ ] **Step 3: Verify agents drive a finding's analysis**

Open `http://localhost:3000/security`, open a finding → the AGENT ANALYSIS sections match the enabled agents' coverage. Disable an agent on `/agents`, click "Run scan", reopen a finding → that agent's section is gone. (Agent_outputs are computed at ingest, so re-scan after toggling.)

- [ ] **Step 4: Mock fallback**

Stop the backend; reload `/agents` → 5 mock agents + mock banner. No blank screen.

- [ ] **Step 5: No regressions**

`/`, `/security`, `/cost`, `/energy`, `/audit`, `/rules` all still load.

---

## Self-Review (completed by plan author)

- **Spec coverage (§6 / §2-decision-4 / §13 Phase 2):** Agent model with lens/coverage/tone/extra_focus (Task 1) ✓ · 5 personas seeded (Task 3) ✓ · master router selects by coverage (Task 2) ✓ · LLM enrichment agent-driven, "AI explains, never invents numbers" preserved (Task 5) ✓ · AgentService + `/api/agents` CRUD + templates + preview (Tasks 6–7) ✓ · Agents page with clone-template wizard + sample-finding preview (Tasks 8–10) ✓. **Deferred (Phase 3+):** threat reports, criticality, response policy, real agent script.
- **Parity guard:** Task 3's `test_selection_reproduces_legacy_map` proves the seed agents reproduce `_RELEVANT_AGENTS` exactly; Task 4's `test_savings_still_preserved` proves the numeric path is untouched.
- **No-regression guard:** Tasks 4/5/7 each re-run the full suite; the Phase 1 savings test must stay green.
- **Type consistency:** `select_agents`/`build_agent_outputs`/`build_prompt`/`parse_response` signatures are consistent across router (Task 2), governance (Tasks 4–5), ai_client (Task 5), and their tests. Store keys agents by `output_key`; `AgentService` honors that in create/update/delete. `AgentCreate` excludes `agent_id`/`created_at`; `create_agent` supplies both (no kwarg collision). Frontend `Agent`/`AgentTemplate` field names mirror the backend exactly.
- **Frontend reuse:** `FindingModal` already renders arbitrary `agent_outputs` keys (known→colored, extra→gray, per its `orderedAgents`), so custom agents render with no modal change.

---

## Roadmap — Phase 3 & 4 (separate plans)

- **Phase 3 — Threat Reports + Response Policy:** deterministic `compute_criticality`; `ThreatReport` (LLM "what & why" + activity-log timeline + recommended solution); `ResponsePolicy` (global + per-rule mode/threshold) enforced at finding creation; `RemediationCommand` lifecycle (destructive always human-gated); Threats page + Policy panel. The `forensics` lens added here is the hook for the timeline trace.
- **Phase 4 — Real SafeCloud Agent:** `safecloud-agent.py` + `watch/` folder + agent endpoints (`/api/agent/*`, `X-Agent-Token`); agent executes approved remediation by mutating the snapshot (visible closed loop); "Agent online" status chip. Swap the in-process simulator for the real agent.
