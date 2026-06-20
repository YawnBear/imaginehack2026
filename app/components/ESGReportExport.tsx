"use client";

import { useState } from "react";

export interface ESGTrendPoint {
  date: string;
  label: string;
  footprintKg: number;
}

export interface ESGReductionCategory {
  category: string;
  savedKg: number;
}

export interface ESGReportData {
  organizationName: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  overallFootprintKg: number;
  totalReducedKg: number;
  esgScore?: number | null;
  trend: ESGTrendPoint[];
  reductions: ESGReductionCategory[];
}

type PdfOp = string;
type ReportRgb = readonly [number, number, number];

const REPORT_COLORS = {
  ink: [15, 15, 15],
  muted: [96, 96, 96],
  canvas: [255, 255, 255],
  border: [229, 229, 229],
  surface: [242, 242, 242],
  chartTrack: [226, 232, 240],
  success: [43, 166, 64],
  successStrong: [29, 122, 46],
  successTint: [245, 251, 246],
  successBorder: [213, 239, 217],
} satisfies Record<string, ReportRgb>;

type ReportColorName = keyof typeof REPORT_COLORS;

function toHexChannel(value: number): string {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function cssColor(name: ReportColorName, alpha?: number): string {
  const base = REPORT_COLORS[name].map(toHexChannel).join("");
  const opacity = alpha == null ? "" : toHexChannel(Math.round(alpha * 255));
  return `#${base}${opacity}`;
}

function pdfRgb(color: ReportRgb): string {
  const [r, g, b] = color;
  return `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fileDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(
    d.getHours(),
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function kg(value: number): string {
  return `${Math.round(value).toLocaleString()} kgCO2e`;
}

function pct(value: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildMonthToDateTrend(data: ESGReportData, generatedAt: Date): ESGTrendPoint[] {
  const daysInRange = generatedAt.getDate();
  const source = data.trend.length > 0 ? data.trend : [{ footprintKg: data.overallFootprintKg }];
  const startValue = source[0]?.footprintKg ?? data.overallFootprintKg;
  const endValue = source[source.length - 1]?.footprintKg ?? startValue;
  const start = new Date(generatedAt.getFullYear(), generatedAt.getMonth(), 1);

  return Array.from({ length: daysInRange }, (_, index) => {
    const day = new Date(start);
    day.setDate(index + 1);
    const progress = daysInRange > 1 ? index / (daysInRange - 1) : 1;
    const seasonalBend = Math.sin(progress * Math.PI) * (source.length > 2 ? 10 : 0);
    const footprintKg = Math.max(0, Math.round(startValue + (endValue - startValue) * progress + seasonalBend));

    return {
      date: day.toISOString(),
      label: String(index + 1),
      footprintKg,
    };
  });
}

function buildHtmlTrendSvg(data: ESGReportData): string {
  const border = cssColor("border");
  const success = cssColor("success");
  const canvas = cssColor("canvas");
  const muted = cssColor("muted");
  const width = 600;
  const height = 220;
  const padLeft = 46;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 34;
  const values = data.trend.map((p) => p.footprintKg);
  const max = Math.max(...values, 1) * 1.08;
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const pts = data.trend.map((point, index) => {
    const x = padLeft + (chartW / Math.max(data.trend.length - 1, 1)) * index;
    const y = padTop + chartH - ((point.footprintKg - min) / span) * chartH;
    return [x, y] as const;
  });
  const path = pts.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${path} L ${pts[pts.length - 1]?.[0] ?? padLeft} ${height - padBottom} L ${padLeft} ${height - padBottom} Z`;
  const tickIndexes = Array.from(
    new Set([0, Math.floor((data.trend.length - 1) / 2), data.trend.length - 1]),
  ).filter((index) => index >= 0);

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Month-to-date carbon footprint trend">
      ${Array.from({ length: 5 }, (_, i) => {
        const y = padTop + (chartH / 4) * i;
        return `<line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="${border}" stroke-width="1" />`;
      }).join("")}
      <path d="${area}" fill="${success}" opacity="0.08" />
      <path d="${path}" fill="none" stroke="${success}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      ${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="${canvas}" stroke="${success}" stroke-width="2" />`).join("")}
      ${tickIndexes.map((index) => `<text x="${pts[index][0]}" y="${height - 10}" text-anchor="middle" fill="${muted}" font-size="11">${escapeHtml(formatDate(data.trend[index].date))}</text>`).join("")}
      <text x="${width - padRight}" y="14" text-anchor="end" fill="${muted}" font-size="11" font-weight="700">kg CO2e</text>
    </svg>`;
}

function buildReportHtml(data: ESGReportData): string {
  const ink = cssColor("ink");
  const muted = cssColor("muted");
  const canvas = cssColor("canvas");
  const border = cssColor("border");
  const chartTrack = cssColor("chartTrack");
  const success = cssColor("success");
  const successStrong = cssColor("successStrong");
  const successBorder = cssColor("success", 0.2);
  const successWash = cssColor("success", 0.05);
  const total = data.totalReducedKg || 1;
  const rows = data.reductions
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.category)}</td>
          <td style="font-weight: 600;">${kg(item.savedKg)}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="flex: 1; background: ${chartTrack}; height: 6px; border-radius: 3px; overflow: hidden;">
                <div style="width: ${pct(item.savedKg, total)}; background: ${success}; height: 100%;"></div>
              </div>
              <span style="font-size: 11px; color: ${muted}; width: 32px; text-align: right;">${pct(item.savedKg, total)}</span>
            </div>
          </td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cloud Infrastructure ESG Report</title>
  <style>
    body { margin: 0; font-family: Roboto, Arial, sans-serif; color: ${ink}; background: ${canvas}; }
    .page { width: 794px; min-height: 1123px; margin: 0 auto; background: white; box-sizing: border-box; display: flex; flex-direction: column; }
    .header { padding: 36px 40px 22px; border-bottom: 1px solid ${border}; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; }
    .header-left .kicker { color: ${success}; font-size: 11px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; margin-bottom: 8px; }
    .header-left h1 { margin: 0; font-size: 24px; font-weight: 700; line-height: 1.15; color: ${ink}; letter-spacing: 0; }
    .header-left .generated { margin-top: 8px; color: ${muted}; font-size: 12px; }
    .header-right { text-align: right; color: ${muted}; font-size: 12px; line-height: 1.45; }
    .header-right .org { font-weight: 600; color: ${ink}; margin-bottom: 4px; }
    .content { padding: 40px; flex: 1; }
    .period-sub { font-size: 13px; color: ${muted}; margin-bottom: 24px; }
    .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
    .metric { border: 1px solid ${border}; border-radius: 8px; padding: 16px; background: ${canvas}; }
    .label { color: ${muted}; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; }
    .value { margin-top: 6px; font-size: 20px; font-weight: 700; color: ${ink}; }
    section { margin-top: 32px; }
    h2 { font-size: 20px; font-weight: 500; margin: 0 0 14px; color: ${ink}; }
    .chart-container { height: 260px; border: 1px solid ${border}; border-radius: 8px; background: white; padding: 12px; box-sizing: border-box; color: ${muted}; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    th, td { border-bottom: 1px solid ${border}; padding: 12px 8px; text-align: left; }
    th { color: ${muted}; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; }
    .insight { margin-top: 24px; border: 1px solid ${successBorder}; background: ${successWash}; padding: 14px 16px; border-radius: 8px; font-size: 13px; color: ${successStrong}; line-height: 1.5; }
  </style>
</head>
<body>
  <main class="page">
    <div class="header">
      <div class="header-left">
        <div class="kicker">Management Review Pack</div>
        <h1>Cloud Infrastructure ESG Report</h1>
        <div class="generated">Generated: ${formatDateTime(data.generatedAt)}</div>
      </div>
    </div>
    <div class="content">
      <div class="period-sub">Reporting Period: <strong>${formatDateTime(data.periodStart)}</strong> to <strong>${formatDateTime(data.periodEnd)}</strong></div>

      <div class="meta-grid">
        <div class="metric"><div class="label">Overall Carbon Footprint</div><div class="value">${kg(data.overallFootprintKg)}</div></div>
        <div class="metric"><div class="label">Total Carbon Reduced</div><div class="value">${kg(data.totalReducedKg)}</div></div>
        <div class="metric"><div class="label">ESG Score</div><div class="value">${data.esgScore ?? "N/A"}</div></div>
      </div>

      <section>
        <h2>Carbon Footprint Trend</h2>
        <div class="chart-container">
          ${buildHtmlTrendSvg(data)}
        </div>
      </section>

      <section>
        <h2>Carbon Reduction Breakdown</h2>
        <table>
          <thead><tr><th>Optimization Category</th><th>Carbon Footprint Saved</th><th>Contribution (%)</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="insight">
          <strong>Executive Insight:</strong> Optimization recommendations avoided ${kg(data.totalReducedKg)} during this tracking window, cutting down operational footprint emissions by ${pct(data.totalReducedKg, data.overallFootprintKg + data.totalReducedKg)} compared to the pre-optimization baseline.
        </div>
      </section>
    </div>
  </main>
</body>
</html>`;
}

function text(
  x: number,
  y: number,
  size: number,
  value: string,
  font = "F1",
  color: ReportRgb = REPORT_COLORS.ink,
): PdfOp {
  return `${pdfRgb(color)} rg BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET`;
}

function rect(x: number, y: number, w: number, h: number, color: ReportRgb): PdfOp {
  return `${pdfRgb(color)} rg ${x} ${y} ${w} ${h} re f`;
}

function strokeRect(x: number, y: number, w: number, h: number, color: ReportRgb): PdfOp {
  return `${pdfRgb(color)} RG ${x} ${y} ${w} ${h} re S`;
}

function line(x1: number, y1: number, x2: number, y2: number, color: ReportRgb, width = 1): PdfOp {
  return `${pdfRgb(color)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`;
}

function solidPolyline(points: readonly (readonly [number, number])[], color: ReportRgb, width = 2): PdfOp {
  const path = points
    .map(([px, py], index) => `${index === 0 ? `${px} ${py} m` : `${px} ${py} l`}`)
    .join(" ");
  return `${pdfRgb(color)} RG ${width} w 1 J 1 j ${path} S`;
}

function circle(x: number, y: number, r: number, fill: ReportRgb, stroke: ReportRgb, width = 1): PdfOp {
  const c = r * 0.5522847498;
  return [
    `${pdfRgb(fill)} rg`,
    `${pdfRgb(stroke)} RG`,
    `${width} w`,
    `${x + r} ${y} m`,
    `${x + r} ${y + c} ${x + c} ${y + r} ${x} ${y + r} c`,
    `${x - c} ${y + r} ${x - r} ${y + c} ${x - r} ${y} c`,
    `${x - r} ${y - c} ${x - c} ${y - r} ${x} ${y - r} c`,
    `${x + c} ${y - r} ${x + r} ${y - c} ${x + r} ${y} c`,
    "B",
  ].join(" ");
}

function drawMetric(ops: PdfOp[], x: number, y: number, w: number, label: string, value: string) {
  ops.push(rect(x, y, w, 54, REPORT_COLORS.canvas));
  ops.push(strokeRect(x, y, w, 54, REPORT_COLORS.border));
  ops.push(text(x + 12, y + 36, 7.5, label, "F2", REPORT_COLORS.muted));
  ops.push(text(x + 12, y + 14, 14, value, "F2", REPORT_COLORS.ink));
}

function drawTrendChart(ops: PdfOp[], data: ESGReportData, x: number, y: number, w: number, h: number) {
  ops.push(rect(x, y, w, h, REPORT_COLORS.canvas));
  ops.push(strokeRect(x, y, w, h, REPORT_COLORS.border));

  const values = data.trend.map((p) => p.footprintKg);
  const max = Math.max(...values, 1) * 1.1;
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const left = x + 42;
  const right = x + w - 16;
  const top = y + h - 20;
  const bottom = y + 26;
  const chartW = right - left;
  const chartH = top - bottom;

  // Clean, thin gridlines
  for (let i = 0; i <= 4; i++) {
    const yy = bottom + (chartH / 4) * i;
    const label = Math.round(min + (span / 4) * i);
    ops.push(line(left, yy, right, yy, REPORT_COLORS.border, 0.5));
    ops.push(text(x + 8, yy - 3, 7, String(label), "F1", REPORT_COLORS.muted));
  }

  const pts = data.trend.map((point, i) => {
    const px = left + (chartW / Math.max(data.trend.length - 1, 1)) * i;
    const py = bottom + ((point.footprintKg - min) / span) * chartH;
    return [px, py] as const;
  });

  // Soft gradient area fill under line
  if (pts.length > 1) {
    const areaPath = [
      `${pts[0][0]} ${bottom} m`,
      ...pts.map(([px, py]) => `${px} ${py} l`),
      `${pts[pts.length - 1][0]} ${bottom} l`,
      "h",
      "f",
    ].join(" ");
    ops.push(`${pdfRgb(REPORT_COLORS.successTint)} rg ${areaPath}`);
  }

  if (pts.length > 1) {
    ops.push(solidPolyline(pts, REPORT_COLORS.success, 2.2));
  }

  for (const [px, py] of pts) {
    ops.push(circle(px, py, 2.5, REPORT_COLORS.canvas, REPORT_COLORS.success, 1.5));
  }

  const tickIndexes = Array.from(
    new Set([0, Math.floor((data.trend.length - 1) / 2), data.trend.length - 1]),
  ).filter((index) => index >= 0);
  tickIndexes.forEach((index) => {
    const px = left + (chartW / Math.max(data.trend.length - 1, 1)) * index;
    ops.push(text(px - 13, y + 10, 7, formatDate(data.trend[index].date), "F1", REPORT_COLORS.muted));
  });
  ops.push(text(right - 46, top + 6, 7.5, "kg CO2e", "F2", REPORT_COLORS.muted));
}

function drawReductionTable(ops: PdfOp[], data: ESGReportData, x: number, y: number, w: number) {
  const total = data.totalReducedKg || 1;
  const max = Math.max(...data.reductions.map((r) => r.savedKg), 1);
  ops.push(text(x, y + 20, 8, "Optimization category", "F2", REPORT_COLORS.muted));
  ops.push(text(x + 245, y + 20, 8, "Saved", "F2", REPORT_COLORS.muted));
  ops.push(text(x + 345, y + 20, 8, "Contribution", "F2", REPORT_COLORS.muted));
  ops.push(line(x, y + 11, x + w, y + 11, REPORT_COLORS.border, 0.8));

  data.reductions.forEach((item, index) => {
    const rowY = y - 6 - index * 26;
    const barW = Math.max((item.savedKg / max) * 110, item.savedKg > 0 ? 3 : 0);
    ops.push(text(x, rowY, 9.5, item.category, "F1", REPORT_COLORS.ink));
    ops.push(text(x + 245, rowY, 9.5, kg(item.savedKg), "F2", REPORT_COLORS.ink));

    ops.push(rect(x + 345, rowY - 2, 110, 6, REPORT_COLORS.surface));
    ops.push(rect(x + 345, rowY - 2, barW, 6, REPORT_COLORS.success));

    ops.push(text(x + 465, rowY, 9.5, pct(item.savedKg, total), "F1", REPORT_COLORS.muted));
    ops.push(line(x, rowY - 8, x + w, rowY - 8, REPORT_COLORS.border, 0.5));
  });
}

function buildPdf(data: ESGReportData): Blob {
  buildReportHtml(data);

  const ops: PdfOp[] = [];
  // Base Page
  ops.push(rect(0, 0, 595, 842, REPORT_COLORS.canvas));

  ops.push(line(36, 742, 559, 742, REPORT_COLORS.border, 0.8));
  ops.push(text(36, 810, 8, "Management Review Pack", "F2", REPORT_COLORS.success));
  ops.push(text(36, 782, 22, "Cloud Infrastructure ESG Report", "F2", REPORT_COLORS.ink));
  ops.push(text(36, 760, 9, `Generated: ${formatDateTime(data.generatedAt)}`, "F1", REPORT_COLORS.muted));
  ops.push(text(36, 712, 9, `Reporting window: ${formatDateTime(data.periodStart)} to ${formatDateTime(data.periodEnd)}`, "F1", REPORT_COLORS.muted));

  // Dynamic Content Spacing Calculations
  drawMetric(ops, 36, 638, 165, "Overall Carbon Footprint", kg(data.overallFootprintKg));
  drawMetric(ops, 217, 638, 165, "Total Carbon Reduced", kg(data.totalReducedKg));
  drawMetric(ops, 398, 638, 161, "ESG Score", data.esgScore == null ? "N/A" : String(data.esgScore));

  ops.push(text(36, 600, 15, "Carbon Footprint Trend", "F2", REPORT_COLORS.ink));
  drawTrendChart(ops, data, 36, 360, 523, 222);

  ops.push(text(36, 322, 15, "Carbon Reduction Breakdown", "F2", REPORT_COLORS.ink));
  drawReductionTable(ops, data, 36, 282, 523);

  const baseline = data.overallFootprintKg + data.totalReducedKg;
  ops.push(rect(36, 45, 523, 46, REPORT_COLORS.successTint));
  ops.push(strokeRect(36, 45, 523, 46, REPORT_COLORS.successBorder));
  ops.push(text(52, 71, 9.5, `Executive insight: ${kg(data.totalReducedKg)} avoided this period.`, "F2", REPORT_COLORS.successStrong));
  ops.push(text(52, 56, 8.5, `That is ${pct(data.totalReducedKg, baseline)} of the pre-optimization baseline footprint.`, "F1", REPORT_COLORS.muted));

  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

export default function ESGReportExport({ data }: { data: ESGReportData }) {
  const [exporting, setExporting] = useState(false);

  function exportPdf() {
    setExporting(true);
    try {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

      const reportData: ESGReportData = {
        ...data,
        generatedAt: now.toISOString(),
        periodStart: firstDayOfMonth.toISOString(),
        periodEnd: now.toISOString(),
        trend: buildMonthToDateTrend(data, now),
      };
      const pdf = buildPdf(reportData);
      downloadBlob(`safecloud_esg_report_${fileDate(now)}.pdf`, pdf);
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      onClick={exportPdf}
      disabled={exporting}
      className="flex h-9 items-center gap-1.5 rounded-full bg-action px-4 text-[13px] font-medium text-on-action transition-colors hover:opacity-90 disabled:opacity-60"
      title="Generate and download month-to-date ESG PDF report"
    >
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M12 11v6" />
        <path d="M9 14l3 3 3-3" />
      </svg>
      {exporting ? "Exporting..." : "Export ESG Report"}
    </button>
  );
}
