// Shared presentational primitives.
import type { ReactNode } from "react";
import {
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  RISK_COLOR,
} from "@/app/lib/format";
import type { FindingStatus, RiskLevel, Severity } from "@/app/lib/types";
import { IconAlert, IconInfo } from "./icons";

export function SeverityBadge({ severity }: { severity: Severity }) {
  const color = SEVERITY_COLOR[severity];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium tracking-label"
      style={{ background: `${color}14`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function StatusBadge({ status }: { status: FindingStatus }) {
  const color = STATUS_COLOR[status] ?? "#606060";
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium"
      style={{ background: `${color}14`, color }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function RiskBadge({ level }: { level: RiskLevel | string }) {
  const color = RISK_COLOR[level] ?? "#606060";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium capitalize"
      style={{ background: `${color}14`, color }}
    >
      {level} risk
    </span>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#F2F2F2] px-3 py-1 text-[12px] font-medium text-[#0F0F0F]">
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl bg-[#F8F8F8] p-5 transition-colors ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[20px] font-medium text-[#0F0F0F]">{children}</h2>
  );
}

export function EstimateNote({ children }: { children?: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[12px] text-[#606060]">
      <IconInfo width={14} height={14} className="mt-[1px] shrink-0" />
      <span>
        {children ?? (
          <>
            All cost &amp; carbon figures are <strong>estimates</strong> — derived from
            kWh × grid carbon-intensity using Cloud Carbon Footprint coefficients.
          </>
        )}
      </span>
    </p>
  );
}

// ---- async states ----------------------------------------------------------

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="gg-skeleton h-[72px] rounded-xl" />
      ))}
    </div>
  );
}

export function LoadingCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="gg-skeleton h-[104px] rounded-xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  title = "No findings match these filters",
  hint = "Try clearing a filter or selecting “All”.",
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-[#F8F8F8] py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F2F2F2] text-[#2BA640]">
        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-[14px] font-medium text-[#0F0F0F]">{title}</p>
      <p className="mt-1 text-[12px] text-[#606060]">{hint}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[#FF000022] bg-[#FF00000A] py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#FF000014] text-[#FF0000]">
        <IconAlert width={24} height={24} />
      </div>
      <p className="text-[14px] font-medium text-[#0F0F0F]">Couldn’t load live data</p>
      <p className="mt-1 max-w-sm text-[12px] text-[#606060]">{message}</p>
    </div>
  );
}

// Banner shown when running on bundled mock data.
export function MockBanner({ reason }: { reason?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#FB8C0033] bg-[#FB8C000F] px-3 py-2 text-[12px] text-[#8a5300]">
      <IconInfo width={15} height={15} className="shrink-0 text-[#FB8C00]" />
      <span>
        <strong>Demo mode</strong> — showing bundled sample data
        {reason ? ` (backend unreachable: ${reason})` : " (no backend configured)"}.
        Every panel is fully interactive.
      </span>
    </div>
  );
}

// Safety banner — AI recommends, human approves, nothing auto-executes.
export function SafetyBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-[#2BA64033] bg-[#2BA6400D] px-3 ${
        compact ? "py-2" : "py-2.5"
      } text-[12px] text-[#1d7a2e]`}
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#2BA640" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mt-[1px] shrink-0">
        <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      <span>
        <strong>AI recommends — a human must approve.</strong> Safe Cloud never executes
        any cloud action automatically. Nothing changes until required reviewers sign off.
      </span>
    </div>
  );
}
