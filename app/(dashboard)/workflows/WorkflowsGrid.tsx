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
              <th key={a.agent_id} className="px-2 py-2 text-center font-medium text-[#606060]" title={a.output_key}>
                {a.name}
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
