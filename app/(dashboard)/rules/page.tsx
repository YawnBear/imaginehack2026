import { getRules, getRuleTemplates, getClashes } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner } from "@/app/components/ui";
import RulesManager from "./RulesManager";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const [rulesRes, templatesRes, clashesRes] = await Promise.all([
    getRules(),
    getRuleTemplates(),
    getClashes(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Detection Rules"
        subtitle="Author and manage the rules the SafeCloud agent runs. Built from standardized templates — no code."
      />
      {rulesRes.mock && <MockBanner reason={rulesRes.error} />}
      <RulesManager
        initialRules={rulesRes.data.items}
        templates={templatesRes.data}
        clashes={clashesRes.data}
      />
    </div>
  );
}
