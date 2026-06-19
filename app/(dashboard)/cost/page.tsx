import { getFindings, getFinding } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner, SafetyBanner, EstimateNote } from "@/app/components/ui";
import CostTable, { type CostRow } from "@/app/components/CostTable";

export const dynamic = "force-dynamic";

export default async function CostPage() {
  // Cost + energy findings both carry savings figures; show both here.
  const [costRes, energyRes] = await Promise.all([
    getFindings({ category: "cost", page_size: 50 }),
    getFindings({ category: "energy", page_size: 50 }),
  ]);
  const findings = [...costRes.data.items, ...energyRes.data.items];
  const mock = costRes.mock || energyRes.mock;

  const details = await Promise.all(
    findings.map((f) => getFinding(f.finding_id).catch(() => null)),
  );
  const rows: CostRow[] = findings.map((f, i) => ({
    finding: f,
    recommendation: details[i]?.data.recommendation,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cost"
        subtitle="Idle VMs, over-provisioned instances and unused storage — with the optimisation strategy, estimated saving and risk for each."
      />
      {mock && <MockBanner reason={costRes.error} />}
      <SafetyBanner compact />
      <CostTable rows={rows} />
      <EstimateNote />
    </div>
  );
}
