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

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fileDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
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

function buildReportHtml(data: ESGReportData): string {
  const total = data.totalReducedKg || 1;
  const rows = data.reductions
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.category)}</td>
          <td>${kg(item.savedKg)}</td>
          <td>${pct(item.savedKg, total)}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cloud Infrastructure ESG Report</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; color: #0f0f0f; background: #f6f8f7; }
    .page { width: 794px; min-height: 1123px; margin: 0 auto; background: white; padding: 40px; box-sizing: border-box; }
    .kicker { color: #2b7a3f; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 8px 0 18px; font-size: 30px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 22px; }
    .metric { border: 1px solid #dfe8e2; border-radius: 8px; padding: 12px; }
    .label { color: #5f6b63; font-size: 11px; text-transform: uppercase; font-weight: 700; }
    .value { margin-top: 5px; font-size: 18px; font-weight: 700; }
    section { margin-top: 22px; }
    h2 { font-size: 17px; margin: 0 0 10px; }
    .chart { height: 250px; border: 1px solid #dfe8e2; border-radius: 8px; background: #fbfdfb; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #e7eee9; padding: 10px 8px; text-align: left; }
    th { color: #5f6b63; font-size: 11px; text-transform: uppercase; }
    .insight { margin-top: 12px; border-left: 4px solid #2ba640; background: #f0faf2; padding: 12px; font-size: 13px; }
  </style>
</head>
<body>
  <main class="page">
    <div class="kicker">Management Review Pack</div>
    <h1>Cloud Infrastructure ESG Report</h1>
    <div class="meta">
      <div class="metric"><div class="label">Organization</div><div class="value">${escapeHtml(data.organizationName)}</div></div>
      <div class="metric"><div class="label">Generated</div><div class="value">${formatDateTime(data.generatedAt)}</div></div>
      <div class="metric"><div class="label">Reporting Period</div><div class="value">${formatDateTime(data.periodStart)} - ${formatDateTime(data.periodEnd)}</div></div>
      <div class="metric"><div class="label">ESG Score</div><div class="value">${data.esgScore ?? "N/A"}</div></div>
      <div class="metric"><div class="label">Overall Carbon Footprint</div><div class="value">${kg(data.overallFootprintKg)}</div></div>
      <div class="metric"><div class="label">Total Carbon Footprint Reduced</div><div class="value">${kg(data.totalReducedKg)}</div></div>
    </div>
    <section>
      <h2>1. Carbon Footprint Trend</h2>
      <div class="chart"></div>
    </section>
    <section>
      <h2>2. Carbon Reduction Breakdown</h2>
      <table>
        <thead><tr><th>Optimization Category</th><th>Carbon Footprint Saved</th><th>Contribution</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="insight">Optimization recommendations avoid ${kg(data.totalReducedKg)} during the period, reducing the current footprint by ${pct(data.totalReducedKg, data.overallFootprintKg + data.totalReducedKg)} versus the pre-optimization baseline.</div>
    </section>
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
  color = "#0F0F0F",
): PdfOp {
  const [r, g, b] = hexToRgb(color);
  return `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(
    3,
  )} rg BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET`;
}

function rect(x: number, y: number, w: number, h: number, color: string): PdfOp {
  const [r, g, b] = hexToRgb(color);
  return `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} rg ${x} ${y} ${w} ${h} re f`;
}

function strokeRect(x: number, y: number, w: number, h: number, color: string): PdfOp {
  const [r, g, b] = hexToRgb(color);
  return `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} RG ${x} ${y} ${w} ${h} re S`;
}

function line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1): PdfOp {
  const [r, g, b] = hexToRgb(color);
  return `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`;
}

function circle(x: number, y: number, r: number, fill: string, stroke: string, width = 1): PdfOp {
  const c = r * 0.5522847498;
  const [fr, fg, fb] = hexToRgb(fill);
  const [sr, sg, sb] = hexToRgb(stroke);
  return [
    `${(fr / 255).toFixed(3)} ${(fg / 255).toFixed(3)} ${(fb / 255).toFixed(3)} rg`,
    `${(sr / 255).toFixed(3)} ${(sg / 255).toFixed(3)} ${(sb / 255).toFixed(3)} RG`,
    `${width} w`,
    `${x + r} ${y} m`,
    `${x + r} ${y + c} ${x + c} ${y + r} ${x} ${y + r} c`,
    `${x - c} ${y + r} ${x - r} ${y + c} ${x - r} ${y} c`,
    `${x - r} ${y - c} ${x - c} ${y - r} ${x} ${y - r} c`,
    `${x + c} ${y - r} ${x + r} ${y - c} ${x + r} ${y} c`,
    "B",
  ].join(" ");
}

function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16),
  ];
}

function drawMetric(ops: PdfOp[], x: number, y: number, w: number, label: string, value: string) {
  ops.push(rect(x, y, w, 54, "#F8FBF8"));
  ops.push(strokeRect(x, y, w, 54, "#DDE8E0"));
  ops.push(text(x + 10, y + 34, 8, label.toUpperCase(), "F2"));
  ops.push(text(x + 10, y + 15, 13, value, "F2"));
}

function drawTrendChart(ops: PdfOp[], data: ESGReportData, x: number, y: number, w: number, h: number) {
  ops.push(rect(x, y, w, h, "#FFFFFF"));

  const values = data.trend.map((p) => p.footprintKg);
  const max = Math.max(...values, 1) * 1.1;
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const left = x + 36;
  const right = x + w - 12;
  const top = y + h - 18;
  const bottom = y + 24;
  const chartW = right - left;
  const chartH = top - bottom;

  for (let i = 0; i <= 4; i++) {
    const yy = bottom + (chartH / 4) * i;
    const label = Math.round(min + (span / 4) * i);
    ops.push(line(left, yy, right, yy, "#E4ECE6", 0.6));
    ops.push(text(x + 4, yy - 3, 7, String(label), "F1", "#606060"));
  }

  const pts = data.trend.map((point, i) => {
    const px = left + (chartW / Math.max(data.trend.length - 1, 1)) * i;
    const py = bottom + ((point.footprintKg - min) / span) * chartH;
    return [px, py] as const;
  });

  if (pts.length > 1) {
    const [r, g, b] = hexToRgb("#EAF6ED");
    const areaPath = [
      `${pts[0][0]} ${bottom} m`,
      ...pts.map(([px, py]) => `${px} ${py} l`),
      `${pts[pts.length - 1][0]} ${bottom} l`,
      "h",
      "f",
    ].join(" ");
    ops.push(`${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} rg ${areaPath}`);
  }

  if (pts.length > 1) {
    const [r, g, b] = hexToRgb("#2BA640");
    const path = pts.map(([px, py], i) => `${i === 0 ? "m" : "l"} ${px} ${py}`).join(" ");
    ops.push(`${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} RG 2.5 w 1 J 1 j ${path} S`);
  }

  for (const [px, py] of pts) {
    ops.push(circle(px, py, 3, "#FFFFFF", "#2BA640", 1.8));
  }

  data.trend.forEach((point, i) => {
    const px = left + (chartW / Math.max(data.trend.length - 1, 1)) * i;
    ops.push(text(px - 8, y + 6, 7, point.label || point.date, "F1", "#606060"));
  });
  ops.push(text(right - 42, top + 5, 8, "kg CO2e", "F1", "#606060"));
}

function drawReductionTable(ops: PdfOp[], data: ESGReportData, x: number, y: number, w: number) {
  const total = data.totalReducedKg || 1;
  const max = Math.max(...data.reductions.map((r) => r.savedKg), 1);
  ops.push(text(x, y + 20, 9, "OPTIMIZATION CATEGORY", "F2"));
  ops.push(text(x + 245, y + 20, 9, "SAVED", "F2"));
  ops.push(text(x + 345, y + 20, 9, "CONTRIBUTION", "F2"));
  ops.push(line(x, y + 13, x + w, y + 13, "#DDE8E0"));

  data.reductions.forEach((item, index) => {
    const rowY = y - index * 28;
    const barW = Math.max((item.savedKg / max) * 110, item.savedKg > 0 ? 3 : 0);
    ops.push(text(x, rowY, 10, item.category));
    ops.push(text(x + 245, rowY, 10, kg(item.savedKg)));
    ops.push(rect(x + 345, rowY - 3, barW, 8, "#2BA640"));
    ops.push(text(x + 462, rowY, 10, pct(item.savedKg, total)));
    ops.push(line(x, rowY - 10, x + w, rowY - 10, "#EEF3EF", 0.5));
  });
}

function buildPdf(data: ESGReportData): Blob {
  // Build the HTML template first so the export has a single report source model.
  // The PDF drawing below mirrors that template in vector/text form for download.
  buildReportHtml(data);

  const ops: PdfOp[] = [];
  ops.push(rect(0, 0, 595, 842, "#FFFFFF"));
  ops.push(rect(0, 784, 595, 58, "#0F2A18"));
  ops.push(text(36, 810, 9, "MANAGEMENT REVIEW PACK", "F2", "#FFFFFF"));
  ops.push(text(36, 790, 22, "Cloud Infrastructure ESG Report", "F2", "#FFFFFF"));
  ops.push(text(404, 812, 9, data.organizationName, "F1", "#FFFFFF"));
  ops.push(text(404, 796, 8, `Generated ${formatDateTime(data.generatedAt)}`, "F1", "#FFFFFF"));

  ops.push(text(36, 756, 10, `Reporting period: ${formatDateTime(data.periodStart)} - ${formatDateTime(data.periodEnd)}`));

  drawMetric(ops, 36, 682, 160, "Overall Carbon Footprint", kg(data.overallFootprintKg));
  drawMetric(ops, 214, 682, 160, "Total Reduced", kg(data.totalReducedKg));
  drawMetric(ops, 392, 682, 150, "ESG Score", data.esgScore == null ? "N/A" : String(data.esgScore));

  ops.push(text(36, 648, 15, "1. Carbon Footprint Trend", "F2"));
  drawTrendChart(ops, data, 36, 398, 506, 232);

  ops.push(text(36, 358, 15, "2. Carbon Reduction Breakdown", "F2"));
  drawReductionTable(ops, data, 36, 318, 506);

  const baseline = data.overallFootprintKg + data.totalReducedKg;
  ops.push(rect(36, 58, 506, 46, "#F0FAF2"));
  ops.push(rect(36, 58, 4, 46, "#2BA640"));
  ops.push(text(50, 84, 10, `Executive insight: ${kg(data.totalReducedKg)} avoided this period.`, "F2"));
  ops.push(text(50, 68, 9, `That is ${pct(data.totalReducedKg, baseline)} of the pre-optimization baseline footprint.`));

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
      const reportData: ESGReportData = {
        ...data,
        generatedAt: now.toISOString(),
        periodEnd: now.toISOString(),
      };
      const pdf = buildPdf(reportData);
      downloadBlob(`greenguard-esg-report-${fileDate(now)}.pdf`, pdf);
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      onClick={exportPdf}
      disabled={exporting}
      className="flex h-9 items-center gap-1.5 rounded-full bg-[#0F0F0F] px-4 text-[13px] font-medium text-white hover:bg-black disabled:opacity-60"
      title="Generate and download the current month's ESG PDF report"
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
