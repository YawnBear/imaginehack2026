"use client";

import { ErrorState } from "@/app/components/ui";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4">
      <ErrorState message={error.message || "The backend did not return live data."} />
      <button
        onClick={reset}
        className="h-9 rounded-full bg-[#0F0F0F] px-4 text-[13px] font-medium text-white hover:bg-black"
      >
        Try again
      </button>
    </div>
  );
}
