# SafeCloud Phase 6 — Simplify Agents/Rules + Grid-Only Routing

> Three changes: (1) **Agents = Name + System Prompt only** (Claude-Code style, LLM-driven, empty without an AI key). (2) **Rules = custom-only**, form is just Name + Conditions (resource/severity/category inferred). (3) **Workflows grid is the ONLY router** — a finding runs exactly the agents its rule checks; no coverage. Built on real created rules + agents (always in sync).

**Branch:** `safecloud-phase1-rules` (84 backend tests). macOS, `backend/.venv`.

## Decisions
- Agent model: `{agent_id, name, system_prompt, enabled, output_key, created_at}`. Remove lens, coverage, tone, extra_focus, template_key, AgentTemplate, preview. No deterministic fallback — agent text comes ONLY from the LLM via `system_prompt`; with no API key, agent sections are empty.
- Routing: `select_agents_for_finding(finding, agents, rule)` = enabled agents whose `output_key ∈ rule.agent_keys`. No coverage, no fallback. Empty `agent_keys` → no agents.
- Rule form: Name + Conditions only. `resource_type` becomes OPTIONAL (None = matches any resource where the conditions resolve). Defaults: `severity_base="medium"`, `category="security"`, `issue_type=slug(name)`, `required_reviewers=[]`.
- Seed rules get `agent_keys` pre-set (reproducing the old mapping) so the demo shows analysis when an AI key is configured.

---

# BACKEND

## B1. `backend/app/schemas/agents.py` — REPLACE ENTIRE FILE
```python
from datetime import datetime

from pydantic import BaseModel, Field


class Agent(BaseModel):
    agent_id: str
    name: str
    system_prompt: str
    output_key: str  # slug of name; keys recommendation.agent_outputs
    enabled: bool = True
    created_at: datetime


class AgentCreate(BaseModel):
    name: str
    system_prompt: str
    enabled: bool = True


class AgentUpdate(BaseModel):
    name: str | None = None
    system_prompt: str | None = None
    enabled: bool | None = None


class AgentListResponse(BaseModel):
    items: list[Agent]
    total: int
```
Then in `backend/app/schemas/__init__.py`: the agents import block must now import only `Agent, AgentCreate, AgentListResponse, AgentUpdate` (remove `AgentLens, AgentPreviewRequest, AgentPreviewResponse, AgentTemplate` from the import and from `__all__`).

## B2. `backend/app/agents/seed_agents.py` — REPLACE ENTIRE FILE
```python
from datetime import UTC, datetime

from app.schemas import Agent

_PROMPTS = {
    "security": "You are a cloud security analyst for a construction-tech company. Explain the exposure and data-protection risk of this finding in one or two plain sentences. Reference the evidence; never invent numbers.",
    "cost": "You are a cloud cost analyst. Explain the wasted monthly spend and the saving opportunity in one or two sentences. Do not invent figures; reference the provided estimate only.",
    "energy": "You are a sustainability analyst. Explain the estimated carbon impact of this wasted resource in one or two sentences.",
    "workflow": "You are a construction-tech workflow analyst. Explain the application or project impact and downtime risk of changing this resource in one or two sentences.",
    "audit": "You are a compliance auditor. Explain the audit-trail and approval requirements for this finding in one or two sentences.",
}
_NAMES = {
    "security": "Security Analyst",
    "cost": "Cost Optimizer",
    "energy": "Carbon Analyst",
    "workflow": "Workflow Impact",
    "audit": "Compliance Auditor",
}


def builtin_agents() -> list[Agent]:
    now = datetime.now(UTC)
    return [
        Agent(agent_id=f"agent-{key}", name=_NAMES[key], system_prompt=_PROMPTS[key],
              output_key=key, enabled=True, created_at=now)
        for key in ("security", "cost", "energy", "workflow", "audit")
    ]
```

## B3. `backend/app/agents/router.py` — REPLACE ENTIRE FILE
```python
"""Routing only: which agents analyze a finding = its rule's agent_keys.
No coverage, no deterministic text. Agent text is produced solely by the LLM
(ai_client) from each agent's system_prompt; with no AI key, there is none."""

from app.schemas import Agent, Finding


def select_agents_for_finding(finding: Finding, agents: list[Agent], rule) -> list[Agent]:
    keys = list(getattr(rule, "agent_keys", None) or [])
    by_key = {a.output_key: a for a in agents if a.enabled}
    return [by_key[k] for k in keys if k in by_key]
```

## B4. `backend/app/services/governance.py`
- Replace the agent-imports line `from app.agents.router import build_agent_outputs, select_agents` with `from app.agents.router import select_agents_for_finding`.
- In `ingest_events`, **delete** the `recommendation.agent_outputs = build_agent_outputs(...)` block entirely (agent_outputs stays `{}` at ingest — the LLM fills it lazily).
- In `_maybe_enrich_recommendation`, the agent-selection lines become:
```python
        selected = select_agents_for_finding(
            finding, list(self.store.agents.values()), self.store.rules.get(finding.rule_id)
        )
        ai_outputs = generate_agent_analysis(finding, recommendation, selected)
```
(remove any leftover `from app.agents.router import select_agents_for_finding` inside the method if the top-level import covers it.)

## B5. `backend/app/agents/ai_client.py` — `build_prompt`
Rewrite `build_prompt(finding, base_recommendation, agents)` so each agent contributes its `system_prompt` under its `output_key`:
```python
def build_prompt(finding, base_recommendation, agents) -> str:
    issue_type = getattr(finding, "issue_type", "unknown")
    severity = getattr(finding, "severity", "unknown")
    evidence = getattr(finding, "evidence", {}) or {}
    recommended_action = getattr(base_recommendation, "recommended_action", "")
    try:
        evidence_text = json.dumps(evidence, default=str)
    except (TypeError, ValueError):
        evidence_text = str(evidence)

    blocks, keys = [], []
    for agent in agents:
        key = getattr(agent, "output_key", "")
        keys.append(key)
        blocks.append(f'- "{key}": {getattr(agent, "system_prompt", "")}')
    instructions = "\n".join(blocks)

    return (
        "A deterministic rule engine detected a cloud governance issue.\n"
        f"issue_type: {issue_type}\nseverity: {severity}\n"
        f"evidence: {evidence_text}\n"
        f"deterministic_recommended_action: {recommended_action}\n\n"
        "Produce a JSON object. For each agent key below, write one or two plain-English "
        "sentences following that agent's instruction:\n"
        f"{instructions}\n\n"
        f"Return ONLY a JSON object whose keys are exactly: {keys}. "
        "Do NOT invent dollar amounts or carbon figures (those are provided separately). "
        'Example: {"security": "..."}'
    )
```
`parse_response(raw, allowed_keys)` is unchanged (already clamps to the passed keys). `generate_agent_analysis(finding, rec, agents)` is unchanged (already returns None when `not agents` or AI disabled).

## B6. `backend/app/services/agents_service.py` — REPLACE ENTIRE FILE
```python
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
```
Delete `backend/app/agents/templates.py` (agent templates) — no longer used.

## B7. `backend/app/api/agents_routes.py` — REPLACE ENTIRE FILE
```python
from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas import Agent, AgentCreate, AgentListResponse, AgentUpdate
from app.services.agents_service import AgentService
from app.services.dependencies import get_agent_service

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("", response_model=AgentListResponse)
def list_agents(service: AgentService = Depends(get_agent_service)) -> AgentListResponse:
    return service.list_agents()


@router.post("", response_model=Agent, status_code=status.HTTP_201_CREATED)
def create_agent(payload: AgentCreate, service: AgentService = Depends(get_agent_service)) -> Agent:
    return service.create_agent(payload, actor_id="dashboard")


@router.get("/{agent_id}", response_model=Agent)
def get_agent(agent_id: str, service: AgentService = Depends(get_agent_service)) -> Agent:
    agent = service.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=Agent)
def update_agent(agent_id: str, payload: AgentUpdate, service: AgentService = Depends(get_agent_service)) -> Agent:
    updated = service.update_agent(agent_id, payload, actor_id="dashboard")
    if updated is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return updated


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(agent_id: str, service: AgentService = Depends(get_agent_service)) -> None:
    if not service.delete_agent(agent_id, actor_id="dashboard"):
        raise HTTPException(status_code=404, detail="Agent not found")
```

## B8. Rules: optional resource_type + seed agent_keys
- `backend/app/schemas/rules.py`: change `resource_type: RuleResourceType` → `resource_type: RuleResourceType | None = None` in `Rule` and `RuleCreate` (RuleUpdate already optional). In `RulePreviewRequest`, change `resource_type: RuleResourceType` → `resource_type: RuleResourceType | None = None`.
- `backend/app/rules/engine.py` `evaluate_event`: change the resource filter to `if rule.resource_type is not None and rule.resource_type != event.resource_type: continue`.
- `backend/app/rules/clash.py`: when comparing two rules, only treat them as same-resource if `rule_a.resource_type == rule_b.resource_type` (None == None counts as same — fine; leave logic, it already compares equality).
- `backend/app/services/rules_service.py` `preview`: change the per-event filter to `if resource_type is not None and event.resource_type != resource_type: continue`.
- `backend/app/rules/seed_rules.py`: add `agent_keys=[...]` to each builtin rule:
  - RULE_PUBLIC_BUCKET → `agent_keys=["security", "workflow", "audit"]`
  - RULE_IDLE_VM → `agent_keys=["cost", "energy", "workflow"]`
  - RULE_UNUSED_STORAGE → `agent_keys=["cost", "energy", "audit"]`
  - RULE_UNENCRYPTED_DATABASE → `agent_keys=["security", "workflow", "audit"]`

## B9. Tests (make the suite green)
- `test_agent_schemas.py`: rewrite for `Agent(name, system_prompt, output_key, created_at)` defaults (`enabled is True`) and `AgentCreate(name, system_prompt)`.
- `test_agent_router.py`: rewrite to test `select_agents_for_finding` only: a rule with `agent_keys=["security"]` selects the security agent; empty `agent_keys` selects none; disabled agent excluded. Remove all lens/coverage/build_agent_outputs/issue_label tests.
- `test_agent_parity.py`: DELETE this file (coverage no longer exists).
- `test_ingest_agent_outputs.py`: rewrite — after ingest, `recommendation.agent_outputs == {}` (no deterministic base, AI off in tests); `test_savings_still_preserved` stays (76.8 / 28.7).
- `test_ai_client_agents.py`: update `test_prompt_mentions_each_agent_key` to build agents with `system_prompt` and assert the prompt contains each `output_key` and the system_prompt text; keep the parse-clamp test; keep the AI-disabled test (build a name+system_prompt agent).
- `test_agents_service.py`: rewrite for name+system_prompt CRUD; remove templates/preview tests.
- `test_agents_api.py`: remove templates/preview tests; CRUD with `{name, system_prompt}`; `test_list_agents` asserts total 5 (or >=5) + the 5 seed output_keys.
- `test_workflow_routing.py`: rewrite — `build_agent_outputs` is gone; instead test `select_agents_for_finding`: rule with `agent_keys=["security","audit"]` → those two; empty → `[]`.
- `test_rule_schemas.py`: keep; optionally assert a rule with no `resource_type` is valid (`Rule(... )` without resource_type → None).
- Run `cd backend && .venv/bin/pytest -q -p no:warnings` until green. `compute_criticality`/`build_threat_report` stay (used by the modal report).

---

# FRONTEND

## F1. `app/lib/types.ts`
- Replace the `Agent` interface with `{ agent_id, name, system_prompt, output_key, enabled, created_at }`. Delete `AgentLens`, `AgentTone`, `AgentTemplate`, and any `AgentCreateBody` lens/coverage fields → `AgentCreateBody = { name, system_prompt, enabled? }`. Delete `AgentPreviewResponse`.
- `Rule.resource_type` → `ResourceType | null`. `RuleCreateBody.resource_type?` (optional) and `RuleCreateBody.severity_base?` already optional.

## F2. `app/lib/api.ts`
- `getAgents()` stays. `createAgent(body: AgentCreateBody)` posts `{name, system_prompt}`; update its mock fallback to the new Agent shape (no lens/coverage). `updateAgent`/`deleteAgent` stay. **Delete** `getAgentTemplates` and `previewAgent`.
- `getRuleTemplates` may stay unused OR be deleted — remove the call from the Rules page (F4). `previewRule` body `resource_type` is now optional; allow `resource_type?: string`.

## F3. `app/lib/mockData.ts`
- `MOCK_AGENTS`: 5 agents as `{agent_id, name, system_prompt, output_key, enabled, created_at}`. **Delete** `MOCK_AGENT_TEMPLATES`. Remove unused `AgentTemplate` import.

## F4. Agents page — `app/(dashboard)/agents/AgentsManager.tsx` REPLACE
Simple list + a 2-field wizard (Name + System Prompt). Agent card shows name + truncated system_prompt + Enabled/Delete. Wizard:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Agent } from "@/app/lib/types";
import { createAgent, deleteAgent, updateAgent } from "@/app/lib/api";
import { Card } from "@/app/components/ui";
import { useToast } from "@/app/lib/toast";

export default function AgentsManager({ initialAgents }: { initialAgents: Agent[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [open, setOpen] = useState(false);

  async function toggle(a: Agent) {
    const res = await updateAgent(a.agent_id, { enabled: !a.enabled });
    if (res.mock || !res.data) { toast("Couldn't update (offline)", "error"); return; }
    setAgents((xs) => xs.map((x) => (x.agent_id === a.agent_id ? { ...x, enabled: !x.enabled } : x)));
    router.refresh();
  }
  async function remove(a: Agent) {
    const res = await deleteAgent(a.agent_id);
    if (res.mock || !res.data) { toast("Couldn't delete (offline)", "error"); return; }
    setAgents((xs) => xs.filter((x) => x.agent_id !== a.agent_id));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[#606060]">{agents.length} agent{agents.length === 1 ? "" : "s"}</p>
        <button onClick={() => setOpen(true)} className="h-9 rounded-full bg-[#0F0F0F] px-4 text-[13px] font-medium text-white hover:bg-black">+ New Agent</button>
      </div>
      <div className="space-y-3">
        {agents.map((a) => (
          <Card key={a.agent_id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-[#0F0F0F]">{a.name}</p>
                <p className="mt-1 line-clamp-2 text-[12px] text-[#606060]">{a.system_prompt}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => toggle(a)} className={`h-7 rounded-full px-3 text-[12px] font-medium ${a.enabled ? "bg-[#E7F6EC] text-[#1f7a3d]" : "bg-[#F2F2F2] text-[#606060]"}`}>{a.enabled ? "Enabled" : "Disabled"}</button>
                <button onClick={() => remove(a)} className="h-7 rounded-full px-3 text-[12px] text-[#FF0000] hover:bg-[#FFECEC]">Delete</button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {open && <AgentWizard onClose={() => setOpen(false)} onCreated={(a) => { setAgents((xs) => [...xs, a]); setOpen(false); toast("Agent created", "success"); router.refresh(); }} />}
    </div>
  );
}

function AgentWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (a: Agent) => void }) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!name.trim() || !prompt.trim()) return;
    setSaving(true);
    try { const res = await createAgent({ name: name.trim(), system_prompt: prompt.trim() }); onCreated(res.data); }
    finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 gg-scrim" onClick={onClose} />
      <div className="gg-fade-up relative z-10 w-full max-w-[560px] rounded-xl border border-[#E5E5E5] bg-white p-5 shadow-[var(--shadow-e3)]">
        <div className="flex items-center justify-between"><h2 className="text-[18px] font-bold">New Agent</h2><button onClick={onClose} className="text-[#606060] hover:text-[#0F0F0F]">✕</button></div>
        <label className="mt-4 block text-[12px] font-medium text-[#606060]">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Data Exposure Specialist" className="mt-1 w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-[14px]" />
        <label className="mt-4 block text-[12px] font-medium text-[#606060]">System prompt</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} placeholder="You are a... For each finding, explain... in one or two sentences. Never invent numbers." className="mt-1 w-full resize-none rounded-lg border border-[#E5E5E5] px-3 py-2 text-[13px]" />
        <p className="mt-1 text-[11px] text-[#909090]">The agent runs this prompt against each finding it's assigned (set assignments in Workflows). Requires an AI key to produce output.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-full px-4 text-[13px] hover:bg-[#F2F2F2]">Cancel</button>
          <button onClick={save} disabled={saving || !name.trim() || !prompt.trim()} className="h-9 rounded-full bg-[#0F0F0F] px-5 text-[13px] font-medium text-white hover:bg-black disabled:opacity-50">{saving ? "Saving…" : "Save agent"}</button>
        </div>
      </div>
    </div>
  );
}
```
- `app/(dashboard)/agents/page.tsx`: stop fetching templates; just `getAgents()`; pass `initialAgents` only.

## F5. Rules wizard — `app/(dashboard)/rules/RulesManager.tsx`
Simplify `RuleWizard` to **Name + Conditions** (+ keep the live preview + the rule list/clash banner unchanged). Remove the template `<select>` and template logic. New wizard fields: a Name input, condition rows (field / operator / value / remove), a "+ condition" button, a "Preview matches" button (calls `previewRule({ conditions })` with NO resource_type), and Save. `save()` calls:
```tsx
    const res = await createRule({
      name: name.trim(),
      issue_type: slug(name),
      category: "security",
      conditions: conditions.map((c) => ({ ...c, value: coerce(c.value) })),
    });
```
where `slug(s) = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "custom_rule"`. Keep the `coerce` helper. Remove `templates` prop usage. (RuleCreateBody no longer requires resource_type/severity_base/template_key.)
- `app/(dashboard)/rules/page.tsx`: stop fetching `getRuleTemplates`; pass only rules + clashes to `RulesManager` (drop the `templates` prop).

## F6. Workflows grid — `app/(dashboard)/workflows/WorkflowsGrid.tsx`
Already rules×agents. Change the column header to show `a.name` (was `a.output_key`); keep `a.output_key` as the value written to `agent_keys`. Everything else stays (checkbox writes `updateRule(rule.rule_id, { agent_keys: next })`). Page is `force-dynamic` so it always reflects current rules + agents.

## F7. Build
`node ./node_modules/next/dist/bin/next build` → clean; routes unchanged; no references to removed symbols (AgentLens/AgentTone/AgentTemplate/getAgentTemplates/previewAgent/getRuleTemplates in the Rules+Agents pages/MOCK_AGENT_TEMPLATES).

---

## Self-Review
- Agents simplified to name+system_prompt (LLM-only, empty without key) ✓ · rules custom-only Name+Conditions (resource_type optional/any) ✓ · routing 100% via Workflows grid (`rule.agent_keys`), no coverage ✓ · grid reflects real rules+agents ✓.
- Consistency: `select_agents_for_finding(finding, agents, rule)` used by ingest-enrich + tests; `build_agent_outputs` fully removed (ingest leaves agent_outputs `{}`); `compute_criticality`/`build_threat_report` retained for the modal. Seed rules carry `agent_keys` so demo analysis works with an AI key. Numbers still rule/criticality-owned.
