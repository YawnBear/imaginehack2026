"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Finding } from "@/app/lib/types";
import { findingMatchesQuery } from "@/app/lib/format";
import { FindingRow } from "./FindingsExplorer";
import FindingModal from "./FindingModal";
import { EmptyState } from "./ui";
import { IconSearch } from "./icons";

export default function SearchResults({
  findings,
  initialQuery,
}: {
  findings: Finding[];
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [openId, setOpenId] = useState<string | null>(null);

  const results = useMemo(
    () => (query.trim() ? findings.filter((f) => findingMatchesQuery(f, query)) : []),
    [findings, query],
  );

  const trimmed = query.trim();

  return (
    <div className="space-y-4">
      {/* In-page search box — keeps the URL in sync on Enter. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.replace(`/search?q=${encodeURIComponent(trimmed)}`);
        }}
        className="flex items-center rounded-full border border-border bg-canvas px-4"
      >
        <IconSearch width={18} height={18} className="shrink-0 text-subtle" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search findings, resources, projects, teams…"
          className="h-[44px] w-full bg-transparent px-3 text-[14px] text-ink placeholder:text-subtle focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              router.replace("/search");
            }}
            className="shrink-0 rounded-full px-2 py-1 text-[12px] font-medium text-muted hover:bg-surface"
          >
            Clear
          </button>
        )}
      </form>

      {!trimmed ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-canvas py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface text-muted">
            <IconSearch width={24} height={24} />
          </div>
          <p className="text-[14px] font-medium text-ink">Search the cloud estate</p>
          <p className="mt-1 max-w-sm text-[12px] text-muted">
            Try a resource name, project id, owner team, issue type, severity or a
            finding id (e.g. <span className="font-mono">FND-1042</span>).
          </p>
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          title={`No findings match “${trimmed}”`}
          hint="Try a different term, a resource type, or a severity like “critical”."
        />
      ) : (
        <>
          <p className="text-[12px] text-muted">
            {results.length} result{results.length === 1 ? "" : "s"} for{" "}
            <span className="font-medium text-ink">“{trimmed}”</span>
          </p>
          <div className="divide-y divide-border rounded-xl border border-border bg-canvas p-1.5">
            {results.map((f) => (
              <FindingRow key={f.finding_id} f={f} onOpen={setOpenId} />
            ))}
          </div>
        </>
      )}

      {openId && <FindingModal findingId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
