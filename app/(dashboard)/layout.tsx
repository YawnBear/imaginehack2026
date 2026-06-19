import AppShell from "@/app/components/AppShell";
import { getSummary } from "@/app/lib/api";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const summary = await getSummary();
  return <AppShell latestScanAt={summary.data.latest_scan_at}>{children}</AppShell>;
}
