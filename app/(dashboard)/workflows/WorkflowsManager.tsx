"use client";

import { useMemo, useState } from "react";
import type { Agent, Rule, Workflow } from "@/app/lib/types";
import { createWorkflow, deleteWorkflow, runAllWorkflows } from "@/app/lib/api";
import { Card } from "@/app/components/ui";
import { CATEGORY_COLOR, issueLabel, relativeTime } from "@/app/lib/format";
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

export default function WorkflowsManager({
  workflows,
  rules,
  agents,
}: {
  workflows: Workflow[];
  rules: Rule[];
  agents: Agent[];
}) {
  const { toast } = useToast();

  const [list, setList] = useState<Workflow[]>(workflows);
  const [running, setRunning] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Lookups for rendering cards.
  const ruleById = useMemo(
    () => Object.fromEntries(rules.map((r) => [r.rule_id, r])),
    [rules],
  );
  const agentByKey = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.output_key, a])),
    [agents],
  );

  async function runAll() {
    if (list.length === 0 || running) return;
    setRunning(true);
    const res = await runAllWorkflows();
    setRunning(false);
    // Merge the freshly-run workflows into the current list by id.
    const byId = new Map(list.map((w) => [w.workflow_id, w]));
    for (const w of res.data.workflows) byId.set(w.workflow_id, w);
    setList(Array.from(byId.values()));
    if (res.mock) {
      toast("Offline — connect the backend to run workflows", "info");
    } else {
      toast(
        `Scanned ${res.data.scanned_findings} findings · ran ${res.data.workflows.length} workflows`,
        "success",
      );
    }
  }

  async function remove(wf: Workflow) {
    const res = await deleteWorkflow(wf.workflow_id);
    if (res.mock || !res.data) {
      toast("Couldn't delete (offline)", "error");
      return;
    }
    setList((xs) => xs.filter((x) => x.workflow_id !== wf.workflow_id));
    toast("Workflow deleted", "success");
  }

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {list.length} workflow{list.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalOpen(true)}
            className="h-9 rounded-full border border-border bg-canvas px-4 text-[13px] font-medium text-ink hover:bg-surface"
          >
            + Create workflow
          </button>
          <button
            onClick={runAll}
            disabled={list.length === 0 || running}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-action px-4 text-[13px] font-medium text-on-action hover:opacity-90 disabled:opacity-50"
          >
            {running ? "Running…" : "Run all ▶"}
          </button>
        </div>
      </div>

      {/* Cards grid */}
      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-canvas py-16 text-center">
          <p className="text-[14px] font-medium text-ink">No workflows yet</p>
          <p className="mt-1 text-[12px] text-muted">
            Press <strong>+ Create workflow</strong> to pick a rule and its agents.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((wf) => (
            <WorkflowCard
              key={wf.workflow_id}
              wf={wf}
              rule={ruleById[wf.rule_id] ?? null}
              agentByKey={agentByKey}
              onDelete={() => remove(wf)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <CreateWorkflowModal
          rules={rules}
          agents={agents}
          onClose={() => setModalOpen(false)}
          onCreated={(wf) => {
            setList((xs) => [wf, ...xs]);
            setModalOpen(false);
            toast("Workflow created", "success");
          }}
        />
      )}
    </div>
  );
}

function WorkflowCard({
  wf,
  rule,
  agentByKey,
  onDelete,
}: {
  wf: Workflow;
  rule: Rule | null;
  agentByKey: Record<string, Agent>;
  onDelete: () => void;
}) {
  const [showOutputs, setShowOutputs] = useState(false);
  const run = wf.last_run;

  return (
    <Card className="flex flex-col gap-3">
      {/* Header: name + delete */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-ink">{wf.name}</p>
          <p className="mt-1 text-[12px] text-muted">
            {rule ? (
              <>
                {rule.name} · {issueLabel(rule.issue_type)}
              </>
            ) : (
              <span className="text-subtle">rule removed</span>
            )}
          </p>
        </div>
        <button
          onClick={onDelete}
          aria-label="Delete workflow"
          className="shrink-0 rounded-full px-2 py-1 text-[14px] text-subtle hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
        >
          ✕
        </button>
      </div>

      {/* Agent chips */}
      {wf.agent_keys.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {wf.agent_keys.map((key) => {
            const agent = agentByKey[key];
            const color =
              CATEGORY_COLOR[key as keyof typeof CATEGORY_COLOR] ?? "var(--color-muted)";
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium"
                style={{ background: `${color}14`, color }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                {agent?.name ?? key}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-[12px] text-subtle">No agents selected.</p>
      )}

      {/* Result */}
      {run ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--color-link-border)] bg-[var(--color-link-tint)] p-3">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h4 className="text-[12px] font-medium tracking-label text-muted">
                WORKFLOW SUMMARY
              </h4>
              {run.ai_generated ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: "var(--color-link-soft)", color: "var(--color-link)" }}
                >
                  ✨ AI-generated
                </span>
              ) : (
                <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">
                  offline / stitched
                </span>
              )}
            </div>
            <p className="text-[13px] leading-relaxed text-ink">{run.summary}</p>
            <p className="mt-2 text-[11px] text-subtle">
              {run.finding_count} resource{run.finding_count === 1 ? "" : "s"}
              {run.ran_at ? ` · ${relativeTime(run.ran_at)}` : ""}
            </p>
          </div>

          {Object.keys(run.agent_outputs).length > 0 && (
            <div>
              <button
                onClick={() => setShowOutputs((s) => !s)}
                className="mb-2 flex items-center gap-1.5 text-[12px] font-medium tracking-label text-muted hover:text-ink"
              >
                <span>{showOutputs ? "▾" : "▸"}</span>
                AGENT OUTPUTS ({Object.keys(run.agent_outputs).length})
              </button>
              {showOutputs && (
                <div className="space-y-2">
                  {orderedKeys(run.agent_outputs).map((agent) => {
                    const color =
                      CATEGORY_COLOR[agent.toLowerCase() as keyof typeof CATEGORY_COLOR] ??
                      "var(--color-muted)";
                    return (
                      <div key={agent} className="flex gap-3 rounded-lg bg-surface-subtle p-3">
                        <span
                          className="mt-0.5 h-fit shrink-0 rounded px-2 py-0.5 text-[11px] font-medium capitalize"
                          style={{ background: `${color}1a`, color }}
                        >
                          {agent}
                        </span>
                        <p className="text-[13px] leading-relaxed text-ink">
                          {run.agent_outputs[agent]}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-[12px] text-subtle">Not run yet — press Run all.</p>
      )}
    </Card>
  );
}

function CreateWorkflowModal({
  rules,
  agents,
  onClose,
  onCreated,
}: {
  rules: Rule[];
  agents: Agent[];
  onClose: () => void;
  onCreated: (wf: Workflow) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [ruleId, setRuleId] = useState<string>(rules[0]?.rule_id ?? "");
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  function toggle(key: string) {
    setKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    if (!name.trim() || !ruleId) return;
    setSaving(true);
    const res = await createWorkflow({
      name: name.trim(),
      rule_id: ruleId,
      agent_keys: Array.from(keys),
    });
    setSaving(false);
    if (res.mock || !res.data) {
      toast("Couldn't create (offline)", "error");
      return;
    }
    onCreated(res.data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 gg-scrim" onClick={onClose} />
      <div className="gg-fade-up relative z-10 w-full max-w-[560px] rounded-xl border border-border bg-canvas p-5 shadow-[var(--shadow-e3)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold">Create workflow</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <label className="mt-4 block text-[12px] font-medium text-muted">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Public bucket sweep"
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[14px]"
        />

        <label className="mt-4 block text-[12px] font-medium text-muted">Rule</label>
        {rules.length === 0 ? (
          <p className="mt-1 text-[13px] text-subtle">No rules configured yet.</p>
        ) : (
          <select
            value={ruleId}
            onChange={(e) => setRuleId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-[14px] text-ink focus:border-ink focus:bg-canvas focus:outline-none"
          >
            {rules.map((r) => (
              <option key={r.rule_id} value={r.rule_id}>
                {r.name}
              </option>
            ))}
          </select>
        )}

        <label className="mt-4 block text-[12px] font-medium text-muted">Agents</label>
        {agents.length === 0 ? (
          <p className="mt-1 text-[13px] text-subtle">No agents configured yet.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {agents.map((a) => {
              const on = keys.has(a.output_key);
              const color =
                CATEGORY_COLOR[a.output_key as keyof typeof CATEGORY_COLOR] ?? "var(--color-muted)";
              return (
                <button
                  key={a.agent_id}
                  type="button"
                  onClick={() => toggle(a.output_key)}
                  aria-pressed={on}
                  className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
                    on
                      ? "border-ink bg-action text-on-action"
                      : "border-border bg-canvas text-ink hover:bg-surface"
                  }`}
                >
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ background: on ? "var(--color-on-accent)" : color }}
                  />
                  {a.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 rounded-full px-4 text-[13px] hover:bg-surface"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !name.trim() || !ruleId}
            className="h-9 rounded-full bg-action px-5 text-[13px] font-medium text-on-action hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}
