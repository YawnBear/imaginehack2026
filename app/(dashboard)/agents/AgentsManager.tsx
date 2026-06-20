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
