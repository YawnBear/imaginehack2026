import AppShell from "@/app/components/AppShell";
import { getSummary } from "@/app/lib/api";
import { SessionProvider } from "@/app/lib/session";
import { ToastProvider } from "@/app/lib/toast";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const summary = await getSummary();
  return (
    <SessionProvider>
      <ToastProvider>
        <AppShell latestScanAt={summary.data.latest_scan_at}>{children}</AppShell>
      </ToastProvider>
    </SessionProvider>
  );
}
