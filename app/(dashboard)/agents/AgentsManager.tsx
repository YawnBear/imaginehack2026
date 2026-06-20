"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Agent } from "@/app/lib/types";
import { createAgent, deleteAgent, updateAgent } from "@/app/lib/api";
import { Card } from "@/app/components/ui";
import { useToast } from "@/app/lib/toast";
import AIAgentAssistant from "@/app/components/assistant/AIAgentAssistant";
import AgentAIBuilder from "./AgentAIBuilder";

export default function AgentsManager({ initialAgents }: { initialAgents: Agent[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [open, setOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

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
  function openNew() {
    setEditingAgent(null);
    setOpen(true);
  }
  function openEdit(a: Agent) {
    setEditingAgent(a);
    setOpen(true);
  }
  function closeWizard() {
    setOpen(false);
    setEditingAgent(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">{agents.length} agent{agents.length === 1 ? "" : "s"}</p>
        <button onClick={openNew} className="h-9 rounded-full bg-action px-4 text-[13px] font-medium text-on-action hover:opacity-90">+ New Agent</button>
      </div>
      <AIAgentAssistant agents={agents} onToggle={toggle} onDelete={remove} />
      <div className="space-y-3">
        {agents.map((a) => (
          <Card key={a.agent_id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-ink">{a.name}</p>
                <p className="mt-1 line-clamp-2 text-[12px] text-muted">{a.system_prompt}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => toggle(a)} className={`h-7 rounded-full px-3 text-[12px] font-medium ${a.enabled ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-surface text-muted"}`}>{a.enabled ? "Enabled" : "Disabled"}</button>
                <button onClick={() => openEdit(a)} className="h-7 rounded-full border border-border px-3 text-[12px] text-ink hover:bg-surface">Edit</button>
                <button onClick={() => remove(a)} className="h-7 rounded-full px-3 text-[12px] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]">Delete</button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {open && (
        <AgentWizard
          initialAgent={editingAgent ?? undefined}
          onClose={closeWizard}
          onSaved={(a, action) => {
            setAgents((xs) =>
              action === "edit"
                ? xs.map((x) => (x.agent_id === a.agent_id ? a : x))
                : [...xs, a],
            );
            closeWizard();
            toast(action === "edit" ? "Agent updated" : "Agent created", "success");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AgentWizard({
  initialAgent,
  onClose,
  onSaved,
}: {
  initialAgent?: Agent;
  onClose: () => void;
  onSaved: (a: Agent, action: "create" | "edit") => void;
}) {
  const { toast } = useToast();
  const isEdit = Boolean(initialAgent);
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [name, setName] = useState(initialAgent?.name ?? "");
  const [prompt, setPrompt] = useState(initialAgent?.system_prompt ?? "");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!name.trim() || !prompt.trim()) return;
    setSaving(true);
    try {
      if (initialAgent) {
        const res = await updateAgent(initialAgent.agent_id, {
          name: name.trim(),
          system_prompt: prompt.trim(),
        });
        if (res.mock || !res.data) {
          toast("Couldn't update (offline)", "error");
          return;
        }
        onSaved(res.data, "edit");
        return;
      }
      const res = await createAgent({ name: name.trim(), system_prompt: prompt.trim() });
      onSaved(res.data, "create");
    }
    finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 gg-scrim" onClick={onClose} />
      <div className={`gg-fade-up relative z-10 w-full rounded-xl border border-border bg-surface-raised p-5 shadow-[var(--shadow-e3)] ${mode === "ai" ? "max-w-[920px]" : "max-w-[560px]"}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold">{isEdit ? "Edit Agent" : "New Agent"}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>

        {!isEdit && (
          <div className="mt-3 inline-flex rounded-full border border-border bg-surface-subtle p-1 text-[12px] font-medium">
            <button
              onClick={() => setMode("manual")}
              className={`h-7 rounded-full px-3 ${mode === "manual" ? "bg-action text-on-action" : "text-muted hover:text-ink"}`}
            >
              Manual
            </button>
            <button
              onClick={() => setMode("ai")}
              className={`h-7 rounded-full px-3 ${mode === "ai" ? "bg-action text-on-action" : "text-muted hover:text-ink"}`}
            >
              ✨ Generate with AI
            </button>
          </div>
        )}

        {mode === "manual" ? (
          <>
            <label className="mt-4 block text-[12px] font-medium text-muted">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Data Exposure Specialist" className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[14px]" />
            <label className="mt-4 block text-[12px] font-medium text-muted">System prompt</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} placeholder="You are a... For each finding, explain... in one or two sentences. Never invent numbers." className="mt-1 w-full resize-none rounded-lg border border-border px-3 py-2 text-[13px]" />
            <p className="mt-1 text-[11px] text-subtle">The agent runs this prompt against each finding it&apos;s assigned (set assignments in Workflows). Requires an AI key to produce output.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="h-9 rounded-full px-4 text-[13px] hover:bg-surface">Cancel</button>
              <button onClick={save} disabled={saving || !name.trim() || !prompt.trim()} className="h-9 rounded-full bg-action px-5 text-[13px] font-medium text-on-action hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : isEdit ? "Save changes" : "Save agent"}</button>
            </div>
          </>
        ) : (
          <AgentAIBuilder onCreated={(a) => onSaved(a, "create")} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
