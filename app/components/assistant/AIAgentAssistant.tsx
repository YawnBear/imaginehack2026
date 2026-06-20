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
    return { label: "Needs attention", tone: "bg-[#FFF3E8] text-[#B86800]" };
  }

  if (state === "scanning") {
    return { label: "Scanning live", tone: "bg-[#ECFCFF] text-[#127D98]" };
  }

  if (state === "success") {
    return { label: "Healthy", tone: "bg-[#EAF9EE] text-[#1D7A2E]" };
  }

  return { label: "Idle watch", tone: "bg-[#F3FAFE] text-[#2B8AB8]" };
}

const AGENT_COLORS: AIAgentColor[] = ["yellow", "orange", "pink", "blue", "green"];

export default function AIAgentAssistant({ agents }: AIAgentAssistantProps) {
  return (
    <aside
      className="w-full"
      aria-label="SafeCloud agent mascot status"
    >
      <div className="rounded-2xl border border-[#D8EBF5] bg-[linear-gradient(180deg,rgba(248,253,255,0.98)_0%,rgba(236,247,252,0.94)_100%)] p-4 shadow-[0_10px_30px_rgba(8,42,67,0.10)] sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2B8AB8]">
              Agent Fleet
            </p>
            <p className="mt-1 text-[13px] leading-5 text-[#355769]">
              A playful face for each agent, with motion driven by live status.
            </p>
          </div>
          <span className="rounded-full bg-white/80 px-3 py-1 text-[12px] font-medium text-[#123247]">
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
                className="flex min-w-0 flex-col items-center rounded-2xl bg-white/55 px-2 py-3"
                aria-label={`${agent.name}: ${status.label}`}
              >
                <div className="rounded-full border border-white/80 bg-transparent shadow-[0_8px_20px_rgba(8,42,67,0.12)]">
                  <AIAgentMascot state={state} collapsed color={color} />
                </div>
                <p className="mt-2 clamp-1 max-w-[96px] text-center text-[12px] font-semibold text-[#0F2230]">
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
