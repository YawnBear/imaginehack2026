"use client";

import { useEffect, useId, useMemo, useState } from "react";

type Point = readonly [number, number];

const ANIMATION_DURATION_MS = 2500;

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
  const [progress, setProgress] = useState(0);
  const id = useId().replace(/:/g, "");
  const gradientId = `gg-area-${id}`;
  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const max = Math.max(...values) * 1.1 || 1;
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? w / (values.length - 1) : w;

  const points = useMemo<Point[]>(
    () =>
      values.map((value, index) => {
        const x = pad.l + index * step;
        const y = pad.t + h - ((value - min) / span) * h;
        return [x, y] as const;
      }),
    [h, min, pad.l, pad.t, span, step, values],
  );

  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x},${y}`)
    .join(" ");
  const lastX = points.at(-1)?.[0] ?? pad.l;
  const area = `${line} L${lastX},${pad.t + h} L${pad.l},${pad.t + h} Z`;
  const footprints = useMemo(
    () =>
      Array.from({ length: 36 }, (_, index) => {
        const revealAt = 0.02 + index * 0.0255;
        return {
          ...pointAlongPath(points, revealAt),
          revealAt,
          side: index % 2 === 0 ? -1 : 1,
        };
      }),
    [points],
  );
  const gridY = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = labels ? Math.max(1, Math.ceil(labels.length / 6)) : 1;
  const chartComplete = progress >= 1;
  const description = `Carbon footprint trend${unit ? ` in ${unit}` : ""}, from ${values[0] ?? 0} to ${values.at(-1) ?? 0}.`;

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) {
      const frame = window.requestAnimationFrame(() => setProgress(1));
      return () => window.cancelAnimationFrame(frame);
    }

    let frame = 0;
    let startedAt: number | null = null;
    const animate = (timestamp: number) => {
      startedAt ??= timestamp;
      const elapsed = Math.min((timestamp - startedAt) / ANIMATION_DURATION_MS, 1);
      setProgress(elapsed);
      if (elapsed < 1) frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={`${id}-title ${id}-description`}
      className="overflow-visible"
    >
      <title id={`${id}-title`}>Estimated monthly carbon footprint</title>
      <desc id={`${id}-description`}>{description}</desc>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {gridY.map((grid) => {
        const y = pad.t + h - grid * h;
        const value = Math.round(min + grid * span);
        return (
          <g key={grid}>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={y}
              y2={y}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <text x={4} y={y + 3} fontSize="8" fill="var(--color-muted)">
              {value}
            </text>
          </g>
        );
      })}
      <path d={area} fill={`url(#${gradientId})`} opacity={chartComplete ? 1 : 0} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={chartComplete ? 1 : 0}
      />
      {points.map(([x, y]) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={3}
          fill="var(--color-canvas)"
          stroke={color}
          strokeWidth={2}
          opacity={chartComplete ? 1 : 0}
        />
      ))}
      <g aria-hidden="true" fill="var(--color-footprint)" className="pointer-events-none">
        {footprints.map((footprint, index) => {
          const stepReveal = Math.min(
            1,
            Math.max(0, (progress - footprint.revealAt) / 0.025),
          );
          const trailFade = progress < 0.94 ? 1 : Math.max(0, (1 - progress) / 0.06);
          const opacity = Math.min(stepReveal, trailFade);
          const sideOffset = footprint.side * 3.2;

          return (
            <g
              key={index}
              opacity={opacity}
              transform={`translate(${footprint.x} ${footprint.y}) rotate(${footprint.angle})`}
            >
              <g transform={`translate(0 ${sideOffset}) scale(1 ${footprint.side})`}>
                <g transform={`rotate(45) scale(${0.26 + stepReveal * 0.06}) translate(-16 -16)`}>
                  <path d="M16.707 3.79c-0.419 1.062-1.464 1.645-2.334 1.301s-1.236-1.483-0.816-2.545 1.464-1.645 2.334-1.302 1.236 1.483 0.816 2.545zM21.193 5.46c-0.764 1.032-2.069 1.361-2.914 0.734s-0.911-1.97-0.146-3.002 2.069-1.361 2.914-0.734c0.845 0.626 0.911 1.97 0.146 3.002zM25.192 8.225c-0.99 0.959-2.43 1.079-3.215 0.268s-0.62-2.246 0.371-3.205 2.43-1.079 3.215-0.268 0.619 2.246-0.371 3.205zM28.906 14.051c-1.737 0.966-3.787 0.596-4.578-0.827s-0.025-3.359 1.712-4.325 3.787-0.596 4.578 0.827 0.025 3.359-1.712 4.325zM10.525 7.981c-3.809 3.407-7.519 8.305-8.761 16.165-1.451 9.181 9.858 7.521 8.738 2.618-1.43-6.264 2.129-8.805 6.739-7.747 2.049 0.47 4.152-0.306 5.366-2.523 1.46-2.666-0.463-6.665-3.922-8.712-2.697-1.596-5.773-1.935-8.16 0.2l-0 0z" />
                </g>
              </g>
            </g>
          );
        })}
      </g>
      {labels?.map((label, index) => {
        const shouldShow = index === 0 || index === labels.length - 1 || index % labelEvery === 0;
        if (!shouldShow) return null;
        const x = pad.l + index * step;
        return (
          <text
            key={label + index}
            x={x}
            y={height - 6}
            fontSize="8"
            fill="var(--color-muted)"
            textAnchor="middle"
            transform={`rotate(-25 ${x} ${height - 6})`}
          >
            {label}
          </text>
        );
      })}
      {unit && (
        <text
          x={width - pad.r}
          y={pad.t + 4}
          fontSize="10"
          fill="var(--color-muted)"
          textAnchor="end"
        >
          {unit}
        </text>
      )}
    </svg>
  );
}

function pointAlongPath(points: Point[], progress: number) {
  if (points.length === 0) return { x: 0, y: 0, angle: 0 };
  if (points.length === 1) return { x: points[0][0], y: points[0][1], angle: 0 };

  const segments = points.slice(1).map((point, index) => {
    const start = points[index];
    const dx = point[0] - start[0];
    const dy = point[1] - start[1];
    return { start, end: point, length: Math.hypot(dx, dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI };
  });
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  let remaining = totalLength * progress;

  for (const segment of segments) {
    if (remaining <= segment.length) {
      const segmentProgress = segment.length > 0 ? remaining / segment.length : 0;
      return {
        x: segment.start[0] + (segment.end[0] - segment.start[0]) * segmentProgress,
        y: segment.start[1] + (segment.end[1] - segment.start[1]) * segmentProgress,
        angle: segment.angle,
      };
    }
    remaining -= segment.length;
  }

  const finalSegment = segments.at(-1)!;
  return { x: finalSegment.end[0], y: finalSegment.end[1], angle: finalSegment.angle };
}
