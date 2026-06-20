import DashboardOverview from "@/app/components/DashboardOverview";
import { PageHeader } from "@/app/components/layout-bits";
import { ErrorState } from "@/app/components/ui";
import { getEnergySummary, getFindings, getSummary } from "@/app/lib/api";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const renderedAt = new Date().toISOString();
  let summaryRes: Awaited<ReturnType<typeof getSummary>>;
  let findingsRes: Awaited<ReturnType<typeof getFindings>>;
  let energyRes: Awaited<ReturnType<typeof getEnergySummary>>;

  try {
    [summaryRes, findingsRes, energyRes] = await Promise.all([
      getSummary(),
      getFindings({ page_size: 100 }),
      getEnergySummary(),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div className="space-y-6">
        <PageHeader
          title="Overview"
          subtitle="AI-assisted cloud governance for your construction cloud estate - explainable findings, estimated savings, human-approved remediation."
        />
        <ErrorState message={message} />
      </div>
    );
  }

  const history = energyRes.data.history.map((point) => point.value_kg);
  const carbonHistory =
    history.length > 1
      ? history
      : [1.24, 1.18, 1.13, 1.09, 1.04, 1].map((factor) =>
          Math.round(summaryRes.data.estimated_carbon_reduction_kg * factor),
        );

  return (
    <DashboardOverview
      summary={summaryRes.data}
      findings={findingsRes.data.items}
      carbonHistory={carbonHistory}
      usingMock={summaryRes.mock || findingsRes.mock || energyRes.mock}
      renderedAt={renderedAt}
      mockReason={summaryRes.error ?? findingsRes.error ?? energyRes.error}
    />
  );
}
