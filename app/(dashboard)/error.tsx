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
        className="h-9 rounded-full bg-action px-4 text-[13px] font-medium text-on-action hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
