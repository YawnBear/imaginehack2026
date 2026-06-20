"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getFinding, reviewFinding, getThreatReport } from "@/app/lib/api";
import type { FindingDetail, FindingStatus, ReviewDecision } from "@/app/lib/types";
import type { ThreatReport } from "@/app/lib/types";
import { usd, kg, CATEGORY_COLOR, issueLabel } from "@/app/lib/format";
import { useSession, ROLE_LABEL, type ReviewerRole } from "@/app/lib/session";
import { useToast } from "@/app/lib/toast";
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
  const router = useRouter();
  const { role, reviewerId } = useSession();
  const { toast } = useToast();
  const [detail, setDetail] = useState<FindingDetail | null>(null);
  const [report, setReport] = useState<ThreatReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [decided, setDecided] = useState<ReviewDecision | null>(null);
  // Result of the last review: new status + who still has to approve.
  const [decisionResult, setDecisionResult] = useState<{
    status: FindingStatus;
    remaining: string[];
  } | null>(null);

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
    let active = true;
    getThreatReport(findingId).then((r) => active && setReport(r.data));
    return () => { active = false; };
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
    // Reviewer identity comes from the ACTIVE role (profile menu), so the
    // multi-reviewer story is demonstrable: a finding only flips to "approved"
    // once every required role has approved.
    const res = await reviewFinding(finding.finding_id, {
      decision,
      reviewer_id: reviewerId,
      reviewer_role: role,
      reason,
    });
    setDecided(decision);
    setDecisionResult({
      status: res.data.status,
      remaining: res.data.required_reviewers_remaining ?? [],
    });
    setSubmitting(false);

    // Confirmation toast carries the same who's-left detail.
    const remaining = res.data.required_reviewers_remaining ?? [];
    if (decision === "approved") {
      toast(
        remaining.length > 0
          ? `Approved as ${ROLE_LABEL[role]} · still needs: ${remaining
              .map((r) => ROLE_LABEL[r as ReviewerRole] ?? r)
              .join(", ")}`
          : `Approved as ${ROLE_LABEL[role]} · all required reviewers signed off`,
        "success",
      );
    } else {
      toast(`Recorded "${decision.replace(/_/g, " ")}" as ${ROLE_LABEL[role]}`, "info");
    }

    // Refresh the dashboard server components so counts/statuses update live.
    router.refresh();
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
                  <StatusBadge status={decisionResult?.status ?? finding.status} />
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

              {report && (
                <section className="rounded-lg border border-[#E5E5E5] p-4">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-[13px] font-bold text-white"
                      style={{ background: report.criticality_score >= 80 ? "#FF0000" : report.criticality_score >= 60 ? "#FB8C00" : "#065FD4" }}
                    >
                      {report.criticality_score}
                    </span>
                    <h3 className="text-[12px] font-medium tracking-label text-[#606060]">
                      WHY THIS TRIGGERED · criticality {report.criticality_score}/100
                    </h3>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-[#0F0F0F]">{report.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(report.criticality_factors).map(([k, v]) => (
                      <span key={k} className="rounded-full bg-[#F2F2F2] px-2 py-0.5 text-[11px] text-[#0F0F0F]">
                        {k.replace(/_/g, " ")} +{v}
                      </span>
                    ))}
                  </div>
                  {report.timeline.length > 0 && (
                    <>
                      <h4 className="mt-4 text-[12px] font-medium tracking-label text-[#606060]">TIMELINE</h4>
                      <ol className="mt-2 space-y-2 border-l border-[#E5E5E5] pl-4">
                        {report.timeline.map((e, i) => (
                          <li key={i} className="relative text-[13px]">
                            <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-[#065FD4]" />
                            <span className="font-medium text-[#0F0F0F]">{e.action.replace(/_/g, " ")}</span>
                            <span className="text-[#606060]"> · {e.actor}</span>
                            {e.note && <span className="block text-[12px] text-[#606060]">{e.note}</span>}
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </section>
              )}

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

                  {/* Workflow summary — one merged paragraph across all agents */}
                  {rec.agent_summary && (
                    <div className="mt-4 rounded-lg border border-[#065FD433] bg-[#065FD40A] p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <h4 className="text-[12px] font-medium tracking-label text-[#606060]">WORKFLOW SUMMARY</h4>
                        {rec.ai_generated && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "#065FD414", color: "#065FD4" }}>
                            ✨ AI-generated
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] leading-relaxed text-[#0F0F0F]">{rec.agent_summary}</p>
                    </div>
                  )}

                  {/* Agent outputs */}
                  <div className="mb-2 mt-4 flex items-center gap-2">
                    <h4 className="text-[12px] font-medium tracking-label text-[#606060]">
                      AGENT ANALYSIS
                    </h4>
                    {rec.ai_generated && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: "#065FD414", color: "#065FD4" }}
                        title="Analysis text generated by the AI layer; numbers and detection remain rule-based."
                      >
                        ✨ AI-generated
                      </span>
                    )}
                  </div>
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
              <div className="space-y-2 rounded-lg bg-[#2BA6400D] p-3 text-[13px] text-[#1d7a2e]">
                <div className="flex items-center gap-2">
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#2BA640" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  <span>
                    Decision recorded as <strong>{ROLE_LABEL[role]}</strong>:{" "}
                    <strong className="capitalize">{decided.replace(/_/g, " ")}</strong>.
                    {" "}New status:{" "}
                    <span className="capitalize">
                      {(decisionResult?.status ?? decided).replace(/_/g, " ")}
                    </span>
                    .
                  </span>
                </div>
                {decided === "approved" &&
                  (decisionResult && decisionResult.remaining.length > 0 ? (
                    <p className="pl-7 text-[12px]">
                      Still needs:{" "}
                      <strong>
                        {decisionResult.remaining
                          .map((r) => ROLE_LABEL[r as ReviewerRole] ?? r)
                          .join(", ")}
                      </strong>
                      . Switch role in the profile menu and approve as each to clear it —
                      nothing has run yet.
                    </p>
                  ) : (
                    <p className="pl-7 text-[12px]">
                      All required reviewers have approved. Cleared for remediation by a
                      human — GreenGuard does not execute it.
                    </p>
                  ))}
                {decided !== "approved" && (
                  <p className="pl-7 text-[12px]">No cloud action will be taken.</p>
                )}
                <button
                  onClick={() => {
                    setDecided(null);
                    setDecisionResult(null);
                  }}
                  className="ml-7 mt-1 text-[12px] font-medium text-[#065FD4] hover:underline"
                >
                  Record another decision
                </button>
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
