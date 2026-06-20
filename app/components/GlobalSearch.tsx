"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getFindings } from "@/app/lib/api";
import type { Finding } from "@/app/lib/types";
import { findingMatchesQuery, issueLabel, SEVERITY_COLOR } from "@/app/lib/format";
import { IconSearch, ResourceIcon } from "./icons";
import FindingModal from "./FindingModal";

export default function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Lazy-load the finding set the first time the box is focused.
  async function ensureLoaded() {
    if (loaded) return;
    setLoaded(true);
    const res = await getFindings({ page_size: 100 });
    setFindings(res.data.items);
  }

  // Close the suggestions on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const matches = useMemo(
    () => (query.trim() ? findings.filter((f) => findingMatchesQuery(f, query)) : []),
    [findings, query],
  );
  const suggestions = matches.slice(0, 5);

  function goToResults() {
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <div ref={boxRef} className="relative mx-auto hidden w-full max-w-[520px] md:block">
      <div className="flex items-center">
        <div className="flex h-[40px] flex-1 items-center rounded-l-full border border-[#E5E5E5] bg-white px-4">
          <input
            value={query}
            onFocus={() => {
              ensureLoaded();
              setOpen(true);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") goToResults();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Search findings, resources, projects…"
            className="w-full bg-transparent text-[14px] text-[#0F0F0F] placeholder:text-[#909090] focus:outline-none"
          />
        </div>
        <button
          aria-label="Search"
          onClick={goToResults}
          className="flex h-[40px] w-[60px] items-center justify-center rounded-r-full border border-l-0 border-[#E5E5E5] bg-[#F8F8F8] text-[#606060] hover:bg-[#F2F2F2]"
        >
          <IconSearch width={18} height={18} />
        </button>
      </div>

      {/* Live suggestions dropdown (Level-2 elevation). */}
      {open && query.trim() && (
        <div className="absolute left-0 top-[46px] z-50 w-full overflow-hidden rounded-lg border border-[#E5E5E5] bg-white shadow-[var(--shadow-e2)]">
          {!loaded ? (
            <div className="px-4 py-3 text-[13px] text-[#606060]">Searching…</div>
          ) : suggestions.length === 0 ? (
            <div className="px-4 py-3 text-[13px] text-[#606060]">
              No findings match “{query.trim()}”.
            </div>
          ) : (
            <>
              {suggestions.map((f) => {
                const color = SEVERITY_COLOR[f.severity];
                return (
                  <button
                    key={f.finding_id}
                    onClick={() => {
                      setOpen(false);
                      setOpenId(f.finding_id);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#F2F2F2]"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `${color}14`, color }}
                    >
                      <ResourceIcon type={f.resource_type} width={16} height={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-[#0F0F0F]">
                        {f.title ?? issueLabel(f.issue_type)}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-[#606060]">
                        {f.finding_id} · {f.resource_id}
                      </span>
                    </span>
                  </button>
                );
              })}
              <button
                onClick={goToResults}
                className="flex w-full items-center justify-between border-t border-[#E5E5E5] px-4 py-2.5 text-[12px] font-medium text-[#065FD4] hover:bg-[#F2F2F2]"
              >
                <span>
                  See all {matches.length} result{matches.length === 1 ? "" : "s"}
                </span>
                <span aria-hidden>↵</span>
              </button>
            </>
          )}
        </div>
      )}

      {openId && <FindingModal findingId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
