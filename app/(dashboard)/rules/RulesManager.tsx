"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ClashWarning,
  ConditionOperator,
  Rule,
  RuleCondition,
} from "@/app/lib/types";
import { createRule, deleteRule, previewRule, updateRule } from "@/app/lib/api";
import { Card, SeverityBadge, Pill } from "@/app/components/ui";
import { useToast } from "@/app/lib/toast";

const OPERATORS: ConditionOperator[] = [
  "==", "!=", "<", "<=", ">", ">=", "in", "not_in", "exists", "contains",
];

export default function RulesManager({
  initialRules,
  clashes,
}: {
  initialRules: Rule[];
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
                  <Pill>{rule.resource_type ?? "any"}</Pill>
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

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "custom_rule";
}

function RuleWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (rule: Rule) => void;
}) {
  const [name, setName] = useState("");
  const [conditions, setConditions] = useState<RuleCondition[]>([
    { field: "", operator: "==", value: "" },
  ]);
  const [preview, setPreview] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  function setCond(i: number, patch: Partial<RuleCondition>) {
    setConditions((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  async function runPreview() {
    const res = await previewRule({
      conditions: conditions.map((c) => ({ ...c, value: coerce(c.value) })),
    });
    setPreview(res.data.match_count);
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await createRule({
        name: name.trim(),
        issue_type: slug(name),
        category: "security",
        conditions: conditions.map((c) => ({ ...c, value: coerce(c.value) })),
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

        <label className="mt-4 block text-[12px] font-medium text-[#606060]">Rule name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Idle Prod VM"
          className="mt-1 w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-[14px]"
        />

        <div className="mt-4 flex items-center justify-between">
          <label className="text-[12px] font-medium text-[#606060]">Conditions</label>
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
