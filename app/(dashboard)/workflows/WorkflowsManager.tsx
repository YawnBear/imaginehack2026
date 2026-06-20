"use client";

import { useMemo, useState } from "react";
import type { Agent, Rule, Workflow } from "@/app/lib/types";
import { createWorkflow, deleteWorkflow, updateWorkflow } from "@/app/lib/api";
import { CATEGORY_COLOR, relativeTime } from "@/app/lib/format";
import { useToast } from "@/app/lib/toast";
import { WorkflowGraph } from "./WorkflowGraph";

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
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);

  const ruleById = useMemo(
    () => Object.fromEntries(rules.map((r) => [r.rule_id, r])),
    [rules],
  );
  const agentByKey = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.output_key, a])),
    [agents],
  );

  async function remove(wf: Workflow) {
    const res = await deleteWorkflow(wf.workflow_id);
    if (res.mock || !res.data) {
      toast("Couldn't delete (offline)", "error");
      return;
    }
    setList((xs) => xs.filter((x) => x.workflow_id !== wf.workflow_id));
    toast("Workflow deleted", "success");
  }

  function openNew() {
    setEditingWorkflow(null);
    setModalOpen(true);
  }

  function openEdit(wf: Workflow) {
    setEditingWorkflow(wf);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingWorkflow(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {list.length} workflow{list.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={openNew}
          className="h-9 rounded-full border border-border bg-canvas px-4 text-[13px] font-medium text-ink hover:bg-surface"
        >
          + Create workflow
        </button>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-canvas py-16 text-center">
          <p className="text-[14px] font-medium text-ink">No workflows yet</p>
          <p className="mt-1 text-[12px] text-muted">
            Press <strong>+ Create workflow</strong> to pick a rule and its agents.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {list.map((wf) => (
            <WorkflowCard
              key={wf.workflow_id}
              wf={wf}
              rule={ruleById[wf.rule_id] ?? null}
              agentByKey={agentByKey}
              onEdit={() => openEdit(wf)}
              onDelete={() => remove(wf)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <WorkflowModal
          initialWorkflow={editingWorkflow ?? undefined}
          rules={rules}
          agents={agents}
          onClose={closeModal}
          onSaved={(wf, action) => {
            setList((xs) =>
              action === "edit"
                ? xs.map((x) => (x.workflow_id === wf.workflow_id ? wf : x))
                : [wf, ...xs],
            );
            closeModal();
            toast(action === "edit" ? "Workflow updated" : "Workflow created", "success");
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
  onEdit,
  onDelete,
}: {
  wf: Workflow;
  rule: Rule | null;
  agentByKey: Record<string, Agent>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const run = wf.last_run;

  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-surface-subtle"
      style={{
        backgroundImage:
          "radial-gradient(circle, color-mix(in srgb, var(--color-border) 70%, transparent) 1px, transparent 1px)",
        backgroundSize: "15px 15px",
      }}
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <p className="min-w-0 truncate text-[15px] font-medium text-ink">{wf.name}</p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onEdit}
            className="h-7 rounded-full border border-border bg-canvas px-3 text-[12px] text-ink hover:bg-surface"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            aria-label={`Delete ${wf.name}`}
            className="shrink-0 rounded-full px-2 py-1 text-[14px] text-subtle hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
          >
            <span aria-hidden>x</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto px-5 py-3">
        <WorkflowGraph
          rule={rule}
          agentKeys={wf.agent_keys}
          agentByKey={agentByKey}
          findingCount={run?.ran_at ? run.finding_count : null}
        />
      </div>

      <p className="px-5 pb-4 text-[11px] text-subtle">
        {run?.ran_at ? `Last scanned ${relativeTime(run.ran_at)}` : "Not run yet."}
      </p>
    </div>
  );
}

function WorkflowModal({
  initialWorkflow,
  rules,
  agents,
  onClose,
  onSaved,
}: {
  initialWorkflow?: Workflow;
  rules: Rule[];
  agents: Agent[];
  onClose: () => void;
  onSaved: (wf: Workflow, action: "create" | "edit") => void;
}) {
  const { toast } = useToast();
  const isEdit = Boolean(initialWorkflow);
  const [name, setName] = useState(initialWorkflow?.name ?? "");
  const [ruleId, setRuleId] = useState<string>(
    initialWorkflow?.rule_id ?? rules[0]?.rule_id ?? "",
  );
  const [keys, setKeys] = useState<Set<string>>(new Set(initialWorkflow?.agent_keys ?? []));
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
    const payload = {
      name: name.trim(),
      rule_id: ruleId,
      agent_keys: Array.from(keys),
    };
    const res = initialWorkflow
      ? await updateWorkflow(initialWorkflow.workflow_id, payload)
      : await createWorkflow(payload);
    setSaving(false);
    if (res.mock || !res.data) {
      toast(initialWorkflow ? "Couldn't update (offline)" : "Couldn't create (offline)", "error");
      return;
    }
    onSaved(res.data, initialWorkflow ? "edit" : "create");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 gg-scrim" onClick={onClose} />
      <div className="gg-fade-up relative z-10 w-full max-w-[560px] rounded-xl border border-border bg-canvas p-5 shadow-[var(--shadow-e3)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold">{isEdit ? "Edit workflow" : "Create workflow"}</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <span aria-hidden>x</span>
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
            {saving ? "Saving..." : isEdit ? "Save changes" : "Save workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}
