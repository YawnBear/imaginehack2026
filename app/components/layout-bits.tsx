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
        <h1 className="text-[24px] font-bold leading-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  accent = "var(--color-ink)",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="group rounded-xl bg-surface-subtle p-4 transition-colors hover:bg-surface">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium tracking-label text-muted">
          {label}
        </span>
        {icon && (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: `${accent}12`, color: accent }}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-[28px] font-bold leading-none tabular-nums" style={{ color: accent }}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[12px] text-muted">{sub}</p>}
    </div>
  );
}
