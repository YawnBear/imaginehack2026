import { getEnergySummary } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { Card, SectionTitle, MockBanner, EstimateNote } from "@/app/components/ui";
import { AreaLineChart } from "@/app/components/AnimatedAreaLineChart";
import { kg } from "@/app/lib/format";
import { IconLeaf } from "@/app/components/icons";
import ESGReportExport, {
  type ESGReductionCategory,
  type ESGTrendPoint,
} from "@/app/components/ESGReportExport";

export const dynamic = "force-dynamic";

export default async function EnergyPage() {
  const res = await getEnergySummary();
  const summary = res.data;

  const operationRows = Object.entries(summary.by_operation)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([operation, value], index) => ({
      label: formatOperation(operation),
      value: Math.round(value),
      color: operationColor(index),
    }));

  const trend = summary.history.map((point) => Math.round(point.value_kg));
  const trendLabels = summary.history.map((point) => point.label);
  const beforeFootprint = Math.round(summary.current_footprint_kg);
  const afterFootprint = Math.round(summary.projected_footprint_kg);
  const totalReduction = Math.round(summary.estimated_reduction_kg);
  const reductionPct =
    beforeFootprint > 0 ? Math.round((totalReduction / beforeFootprint) * 100) : 0;
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const reportTrend =
    summary.history.length > 0
      ? buildReportTrend(
          trend,
          trendLabels,
          summary.history.map((point) => point.timestamp),
        )
      : buildReportTrend([afterFootprint], ["Current"], [now.toISOString()]);
  const reductionCategories = buildReductionCategories(summary.by_operation, totalReduction);
  const esgScore =
    beforeFootprint > 0
      ? Math.min(100, Math.round(72 + (totalReduction / beforeFootprint) * 100))
      : null;
  const reportData = {
    organizationName: "SafeCloud",
    generatedAt: now.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: now.toISOString(),
    overallFootprintKg: afterFootprint,
    totalReducedKg: totalReduction,
    esgScore,
    trend: reportTrend,
    reductions: reductionCategories,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Energy"
        subtitle="Estimated carbon footprint by energy operation, backed by recorded energy measurements."
        right={
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full bg-[var(--color-success-tint)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-success-strong)] sm:flex">
              <IconLeaf width={14} height={14} /> all values are estimates
            </span>
            <ESGReportExport data={reportData} />
          </div>
        }
      />
      {res.mock && <MockBanner reason={res.error} />}

      <Card>
        <div className="flex items-center justify-between">
          <SectionTitle>Estimated monthly carbon footprint</SectionTitle>
          <span className="text-[12px] text-muted">kg CO2e / month - estimate</span>
        </div>
        <div className="mt-4">
          {trend.length > 0 ? (
            <AreaLineChart values={trend} labels={trendLabels} height={250} unit="kg CO2e" />
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-subtle text-center">
              <p className="text-[14px] font-medium text-ink">No energy history yet</p>
              <p className="mt-1 max-w-sm text-[12px] text-muted">
                The database has no time-series energy rows, so the chart will appear after
                energy measurements are recorded.
              </p>
            </div>
          )}
        </div>
        <p className="mt-2 text-[12px] text-muted">
          History comes from daily energy rows grouped by timestamp.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Before / after planned reductions</SectionTitle>
          <div className="mt-5 space-y-4">
            <BeforeAfterBar label="Before" value={beforeFootprint} max={beforeFootprint} color="var(--color-muted)" />
            <BeforeAfterBar label="After (projected)" value={afterFootprint} max={beforeFootprint} color="var(--color-success)" />
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-lg bg-[var(--color-success-tint)] p-3">
            <IconLeaf width={20} height={20} className="text-[var(--color-success)]" />
            <p className="text-[13px] text-ink">
              <strong>{kg(totalReduction)} CO2e / month</strong> planned for reduction,
              {" "}about <strong>{reductionPct}%</strong> of the current estimated footprint.
            </p>
          </div>
        </Card>

        <Card>
          <SectionTitle>Energy impact by operation</SectionTitle>
          <p className="mb-4 mt-1 text-[12px] text-muted">
            Latest estimated CO2e footprint by operation from the energy table (kg / month).
          </p>
          <OperationImpact rows={operationRows} />
        </Card>
      </div>

      <Card>
        <SectionTitle>How we estimate carbon</SectionTitle>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Carbon estimates use{" "}
          <span className="font-mono text-ink">kWh x grid carbon-intensity</span> with{" "}
          <strong>Cloud Carbon Footprint</strong> coefficients. Instance energy is derived from
          machine-type power draw and utilisation. All figures are directional estimates to guide
          prioritisation, not billed measurements.
        </p>
      </Card>

      <EstimateNote />
    </div>
  );
}

function buildReductionCategories(
  byOperation: Record<string, number>,
  totalReduction: number,
): ESGReductionCategory[] {
  const entries = Object.entries(byOperation)
    .filter(([, value]) => value > 0)
    .sort(([, a], [, b]) => b - a);

  if (entries.length === 0) {
    return [{ category: "Pending Recommendations", savedKg: Math.max(totalReduction, 0) }];
  }

  const totalFootprint = entries.reduce((sum, [, value]) => sum + value, 0);
  let allocated = 0;

  return entries.map(([operation, value], index) => {
    const savedKg =
      index === entries.length - 1
        ? Math.max(totalReduction - allocated, 0)
        : Math.round((value / totalFootprint) * totalReduction);
    allocated += savedKg;

    return {
      category: `${formatOperation(operation)} Reduction`,
      savedKg,
    };
  });
}

function buildReportTrend(
  values: number[],
  labels: string[],
  dates: Array<string | null | undefined>,
): ESGTrendPoint[] {
  return values.map((value, index) => ({
    date: dates[index] ?? new Date().toISOString(),
    label: labels[index] ?? String(index + 1),
    footprintKg: Math.max(0, Math.round(value)),
  }));
}

function formatOperation(value: string): string {
  if (value === "idle VM") return "Idle VM";
  if (value === "Unused Storage") return "Unused Storage";
  if (value === "idle database") return "Idle Database";
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function operationColor(index: number): string {
  const colors = [
    "var(--color-success)",
    "var(--color-link)",
    "var(--color-warning)",
    "var(--color-muted)",
    "var(--color-danger)",
  ];
  return colors[index % colors.length];
}

function OperationImpact({
  rows,
}: {
  rows: { label: string; value: number; color: string }[];
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const max = Math.max(...rows.map((row) => row.value), 1);

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[170px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-subtle text-center">
        <p className="text-[14px] font-medium text-ink">No operation data yet</p>
        <p className="mt-1 max-w-sm text-[12px] text-muted">
          Add rows to the energy table with an operation or resource_type to populate this view.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const width = Math.max((row.value / max) * 100, 3);
        const share = total > 0 ? Math.round((row.value / total) * 100) : 0;
        return (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-[13px]">
              <span className="font-medium text-ink">{row.label}</span>
              <span className="shrink-0 text-muted">
                {row.value} kg · {share}%
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full"
                style={{ width: `${width}%`, background: row.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BeforeAfterBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="font-medium text-ink">{value} kg CO2e</span>
      </div>
      <div className="h-4 w-full overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
