"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getFindings } from "@/app/lib/api";
import type { Finding } from "@/app/lib/types";
import { issueLabel, SEVERITY_COLOR } from "@/app/lib/format";
import { IconSearch, ResourceIcon } from "./icons";
import FindingModal from "./FindingModal";

export default function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [total, setTotal] = useState(0);
  const [resultQuery, setResultQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const trimmedQuery = query.trim();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const q = trimmedQuery;
    if (!open || !q) {
      return;
    }

    let active = true;
    const id = window.setTimeout(() => {
      if (!active) return;
      setSearching(true);
      setSearchError(null);
      getFindings({ q, page_size: 5 })
        .then((res) => {
          if (!active) return;
          setFindings(res.data.items);
          setTotal(res.data.total);
          setResultQuery(q);
        })
        .catch((error) => {
          if (!active) return;
          setFindings([]);
          setTotal(0);
          setSearchError(error instanceof Error ? error.message : String(error));
          setResultQuery(q);
        })
        .finally(() => active && setSearching(false));
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(id);
    };
  }, [trimmedQuery, open]);

  function goToResults() {
    if (!trimmedQuery) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  }

  const hasCurrentResults = resultQuery === trimmedQuery;
  const visibleFindings = hasCurrentResults ? findings : [];
  const visibleTotal = hasCurrentResults ? total : 0;
  const visibleError = hasCurrentResults ? searchError : null;
  const isSearching = Boolean(trimmedQuery) && (!hasCurrentResults || searching);

  return (
    <div ref={boxRef} className="relative mx-auto hidden w-full max-w-[520px] md:block">
      <div className="flex items-center">
        <div className="flex h-[40px] flex-1 items-center rounded-l-full border border-border bg-canvas px-4">
          <input
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") goToResults();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Search findings, resources, projects..."
            className="w-full bg-transparent text-[14px] text-ink placeholder:text-subtle focus:outline-none"
          />
        </div>
        <button
          aria-label="Search"
          onClick={goToResults}
          className="flex h-[40px] w-[60px] items-center justify-center rounded-r-full border border-l-0 border-border bg-surface-subtle text-muted hover:bg-surface"
        >
          <IconSearch width={18} height={18} />
        </button>
      </div>

      {open && trimmedQuery && (
        <div className="absolute left-0 top-[46px] z-50 w-full overflow-hidden rounded-lg border border-border bg-canvas shadow-[var(--shadow-e2)]">
          {isSearching ? (
            <div className="px-4 py-3 text-[13px] text-muted">Searching...</div>
          ) : visibleError ? (
            <div className="px-4 py-3 text-[13px] text-muted">
              Search unavailable: {visibleError}
            </div>
          ) : visibleFindings.length === 0 ? (
            <div className="px-4 py-3 text-[13px] text-muted">
              No findings match &quot;{trimmedQuery}&quot;.
            </div>
          ) : (
            <>
              {visibleFindings.map((f) => {
                const color = SEVERITY_COLOR[f.severity];
                return (
                  <button
                    key={f.finding_id}
                    onClick={() => {
                      setOpen(false);
                      setOpenId(f.finding_id);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `${color}14`, color }}
                    >
                      <ResourceIcon type={f.resource_type} width={16} height={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {f.title ?? issueLabel(f.issue_type)}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-muted">
                        {f.finding_id} - {f.resource_id}
                      </span>
                    </span>
                  </button>
                );
              })}
              <button
                onClick={goToResults}
                className="flex w-full items-center justify-between border-t border-border px-4 py-2.5 text-[12px] font-medium text-[var(--color-link)] hover:bg-surface"
              >
                <span>
                  See all {visibleTotal} result{visibleTotal === 1 ? "" : "s"}
                </span>
                <span aria-hidden>Enter</span>
              </button>
            </>
          )}
        </div>
      )}

      {openId && <FindingModal findingId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
