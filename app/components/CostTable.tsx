"use client";

import { useMemo, useState } from "react";
import type { Finding, Recommendation } from "@/app/lib/types";
import { usd, kg, issueLabel, SEVERITY_COLOR } from "@/app/lib/format";
import { SeverityBadge, StatusBadge, RiskBadge, EmptyState } from "./ui";
import { ResourceIcon } from "./icons";
import FindingModal from "./FindingModal";

export interface CostRow {
  finding: Finding;
  recommendation?: Recommendation | null;
}

export default function CostTable({ rows }: { rows: CostRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(true);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const av = a.recommendation?.estimated_monthly_savings ?? 0;
        const bv = b.recommendation?.estimated_monthly_savings ?? 0;
        return sortDesc ? bv - av : av - bv;
      }),
    [rows, sortDesc],
  );

  const totalSaving = rows.reduce(
    (s, r) => s + (r.recommendation?.estimated_monthly_savings ?? 0),
    0,
  );
  const totalCarbon = rows.reduce(
    (s, r) => s + (r.recommendation?.estimated_carbon_reduction_kg ?? 0),
    0,
  );

  if (rows.length === 0)
    return <EmptyState title="No cost findings" hint="No idle or unused resources detected." />;

  return (
    <div className="space-y-4">
      {/* totals */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl border border-[#065FD433] bg-[#065FD40A] px-4 py-3">
          <p className="text-[12px] text-[#606060]">Total est. monthly saving</p>
          <p className="text-[22px] font-bold text-[#0F0F0F]">{usd(totalSaving)}</p>
        </div>
        <div className="rounded-xl border border-[#2BA64033] bg-[#2BA6400A] px-4 py-3">
          <p className="text-[12px] text-[#606060]">Total est. CO₂e avoided</p>
          <p className="text-[22px] font-bold text-[#0F0F0F]">{kg(totalCarbon)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E5E5E5] bg-white">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#E5E5E5] text-[11px] font-medium uppercase tracking-label text-[#606060]">
              <th className="px-4 py-3 font-medium">Resource</th>
              <th className="px-4 py-3 font-medium">Issue</th>
              <th className="px-4 py-3 font-medium">Est. cost / mo</th>
              <th className="px-4 py-3 font-medium">
                <button
                  onClick={() => setSortDesc((d) => !d)}
                  className="inline-flex items-center gap-1 hover:text-[#0F0F0F]"
                >
                  Est. saving {sortDesc ? "↓" : "↑"}
                </button>
              </th>
              <th className="px-4 py-3 font-medium">Strategy</th>
              <th className="px-4 py-3 font-medium">Risk</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ finding: f, recommendation: r }) => {
              const saving = r?.estimated_monthly_savings ?? 0;
              const currentCost = saving > 0 ? Math.round(saving / 0.92) : 0;
              return (
                <tr
                  key={f.finding_id}
                  onClick={() => setOpenId(f.finding_id)}
                  className="cursor-pointer border-b border-[#F2F2F2] text-[13px] last:border-0 hover:bg-[#F2F2F2]"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg"
                        style={{
                          background: `${SEVERITY_COLOR[f.severity]}12`,
                          color: SEVERITY_COLOR[f.severity],
                        }}
                      >
                        <ResourceIcon type={f.resource_type} width={16} height={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono text-[12px] text-[#0F0F0F]">{f.resource_id}</p>
                        <p className="text-[11px] text-[#606060]">{f.owner_team}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[220px] text-[#0F0F0F]">{f.title ?? issueLabel(f.issue_type)}</p>
                    <SeverityBadge severity={f.severity} />
                  </td>
                  <td className="px-4 py-3 font-medium text-[#0F0F0F]">
                    {currentCost ? usd(currentCost) : "—"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[#065FD4]">
                    {saving ? usd(saving) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[260px] text-[#606060] clamp-2">
                      {r?.recommended_action ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">{r && <RiskBadge level={r.risk_level} />}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={f.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openId && <FindingModal findingId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
