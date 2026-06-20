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
        className="flex items-center rounded-full border border-[#E5E5E5] bg-white px-4"
      >
        <IconSearch width={18} height={18} className="shrink-0 text-[#909090]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search findings, resources, projects, teams…"
          className="h-[44px] w-full bg-transparent px-3 text-[14px] text-[#0F0F0F] placeholder:text-[#909090] focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              router.replace("/search");
            }}
            className="shrink-0 rounded-full px-2 py-1 text-[12px] font-medium text-[#606060] hover:bg-[#F2F2F2]"
          >
            Clear
          </button>
        )}
      </form>

      {!trimmed ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E5E5E5] bg-white py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F2F2F2] text-[#606060]">
            <IconSearch width={24} height={24} />
          </div>
          <p className="text-[14px] font-medium text-[#0F0F0F]">Search the cloud estate</p>
          <p className="mt-1 max-w-sm text-[12px] text-[#606060]">
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
          <p className="text-[12px] text-[#606060]">
            {results.length} result{results.length === 1 ? "" : "s"} for{" "}
            <span className="font-medium text-[#0F0F0F]">“{trimmed}”</span>
          </p>
          <div className="divide-y divide-[#F2F2F2] rounded-xl border border-[#E5E5E5] bg-white p-1.5">
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
