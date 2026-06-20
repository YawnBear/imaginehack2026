import { getFindings } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner, SafetyBanner, EmptyState } from "@/app/components/ui";
import FindingsExplorer, { type ChipGroup } from "@/app/components/FindingsExplorer";
import type { Finding } from "@/app/lib/types";

export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  pending_review: "Pending",
  deferred: "Deferred",
  approved: "Approved",
  rejected: "Rejected",
  needs_more_information: "Needs info",
  action_completed: "Action completed",
  bucket: "Buckets",
  database: "Databases",
  storage: "Storage",
  vm: "VMs",
};

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function groupOptions(
  findings: Finding[],
  key: keyof Finding,
  order: string[],
): { value: string; label: string }[] {
  const values = new Set(
    findings
      .map((finding) => String(finding[key] ?? ""))
      .filter(Boolean),
  );
  const ordered = [
    ...order.filter((value) => values.has(value)),
    ...Array.from(values).filter((value) => !order.includes(value)).sort(),
  ];
  return ordered.map((value) => ({ value, label: LABELS[value] ?? titleCase(value) }));
}

function buildGroups(findings: Finding[]): ChipGroup[] {
  return [
    {
      key: "severity",
      label: "Severity",
      options: groupOptions(findings, "severity", ["critical", "high", "medium", "low"]),
    },
    {
      key: "status",
      label: "Status",
      options: groupOptions(findings, "status", [
        "pending_review",
        "needs_more_information",
        "deferred",
        "approved",
        "rejected",
        "action_completed",
      ]),
    },
    {
      key: "resource_type",
      label: "Resource",
      options: groupOptions(findings, "resource_type", ["bucket", "database", "storage", "vm"]),
    },
  ].filter((group) => group.options.length > 0);
}

export default async function ThreatsPage() {
  const res = await getFindings({ category: "security", page_size: 50 });
  const items = res.data.items;
  const groups = buildGroups(items);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Threats"
        subtitle="Detected threats across the cloud estate - each with an AI explanation, timeline and recommended fix for your security team."
      />
      {res.mock && <MockBanner reason={res.error} />}
      <SafetyBanner compact />
      {items.length === 0 ? (
        <EmptyState title="No threats" hint="The last scan found no security issues." />
      ) : (
        <FindingsExplorer findings={items} groups={groups} />
      )}
    </div>
  );
}
