"use client";

import type { Agent, Rule } from "@/app/lib/types";
import { CATEGORY_COLOR } from "@/app/lib/format";

// Three states, derived from the last run. The verdict node at the END of the
// pipeline carries the signal: red (threat) / green (clear) / grey (not run).
type WState = "idle" | "clear" | "threats";

// Fixed geometry so the SVG connectors line up with the HTML nodes without any
// runtime measurement. Everything is deterministic from the agent count.
const LINK_W = 40;
const FAN_W = 64;
const AGENT_W = 160;
const AGENT_H = 40;
const AGENT_GAP = 12;
const MIN_H = 80; // min graph height when there are few/no agents

const mix = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

const STATE_META: Record<WState, { base: string; ink: string; label: string; ran: boolean }> = {
  threats: { base: "var(--color-danger)", ink: "var(--color-danger-strong)", label: "Threat detected", ran: true },
  clear: { base: "var(--color-success)", ink: "var(--color-success-strong)", label: "Clear", ran: true },
  idle: { base: "var(--color-subtle)", ink: "var(--color-muted)", label: "Not run", ran: false },
};

function Port({ color, className }: { color: string; className: string }) {
  return (
    <span
      aria-hidden
      className={`absolute h-2.5 w-2.5 rounded-full border-2 border-canvas ${className}`}
      style={{ background: color }}
    />
  );
}

// Trigger = just the rule name (category accent bar on the left edge). It is the
// branch point: the analysts fan out directly from its right port.
function TriggerNode({ rule }: { rule: Rule | null }) {
  if (!rule) {
    return (
      <div className="relative flex h-11 min-w-[200px] items-center rounded-xl border border-dashed border-border bg-canvas px-3.5 text-[12px] text-subtle">
        rule removed
        <Port color="var(--color-subtle)" className="right-0 top-1/2 -translate-y-1/2 translate-x-1/2" />
      </div>
    );
  }
  const color = CATEGORY_COLOR[rule.category] ?? "var(--color-muted)";
  return (
    <div
      style={{ borderColor: mix(color, 35) }}
      className="relative flex h-11 min-w-[200px] max-w-[360px] items-center overflow-hidden rounded-xl border bg-canvas px-4 shadow-[var(--shadow-e1)]"
    >
      <span aria-hidden className="absolute left-0 top-0 h-full w-1" style={{ background: color }} />
      <p className="truncate text-[13px] font-semibold text-ink" title={rule.name}>
        {rule.name}
      </p>
      <Port color={color} className="right-0 top-1/2 -translate-y-1/2 translate-x-1/2" />
    </div>
  );
}

// Straight connector with an arrowhead (used when there are no agents).
function MainLink() {
  return (
    <svg
      width={LINK_W}
      height={24}
      viewBox={`0 0 ${LINK_W} 24`}
      className="shrink-0 self-center overflow-visible text-subtle"
      aria-hidden
    >
      <line x1="0" y1="12" x2={LINK_W} y2="12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 6" strokeLinecap="round" />
      <path
        d={`M ${LINK_W - 7} 8 L ${LINK_W} 12 L ${LINK_W - 7} 16`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Branch out: from the trigger's single right port to each agent (to the side).
function FanOut({ height, agentCenters, color }: { height: number; agentCenters: number[]; color: string }) {
  const sy = height / 2;
  return (
    <svg
      width={FAN_W}
      height={height}
      viewBox={`0 0 ${FAN_W} ${height}`}
      className="shrink-0 overflow-visible"
      style={{ color }}
      aria-hidden
    >
      {agentCenters.map((ay, i) => (
        <path
          key={i}
          d={`M 0 ${sy} C ${FAN_W * 0.5} ${sy}, ${FAN_W * 0.5} ${ay}, ${FAN_W} ${ay}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="6 6"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

// Merge back in: from each agent out to the single verdict node.
function FanIn({ height, agentCenters, color }: { height: number; agentCenters: number[]; color: string }) {
  const ey = height / 2;
  return (
    <svg
      width={FAN_W}
      height={height}
      viewBox={`0 0 ${FAN_W} ${height}`}
      className="shrink-0 overflow-visible"
      style={{ color }}
      aria-hidden
    >
      {agentCenters.map((ay, i) => (
        <path
          key={i}
          d={`M 0 ${ay} C ${FAN_W * 0.5} ${ay}, ${FAN_W * 0.5} ${ey}, ${FAN_W} ${ey}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="6 6"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

// Agent = just the name (with a category dot).
function AgentNodeRight({ name, color, dim }: { name: string; color: string; dim: boolean }) {
  const dot = dim ? "var(--color-subtle)" : color;
  return (
    <div
      style={{ width: AGENT_W, height: AGENT_H, borderColor: dim ? "var(--color-border)" : mix(color, 35) }}
      className="relative flex items-center gap-2 rounded-lg border bg-canvas px-2.5 shadow-[var(--shadow-e1)]"
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
      <p
        className={`truncate text-[12px] font-semibold leading-tight ${dim ? "text-muted" : "text-ink"}`}
        title={name}
      >
        {name}
      </p>
      <Port color={dot} className="left-0 top-1/2 -translate-x-1/2 -translate-y-1/2" />
      <Port color={dot} className="right-0 top-1/2 -translate-y-1/2 translate-x-1/2" />
    </div>
  );
}

// The verdict — the glowing status node at the END of the pipeline.
function StatusNode({ state }: { state: WState }) {
  const meta = STATE_META[state];
  return (
    <div className="relative shrink-0 self-center">
      <span
        className="inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wide"
        style={{
          borderColor: meta.base,
          color: meta.ink,
          background: mix(meta.base, 12),
          boxShadow: meta.ran ? `0 0 16px ${mix(meta.base, 50)}` : undefined,
        }}
      >
        <span className="relative grid h-2.5 w-2.5 place-items-center">
          {state === "threats" && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping"
              style={{ background: meta.base }}
            />
          )}
          <span aria-hidden className="relative h-2 w-2 rounded-full" style={{ background: meta.base }} />
        </span>
        {meta.label}
      </span>
      <Port color={meta.base} className="left-0 top-1/2 -translate-x-1/2 -translate-y-1/2" />
    </div>
  );
}

export function WorkflowGraph({
  rule,
  agentKeys,
  agentByKey,
  findingCount,
}: {
  rule: Rule | null;
  agentKeys: string[];
  agentByKey: Record<string, Agent>;
  findingCount: number | null;
}) {
  const state: WState = findingCount === null ? "idle" : findingCount > 0 ? "threats" : "clear";
  const dim = state === "idle";
  const n = agentKeys.length;

  const colContent = n > 0 ? n * AGENT_H + (n - 1) * AGENT_GAP : 0;
  const H = Math.max(MIN_H, colContent);
  const colTop = (H - colContent) / 2;
  const agentCenters = Array.from({ length: n }, (_, i) => colTop + i * (AGENT_H + AGENT_GAP) + AGENT_H / 2);
  // Wires stay neutral grey in every state (dashed, like a circuit trace). Only
  // the verdict node at the end carries colour — red on "threats", green on "clear".
  const wireColor = "var(--color-subtle)";

  return (
    <div className="flex w-max items-center">
      <TriggerNode rule={rule} />
      {n > 0 ? (
        <>
          <FanOut height={H} agentCenters={agentCenters} color={wireColor} />
          <div className="flex flex-col" style={{ gap: AGENT_GAP }}>
            {agentKeys.map((key) => (
              <AgentNodeRight
                key={key}
                name={agentByKey[key]?.name ?? key}
                color={CATEGORY_COLOR[key as keyof typeof CATEGORY_COLOR] ?? "var(--color-muted)"}
                dim={dim}
              />
            ))}
          </div>
          <FanIn height={H} agentCenters={agentCenters} color={wireColor} />
        </>
      ) : (
        <MainLink />
      )}
      <StatusNode state={state} />
    </div>
  );
}
