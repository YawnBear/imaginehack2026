import { getAgents, getAgentTemplates } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner } from "@/app/components/ui";
import AgentsManager from "./AgentsManager";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const [agentsRes, templatesRes] = await Promise.all([getAgents(), getAgentTemplates()]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Agents"
        subtitle="Add specialized analysis agents. Each agent analyzes the findings its coverage matches and writes its own section of the report."
      />
      {agentsRes.mock && <MockBanner reason={agentsRes.error} />}
      <AgentsManager initialAgents={agentsRes.data.items} templates={templatesRes.data} />
    </div>
  );
}
