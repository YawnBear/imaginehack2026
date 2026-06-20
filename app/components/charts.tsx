// Inline-SVG chart primitives — no chart library.

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  data,
  size = 168,
  thickness = 22,
  centerLabel,
  centerSub,
}: {
  data: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;

  // Precompute cumulative offsets without mutating during render.
  const segments = data.reduce<{ d: Slice; len: number; offset: number }[]>(
    (acc, d) => {
      const len = (d.value / total) * circ;
      const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0;
      acc.push({ d, len, offset });
      return acc;
    },
    [],
  );

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-surface)" strokeWidth={thickness} />
        {segments.map(({ d, len, offset }) => (
          <circle
            key={d.label}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth={thickness}
            strokeDasharray={`${len} ${circ - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${c} ${c})`}
            strokeLinecap="butt"
          />
        ))}
        {centerLabel && (
          <text
            x={c}
            y={c - 2}
            textAnchor="middle"
            fontSize="26"
            fontWeight="700"
            fill="var(--color-ink)"
          >
            {centerLabel}
          </text>
        )}
        {centerSub && (
          <text x={c} y={c + 16} textAnchor="middle" fontSize="11" fill="var(--color-muted)">
            {centerSub}
          </text>
        )}
      </svg>
      <ul className="space-y-1.5">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-[13px]">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: d.color }}
            />
            <span className="text-ink capitalize">{d.label}</span>
            <span className="text-muted">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarChart({
  data,
  height = 150,
  unit,
}: {
  data: Slice[];
  height?: number;
  unit?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-4" style={{ height }}>
      {data.map((d) => {
        const h = Math.max((d.value / max) * (height - 36), 4);
        return (
          <div key={d.label} className="flex flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-[13px] font-medium text-ink">
              {d.value}
              {unit ? <span className="text-muted">{unit}</span> : null}
            </span>
            <div
              className="w-full max-w-[44px] rounded-md transition-all"
              style={{ height: h, background: d.color }}
            />
            <span className="text-[11px] capitalize text-muted">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Small inline confidence bar.
export function ConfidenceBar({
  value,
  color = "var(--color-link)",
  label,
}: {
  value: number;
  color?: string;
  label: string;
}) {
  const p = Math.round(value * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <span className="text-muted">{label}</span>
        <span className="font-medium text-ink">{p}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full" style={{ width: `${p}%`, background: color }} />
      </div>
    </div>
  );
}
