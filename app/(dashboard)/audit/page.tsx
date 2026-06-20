import { getAuditLogs } from "@/app/lib/api";
import { PageHeader } from "@/app/components/layout-bits";
import { MockBanner, EmptyState } from "@/app/components/ui";
import AuditExport from "@/app/components/AuditExport";
import { formatTime } from "@/app/lib/format";
import type { AuditLog } from "@/app/lib/types";

export const dynamic = "force-dynamic";

const ACTION_STYLE: Record<string, { color: string; label: string }> = {
  // Backend (live) action strings — underscored.
  event_ingested: { color: "var(--color-muted)", label: "Event ingested" },
  finding_created: { color: "var(--color-warning)", label: "Finding created" },
  recommendation_generated: { color: "var(--color-link)", label: "Recommendation generated" },
  finding_approved: { color: "var(--color-success)", label: "Approved" },
  finding_rejected: { color: "var(--color-muted)", label: "Rejected" },
  finding_deferred: { color: "var(--color-muted)", label: "Deferred" },
  finding_needs_more_information: { color: "var(--color-link)", label: "Needs more info" },
  action_completed: { color: "var(--color-success)", label: "Action completed" },
  // Mock (demo) action strings — dotted.
  "scan.completed": { color: "var(--color-muted)", label: "Scan completed" },
  "finding.created": { color: "var(--color-warning)", label: "Finding created" },
  "recommendation.generated": { color: "var(--color-link)", label: "Recommendation generated" },
  "review.approved": { color: "var(--color-success)", label: "Approved" },
  "review.rejected": { color: "var(--color-muted)", label: "Rejected" },
  "review.deferred": { color: "var(--color-muted)", label: "Deferred" },
  "remediation.applied": { color: "var(--color-success)", label: "Remediation applied" },
};

function styleFor(action: string) {
  return ACTION_STYLE[action] ?? { color: "var(--color-muted)", label: action };
}

function StateBlock({ title, state }: { title: string; state?: Record<string, unknown> | null }) {
  if (!state || Object.keys(state).length === 0) return null;
  return (
    <div className="flex-1">
      <p className="mb-1 text-[11px] font-medium tracking-label text-muted">{title}</p>
      <div className="rounded-lg bg-surface-subtle p-2.5 font-mono text-[11px] text-ink">
        {Object.entries(state).map(([k, v]) => {
          const isObj = v !== null && typeof v === "object";
          return (
            <div key={k} className="flex gap-2">
              <span className="text-muted">{k}:</span>
              {isObj ? (
                <pre className="whitespace-pre-wrap break-all font-mono text-[10px] leading-snug text-ink">
                  {JSON.stringify(v, null, 2)}
                </pre>
              ) : (
                <span>{String(v)}</span>
              )}
            </div>
          );
        })}
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
        right={<AuditExport logs={logs} />}
      />
      {res.mock && <MockBanner reason={res.error} />}

      {logs.length === 0 ? (
        <EmptyState title="No audit entries yet" hint="Activity will appear here after the first scan." />
      ) : (
        <ol className="relative ml-2 border-l border-border">
          {logs.map((log) => {
            const st = styleFor(log.action);
            const reason = log.metadata?.["reason"] as string | undefined;
            return (
              <li key={log.audit_id} className="mb-5 ml-5">
                <span
                  className="absolute -left-[7px] mt-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-on-accent"
                  style={{ background: st.color }}
                />
                <div className="rounded-xl border border-border bg-canvas p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[12px] font-medium"
                      style={{ background: `${st.color}14`, color: st.color }}
                    >
                      {st.label}
                    </span>
                    <span className="text-[12px] text-muted">
                      {log.entity_type} · <span className="font-mono">{log.entity_id}</span>
                    </span>
                    <span className="ml-auto text-[12px] text-muted">
                      {formatTime(log.created_at)}
                    </span>
                  </div>

                  <p className="mt-2 text-[13px] text-ink">
                    by <span className="font-medium">{log.actor_id}</span>
                    {log.metadata?.["reviewer_role"] ? (
                      <span className="text-muted">
                        {" "}
                        · {String(log.metadata["reviewer_role"])}
                      </span>
                    ) : null}
                  </p>

                  {reason && (
                    <p className="mt-1 text-[13px] italic text-muted">“{reason}”</p>
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
