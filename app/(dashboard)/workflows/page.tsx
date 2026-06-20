import { getRules, getAgents } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner } from "@/app/components/ui";
import WorkflowsGrid from "./WorkflowsGrid";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const [rulesRes, agentsRes] = await Promise.all([getRules(), getAgents()]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Workflows"
        subtitle="Choose which agents each rule triggers. A rule with no agents selected falls back to the agents' own coverage."
      />
      {(rulesRes.mock || agentsRes.mock) && <MockBanner reason={rulesRes.error ?? agentsRes.error} />}
      <WorkflowsGrid rules={rulesRes.data.items} agents={agentsRes.data.items} />
    </div>
  );
}
