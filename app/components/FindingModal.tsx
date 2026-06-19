"use client";

import { useEffect, useState } from "react";
import { getFinding, reviewFinding } from "@/app/lib/api";
import type { FindingDetail, ReviewDecision } from "@/app/lib/types";
import { usd, kg, CATEGORY_COLOR, issueLabel } from "@/app/lib/format";
import {
  SeverityBadge,
  StatusBadge,
  RiskBadge,
  EstimateNote,
  SafetyBanner,
} from "./ui";
import { ConfidenceBar } from "./charts";
import { IconClose, ResourceIcon, IconLeaf, IconCost } from "./icons";

const DECISIONS: { key: ReviewDecision; label: string; kind: "primary" | "danger" | "ghost" }[] = [
  { key: "approved", label: "Approve", kind: "primary" },
  { key: "rejected", label: "Reject", kind: "danger" },
  { key: "deferred", label: "Defer", kind: "ghost" },
  { key: "needs_more_information", label: "Needs more info", kind: "ghost" },
];

// Preferred display order; any other agent keys present are appended.
// Backend keys are lowercase (security/cost/energy/workflow/audit).
const AGENT_ORDER = ["security", "cost", "energy", "workflow", "audit"];

function orderedAgents(outputs: Record<string, string>): string[] {
  const keys = Object.keys(outputs);
  const known = AGENT_ORDER.filter((a) => keys.includes(a));
  const extra = keys.filter((k) => !AGENT_ORDER.includes(k.toLowerCase()));
  return [...known, ...extra];
}

export default function FindingModal({
  findingId,
  onClose,
}: {
  findingId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<FindingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [decided, setDecided] = useState<ReviewDecision | null>(null);

  useEffect(() => {
    let active = true;
    getFinding(findingId)
      .then((r) => {
        if (!active) return;
        setDetail(r.data);
        setError(null);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [findingId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function submit(decision: ReviewDecision) {
    if (!finding) return;
    setSubmitting(true);
    await reviewFinding(finding.finding_id, {
      decision,
      reviewer_id: "demo-user",
      reviewer_role: "Site Ops Lead",
      reason,
    });
    setDecided(decision);
    setSubmitting(false);
  }

  // detail is the nested backend envelope: { finding, recommendation, approvals, audit_logs }
  const finding = detail?.finding;
  const rec = detail?.recommendation;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 gg-scrim" onClick={onClose} />
      <div className="gg-fade-up relative my-auto w-full max-w-[760px] rounded-lg bg-white shadow-[var(--shadow-e3)]">
        {/* header */}
        <div className="flex items-start gap-3 border-b border-[#E5E5E5] p-5">
          {finding && (
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `${CATEGORY_COLOR[finding.category]}14`, color: CATEGORY_COLOR[finding.category] }}
            >
              <ResourceIcon type={finding.resource_type} width={20} height={20} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="gg-skeleton h-5 w-2/3 rounded" />
            ) : finding ? (
              <>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={finding.severity} />
                  <StatusBadge status={decided ?? finding.status} />
                  <span className="text-[11px] font-medium tracking-label text-[#606060]">
                    {finding.finding_id} · {finding.rule_id}
                  </span>
                </div>
                <h2 className="text-[18px] font-bold leading-snug text-[#0F0F0F]">
                  {finding.title ?? issueLabel(finding.issue_type)}
                </h2>
                <p className="mt-0.5 font-mono text-[12px] text-[#606060]">{finding.resource_id}</p>
              </>
            ) : (
              <h2 className="text-[16px] font-medium text-[#FF0000]">Couldn’t load finding</h2>
            )}
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#606060] hover:bg-[#F2F2F2]"
          >
            <IconClose width={18} height={18} />
          </button>
        </div>

        {/* body */}
        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
          {error && !finding ? (
            <p className="rounded-lg bg-[#FF00000A] p-4 text-[13px] text-[#0F0F0F]">
              {error}
            </p>
          ) : loading || !finding ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="gg-skeleton h-16 rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              <SafetyBanner />

              {finding.explanation && (
                <p className="text-[14px] leading-relaxed text-[#0F0F0F]">
                  {finding.explanation}
                </p>
              )}

              {/* Evidence + confidence */}
              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-lg border border-[#E5E5E5] p-4">
                  <h3 className="mb-2 text-[12px] font-medium tracking-label text-[#606060]">
                    EVIDENCE
                  </h3>
                  <dl className="space-y-1.5 text-[13px]">
                    {Object.entries(finding.evidence).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="shrink-0 capitalize text-[#606060]">
                          {k.replace(/_/g, " ")}
                        </dt>
                        <dd className="ml-auto text-right font-medium text-[#0F0F0F]">
                          {Array.isArray(v) ? v.join(", ") : String(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section className="rounded-lg border border-[#E5E5E5] p-4">
                  <h3 className="mb-3 text-[12px] font-medium tracking-label text-[#606060]">
                    CONFIDENCE
                  </h3>
                  <div className="space-y-3">
                    <ConfidenceBar label="Rule confidence" value={finding.rule_confidence} color="#606060" />
                    <ConfidenceBar label="AI confidence" value={finding.ai_confidence} color="#065FD4" />
                  </div>
                  <p className="mt-3 text-[11px] text-[#606060]">
                    Rule and AI confidence are shown separately so reviewers can weigh the
                    deterministic rule against the AI’s judgment.
                  </p>
                </section>
              </div>

              {/* Recommendation */}
              {rec && (
                <section className="rounded-lg border border-[#E5E5E5] p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-[12px] font-medium tracking-label text-[#606060]">
                      RECOMMENDED ACTION
                    </h3>
                    <RiskBadge level={rec.risk_level} />
                    <span
                      className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        background: rec.safe_to_execute ? "#2BA64014" : "#FB8C0014",
                        color: rec.safe_to_execute ? "#2BA640" : "#FB8C00",
                      }}
                    >
                      {rec.safe_to_execute ? "Cleared to execute" : "Awaiting approval"}
                    </span>
                  </div>
                  <p className="text-[14px] font-medium text-[#0F0F0F]">{rec.recommended_action}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[#606060]">{rec.rationale}</p>

                  {(rec.estimated_monthly_savings > 0 || rec.estimated_carbon_reduction_kg > 0) && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2 rounded-lg bg-[#065FD40A] p-3">
                        <IconCost width={20} height={20} className="text-[#065FD4]" />
                        <div>
                          <p className="text-[16px] font-bold text-[#0F0F0F]">
                            {usd(rec.estimated_monthly_savings)}
                          </p>
                          <p className="text-[11px] text-[#606060]">est. saving / month</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-[#2BA6400A] p-3">
                        <IconLeaf width={20} height={20} className="text-[#2BA640]" />
                        <div>
                          <p className="text-[16px] font-bold text-[#0F0F0F]">
                            {kg(rec.estimated_carbon_reduction_kg)}
                          </p>
                          <p className="text-[11px] text-[#606060]">est. CO₂e avoided / month</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Agent outputs */}
                  <h4 className="mb-2 mt-4 text-[12px] font-medium tracking-label text-[#606060]">
                    AGENT ANALYSIS
                  </h4>
                  <div className="space-y-2">
                    {orderedAgents(rec.agent_outputs).map((agent) => {
                      const color =
                        CATEGORY_COLOR[agent.toLowerCase() as keyof typeof CATEGORY_COLOR] ??
                        "#606060";
                      return (
                        <div key={agent} className="flex gap-3 rounded-lg bg-[#F8F8F8] p-3">
                          <span
                            className="mt-0.5 h-fit shrink-0 rounded px-2 py-0.5 text-[11px] font-medium capitalize"
                            style={{ background: `${color}1a`, color }}
                          >
                            {agent}
                          </span>
                          <p className="text-[13px] leading-relaxed text-[#0F0F0F]">
                            {rec.agent_outputs[agent]}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Required reviewers */}
              <section>
                <h3 className="mb-2 text-[12px] font-medium tracking-label text-[#606060]">
                  REQUIRED REVIEWERS
                </h3>
                <div className="flex flex-wrap gap-2">
                  {finding.required_reviewers.map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#F2F2F2] px-3 py-1 text-[12px] font-medium text-[#0F0F0F]"
                    >
                      <span className="h-4 w-4 rounded-full bg-[#065FD4] text-[8px] leading-4 text-center text-white">
                        {r[0]}
                      </span>
                      {r}
                    </span>
                  ))}
                </div>
              </section>

              <EstimateNote />
            </>
          )}
        </div>

        {/* approval action row */}
        {detail && (
          <div className="border-t border-[#E5E5E5] p-5">
            {decided ? (
              <div className="flex items-center gap-2 rounded-lg bg-[#2BA6400D] p-3 text-[13px] text-[#1d7a2e]">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#2BA640" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
                Decision recorded: <strong className="capitalize">{decided.replace(/_/g, " ")}</strong>.
                {decided === "approved"
                  ? " Queued for execution once all required reviewers sign off — nothing has run yet."
                  : " No cloud action will be taken."}
              </div>
            ) : (
              <>
                <label className="mb-1 block text-[12px] font-medium tracking-label text-[#606060]">
                  REVIEWER REASON
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Add context for this decision (recommended)…"
                  className="mb-3 w-full resize-none rounded-lg border border-[#E5E5E5] bg-[#F8F8F8] px-3 py-2 text-[13px] text-[#0F0F0F] placeholder:text-[#909090] focus:border-[#0F0F0F] focus:bg-white focus:outline-none"
                />
                <div className="flex flex-wrap gap-2">
                  {DECISIONS.map((d) => {
                    const cls =
                      d.kind === "primary"
                        ? "bg-[#0F0F0F] text-white hover:bg-black"
                        : d.kind === "danger"
                          ? "border border-[#E5E5E5] text-[#FF0000] hover:bg-[#FF00000A]"
                          : "border border-[#E5E5E5] text-[#0F0F0F] hover:bg-[#F2F2F2]";
                    return (
                      <button
                        key={d.key}
                        disabled={submitting}
                        onClick={() => submit(d.key)}
                        className={`h-9 rounded-full px-4 text-[14px] font-medium disabled:opacity-50 ${cls}`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-[#606060]">
                  GreenGuard does not execute the action — it only records your decision and
                  notifies the remaining reviewers.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
