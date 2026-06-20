"use client";

import { useEffect } from "react";
import { IconClose } from "./icons";

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "A scan turns cloud events into findings",
    body: (
      <>
        Hit <strong>Run scan</strong> in the header to ingest the latest
        database scan sources. The deterministic rule engine detects issues (public
        buckets, idle VMs, unused storage, unencrypted databases) and creates a
        finding for each.
      </>
    ),
  },
  {
    title: "Open a finding to see the full picture",
    body: (
      <>
        Each finding shows the <strong>evidence</strong>, the{" "}
        <strong>triggering rule</strong>, the dual{" "}
        <strong>rule-vs-AI confidence</strong>, and the{" "}
        <strong>AI agents&apos; analysis</strong> (Security / Cost / Energy /
        Workflow / Audit) with estimated savings and carbon avoided.
      </>
    ),
  },
  {
    title: "Pick your reviewer role",
    body: (
      <>
        Use the <strong>profile menu</strong> (top-right) to choose your
        reviewer role. You only approve what your role owns - Security signs off
        on access, DBA on encryption, and so on.
      </>
    ),
  },
  {
    title: "Approve, Reject, Defer or ask for more info",
    body: (
      <>
        Record a decision with a reason. A finding clears to{" "}
        <strong>Approved</strong> only when <strong>all</strong> required
        reviewers approve - switch roles and approve as each to walk the
        multi-reviewer workflow.
      </>
    ),
  },
  {
    title: "Everything is written to the Audit trail",
    body: (
      <>
        Every scan, finding, recommendation and decision lands in the{" "}
        <strong>Audit</strong> log with before/after state.{" "}
        <strong>
          Safe Cloud never executes cloud changes — humans do, after approval.
        </strong>
      </>
    ),
  },
];

export default function HelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 gg-scrim" onClick={onClose} />
      <div className="gg-fade-up relative my-auto w-full max-w-[640px] rounded-lg bg-canvas shadow-[var(--shadow-e3)]">
        {/* header */}
        <div className="flex items-start gap-3 border-b border-border p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-danger)]">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--color-on-accent)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-bold leading-snug text-ink">
              How to use Safe Cloud
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">
              AI-assisted cloud governance - explain, recommend, and approve.
              Humans stay in control.
            </p>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface"
          >
            <IconClose width={18} height={18} />
          </button>
        </div>

        {/* body */}
        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
          <ol className="space-y-3">
            {STEPS.map((step, i) => (
              <li key={i} className="flex gap-3 rounded-lg border border-border p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-action text-[13px] font-bold text-on-action">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[14px] font-medium text-ink">{step.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="flex items-start gap-2 rounded-lg border border-[var(--color-success-border)] bg-[var(--color-success-tint)] px-3 py-2.5 text-[12px] text-[var(--color-success-strong)]">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mt-[1px] shrink-0">
              <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <span>
              <strong>Safety:</strong> Safe Cloud never executes any cloud change.
              It analyses and recommends; a human approves; remediation is carried
              out by your team - every step is auditable.
            </span>
          </div>
        </div>

        {/* footer */}
        <div className="flex justify-end border-t border-border p-4">
          <button
            onClick={onClose}
            className="h-9 rounded-full bg-action px-5 text-[14px] font-medium text-on-action hover:opacity-90"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
