import { getAgents } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner } from "@/app/components/ui";
import AgentsManager from "./AgentsManager";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const agentsRes = await getAgents();
  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Agents"
        subtitle="Add specialized analysis agents. Each agent runs its system prompt against the findings it's assigned in Workflows and writes its own section of the report."
      />
      {agentsRes.mock && <MockBanner reason={agentsRes.error} />}
      <AgentsManager initialAgents={agentsRes.data.items} />
    </div>
  );
}
