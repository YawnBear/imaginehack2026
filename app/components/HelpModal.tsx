"use client";

import { useEffect, type ReactNode } from "react";
import { IconClose } from "./icons";

const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: "Configure what Safe Cloud should check",
    body: (
      <>
        Use <strong>Detection Rules</strong> to define the conditions to match,
        <strong> AI Agents</strong> to add specialist analysis, and{" "}
        <strong>Workflows</strong> to connect a rule to the agents that should
        review matching findings. The built-in rules and agents work for the
        demo if you skip this setup.
      </>
    ),
  },
  {
    title: "Run a scan",
    body: (
      <>
        Press <strong>Run scan</strong> in the header to ingest the latest
        connected scan sources and cloud events. Safe Cloud reprocesses those
        sources through the deterministic rule engine and creates or updates
        findings such as public buckets, idle VMs, unused storage, unencrypted
        databases, and suspicious cloud activity.
      </>
    ),
  },
  {
    title: "Review the findings",
    body: (
      <>
        Open a row from <strong>Overview</strong> or <strong>Threats</strong>.
        The detail view shows the evidence, triggering rule, criticality score,
        timeline, recommended action, rule confidence, AI confidence, estimated
        savings, carbon impact, and any workflow or agent analysis.
      </>
    ),
  },
  {
    title: "Run workflows when you want agent summaries",
    body: (
      <>
        On <strong>Workflows</strong>, create a workflow by choosing a rule and
        agent set, then press <strong>Run all</strong>. Each workflow scans the
        latest available snapshot or ingested findings, updates its status
        light, and writes the selected agents&apos; summary back into matching
        recommendations.
      </>
    ),
  },
  {
    title: "Record the reviewer decision",
    body: (
      <>
        Use the <strong>profile menu</strong> to switch to the reviewer role
        you are representing, add a reason, then choose{" "}
        <strong>Approve</strong>, <strong>Reject</strong>,{" "}
        <strong>Defer</strong>, or <strong>Needs more info</strong>. A finding
        becomes <strong>Approved</strong> only after every required reviewer
        role has approved it.
      </>
    ),
  },
  {
    title: "Use Audit as the handoff record",
    body: (
      <>
        The <strong>Audit</strong> page records scan events, findings,
        recommendations, and reviewer decisions with the state details captured
        by the backend. Approval means the issue is cleared for a human team to
        remediate; <strong>Safe Cloud does not execute cloud changes.</strong>
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
              AI-assisted cloud governance - detect, explain, recommend, and
              record human review.
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
              It analyzes and recommends; required reviewers approve; remediation
              is carried out by your team, with decisions preserved in Audit.
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
