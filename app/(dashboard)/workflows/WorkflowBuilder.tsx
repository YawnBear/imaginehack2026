"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Agent, Rule, WorkflowRunResponse } from "@/app/lib/types";
import { runWorkflow, updateRule } from "@/app/lib/api";
import { Card } from "@/app/components/ui";
import { CATEGORY_COLOR, issueLabel } from "@/app/lib/format";
import { useToast } from "@/app/lib/toast";

// Preferred display order for merged agent outputs; matches the backend
// summary stitcher and the finding modal.
const AGENT_ORDER = ["security", "cost", "energy", "workflow", "audit"];

function orderedKeys(outputs: Record<string, string>): string[] {
  const keys = Object.keys(outputs);
  const known = AGENT_ORDER.filter((a) => keys.includes(a));
  const extra = keys.filter((k) => !AGENT_ORDER.includes(k.toLowerCase()));
  return [...known, ...extra];
}

export default function WorkflowBuilder({
  rules,
  agents,
}: {
  rules: Rule[];
  agents: Agent[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [selectedRuleId, setSelectedRuleId] = useState<string>(
    rules[0]?.rule_id ?? "",
  );
  const [keysByRule, setKeysByRule] = useState<Record<string, string[]>>(
    Object.fromEntries(rules.map((r) => [r.rule_id, r.agent_keys ?? []])),
  );
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WorkflowRunResponse | null>(null);
  const [showOutputs, setShowOutputs] = useState(true);

  const selectedRule = rules.find((r) => r.rule_id === selectedRuleId) ?? null;
  const currentKeys = keysByRule[selectedRuleId] ?? [];

  // Map output_key -> agent name for the read-only mappings table.
  const nameByKey = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.output_key, a.name])),
    [agents],
  );

  async function toggle(agentKey: string) {
    if (!selectedRuleId) return;
    const next = currentKeys.includes(agentKey)
      ? currentKeys.filter((k) => k !== agentKey)
      : [...currentKeys, agentKey];
    setKeysByRule((m) => ({ ...m, [selectedRuleId]: next }));
    setSaving(true);
    const res = await updateRule(selectedRuleId, { agent_keys: next });
    setSaving(false);
    if (res.mock || !res.data) {
      toast("Saved locally (offline)", "info");
    } else {
      toast(`${selectedRule?.name ?? "Rule"}: ${next.length || "coverage"} agents`, "success");
      router.refresh();
    }
  }

  async function run() {
    if (!selectedRuleId) return;
    setRunning(true);
    const res = await runWorkflow(selectedRuleId, currentKeys);
    setResult(res.data);
    setShowOutputs(true);
    setRunning(false);
    if (res.mock) {
      toast("Offline preview", "info");
    }
  }

  return (
    <div className="space-y-5">
      {/* Builder */}
      <Card className="space-y-4">
        {/* Rule picker */}
        <div>
          <label
            htmlFor="workflow-rule"
            className="mb-1 block text-[12px] font-medium tracking-label text-[#606060]"
          >
            RULE
          </label>
          <select
            id="workflow-rule"
            value={selectedRuleId}
            onChange={(e) => {
              setSelectedRuleId(e.target.value);
              setResult(null);
            }}
            className="w-full rounded-lg border border-[#E5E5E5] bg-[#F8F8F8] px-3 py-2 text-[14px] text-[#0F0F0F] focus:border-[#0F0F0F] focus:bg-white focus:outline-none"
          >
            {rules.map((r) => (
              <option key={r.rule_id} value={r.rule_id}>
                {r.name}
              </option>
            ))}
          </select>
          {selectedRule && (
            <p className="mt-1.5 text-[12px] text-[#606060]">
              {issueLabel(selectedRule.issue_type)} · {selectedRule.category} ·{" "}
              {selectedRule.severity_base}
            </p>
          )}
        </div>

        {/* Agent chips */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[12px] font-medium tracking-label text-[#606060]">
              AGENTS
            </h3>
            {saving && <span className="text-[11px] text-[#065FD4]">saving…</span>}
          </div>
          {agents.length === 0 ? (
            <p className="text-[13px] text-[#909090]">No agents configured yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {agents.map((a) => {
                const on = currentKeys.includes(a.output_key);
                const color =
                  CATEGORY_COLOR[a.output_key as keyof typeof CATEGORY_COLOR] ??
                  "#606060";
                return (
                  <button
                    key={a.agent_id}
                    onClick={() => toggle(a.output_key)}
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
                      on
                        ? "border-[#0F0F0F] bg-[#0F0F0F] text-white"
                        : "border-[#E5E5E5] bg-white text-[#0F0F0F] hover:bg-[#F2F2F2]"
                    }`}
                  >
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ background: on ? "#FFFFFF" : color }}
                    />
                    {a.name}
                  </button>
                );
              })}
            </div>
          )}
          {currentKeys.length === 0 && (
            <p className="mt-2 text-[12px] text-[#909090]">
              No agents selected — this rule falls back to the agents&apos; own coverage.
            </p>
          )}
        </div>

        {/* Run */}
        <div className="flex items-center gap-3">
          <button
            onClick={run}
            disabled={running || currentKeys.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0F0F0F] px-4 text-[14px] font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {running ? "Running…" : "Run ▶"}
          </button>
          {currentKeys.length === 0 && (
            <span className="text-[12px] text-[#909090]">
              Pick one or more agents to run.
            </span>
          )}
        </div>
      </Card>

      {/* Result */}
      {result && (
        <Card className="space-y-4">
          {/* Workflow summary */}
          <div className="rounded-lg border border-[#065FD433] bg-[#065FD40A] p-4">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h3 className="text-[12px] font-medium tracking-label text-[#606060]">
                WORKFLOW SUMMARY
              </h3>
              {result.ai_generated ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: "#065FD414", color: "#065FD4" }}
                >
                  ✨ AI-generated
                </span>
              ) : (
                <span className="rounded-full bg-[#F2F2F2] px-2 py-0.5 text-[10px] font-medium text-[#606060]">
                  Offline / stitched
                </span>
              )}
              {result.synthetic && (
                <span className="rounded-full bg-[#FB8C0014] px-2 py-0.5 text-[10px] font-medium text-[#FB8C00]">
                  synthetic sample
                </span>
              )}
            </div>
            <p className="text-[13px] leading-relaxed text-[#0F0F0F]">{result.summary}</p>
          </div>

          {/* Agent outputs (collapsible) */}
          {Object.keys(result.agent_outputs).length > 0 && (
            <div>
              <button
                onClick={() => setShowOutputs((s) => !s)}
                className="mb-2 flex items-center gap-1.5 text-[12px] font-medium tracking-label text-[#606060] hover:text-[#0F0F0F]"
              >
                <span>{showOutputs ? "▾" : "▸"}</span>
                AGENT OUTPUTS ({Object.keys(result.agent_outputs).length})
              </button>
              {showOutputs && (
                <div className="space-y-2">
                  {orderedKeys(result.agent_outputs).map((agent) => {
                    const color =
                      CATEGORY_COLOR[agent.toLowerCase() as keyof typeof CATEGORY_COLOR] ??
                      "#606060";
                    return (
                      <div key={agent} className="flex gap-3 rounded-lg bg-[#F8F8F8] p-3">
                        <span
                          className="mt-0.5 h-fit shrink-0 rounded px-2 py-0.5 text-[11px] font-medium capitalize"
                          style={{ background: `${color}1a`, color }}
                        >
                          {agent}
                        </span>
                        <p className="text-[13px] leading-relaxed text-[#0F0F0F]">
                          {result.agent_outputs[agent]}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Read-only mappings table */}
      <Card className="overflow-x-auto">
        <h3 className="mb-3 text-[12px] font-medium tracking-label text-[#606060]">
          RULE → AGENT MAPPINGS
        </h3>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[#E5E5E5]">
              <th className="px-2 py-2 text-left font-medium text-[#606060]">Rule</th>
              <th className="px-2 py-2 text-left font-medium text-[#606060]">Agents</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => {
              const keys = keysByRule[rule.rule_id] ?? [];
              const names = keys.map((k) => nameByKey[k] ?? k);
              return (
                <tr key={rule.rule_id} className="border-b border-[#F2F2F2]">
                  <td className="px-2 py-2">
                    <span className="font-medium text-[#0F0F0F]">{rule.name}</span>
                  </td>
                  <td className="px-2 py-2 text-[#0F0F0F]">
                    {names.length > 0 ? (
                      names.join(", ")
                    ) : (
                      <span className="text-[#909090]">no agents</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
