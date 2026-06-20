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

// Area + line chart for carbon trend.
export function AreaLineChart({
  values,
  labels,
  width = 640,
  height = 200,
  color = "var(--color-success)",
  unit = "",
}: {
  values: number[];
  labels?: string[];
  width?: number;
  height?: number;
  color?: string;
  unit?: string;
}) {
  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const max = Math.max(...values) * 1.1 || 1;
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? w / (values.length - 1) : w;

  const pts = values.map((v, i) => {
    const x = pad.l + i * step;
    const y = pad.t + h - ((v - min) / span) * h;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const area = `${line} L${pad.l + (values.length - 1) * step},${pad.t + h} L${pad.l},${
    pad.t + h
  } Z`;

  const gridY = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = labels ? Math.max(1, Math.ceil(labels.length / 6)) : 1;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" className="overflow-visible">
      <defs>
        <linearGradient id="ggArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {gridY.map((g) => {
        const y = pad.t + h - g * h;
        const val = Math.round((min + g * span) as number);
        return (
          <g key={g}>
            <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke="var(--color-border)" strokeWidth={1} />
            <text x={4} y={y + 3} fontSize="8" fill="var(--color-muted)">
              {val}
            </text>
          </g>
        );
      })}
      <path d={area} fill="url(#ggArea)" />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill="var(--color-canvas)" stroke={color} strokeWidth={2} />
      ))}
      {labels &&
        labels.map((l, i) => {
          const shouldShow = i === 0 || i === labels.length - 1 || i % labelEvery === 0;
          if (!shouldShow) return null;
          const x = pad.l + i * step;
          return (
          <text
            key={l + i}
            x={x}
            y={height - 6}
            fontSize="8"
            fill="var(--color-muted)"
            textAnchor="middle"
            transform={`rotate(-25 ${x} ${height - 6})`}
          >
            {l}
          </text>
          );
        })}
      {unit && (
        <text x={width - pad.r} y={pad.t + 4} fontSize="10" fill="var(--color-muted)" textAnchor="end">
          {unit}
        </text>
      )}
    </svg>
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
