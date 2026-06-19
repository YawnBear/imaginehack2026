import { getAuditLogs } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner, EmptyState } from "@/app/components/ui";
import { formatTime } from "@/app/lib/format";
import type { AuditLog } from "@/app/lib/types";

export const dynamic = "force-dynamic";

const ACTION_STYLE: Record<string, { color: string; label: string }> = {
  // Backend (live) action strings — underscored.
  event_ingested: { color: "#606060", label: "Event ingested" },
  finding_created: { color: "#FB8C00", label: "Finding created" },
  recommendation_generated: { color: "#065FD4", label: "Recommendation generated" },
  finding_approved: { color: "#2BA640", label: "Approved" },
  finding_rejected: { color: "#606060", label: "Rejected" },
  finding_deferred: { color: "#606060", label: "Deferred" },
  finding_needs_more_information: { color: "#065FD4", label: "Needs more info" },
  action_completed: { color: "#2BA640", label: "Action completed" },
  // Mock (demo) action strings — dotted.
  "scan.completed": { color: "#606060", label: "Scan completed" },
  "finding.created": { color: "#FB8C00", label: "Finding created" },
  "recommendation.generated": { color: "#065FD4", label: "Recommendation generated" },
  "review.approved": { color: "#2BA640", label: "Approved" },
  "review.rejected": { color: "#606060", label: "Rejected" },
  "review.deferred": { color: "#606060", label: "Deferred" },
  "remediation.applied": { color: "#2BA640", label: "Remediation applied" },
};

function styleFor(action: string) {
  return ACTION_STYLE[action] ?? { color: "#606060", label: action };
}

function StateBlock({ title, state }: { title: string; state?: Record<string, unknown> | null }) {
  if (!state || Object.keys(state).length === 0) return null;
  return (
    <div className="flex-1">
      <p className="mb-1 text-[11px] font-medium tracking-label text-[#606060]">{title}</p>
      <div className="rounded-lg bg-[#F8F8F8] p-2.5 font-mono text-[11px] text-[#0F0F0F]">
        {Object.entries(state).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-[#606060]">{k}:</span>
            <span>{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function AuditPage() {
  const res = await getAuditLogs();
  const logs: AuditLog[] = [...res.data].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        subtitle="Immutable, chronological trail: scan event → finding → recommendation → human approval → remediation. Before/after states are captured for accountability."
      />
      {res.mock && <MockBanner reason={res.error} />}

      {logs.length === 0 ? (
        <EmptyState title="No audit entries yet" hint="Activity will appear here after the first scan." />
      ) : (
        <ol className="relative ml-2 border-l border-[#E5E5E5]">
          {logs.map((log) => {
            const st = styleFor(log.action);
            const reason = log.metadata?.["reason"] as string | undefined;
            return (
              <li key={log.audit_id} className="mb-5 ml-5">
                <span
                  className="absolute -left-[7px] mt-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white"
                  style={{ background: st.color }}
                />
                <div className="rounded-xl border border-[#E5E5E5] bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[12px] font-medium"
                      style={{ background: `${st.color}14`, color: st.color }}
                    >
                      {st.label}
                    </span>
                    <span className="text-[12px] text-[#606060]">
                      {log.entity_type} · <span className="font-mono">{log.entity_id}</span>
                    </span>
                    <span className="ml-auto text-[12px] text-[#606060]">
                      {formatTime(log.created_at)}
                    </span>
                  </div>

                  <p className="mt-2 text-[13px] text-[#0F0F0F]">
                    by <span className="font-medium">{log.actor_id}</span>
                    {log.metadata?.["reviewer_role"] ? (
                      <span className="text-[#606060]">
                        {" "}
                        · {String(log.metadata["reviewer_role"])}
                      </span>
                    ) : null}
                  </p>

                  {reason && (
                    <p className="mt-1 text-[13px] italic text-[#606060]">“{reason}”</p>
                  )}

                  {(log.before_state || log.after_state) &&
                  log.action !== "review.deferred" ? (
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                      <StateBlock title="BEFORE" state={log.before_state} />
                      <StateBlock title="AFTER" state={log.after_state} />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
