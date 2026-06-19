import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[24px] font-bold leading-tight text-[#0F0F0F]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-[#606060]">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  accent = "#0F0F0F",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#E5E5E5] bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium tracking-label text-[#606060]">
          {label}
        </span>
        {icon && (
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: `${accent}12`, color: accent }}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-[28px] font-bold leading-none tabular-nums" style={{ color: accent }}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[12px] text-[#606060]">{sub}</p>}
    </div>
  );
}
