import { getRules, getAgents } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner } from "@/app/components/ui";
import WorkflowBuilder from "./WorkflowBuilder";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const [rulesRes, agentsRes] = await Promise.all([getRules(), getAgents()]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Workflows"
        subtitle="Pick a rule, choose the agents it triggers, and run it to see one merged summary of all their analysis."
      />
      {(rulesRes.mock || agentsRes.mock) && <MockBanner reason={rulesRes.error ?? agentsRes.error} />}
      <WorkflowBuilder rules={rulesRes.data.items} agents={agentsRes.data.items} />
    </div>
  );
}
