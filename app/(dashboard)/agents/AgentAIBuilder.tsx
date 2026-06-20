"use client";

import { useEffect, useRef, useState } from "react";
import type { Agent, AgentChatMessage } from "@/app/lib/types";
import { createAgent, generateAgentDraft } from "@/app/lib/api";
import { useToast } from "@/app/lib/toast";

const EXAMPLES = [
  "An agent that flags idle, over-provisioned compute and suggests right-sizing.",
  "A data-residency agent that checks if storage breaks our region rules.",
  "An agent that explains the project downtime risk of decommissioning a resource.",
];

/**
 * Conversational agent builder: describe a sub-agent in plain English, the LLM
 * (claude-opus-4-8 via the backend) talks back, explains its choices, and drafts
 * a SafeCloud-native system prompt into the editable preview. Save reuses the
 * same createAgent path as manual entry.
 */
export default function AgentAIBuilder({
  onCreated,
  onClose,
}: {
  onCreated: (a: Agent) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    const next: AgentChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setThinking(true);
    try {
      const res = await generateAgentDraft({
        messages: next,
        current_name: draftName || undefined,
        current_system_prompt: draftPrompt || undefined,
      });
      const d = res.data;
      const reply =
        d.reply ||
        (d.system_prompt
          ? "Here's a draft on the right — edit it or tell me what to change."
          : "I couldn't draft that. Could you describe the agent a bit more?");
      setMessages((xs) => [...xs, { role: "assistant", content: reply }]);
      if (d.name) setDraftName(d.name);
      if (d.system_prompt) setDraftPrompt(d.system_prompt);
    } catch {
      setMessages((xs) => [
        ...xs,
        { role: "assistant", content: "Something went wrong reaching the AI. Please try again." },
      ]);
    } finally {
      setThinking(false);
    }
  }

  async function save() {
    if (!draftName.trim() || !draftPrompt.trim() || saving) return;
    setSaving(true);
    try {
      const res = await createAgent({ name: draftName.trim(), system_prompt: draftPrompt.trim() });
      onCreated(res.data);
    } catch {
      toast("Couldn't save agent", "error");
    } finally {
      setSaving(false);
    }
  }

  const canSave = !!draftName.trim() && !!draftPrompt.trim() && !saving;

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {/* ---- Left: conversation ---- */}
      <div className="flex h-[58vh] flex-col rounded-xl border border-border bg-surface-subtle">
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
          {messages.length === 0 && (
            <div className="gg-fade-up space-y-3">
              <p className="text-[13px] text-muted">
                Describe the agent you want in plain English. I&apos;ll write a professional system
                prompt, explain my choices, and you can refine it by chatting.
              </p>
              <div className="space-y-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => send(ex)}
                    className="block w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-left text-[12px] text-ink hover:bg-surface"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl bg-action px-3 py-2 text-[13px] text-on-action">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[90%] rounded-2xl bg-surface px-3 py-2 text-[13px] text-ink">
                  {/* Animate only the most recent assistant message. */}
                  {i === messages.length - 1 ? <TypewriterText text={m.content} /> : <span className="whitespace-pre-wrap">{m.content}</span>}
                </div>
              </div>
            ),
          )}
          {thinking && (
            <div className="flex justify-start">
              <div className="gg-pulse rounded-2xl bg-surface px-3 py-2 text-[13px] text-muted">
                Thinking…
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-border p-2">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={2}
              placeholder={messages.length === 0 ? "Describe your agent…" : "Refine it (e.g. 'focus on cost waste')…"}
              className="min-h-[40px] flex-1 resize-none rounded-lg border border-border bg-surface-raised px-3 py-2 text-[13px]"
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || thinking}
              className="h-9 shrink-0 rounded-full bg-action px-4 text-[13px] font-medium text-on-action hover:opacity-90 disabled:opacity-50"
            >
              {thinking ? "…" : "Send"}
            </button>
          </div>
        </div>
      </div>

      {/* ---- Right: live, editable preview ---- */}
      <div className="flex h-[58vh] flex-col">
        <div className="flex-1 overflow-y-auto pr-1">
          <label className="block text-[12px] font-medium text-muted">Agent name</label>
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Generated name appears here…"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[14px]"
          />
          <label className="mt-4 block text-[12px] font-medium text-muted">System prompt</label>
          <textarea
            value={draftPrompt}
            onChange={(e) => setDraftPrompt(e.target.value)}
            rows={12}
            placeholder="The generated system prompt appears here. You can edit it before saving."
            className="mt-1 w-full resize-none rounded-lg border border-border px-3 py-2 text-[13px]"
          />
          <p className="mt-1 text-[11px] text-subtle">
            This runs against each finding the agent is assigned (set assignments in Workflows).
          </p>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-full px-4 text-[13px] hover:bg-surface">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="h-9 rounded-full bg-action px-5 text-[13px] font-medium text-on-action hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save agent"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Reveals text word-by-word for a "talking" feel. Animates once per text. */
function TypewriterText({ text }: { text: string }) {
  return <TypewriterTextRun key={text} text={text} />;
}

function TypewriterTextRun({ text }: { text: string }) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (!text) return;
    const tokens = text.split(/(\s+)/); // keep whitespace so layout is preserved
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(tokens.slice(0, i).join(""));
      if (i >= tokens.length) clearInterval(id);
    }, 26);
    return () => clearInterval(id);
  }, [text]);
  return <span className="whitespace-pre-wrap">{shown}</span>;
}
