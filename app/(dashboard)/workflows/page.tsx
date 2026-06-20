import { getWorkflows, getRules, getAgents } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner } from "@/app/components/ui";
import WorkflowsManager from "./WorkflowsManager";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const [wfRes, rulesRes, agentsRes] = await Promise.all([getWorkflows(), getRules(), getAgents()]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Workflows"
        subtitle="Each workflow wires a rule to an AI agent and its analysts. Edit a workflow to change its trigger rule or assigned agents."
      />
      {(wfRes.mock || rulesRes.mock || agentsRes.mock) && (
        <MockBanner reason={wfRes.error ?? rulesRes.error ?? agentsRes.error} />
      )}
      <WorkflowsManager
        workflows={wfRes.data.items}
        rules={rulesRes.data.items}
        agents={agentsRes.data.items}
      />
    </div>
  );
}
