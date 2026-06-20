import type { CSSProperties } from "react";

export type AIAgentState =
  | "idle"
  | "scanning"
  | "analysing"
  | "alert"
  | "waiting_for_review"
  | "success";
export type AIAgentColor = "yellow" | "orange" | "pink" | "blue" | "green";
export type AIAgentSprite = "doux" | "mort" | "tard" | "vita";

type AIAgentMascotProps = {
  state: AIAgentState;
  collapsed?: boolean;
  color?: AIAgentColor;
  sprite?: AIAgentSprite;
};

const FACE_THEME: Record<AIAgentColor, { body: string; blush: string }> = {
  yellow: { body: "var(--color-agent-yellow)", blush: "var(--color-agent-yellow-soft)" },
  orange: { body: "var(--color-agent-orange)", blush: "var(--color-agent-orange-soft)" },
  pink: { body: "var(--color-agent-pink)", blush: "var(--color-agent-pink-soft)" },
  blue: { body: "var(--color-agent-blue-bright)", blush: "var(--color-agent-blue-soft)" },
  green: { body: "var(--color-agent-green)", blush: "var(--color-agent-green-soft)" },
};

const SPRITE_SRC: Record<AIAgentSprite, string> = {
  doux: "https://img.itch.zone/aW1nLzg0MjAwNy5naWY=/original/BowcCL.gif", // blue
  mort: "https://img.itch.zone/aW1nLzg0MTkxNi5naWY=/original/MQrwxq.gif", // red
  tard: "https://img.itch.zone/aW1nLzg0MjAwNi5naWY=/original/ARFzJ6.gif", // yellow
  vita: "https://img.itch.zone/aW1nLzg0MTkxMC5naWY=/original/3Pxeeb.gif", // green
};

// Default sprite per color so existing callers keep a sensible mascot.
// doux = blue, mort = red, tard = yellow, vita = green.
const SPRITE_BY_COLOR: Record<AIAgentColor, AIAgentSprite> = {
  yellow: "tard",
  orange: "mort",
  pink: "doux",
  blue: "doux",
  green: "vita",
};

export default function AIAgentMascot({
  state,
  collapsed = false,
  color = "yellow",
  sprite,
}: AIAgentMascotProps) {
  const theme = FACE_THEME[color];
  const spriteSrc = SPRITE_SRC[sprite ?? SPRITE_BY_COLOR[color]];
  const isScanning = state === "scanning" || state === "analysing";
  const wrapperStyle = {
    "--agent-ring-opacity": isScanning ? 1 : 0.22,
    "--agent-alert-opacity": state === "alert" ? 1 : 0,
  } as CSSProperties;

  const animClass =
    state === "idle"
      ? "gg-agent-float"
      : state === "alert"
        ? "gg-agent-shake"
        : state === "success"
          ? "gg-agent-bounce"
          : "";

  return (
    <div
      className={`gg-agent-shell relative ${collapsed ? "h-28 w-28 sm:h-32 sm:w-32" : "h-32 w-32 sm:h-36 sm:w-36"}`}
      style={wrapperStyle}
      aria-hidden="true"
    >
      {/* Halo, tinted disc and radar ring — sits behind the sprite */}
      <svg
        viewBox="0 0 280 280"
        className="absolute inset-0 h-full w-full overflow-visible"
        fill="none"
      >
        <circle
          cx="140"
          cy="140"
          r="108"
          fill="var(--color-agent-cyan)"
          opacity={isScanning ? 0.18 : 0.08}
          className={isScanning ? "gg-agent-glow" : ""}
        />
        <circle
          cx="140"
          cy="140"
          r="98"
          stroke="var(--color-agent-cyan-light)"
          strokeWidth="7"
          strokeDasharray="16 16"
          opacity="var(--agent-ring-opacity)"
          className={isScanning ? "gg-agent-radar" : ""}
        />
        <circle cx="140" cy="140" r="84" fill={theme.body} opacity="0.16" />
        <circle cx="140" cy="140" r="84" fill="none" stroke={theme.body} strokeWidth="4" opacity="0.55" />
      </svg>

      {/* Animated pixel-art dino sprite */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={spriteSrc}
        alt=""
        draggable={false}
        className={`absolute left-1/2 top-1/2 h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2 object-contain ${animClass}`}
        style={{ imageRendering: "pixelated" }}
      />

      {/* State badges — sit in front of the sprite */}
      <svg
        viewBox="0 0 280 280"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        fill="none"
      >
        <g opacity="var(--agent-alert-opacity)">
          <circle cx="208" cy="84" r="23" fill="var(--color-warning-soft)" stroke="var(--color-warning)" strokeWidth="5" />
          <path d="M208 72v14" stroke="var(--color-warning)" strokeWidth="7" strokeLinecap="round" />
          <circle cx="208" cy="96" r="4.5" fill="var(--color-warning)" />
        </g>
      </svg>
    </div>
  );
}
