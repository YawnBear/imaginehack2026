"use client";

type PieDatum = { label: string; value: number; color: string };

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function piePath(startAngle: number, endAngle: number) {
  const start = polarPoint(40, 40, 36, endAngle);
  const end = polarPoint(40, 40, 36, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M 40 40 L ${start.x} ${start.y} A 36 36 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export function AnimatedCategoryPie({ data, onSelect }: { data: PieDatum[]; onSelect: (label: string) => void }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const slices = data.reduce<Array<PieDatum & { start: number; end: number }>>((result, item) => {
    const start = result.at(-1)?.end ?? 0;
    const angle = total > 0 ? (item.value / total) * 360 : 0;
    return [...result, { ...item, start, end: start + angle }];
  }, []);

  return (
    <div className="flex h-[72px] items-center gap-3">
      <svg viewBox="0 0 80 80" className="h-[72px] w-[72px] shrink-0" role="img" aria-label={`Findings by category, ${total} total`}>
        <circle cx="40" cy="40" r="36" fill="var(--color-surface)" />
        {slices.filter((slice) => slice.value > 0).map((slice, index) => (
          <path key={slice.label} d={piePath(slice.start, slice.end)} fill={slice.color} className="gg-pie-slice cursor-pointer" style={{ animationDelay: `${index * 90}ms` }} onClick={() => onSelect(slice.label)} aria-label={`${slice.label}: ${slice.value}`} />
        ))}
        <circle cx="40" cy="40" r="15" fill="var(--color-surface-subtle)" />
        <text x="40" y="43" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--color-ink)">{total}</text>
      </svg>
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-0.5">
        {data.map((item) => (
          <button key={item.label} type="button" onClick={() => onSelect(item.label)} className="flex min-w-0 items-center gap-1.5 text-left text-[9px] text-muted hover:text-ink">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: item.color }} />
            <span className="truncate">{item.label}</span>
            <strong className="ml-auto text-ink">{item.value}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AnimatedCarbonLine({ values }: { values: number[] }) {
  const chartValues = values.length > 1 ? values : [0, 0];
  const max = Math.max(...chartValues, 1);
  const min = Math.min(...chartValues);
  const span = max - min || 1;
  const points = chartValues.map((value, index) => {
    const x = 4 + (index / (chartValues.length - 1)) * 192;
    const y = 53 - ((value - min) / span) * 43;
    return { x, y };
  });
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const area = `${line} L196,57 L4,57 Z`;

  return (
    <svg viewBox="0 0 200 60" preserveAspectRatio="none" className="h-[56px] min-w-0 flex-1" role="img" aria-label="Carbon emissions trend line">
      <defs>
        <linearGradient id="dashboard-carbon-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-success)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-success)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#dashboard-carbon-area)" className="gg-chart-area" />
      <path d={line} fill="none" stroke="var(--color-success)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" className="gg-chart-line" />
      {points.map((point, index) => <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="2.5" fill="var(--color-canvas)" stroke="var(--color-success)" strokeWidth="1.5" className="gg-chart-point" style={{ animationDelay: `${500 + index * 70}ms` }} />)}
    </svg>
  );
}
