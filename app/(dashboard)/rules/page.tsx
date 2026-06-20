import { getRules, getClashes } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner } from "@/app/components/ui";
import RulesManager from "./RulesManager";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const [rulesRes, clashesRes] = await Promise.all([
    getRules(),
    getClashes(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Detection Rules"
        subtitle="Author and manage the rules the SafeCloud agent runs. Just a name and the conditions to match — no code."
      />
      {rulesRes.mock && <MockBanner reason={rulesRes.error} />}
      <RulesManager
        initialRules={rulesRes.data.items}
        clashes={clashesRes.data}
      />
    </div>
  );
}
