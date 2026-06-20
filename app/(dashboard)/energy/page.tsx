import { getEnergySummary } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { Card, SectionTitle, MockBanner, EstimateNote } from "@/app/components/ui";
import { AreaLineChart, BarChart, type Slice } from "@/app/components/charts";
import { kg } from "@/app/lib/format";
import { IconLeaf } from "@/app/components/icons";

export const dynamic = "force-dynamic";

export default async function EnergyPage() {
  const res = await getEnergySummary();
  const summary = res.data;

  const typeColors: Record<string, string> = {
    vm: "var(--color-warning)",
    storage: "var(--color-link)",
    database: "var(--color-muted)",
    bucket: "var(--color-danger)",
  };
  const energyBars: Slice[] = Object.entries(summary.by_resource_type)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ label: k, value: Math.round(v), color: typeColors[k] ?? "var(--color-muted)" }));

  const trend = summary.history.map((point) => Math.round(point.value_kg));
  const trendLabels = summary.history.map((point) => point.label);
  const beforeFootprint = Math.round(summary.current_footprint_kg);
  const afterFootprint = Math.round(summary.projected_footprint_kg);
  const totalReduction = Math.round(summary.estimated_reduction_kg);
  const reductionPct =
    beforeFootprint > 0 ? Math.round((totalReduction / beforeFootprint) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Energy"
        subtitle="Estimated carbon footprint of the cloud estate, and the reduction unlocked once recommended actions are approved."
        right={
          <span className="hidden items-center gap-1.5 rounded-full bg-[var(--color-success-tint)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-success-strong)] sm:flex">
            <IconLeaf width={14} height={14} /> all values are estimates
          </span>
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
            <AreaLineChart values={trend} labels={trendLabels} height={220} unit="kg CO2e" />
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
          History comes from recorded energy data. Projected reduction is calculated from
          current pending recommendations.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Before / after approved actions</SectionTitle>
          <div className="mt-5 space-y-4">
            <BeforeAfterBar label="Before" value={beforeFootprint} max={beforeFootprint} color="var(--color-muted)" />
            <BeforeAfterBar label="After (projected)" value={afterFootprint} max={beforeFootprint} color="var(--color-success)" />
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-lg bg-[var(--color-success-tint)] p-3">
            <IconLeaf width={20} height={20} className="text-[var(--color-success)]" />
            <p className="text-[13px] text-ink">
              <strong>{kg(totalReduction)} CO2e / month</strong> avoided once approved,
              {" "}about <strong>{reductionPct}%</strong> of the current estimated footprint.
            </p>
          </div>
        </Card>

        <Card>
          <SectionTitle>Energy impact by resource type</SectionTitle>
          <p className="mb-4 mt-1 text-[12px] text-muted">
            Current estimated CO2e footprint by resource class (kg / month).
          </p>
          <BarChart data={energyBars} unit=" kg" height={170} />
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
