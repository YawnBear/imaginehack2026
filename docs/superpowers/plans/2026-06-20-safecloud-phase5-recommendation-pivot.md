# SafeCloud Phase 5 — Recommendation Pivot + Workflows

> Reshape, not greenfield. SafeCloud becomes **detect → analyze → recommend**; a human expert remediates manually. Remove the response policy and ALL remediation execution; keep the agent as a read-only scanner; rename Security→Threats and fold the "why + timeline" into the finding modal; add a Workflows (rules×agents) page.

**Branch:** `safecloud-phase1-rules` (Phases 1–4 committed, 97 backend tests). macOS, `backend/.venv`, no `uv`.

## Locked decisions
1. **Threats page** = the current Security findings view, renamed. Delete the old criticality/policy Threats page. Remove the Security nav item.
2. **Finding modal**: add `WHY THIS TRIGGERED` (criticality score + factor chips + summary) and `TIMELINE`, fetched on-demand via the existing `/api/findings/{id}/threat-report`.
3. **Remove Response Policy** entirely: `ResponsePolicy`/`ResponsePolicyUpdate`/`ResponseMode`, `store.policy`, `/api/policy`, the auto-escalation block in ingest, policy in agent config + mocks.
4. **Remove remediation execution**: `RemediationCommand`, `_queue_remediation` + its call in `review_finding`, `/api/commands`, `list_commands`, `/api/agent/commands`, `/api/agent/commands/{id}/result`, `complete_command`, `apply_remediation`, the agent script's command polling + snapshot mutation. Approval stays = triage (records decision, no action).
5. **Agent = read-only scanner**: keep `/api/agent/enroll|config|events|status`, token, watch folder, status chip, `snapshot_to_events`. Keep `activities` + `record_activity` (feed the timeline).
6. **Workflows**: add `Rule.agent_keys: list[str]` (+ in `RuleUpdate`). Router runs a finding's rule's `agent_keys` (enabled, by `output_key`); empty → coverage fallback. New Workflows page = rules×agents checkbox grid, saved via `PATCH /api/rules/{id}`.

**Keep:** criticality.py, report.py (`build_threat_report`/`build_timeline`), `ThreatService.generate`/`get`, `GET|POST /api/findings/{id}/threat-report`, all rules/agents/findings/recommendation/approval/audit, agent scanner.

---

# BACKEND CHANGES

## B1. Rule.agent_keys (Workflows binding)
- `backend/app/schemas/rules.py`: add `agent_keys: list[str] = Field(default_factory=list)` to **both** `Rule` and `RuleCreate`; add `agent_keys: list[str] | None = None` to `RuleUpdate`.
- `backend/app/agents/router.py`: add a new selector and use it in `build_agent_outputs`:
```python
def select_agents_for_finding(finding, agents, rule):
    if rule is not None and getattr(rule, "agent_keys", None):
        by_key = {a.output_key: a for a in agents if a.enabled}
        return [by_key[k] for k in rule.agent_keys if k in by_key]
    return select_agents(finding, agents)
```
Change `build_agent_outputs(finding, recommendation, agents, rule=None)` to call `select_agents_for_finding(finding, agents, rule)` instead of `select_agents(...)`.

## B2. governance.py
- In `ingest_events`, change the agent_outputs line to pass the rule:
```python
                recommendation.agent_outputs = build_agent_outputs(
                    finding, recommendation, list(self.store.agents.values()),
                    self.store.rules.get(finding.rule_id),
                )
```
- **Delete the auto-escalation block** (the `score, _factors = compute_criticality(...)` ... `threat_report_auto_generated` audit block added in Phase 3). Remove the now-unused `compute_criticality`/`build_threat_report` imports IF nothing else in governance uses them (governance no longer needs them — remove those two imports; keep others).
- In `review_finding`, **remove** the `if finding.status == "approved" and not any(... commands ...): self._queue_remediation(...)` block (revert to just setting `finding.status`).
- **Delete** the `_queue_remediation` and `complete_command` methods. **Keep** `record_activity`.
- Remove the `from app.schemas import RemediationCommand` import.
- In `_maybe_enrich_recommendation`, change agent selection to honor the rule:
```python
        from app.agents.router import select_agents_for_finding
        selected = select_agents_for_finding(
            finding, list(self.store.agents.values()), self.store.rules.get(finding.rule_id)
        )
```
(replace the existing `select_agents(...)` line; drop the now-unused `select_agents` import if unused.)

## B3. store.py
- Remove `self.policy`, `self.commands` and the `ResponsePolicy`/`RemediationCommand`/`ThreatReport` imports that are now unused. **Keep** `self.threat_reports` (modal still generates+caches), `self.activities`, `self.agent_last_seen`, `self.agent_id`.

## B4. schemas
- `backend/app/schemas/threats.py`: **delete** `ResponseMode`, `ResponsePolicy`, `ResponsePolicyUpdate`, `RemediationCommand`, `CommandListResponse`, `ThreatListResponse`. **Keep** `TimelineEntry`, `ThreatReport`.
- `backend/app/schemas/agent_io.py`: in `AgentConfigResponse` **remove** the `policy` field (keep `rules`, `agents`). Keep everything else; remove `CommandResultRequest` (unused now).
- `backend/app/schemas/__init__.py`: remove the deleted names from the import block + `__all__` (ResponseMode, ResponsePolicy, ResponsePolicyUpdate, RemediationCommand, CommandListResponse, ThreatListResponse, CommandResultRequest).

## B5. ThreatService (`backend/app/services/threats_service.py`)
- Keep `generate`, `get`, `_event_for`. **Delete** `list_reports`, `get_policy`, `update_policy`, `list_commands` and their now-unused imports.

## B6. threats_routes.py
- Keep `GET` + `POST /api/findings/{finding_id}/threat-report`. **Delete** the `/api/threats`, `/api/policy` (GET+PUT), `/api/commands` routes and their imports.

## B7. agent_routes.py
- Keep `enroll`, `config` (drop the `policy=` kwarg from `AgentConfigResponse(...)`), `post_events`, `agent_status`, `require_agent_token`. **Delete** `get_commands`, `post_command_result` and the `CommandListResponse`/`CommandResultRequest` imports.

## B8. agent runtime (`backend/app/agent/runtime.py`)
- **Delete** `apply_remediation`. Keep `snapshot_to_events`.

## B9. safecloud-agent.py (repo root)
- Make it scan-only: in `cycle()`, keep enroll + config + scan (snapshot_to_events + POST events). **Delete** the command-polling/execute/result loop, the `apply_remediation` import, and the `_write_snapshot`/activity-append used only for remediation. Keep `_read_snapshot`. Update the printout to "scan only — findings go to the dashboard for an expert to remediate."

## B10. Test updates (make the suite green)
- `test_threat_schemas.py`: delete `test_policy_defaults`, `test_command_defaults`; keep `test_threat_report_minimal`.
- `test_criticality.py`, `test_threat_report.py`: keep as-is.
- `test_threats_flow.py`: keep `test_threat_service_generate_on_demand`; delete `test_store_has_threat_collections` (policy/commands gone — or trim it to only assert `threat_reports == {}`), `test_auto_escalation_generates_reports_for_critical`, `test_monitor_mode_suppresses_auto_reports`, `test_full_approval_queues_remediation_command`.
- `test_threats_api.py`: keep `test_generate_report_for_finding`, `test_get_report_404_for_unknown`; delete `test_list_threats_populated_by_auto_policy`, `test_get_policy_and_update`, `test_list_commands_empty_initially`.
- `test_agent_io_schemas.py`: delete `test_command_has_resource_id`; keep `test_activity_and_io_models` but remove any `RemediationCommand` import.
- `test_agent_runtime.py`: delete the 5 `apply_remediation` tests; keep `test_snapshot_to_events_stamps_timestamp`.
- `test_agent_api.py`: keep `test_auth_required`, `test_status_reflects_heartbeat`, `test_events_ingest_and_activities`; change `test_config_returns_rules_agents_policy` → assert only `rules`/`agents` (no `policy` key); delete `test_commands_and_result_completes_finding`.
- **Add** `backend/tests/test_workflow_routing.py`:
```python
from datetime import UTC, datetime

from app.agents.router import build_agent_outputs
from app.agents.seed_agents import builtin_agents
from app.schemas import Finding, Recommendation, Rule, RuleCondition


def _finding():
    return Finding(finding_id="f", source_event_id="e", resource_id="r", resource_type="bucket",
                   issue_type="public_bucket", category="security", severity="critical",
                   status="pending_review", rule_id="R1", rule_confidence=0.9,
                   created_at=datetime.now(UTC), updated_at=datetime.now(UTC))


def _rec():
    return Recommendation(recommendation_id="r", finding_id="f", recommended_action="x",
                          rationale="y", risk_level="critical", confidence=0.9)


def _rule(agent_keys):
    return Rule(rule_id="R1", name="r", resource_type="bucket", issue_type="public_bucket",
                category="security", agent_keys=agent_keys,
                conditions=[RuleCondition(field="config.public_access", operator="==", value=True)],
                created_at=datetime.now(UTC))


def test_rule_agent_keys_override_coverage():
    out = build_agent_outputs(_finding(), _rec(), builtin_agents(), _rule(["security"]))
    assert set(out.keys()) == {"security"}  # only the rule's chosen agent


def test_empty_agent_keys_falls_back_to_coverage():
    out = build_agent_outputs(_finding(), _rec(), builtin_agents(), _rule([]))
    assert set(out.keys()) == {"security", "workflow", "audit"}  # coverage default
```

Run `cd backend && .venv/bin/pytest -q -p no:warnings` until green.

---

# FRONTEND CHANGES

## F1. Rename Security → Threats
- **Move** `app/(dashboard)/security/page.tsx` content to **`app/(dashboard)/threats/page.tsx`** (replacing the old criticality page). Change `PageHeader title="Threats"` and a fitting subtitle (e.g. "Detected threats across the cloud estate — each with an AI explanation, timeline and recommended fix for your security team."). Keep `getFindings({ category: "security", page_size: 50 })` + `FindingsExplorer` + the chip GROUPS.
- **Delete** `app/(dashboard)/threats/ThreatsView.tsx` and the old `app/(dashboard)/security/` folder.

## F2. AppShell nav
- Remove the **Security** NAV entry. Ensure a **Threats** entry → `/threats` (use `IconThreats`). Add a **Workflows** entry → `/workflows` (new `IconWorkflows`). Keep AgentStatusChip.

## F3. icons.tsx
- Add `IconWorkflows` (pattern `(p: P) => (<svg {...base(p)}>…)`):
```tsx
export const IconWorkflows = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="6" height="6" rx="1" />
    <rect x="15" y="15" width="6" height="6" rx="1" />
    <path d="M9 6h6a3 3 0 0 1 3 3v6" />
  </svg>
);
```

## F4. FindingModal — add WHY THIS TRIGGERED + TIMELINE
In `app/components/FindingModal.tsx`:
- Import: `import { getThreatReport } from "@/app/lib/api";` and `import type { ThreatReport } from "@/app/lib/types";`.
- Add state `const [report, setReport] = useState<ThreatReport | null>(null);`.
- In the existing `useEffect([findingId])` (or a new one), fetch the report:
```tsx
  useEffect(() => {
    let active = true;
    getThreatReport(findingId).then((r) => active && setReport(r.data));
    return () => { active = false; };
  }, [findingId]);
```
- Render, right after `<SafetyBanner />` (and before the evidence grid), a block (only when `report` is present):
```tsx
              {report && (
                <section className="rounded-lg border border-[#E5E5E5] p-4">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-[13px] font-bold text-white"
                      style={{ background: report.criticality_score >= 80 ? "#FF0000" : report.criticality_score >= 60 ? "#FB8C00" : "#065FD4" }}
                    >
                      {report.criticality_score}
                    </span>
                    <h3 className="text-[12px] font-medium tracking-label text-[#606060]">
                      WHY THIS TRIGGERED · criticality {report.criticality_score}/100
                    </h3>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-[#0F0F0F]">{report.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(report.criticality_factors).map(([k, v]) => (
                      <span key={k} className="rounded-full bg-[#F2F2F2] px-2 py-0.5 text-[11px] text-[#0F0F0F]">
                        {k.replace(/_/g, " ")} +{v}
                      </span>
                    ))}
                  </div>
                  {report.timeline.length > 0 && (
                    <>
                      <h4 className="mt-4 text-[12px] font-medium tracking-label text-[#606060]">TIMELINE</h4>
                      <ol className="mt-2 space-y-2 border-l border-[#E5E5E5] pl-4">
                        {report.timeline.map((e, i) => (
                          <li key={i} className="relative text-[13px]">
                            <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-[#065FD4]" />
                            <span className="font-medium text-[#0F0F0F]">{e.action.replace(/_/g, " ")}</span>
                            <span className="text-[#606060]"> · {e.actor}</span>
                            {e.note && <span className="block text-[12px] text-[#606060]">{e.note}</span>}
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </section>
              )}
```

## F5. api.ts + types.ts + mockData.ts cleanup
- `types.ts`: add `agent_keys: string[];` to the `Rule` interface and `agent_keys?: string[];` to `RuleCreateBody`. Keep `ThreatReport`/`TimelineEntry`. **Delete** `ResponsePolicy`, `ResponseMode`, `RemediationCommand` interfaces.
- `api.ts`: **delete** `getThreats`, `getPolicy`, `updatePolicy` and their `MOCK_THREATS`(list)/`MOCK_POLICY` imports. **Keep** `getThreatReport`, `generateThreatReport`, `getAgentStatus`, `updateRule`. Remove now-unused type imports (`ThreatListResponse`, `ResponsePolicy`).
- `mockData.ts`: keep `MOCK_THREATS` ONLY if `getThreatReport` mock-fallback uses it (it does — `MOCK_THREATS.find(...)`). Keep it; **delete** `MOCK_POLICY`. Remove the `ResponsePolicy` type import.

## F6. Workflows page
`app/(dashboard)/workflows/page.tsx`:
```tsx
import { getRules, getAgents } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner } from "@/app/components/ui";
import WorkflowsGrid from "./WorkflowsGrid";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const [rulesRes, agentsRes] = await Promise.all([getRules(), getAgents()]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Workflows"
        subtitle="Choose which agents each rule triggers. A rule with no agents selected falls back to the agents' own coverage."
      />
      {(rulesRes.mock || agentsRes.mock) && <MockBanner reason={rulesRes.error ?? agentsRes.error} />}
      <WorkflowsGrid rules={rulesRes.data.items} agents={agentsRes.data.items} />
    </div>
  );
}
```

`app/(dashboard)/workflows/WorkflowsGrid.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Agent, Rule } from "@/app/lib/types";
import { updateRule } from "@/app/lib/api";
import { Card } from "@/app/components/ui";
import { useToast } from "@/app/lib/toast";

export default function WorkflowsGrid({ rules, agents }: { rules: Rule[]; agents: Agent[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [keysByRule, setKeysByRule] = useState<Record<string, string[]>>(
    Object.fromEntries(rules.map((r) => [r.rule_id, r.agent_keys ?? []])),
  );
  const [saving, setSaving] = useState<string | null>(null);

  async function toggle(rule: Rule, agentKey: string) {
    const current = keysByRule[rule.rule_id] ?? [];
    const next = current.includes(agentKey) ? current.filter((k) => k !== agentKey) : [...current, agentKey];
    setKeysByRule((m) => ({ ...m, [rule.rule_id]: next }));
    setSaving(rule.rule_id);
    const res = await updateRule(rule.rule_id, { agent_keys: next });
    setSaving(null);
    if (res.mock || !res.data) {
      toast("Saved locally (offline)", "info");
    } else {
      toast(`${rule.name}: ${next.length || "coverage"} agents`, "success");
      router.refresh();
    }
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[#E5E5E5]">
            <th className="px-2 py-2 text-left font-medium text-[#606060]">Rule</th>
            {agents.map((a) => (
              <th key={a.agent_id} className="px-2 py-2 text-center font-medium text-[#606060]" title={a.name}>
                {a.output_key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => {
            const keys = keysByRule[rule.rule_id] ?? [];
            return (
              <tr key={rule.rule_id} className="border-b border-[#F2F2F2]">
                <td className="px-2 py-2">
                  <span className="font-medium text-[#0F0F0F]">{rule.name}</span>
                  {keys.length === 0 && <span className="ml-2 text-[11px] text-[#909090]">(coverage)</span>}
                  {saving === rule.rule_id && <span className="ml-2 text-[11px] text-[#065FD4]">saving…</span>}
                </td>
                {agents.map((a) => {
                  const on = keys.includes(a.output_key);
                  return (
                    <td key={a.agent_id} className="px-2 py-2 text-center">
                      <button
                        onClick={() => toggle(rule, a.output_key)}
                        aria-label={`${rule.name} -> ${a.output_key}`}
                        className={`h-5 w-5 rounded border ${on ? "border-[#0F0F0F] bg-[#0F0F0F] text-white" : "border-[#C8C8C8] bg-white text-transparent"}`}
                      >
                        ✓
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
```
> `updateRule` already exists (Phase 1) and accepts `{ agent_keys }` once `RuleCreateBody` includes it. `Card` accepts `className`.

## F7. Build
`node ./node_modules/next/dist/bin/next build` → clean, routes include `/threats` (findings) + `/workflows`, NO `/security`.

---

## Self-Review
- Pivot coverage: Security→Threats rename + delete old page ✓ · modal why+timeline ✓ · policy removed ✓ · all remediation execution removed ✓ · agent scanner kept ✓ · Workflows rules×agents grid + agent_keys override-with-coverage-fallback ✓.
- Safety/consistency: numbers still rule/criticality-owned; threat report now on-demand only (no policy); approval is triage-only (no action). `select_agents_for_finding(finding, agents, rule)` signature consistent across router, governance (ingest + enrich), and tests. No dangling refs after deletions (each deletion lists its import cleanups).
