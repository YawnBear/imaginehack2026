import { getFindings } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner, SafetyBanner, EmptyState } from "@/app/components/ui";
import FindingsExplorer, { type ChipGroup } from "@/app/components/FindingsExplorer";

export const dynamic = "force-dynamic";

const GROUPS: ChipGroup[] = [
  {
    key: "severity",
    label: "Severity",
    options: [
      { value: "critical", label: "Critical" },
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
    ],
  },
  {
    key: "status",
    label: "Status",
    options: [
      { value: "pending_review", label: "Pending" },
      { value: "deferred", label: "Deferred" },
      { value: "approved", label: "Approved" },
    ],
  },
  {
    key: "resource_type",
    label: "Resource",
    options: [
      { value: "bucket", label: "Buckets" },
      { value: "database", label: "Databases" },
    ],
  },
];

export default async function SecurityPage() {
  const res = await getFindings({ category: "security", page_size: 50 });
  const items = res.data.items;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Security"
        subtitle="Public buckets, unencrypted databases and over-broad IAM across the construction cloud estate. Every fix routes through human approval."
      />
      {res.mock && <MockBanner reason={res.error} />}
      <SafetyBanner compact />
      {items.length === 0 ? (
        <EmptyState title="No security findings" hint="The last scan found no security issues." />
      ) : (
        <FindingsExplorer findings={items} groups={GROUPS} />
      )}
    </div>
  );
}
