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
      <AIAgentAssistant agents={agents} />
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
  const [mode, setMode] = useState<"manual" | "ai">("manual");
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
      <div className={`gg-fade-up relative z-10 w-full rounded-xl border border-[#E5E5E5] bg-white p-5 shadow-[var(--shadow-e3)] ${mode === "ai" ? "max-w-[920px]" : "max-w-[560px]"}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold">New Agent</h2>
          <button onClick={onClose} className="text-[#606060] hover:text-[#0F0F0F]">✕</button>
        </div>

        {/* Mode toggle: Manual (default) | Generate with AI */}
        <div className="mt-3 inline-flex rounded-full border border-[#E5E5E5] bg-[#F8F8F8] p-1 text-[12px] font-medium">
          <button
            onClick={() => setMode("manual")}
            className={`h-7 rounded-full px-3 ${mode === "manual" ? "bg-[#0F0F0F] text-white" : "text-[#606060] hover:text-[#0F0F0F]"}`}
          >
            Manual
          </button>
          <button
            onClick={() => setMode("ai")}
            className={`h-7 rounded-full px-3 ${mode === "ai" ? "bg-[#0F0F0F] text-white" : "text-[#606060] hover:text-[#0F0F0F]"}`}
          >
            ✨ Generate with AI
          </button>
        </div>

        {mode === "manual" ? (
          <>
            <label className="mt-4 block text-[12px] font-medium text-[#606060]">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Data Exposure Specialist" className="mt-1 w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-[14px]" />
            <label className="mt-4 block text-[12px] font-medium text-[#606060]">System prompt</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} placeholder="You are a... For each finding, explain... in one or two sentences. Never invent numbers." className="mt-1 w-full resize-none rounded-lg border border-[#E5E5E5] px-3 py-2 text-[13px]" />
            <p className="mt-1 text-[11px] text-[#909090]">The agent runs this prompt against each finding it&apos;s assigned (set assignments in Workflows). Requires an AI key to produce output.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="h-9 rounded-full px-4 text-[13px] hover:bg-[#F2F2F2]">Cancel</button>
              <button onClick={save} disabled={saving || !name.trim() || !prompt.trim()} className="h-9 rounded-full bg-[#0F0F0F] px-5 text-[13px] font-medium text-white hover:bg-black disabled:opacity-50">{saving ? "Saving…" : "Save agent"}</button>
            </div>
          </>
        ) : (
          <AgentAIBuilder onCreated={onCreated} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
