import DashboardOverview from "@/app/components/DashboardOverview";
import { getEnergySummary, getFindings, getSummary } from "@/app/lib/api";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [summaryRes, findingsRes, energyRes] = await Promise.all([
    getSummary(),
    getFindings({ page_size: 100 }),
    getEnergySummary(),
  ]);

  const history = energyRes.data.history.map((point) => point.value_kg);
  const carbonHistory = history.length > 1
    ? history
    : [1.24, 1.18, 1.13, 1.09, 1.04, 1].map((factor) => Math.round(summaryRes.data.estimated_carbon_reduction_kg * factor));

  return (
    <DashboardOverview
      summary={summaryRes.data}
      findings={findingsRes.data.items}
      carbonHistory={carbonHistory}
      usingMock={summaryRes.mock || findingsRes.mock || energyRes.mock}
      mockReason={summaryRes.error ?? findingsRes.error}
    />
  );
}
