"use client";

import { useState } from "react";
import type { ResponseMode, ResponsePolicy, ThreatReport } from "@/app/lib/types";
import { updatePolicy } from "@/app/lib/api";
import { Card, SectionTitle } from "@/app/components/ui";
import { relativeTime } from "@/app/lib/format";
import { useToast } from "@/app/lib/toast";

const MODES: ResponseMode[] = ["monitor", "manual", "auto"];

function critColor(score: number): string {
  if (score >= 80) return "#FF0000";
  if (score >= 60) return "#FB8C00";
  if (score >= 35) return "#065FD4";
  return "#606060";
}

export default function ThreatsView({
  initialThreats,
  initialPolicy,
}: {
  initialThreats: ThreatReport[];
  initialPolicy: ResponsePolicy;
}) {
  const { toast } = useToast();
  const [policy, setPolicy] = useState<ResponsePolicy>(initialPolicy);
  const [selected, setSelected] = useState<ThreatReport | null>(initialThreats[0] ?? null);

  async function savePolicy(patch: Partial<ResponsePolicy>) {
    const next = { ...policy, ...patch };
    setPolicy(next);
    const res = await updatePolicy(patch);
    toast(res.mock ? "Policy updated (offline)" : "Response policy updated", res.mock ? "info" : "success");
  }

  return (
    <div className="space-y-5">
      {/* Policy panel */}
      <Card>
        <SectionTitle>Response policy</SectionTitle>
        <div className="mt-3 flex flex-wrap items-end gap-6">
          <div>
            <label className="block text-[12px] font-medium text-[#606060]">Default mode</label>
            <div className="mt-1 flex gap-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => savePolicy({ default_mode: m })}
                  className={`rounded-full px-3 py-1 text-[13px] font-medium capitalize ${policy.default_mode === m ? "bg-[#0F0F0F] text-white" : "bg-[#F2F2F2] text-[#0F0F0F]"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="block text-[12px] font-medium text-[#606060]">
              Auto threshold — criticality ≥ <span className="font-bold text-[#0F0F0F]">{policy.auto_threshold}</span>
            </label>
            <input
              type="range" min={0} max={100} value={policy.auto_threshold}
              onChange={(e) => setPolicy({ ...policy, auto_threshold: Number(e.target.value) })}
              onMouseUp={(e) => savePolicy({ auto_threshold: Number((e.target as HTMLInputElement).value) })}
              className="mt-2 w-full"
            />
          </div>
        </div>
        <p className="mt-3 text-[12px] text-[#606060]">
          In <strong>auto</strong> mode, findings at or above the threshold auto-generate a threat report and flag a human.
          Destructive remediation always requires human approval, regardless of mode.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* List */}
        <Card>
          <SectionTitle>Active threats ({initialThreats.length})</SectionTitle>
          <div className="mt-2 space-y-1">
            {initialThreats.length === 0 && (
              <p className="text-[13px] text-[#606060]">No threat reports yet. Set policy to auto and run a scan, or open a finding to generate one.</p>
            )}
            {initialThreats.map((t) => (
              <button
                key={t.report_id}
                onClick={() => setSelected(t)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${selected?.report_id === t.report_id ? "bg-[#F2F2F2]" : "hover:bg-[#F8F8F8]"}`}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white"
                  style={{ background: critColor(t.criticality_score) }}
                >
                  {t.criticality_score}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[#0F0F0F]">{t.finding_id}</span>
                  <span className="block truncate text-[12px] text-[#606060]">{t.recommended_solution}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>

        {/* Detail */}
        {selected ? (
          <Card>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-lg text-[16px] font-bold text-white" style={{ background: critColor(selected.criticality_score) }}>
                {selected.criticality_score}
              </span>
              <div>
                <SectionTitle>Threat report — {selected.finding_id}</SectionTitle>
                <p className="text-[12px] text-[#606060]">
                  Criticality {selected.criticality_score}/100 · {selected.approval_status.replace(/_/g, " ")} · generated {relativeTime(selected.generated_at)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <section>
                <h4 className="text-[12px] font-medium tracking-label text-[#606060]">WHY THIS TRIGGERED</h4>
                <p className="mt-1 text-[13px] leading-relaxed text-[#0F0F0F]">{selected.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(selected.criticality_factors).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-[#F2F2F2] px-2 py-0.5 text-[11px] text-[#0F0F0F]">
                      {k.replace(/_/g, " ")} +{v}
                    </span>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="text-[12px] font-medium tracking-label text-[#606060]">TIMELINE</h4>
                <ol className="mt-2 space-y-2 border-l border-[#E5E5E5] pl-4">
                  {selected.timeline.map((e, i) => (
                    <li key={i} className="relative text-[13px]">
                      <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-[#065FD4]" />
                      <span className="font-medium text-[#0F0F0F]">{e.action.replace(/_/g, " ")}</span>
                      <span className="text-[#606060]"> · {e.actor} · {relativeTime(e.timestamp)}</span>
                      {e.note && <span className="block text-[12px] text-[#606060]">{e.note}</span>}
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h4 className="text-[12px] font-medium tracking-label text-[#606060]">RECOMMENDED SOLUTION</h4>
                <p className="mt-1 text-[13px] text-[#0F0F0F]">{selected.recommended_solution}</p>
              </section>

              {Object.keys(selected.agent_sections).length > 0 && (
                <section>
                  <h4 className="text-[12px] font-medium tracking-label text-[#606060]">AGENT ANALYSIS</h4>
                  <div className="mt-2 space-y-2">
                    {Object.entries(selected.agent_sections).map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-[#F8F8F8] p-3 text-[13px]">
                        <span className="mr-2 rounded px-2 py-0.5 text-[11px] font-medium capitalize" style={{ background: "#065FD414", color: "#065FD4" }}>{k}</span>
                        {v}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </Card>
        ) : (
          <Card><p className="text-[13px] text-[#606060]">Select a threat to see its report.</p></Card>
        )}
      </div>
    </div>
  );
}
