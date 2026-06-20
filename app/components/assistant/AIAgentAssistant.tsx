"use client";

import type { Agent } from "@/app/lib/types";
import AIAgentMascot, {
  type AIAgentColor,
  type AIAgentState,
} from "./AIAgentMascot";

type AIAgentAssistantProps = {
  agents: Agent[];
};

function getAgentState(agent: Agent, index: number): AIAgentState {
  if (!agent.enabled) return "alert";

  const profile = `${agent.name} ${agent.system_prompt}`.toLowerCase();

  if (
    profile.includes("scan") ||
    profile.includes("detect") ||
    profile.includes("monitor") ||
    profile.includes("threat")
  ) {
    return "scanning";
  }

  if (
    profile.includes("cost") ||
    profile.includes("energy") ||
    profile.includes("carbon") ||
    profile.includes("sustain")
  ) {
    return "success";
  }

  return index % 2 === 0 ? "idle" : "success";
}

function getStatusCopy(state: AIAgentState, enabled: boolean) {
  if (!enabled) {
    return { label: "Needs attention", tone: "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]" };
  }

  if (state === "scanning") {
    return { label: "Scanning live", tone: "bg-[var(--color-agent-ice)] text-[var(--color-agent-blue)]" };
  }

  if (state === "success") {
    return { label: "Healthy", tone: "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" };
  }

  return { label: "Idle watch", tone: "bg-[var(--color-agent-surface)] text-[var(--color-agent-blue)]" };
}

const AGENT_COLORS: AIAgentColor[] = ["yellow", "orange", "pink", "blue", "green"];

export default function AIAgentAssistant({ agents }: AIAgentAssistantProps) {
  return (
    <aside
      className="w-full"
      aria-label="SafeCloud agent mascot status"
    >
      <div className="rounded-2xl border border-[var(--color-agent-border)] gg-agent-panel p-4 shadow-agent sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-agent-blue)]">
              Agent Fleet
            </p>
            <p className="mt-1 text-[13px] leading-5 text-[var(--color-agent-muted)]">
              A playful face for each agent, with motion driven by live status.
            </p>
          </div>
          <span className="rounded-full bg-canvas/80 px-3 py-1 text-[12px] font-medium text-[var(--color-agent-ink)]">
            {agents.length} total
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {agents.map((agent, index) => {
            const state = getAgentState(agent, index);
            const status = getStatusCopy(state, agent.enabled);
            const color = AGENT_COLORS[index % AGENT_COLORS.length];

            return (
              <div
                key={agent.agent_id}
                className="flex min-w-0 flex-col items-center rounded-2xl bg-canvas/55 px-2 py-3"
                aria-label={`${agent.name}: ${status.label}`}
              >
                <div className="rounded-full border border-on-accent/80 bg-transparent shadow-agent">
                  <AIAgentMascot state={state} collapsed color={color} />
                </div>
                <p className="mt-2 clamp-1 max-w-[96px] text-center text-[12px] font-semibold text-[var(--color-agent-navy)]">
                  {agent.name}
                </p>
                <div className="mt-2 flex justify-center">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${status.tone}`}>
                    {status.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </aside>
  );
}
