import type { CSSProperties } from "react";

export type AIAgentState =
  | "idle"
  | "scanning"
  | "analysing"
  | "alert"
  | "waiting_for_review"
  | "success";
export type AIAgentColor = "yellow" | "orange" | "pink" | "blue" | "green";

type AIAgentMascotProps = {
  state: AIAgentState;
  collapsed?: boolean;
  color?: AIAgentColor;
};

const FACE_THEME: Record<AIAgentColor, { body: string; blush: string }> = {
  yellow: { body: "var(--color-agent-yellow)", blush: "var(--color-agent-yellow-soft)" },
  orange: { body: "var(--color-agent-orange)", blush: "var(--color-agent-orange-soft)" },
  pink: { body: "var(--color-agent-pink)", blush: "var(--color-agent-pink-soft)" },
  blue: { body: "var(--color-agent-blue-bright)", blush: "var(--color-agent-blue-soft)" },
  green: { body: "var(--color-agent-green)", blush: "var(--color-agent-green-soft)" },
};

const EYE_BY_STATE: Record<AIAgentState, { left: string; right: string }> = {
  idle: {
    left: "M92 112c0-10 7-17 17-17s17 7 17 17-7 17-17 17-17-7-17-17Z",
    right: "M154 112c0-10 7-17 17-17s17 7 17 17-7 17-17 17-17-7-17-17Z",
  },
  scanning: {
    left: "M89 111c0-12 9-20 20-20s20 8 20 20-9 20-20 20-20-8-20-20Z",
    right: "M151 111c0-12 9-20 20-20s20 8 20 20-9 20-20 20-20-8-20-20Z",
  },
  analysing: {
    left: "M89 111c0-12 9-20 20-20s20 8 20 20-9 20-20 20-20-8-20-20Z",
    right: "M151 111c0-12 9-20 20-20s20 8 20 20-9 20-20 20-20-8-20-20Z",
  },
  alert: {
    left: "M94 98l24 24M118 98l-24 24",
    right: "M156 98l24 24M180 98l-24 24",
  },
  success: {
    left: "M95 118c7 10 15 14 24 14",
    right: "M157 132c9 0 17-4 24-14",
  },
  waiting_for_review: {
    left: "M92 112c0-10 7-17 17-17s17 7 17 17-7 17-17 17-17-7-17-17Z",
    right: "M154 112c0-10 7-17 17-17s17 7 17 17-7 17-17 17-17-7-17-17Z",
  },
};

const MOUTH_BY_STATE: Record<AIAgentState, string> = {
  idle: "M116 161c9 6 17 8 24 8s15-2 24-8",
  scanning: "M119 161h42",
  analysing: "M119 161h42",
  alert: "M117 165c8-7 15-10 23-10s15 3 23 10",
  success: "M112 153c9 14 18 20 28 20s19-6 28-20",
  waiting_for_review: "M116 161c9 6 17 8 24 8s15-2 24-8",
};

export default function AIAgentMascot({
  state,
  collapsed = false,
  color = "yellow",
}: AIAgentMascotProps) {
  const eye = EYE_BY_STATE[state];
  const theme = FACE_THEME[color];
  const wrapperStyle = {
    "--agent-ring-opacity": state === "scanning" || state === "analysing" ? 1 : 0.22,
    "--agent-alert-opacity": state === "alert" ? 1 : 0,
    "--agent-success-opacity": state === "success" ? 1 : 0,
  } as CSSProperties;

  return (
    <div
      className={`gg-agent-shell relative ${collapsed ? "h-20 w-20 sm:h-22 sm:w-22" : "h-24 w-24 sm:h-28 sm:w-28"}`}
      style={wrapperStyle}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 280 280"
        className={`h-full w-full overflow-visible ${state === "idle" ? "gg-agent-float" : ""} ${state === "alert" ? "gg-agent-shake" : ""} ${state === "success" ? "gg-agent-bounce" : ""}`}
        fill="none"
      >
        <circle
          cx="140"
          cy="140"
          r="108"
          fill="var(--color-agent-cyan)"
          opacity={state === "scanning" || state === "analysing" ? 0.18 : 0.08}
          className={state === "scanning" || state === "analysing" ? "gg-agent-glow" : ""}
        />
        <circle
          cx="140"
          cy="140"
          r="98"
          stroke="var(--color-agent-cyan-light)"
          strokeWidth="7"
          strokeDasharray="16 16"
          opacity="var(--agent-ring-opacity)"
          className={state === "scanning" || state === "analysing" ? "gg-agent-radar" : ""}
        />
        <circle cx="140" cy="140" r="84" fill={theme.body} />
        <circle cx="104" cy="144" r="16" fill={theme.blush} opacity="0.78" />
        <circle cx="176" cy="144" r="16" fill={theme.blush} opacity="0.78" />

        <path
          d={eye.left}
          stroke="var(--color-agent-surface)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={state === "idle" ? "gg-agent-blink" : ""}
        />
        <path
          d={eye.right}
          stroke="var(--color-agent-surface)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={state === "idle" ? "gg-agent-blink" : ""}
        />

        {state !== "alert" && (
          <>
            <circle cx="106" cy="112" r="6" fill="var(--color-agent-dark)" className={state === "scanning" || state === "analysing" ? "gg-agent-eye-scan" : ""} />
            <circle cx="174" cy="112" r="6" fill="var(--color-agent-dark)" className={state === "scanning" || state === "analysing" ? "gg-agent-eye-scan" : ""} />
          </>
        )}

        <path
          d={MOUTH_BY_STATE[state]}
          stroke="var(--color-agent-shell)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <g opacity="var(--agent-alert-opacity)">
          <circle cx="208" cy="84" r="23" fill="var(--color-warning-soft)" stroke="var(--color-warning)" strokeWidth="5" />
          <path d="M208 72v14" stroke="var(--color-warning)" strokeWidth="7" strokeLinecap="round" />
          <circle cx="208" cy="96" r="4.5" fill="var(--color-warning)" />
        </g>

        <g opacity="var(--agent-success-opacity)">
          <circle cx="76" cy="82" r="18" fill="var(--color-success-soft)" stroke="var(--color-success)" strokeWidth="4" />
          <path d="M68 82l6 6 11-12" stroke="var(--color-success)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}
