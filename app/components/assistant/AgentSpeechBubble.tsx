import type { AIAgentState } from "./AIAgentMascot";

type AgentSpeechBubbleProps = {
  state: AIAgentState;
  message: string;
  open: boolean;
};

const LABEL_BY_STATE: Record<AIAgentState, string> = {
  idle: "Monitoring",
  scanning: "Scanning",
  analysing: "Analysing",
  alert: "Attention",
  waiting_for_review: "Waiting for review",
  success: "Resolved",
};

export default function AgentSpeechBubble({
  state,
  message,
  open,
}: AgentSpeechBubbleProps) {
  return (
    <div
      className={`pointer-events-none absolute bottom-[calc(100%+0.75rem)] right-0 max-w-[240px] transition duration-200 ${open ? "translate-y-1 opacity-0 md:translate-y-0 md:opacity-100" : "translate-y-0 opacity-100"}`}
      aria-live="polite"
    >
      <div className="relative rounded-2xl border border-[var(--color-agent-border)] bg-canvas/96 px-4 py-3 shadow-agent backdrop-blur">
        <div className="mb-1 flex items-center gap-2">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-agent-blue)]">
            {LABEL_BY_STATE[state]}
          </span>
        </div>
        <p className="text-[13px] leading-5 text-[var(--color-agent-ink)]">{message}</p>
        <div className="absolute -bottom-2 right-7 h-4 w-4 rotate-45 border-b border-r border-[var(--color-agent-border)] bg-canvas/96" />
      </div>
    </div>
  );
}
