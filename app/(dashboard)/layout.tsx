import AppShell from "@/app/components/AppShell";
import { getSummary } from "@/app/lib/api";
import { SessionProvider } from "@/app/lib/session";
import { ToastProvider } from "@/app/lib/toast";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let latestScanAt: string | null = null;
  try {
    const summary = await getSummary();
    latestScanAt = summary.data.latest_scan_at;
  } catch {
    latestScanAt = null;
  }

  return (
    <SessionProvider>
      <ToastProvider>
        <AppShell latestScanAt={latestScanAt}>{children}</AppShell>
      </ToastProvider>
    </SessionProvider>
  );
}
