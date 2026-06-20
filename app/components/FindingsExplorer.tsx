"use client";

import { useMemo, useState } from "react";
import type { Finding } from "@/app/lib/types";
import {
  SEVERITY_COLOR,
  CATEGORY_LABEL,
  relativeTime,
  issueLabel,
} from "@/app/lib/format";
import { SeverityBadge, StatusBadge, EmptyState } from "./ui";
import { IconChevron, ResourceIcon } from "./icons";
import FindingModal from "./FindingModal";

export interface ChipGroup {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export function FindingRow({ f, onOpen }: { f: Finding; onOpen: (id: string) => void }) {
  const color = SEVERITY_COLOR[f.severity];
  return (
    <button
      onClick={() => onOpen(f.finding_id)}
      className="group flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left transition-colors hover:bg-[#F2F2F2]"
    >
      {/* severity / resource block (stands in for the thumbnail) */}
      <span
        className="flex h-[60px] w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl"
        style={{ background: `${color}12`, color }}
      >
        <ResourceIcon type={f.resource_type} width={22} height={22} />
        <span className="text-[10px] font-medium uppercase tracking-label">
          {f.resource_type}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <SeverityBadge severity={f.severity} />
          <span className="text-[11px] text-[#606060]">{f.finding_id}</span>
        </span>
        <span className="clamp-2 mt-1 block text-[14px] font-medium leading-snug text-[#0F0F0F]">
          {f.title ?? issueLabel(f.issue_type)}
        </span>
        <span className="clamp-1 mt-0.5 block font-mono text-[12px] text-[#606060]">
          {f.resource_id}
        </span>
        <span className="mt-1 block text-[12px] text-[#606060]">
          {CATEGORY_LABEL[f.category]} · {f.owner_team ?? "Unassigned"} ·{" "}
          {relativeTime(f.created_at)}
        </span>
      </span>

      <span className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
        <StatusBadge status={f.status} />
        <span className="text-[11px] text-[#606060]">
          {f.required_reviewers.length} reviewer{f.required_reviewers.length === 1 ? "" : "s"}
        </span>
      </span>
      <IconChevron
        width={20}
        height={20}
        className="shrink-0 text-[#909090] transition-transform group-hover:translate-x-0.5"
      />
    </button>
  );
}

function ChipBar({
  groups,
  active,
  onChange,
}: {
  groups: ChipGroup[];
  active: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  // Flatten into a single scrolling pill bar: "All" + each option.
  const allSelected = Object.values(active).every((v) => v === "all");
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <Chip
        selected={allSelected}
        onClick={() => groups.forEach((g) => onChange(g.key, "all"))}
        label="All"
      />
      {groups.map((g) =>
        g.options.map((opt) => (
          <Chip
            key={`${g.key}:${opt.value}`}
            selected={active[g.key] === opt.value}
            onClick={() =>
              onChange(g.key, active[g.key] === opt.value ? "all" : opt.value)
            }
            label={opt.label}
          />
        )),
      )}
    </div>
  );
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
        selected
          ? "bg-[#0F0F0F] text-white"
          : "bg-[#F2F2F2] text-[#0F0F0F] hover:bg-[#E5E5E5]"
      }`}
    >
      {label}
    </button>
  );
}

export default function FindingsExplorer({
  findings,
  groups,
}: {
  findings: Finding[];
  groups: ChipGroup[];
}) {
  const [active, setActive] = useState<Record<string, string>>(
    Object.fromEntries(groups.map((g) => [g.key, "all"])),
  );
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      findings.filter((f) =>
        groups.every((g) => {
          const sel = active[g.key];
          if (!sel || sel === "all") return true;
          return String((f as unknown as Record<string, unknown>)[g.key]) === sel;
        }),
      ),
    [findings, groups, active],
  );

  return (
    <div className="space-y-4">
      <ChipBar
        groups={groups}
        active={active}
        onChange={(k, v) => setActive((a) => ({ ...a, [k]: v }))}
      />
      <p className="text-[12px] text-[#606060]">
        {filtered.length} of {findings.length} findings
      </p>
      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="divide-y divide-[#F2F2F2] bg-white p-1.5">
          {filtered.map((f) => (
            <FindingRow key={f.finding_id} f={f} onOpen={setOpenId} />
          ))}
        </div>
      )}

      {openId && <FindingModal findingId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

// A standalone compact list (no filters) reused on the Overview page.
export function CompactFindingList({ findings }: { findings: Finding[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      <div className="divide-y divide-[#F2F2F2]">
        {findings.map((f) => (
          <FindingRow key={f.finding_id} f={f} onOpen={setOpenId} />
        ))}
      </div>
      {openId && <FindingModal findingId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
