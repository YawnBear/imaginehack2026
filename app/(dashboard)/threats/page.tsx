import { getThreats, getPolicy } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner } from "@/app/components/ui";
import ThreatsView from "./ThreatsView";

export const dynamic = "force-dynamic";

export default async function ThreatsPage() {
  const [threatsRes, policyRes] = await Promise.all([getThreats(), getPolicy()]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Threats"
        subtitle="Auto-generated threat reports for high-criticality findings, and the response policy that controls them."
      />
      {threatsRes.mock && <MockBanner reason={threatsRes.error} />}
      <ThreatsView initialThreats={threatsRes.data.items} initialPolicy={policyRes.data} />
    </div>
  );
}
