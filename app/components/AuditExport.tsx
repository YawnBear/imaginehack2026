"use client";

import { useState } from "react";
import type { AuditLog } from "@/app/lib/types";

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown): string {
  let s: string;
  if (value === null || value === undefined) s = "";
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  // RFC-4180 quoting.
  if (/[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const COLUMNS: (keyof AuditLog)[] = [
  "audit_id",
  "created_at",
  "entity_type",
  "entity_id",
  "action",
  "actor_id",
  "before_state",
  "after_state",
  "metadata",
];

export default function AuditExport({ logs }: { logs: AuditLog[] }) {
  const [open, setOpen] = useState(false);

  function exportCsv() {
    const header = COLUMNS.join(",");
    const rows = logs.map((log) => COLUMNS.map((c) => csvCell(log[c])).join(","));
    download(
      `greenguard-audit-${todayStamp()}.csv`,
      [header, ...rows].join("\n"),
      "text/csv;charset=utf-8",
    );
    setOpen(false);
  }

  function exportJson() {
    download(
      `greenguard-audit-${todayStamp()}.json`,
      JSON.stringify(logs, null, 2),
      "application/json",
    );
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={logs.length === 0}
        className="flex h-9 items-center gap-1.5 rounded-full border border-[#E5E5E5] px-4 text-[13px] font-medium text-[#0F0F0F] hover:bg-[#F2F2F2] disabled:opacity-50"
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[42px] z-50 w-[160px] overflow-hidden rounded-lg border border-[#E5E5E5] bg-white py-1 shadow-[var(--shadow-e2)]">
            <button
              onClick={exportCsv}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#0F0F0F] hover:bg-[#F2F2F2]"
            >
              Download CSV
            </button>
            <button
              onClick={exportJson}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#0F0F0F] hover:bg-[#F2F2F2]"
            >
              Download JSON
            </button>
          </div>
        </>
      )}
    </div>
  );
}
