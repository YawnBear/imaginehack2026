import type { Agent } from "@/app/lib/types";
import AIAgentMascot, {
  type AIAgentColor,
  type AIAgentSprite,
  type AIAgentState,
} from "./AIAgentMascot";

type AIAgentAssistantProps = {
  agents: Agent[];
  onToggle: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
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

const AGENT_COLORS: AIAgentColor[] = [
  "yellow",
  "orange",
  "pink",
  "blue",
  "green",
];

const AGENT_SPRITES: AIAgentSprite[] = ["doux", "mort", "tard", "vita"];

export default function AIAgentAssistant({
                                           agents,
                                           onToggle,
                                           onDelete,
                                         }: AIAgentAssistantProps) {
  return (
      <aside className="w-full" aria-label="SafeCloud agent mascot status">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent, index) => {
            const state = getAgentState(agent, index);
            const color = AGENT_COLORS[index % AGENT_COLORS.length];
            const sprite = AGENT_SPRITES[index % AGENT_SPRITES.length];

            return (
                <div
                    key={agent.agent_id}
                    className="flex min-w-0 flex-col items-center justify-between rounded-2xl border border-white/70 bg-canvas/60 px-5 py-6 text-center shadow-agent"
                    aria-label={agent.name}
                >
                  <div className="rounded-full border border-on-accent/80 bg-transparent shadow-agent">
                    <AIAgentMascot state={state} collapsed color={color} sprite={sprite} />
                  </div>

                  <h3 className="mt-3 text-[15px] font-semibold text-ink">
                    {agent.name}
                  </h3>

                  <p className="mt-3 line-clamp-4 text-[12px] leading-5 text-[var(--color-agent-muted)]">
                    {agent.system_prompt}
                  </p>

                  <div className="mt-4 flex items-center justify-center gap-2">
                    <button
                        onClick={() => onToggle(agent)}
                        className={`h-7 rounded-full px-3 text-[12px] font-medium ${
                            agent.enabled
                                ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
                                : "bg-surface text-muted"
                        }`}
                    >
                      {agent.enabled ? "Enabled" : "Disabled"}
                    </button>

                    <button
                        onClick={() => onDelete(agent)}
                        className="h-7 rounded-full px-3 text-[12px] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
            );
          })}
        </div>
      </aside>
  );
}
