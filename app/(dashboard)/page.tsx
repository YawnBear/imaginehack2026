import { getSummary, getFindings } from "@/app/lib/api";
import { PageHeader, MetricCard } from "@/app/components/layout-bits";
import { Card, SectionTitle, MockBanner, EstimateNote, SafetyBanner } from "@/app/components/ui";
import { DonutChart, BarChart, type Slice } from "@/app/components/charts";
import { CompactFindingList } from "@/app/components/FindingsExplorer";
import { rm, kg, relativeTime, SEVERITY_COLOR, CATEGORY_COLOR } from "@/app/lib/format";
import {
  IconAlert,
  IconSecurity,
  IconCheck,
  IconClock,
  IconCost,
  IconLeaf,
} from "@/app/components/icons";
import type { Category, Severity } from "@/app/lib/types";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [summaryRes, findingsRes] = await Promise.all([
    getSummary(),
    getFindings({ page_size: 50 }),
  ]);
  const s = summaryRes.data;
  const usingMock = summaryRes.mock || findingsRes.mock;

  const categoryData: Slice[] = Object.entries(s.findings_by_category).map(
    ([k, v]) => ({
      label: k,
      value: v,
      color: CATEGORY_COLOR[k as Category] ?? "var(--color-muted)",
    }),
  );
  const severityOrder: Severity[] = ["critical", "high", "medium", "low"];
  const severityData: Slice[] = severityOrder
    .filter((sev) => s.findings_by_severity[sev])
    .map((sev) => ({
      label: sev,
      value: s.findings_by_severity[sev] ?? 0,
      color: SEVERITY_COLOR[sev],
    }));

  const totalFindings = Object.values(s.findings_by_category).reduce((a, b) => a + b, 0);

  const criticalFindings = findingsRes.data.items
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        subtitle="AI-assisted cloud governance for your construction cloud estate — explainable findings, estimated savings, human-approved remediation."
        right={
          <span className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] text-muted sm:flex">
            <IconClock width={14} height={14} /> Latest scan{" "}
            {s.latest_scan_at ? relativeTime(s.latest_scan_at) : "—"}
          </span>
        }
      />

      {usingMock && <MockBanner reason={summaryRes.error} />}

      {/* Metric cards */}
      <section>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            label="ACTIVE FINDINGS"
            value={String(s.active_findings)}
            sub={`${totalFindings} total this scan`}
            icon={<IconAlert width={16} height={16} />}
          />
          <MetricCard
            label="CRITICAL"
            value={String(s.critical_findings)}
            sub="needs immediate review"
            accent="var(--color-danger)"
            icon={<IconSecurity width={16} height={16} />}
          />
          <MetricCard
            label="PENDING APPROVALS"
            value={String(s.pending_approvals)}
            sub="awaiting human sign-off"
            accent="var(--color-warning)"
            icon={<IconClock width={16} height={16} />}
          />
          <MetricCard
            label="APPROVED ACTIONS"
            value={String(s.approved_actions)}
            sub="cleared for remediation"
            accent="var(--color-success)"
            icon={<IconCheck width={16} height={16} />}
          />
          <MetricCard
            label="EST. MONTHLY SAVINGS"
            value={rm(s.estimated_monthly_savings)}
            sub="across approved + pending"
            accent="var(--color-link)"
            icon={<IconCost width={16} height={16} />}
          />
          <MetricCard
            label="EST. CARBON REDUCTION"
            value={kg(s.estimated_carbon_reduction_kg)}
            sub="CO₂e per month (estimate)"
            accent="var(--color-success)"
            icon={<IconLeaf width={16} height={16} />}
          />
          <MetricCard
            label="SECURITY FINDINGS"
            value={String(s.findings_by_category.security ?? 0)}
            sub="public buckets, unencrypted DBs"
            accent="var(--color-danger)"
          />
          <MetricCard
            label="COST + ENERGY"
            value={String(
              (s.findings_by_category.cost ?? 0) + (s.findings_by_category.energy ?? 0),
            )}
            sub="idle / oversized / unused"
            accent="var(--color-link)"
          />
        </div>
      </section>

      {/* Charts */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Findings by category</SectionTitle>
          <div className="mt-4">
            <DonutChart
              data={categoryData}
              centerLabel={String(totalFindings)}
              centerSub="findings"
            />
          </div>
        </Card>
        <Card>
          <SectionTitle>Findings by severity</SectionTitle>
          <div className="mt-6">
            <BarChart data={severityData} />
          </div>
        </Card>
      </section>

      <SafetyBanner />

      {/* Recent critical findings */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>Recent critical findings</SectionTitle>
          <span className="text-[12px] text-muted">click any finding to review</span>
        </div>
        <div className="bg-canvas p-1.5">
          <CompactFindingList findings={criticalFindings} />
        </div>
      </section>

      <EstimateNote />
    </div>
  );
}
