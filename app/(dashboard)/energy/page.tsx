import { getFindings, getFinding } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { Card, SectionTitle, MockBanner, EstimateNote } from "@/app/components/ui";
import { AreaLineChart, BarChart, type Slice } from "@/app/components/charts";
import { kg } from "@/app/lib/format";
import { IconLeaf } from "@/app/components/icons";
import ESGReportExport, {
  type ESGReductionCategory,
  type ESGTrendPoint,
} from "@/app/components/ESGReportExport";

export const dynamic = "force-dynamic";

export default async function EnergyPage() {
  const [costRes, energyRes] = await Promise.all([
    getFindings({ category: "cost", page_size: 50 }),
    getFindings({ category: "energy", page_size: 50 }),
  ]);
  const findings = [...costRes.data.items, ...energyRes.data.items];
  const mock = costRes.mock || energyRes.mock;

  const details = await Promise.all(
    findings.map((f) => getFinding(f.finding_id).catch(() => null)),
  );

  // Aggregate estimated carbon reduction by resource type.
  const byType: Record<string, number> = {};
  const byOptimization: Record<string, number> = {};
  let totalReduction = 0;
  for (let i = 0; i < findings.length; i++) {
    const red = details[i]?.data.recommendation?.estimated_carbon_reduction_kg ?? 0;
    totalReduction += red;
    byType[findings[i].resource_type] = (byType[findings[i].resource_type] ?? 0) + red;
    const label = optimizationLabel(findings[i].issue_type, findings[i].resource_type);
    byOptimization[label] = (byOptimization[label] ?? 0) + red;
  }

  const typeColors: Record<string, string> = {
    vm: "#FB8C00",
    storage: "#065FD4",
    database: "#606060",
    bucket: "#FF0000",
  };
  const energyBars: Slice[] = Object.entries(byType)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ label: k, value: Math.round(v), color: typeColors[k] ?? "#606060" }));

  // Synthetic 8-month footprint trend (estimated). Last point dips after approvals.
  const trend = [612, 598, 631, 645, 620, 604, 588, 588 - Math.round(totalReduction)];
  const trendLabels = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];

  const beforeFootprint = 588;
  const afterFootprint = Math.max(beforeFootprint - Math.round(totalReduction), 0);
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const reportTrend = buildReportTrend(trend, trendLabels);
  const reductionCategories = buildReductionCategories(byOptimization);
  const esgScore =
    beforeFootprint > 0
      ? Math.min(100, Math.round(72 + (totalReduction / beforeFootprint) * 100))
      : null;
  const reportData = {
    organizationName: "GreenGuard Cloud Demo Organization",
    generatedAt: now.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: now.toISOString(),
    overallFootprintKg: afterFootprint,
    totalReducedKg: Math.round(totalReduction),
    esgScore,
    trend: reportTrend,
    reductions: reductionCategories,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Energy"
        subtitle="Estimated carbon footprint of the cloud estate, and the reduction unlocked once recommended actions are approved."
        right={
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full bg-[#2BA6400D] px-3 py-1.5 text-[12px] font-medium text-[#1d7a2e] sm:flex">
              <IconLeaf width={14} height={14} /> all values are estimates
            </span>
            <ESGReportExport data={reportData} />
          </div>
        }
      />
      {mock && <MockBanner reason={costRes.error} />}

      <Card>
        <div className="flex items-center justify-between">
          <SectionTitle>Estimated monthly carbon footprint</SectionTitle>
          <span className="text-[12px] text-[#606060]">kg CO₂e / month · estimate</span>
        </div>
        <div className="mt-4">
          <AreaLineChart values={trend} labels={trendLabels} height={220} unit="kg CO₂e" />
        </div>
        <p className="mt-2 text-[12px] text-[#606060]">
          The final point reflects the projected footprint <strong>after</strong> approving the
          current pending recommendations.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Before / after approved actions</SectionTitle>
          <div className="mt-5 space-y-4">
            <BeforeAfterBar label="Before" value={beforeFootprint} max={beforeFootprint} color="#606060" />
            <BeforeAfterBar label="After (projected)" value={afterFootprint} max={beforeFootprint} color="#2BA640" />
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-lg bg-[#2BA6400D] p-3">
            <IconLeaf width={20} height={20} className="text-[#2BA640]" />
            <p className="text-[13px] text-[#0F0F0F]">
              <strong>{kg(Math.round(totalReduction))} CO₂e / month</strong> avoided once approved
              — about{" "}
              <strong>{Math.round((totalReduction / beforeFootprint) * 100)}%</strong> of the
              current estimated footprint.
            </p>
          </div>
        </Card>

        <Card>
          <SectionTitle>Energy impact by resource type</SectionTitle>
          <p className="mb-4 mt-1 text-[12px] text-[#606060]">
            Estimated CO₂e reduction available per resource class (kg / month).
          </p>
          <BarChart data={energyBars} unit=" kg" height={170} />
        </Card>
      </div>

      <Card>
        <SectionTitle>How we estimate carbon</SectionTitle>
        <p className="mt-2 text-[13px] leading-relaxed text-[#606060]">
          Carbon estimates use{" "}
          <span className="font-mono text-[#0F0F0F]">kWh × grid carbon-intensity</span> with{" "}
          <strong>Cloud Carbon Footprint</strong> coefficients. Instance energy is derived from
          machine-type power draw and utilisation; the grid factor for{" "}
          <span className="font-mono text-[#0F0F0F]">asia-southeast1</span> is ≈ 0.40 kg CO₂e/kWh.
          All figures are directional estimates to guide prioritisation, not billed measurements.
        </p>
      </Card>

      <EstimateNote />
    </div>
  );
}

function optimizationLabel(issueType: string, resourceType: string): string {
  const normalized = issueType.toLowerCase().replace(/\s+/g, "_");
  if (normalized.includes("idle_vm") || normalized.includes("idle_compute")) {
    return "Idle VM Shutdown";
  }
  if (normalized.includes("unused_storage") || normalized.includes("orphaned_storage")) {
    return "Unused Storage Removal";
  }
  if (normalized.includes("storage") || resourceType === "storage") {
    return "Storage Tier Optimization";
  }
  if (normalized.includes("right") || normalized.includes("over_provisioned") || resourceType === "vm") {
    return "VM Right-Sizing";
  }
  if (resourceType === "database") {
    return "Database Optimization";
  }
  return "Other Optimizations";
}

function buildReductionCategories(source: Record<string, number>): ESGReductionCategory[] {
  const ordered = [
    "Idle VM Shutdown",
    "Unused Storage Removal",
    "Storage Tier Optimization",
    "VM Right-Sizing",
    "Database Optimization",
    "Other Optimizations",
  ];
  return ordered.map((category) => ({
    category,
    savedKg: Math.round(source[category] ?? 0),
  }));
}

function buildReportTrend(values: number[], labels: string[]): ESGTrendPoint[] {
  return values.map((value, index) => ({
    date: labels[index] ?? String(index + 1),
    label: labels[index] ?? String(index + 1),
    footprintKg: Math.max(0, Math.round(value)),
  }));
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
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span className="text-[#606060]">{label}</span>
        <span className="font-medium text-[#0F0F0F]">{value} kg CO₂e</span>
      </div>
      <div className="h-4 w-full overflow-hidden rounded-full bg-[#F2F2F2]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
