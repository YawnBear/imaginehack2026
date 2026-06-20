"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  IconOverview,
  IconEnergy,
  IconAudit,
  IconRules,
  IconAgents,
  IconThreats,
  IconWorkflows,
  IconMenu,
} from "./icons";
import { relativeTime } from "@/app/lib/format";
import { getScanStatus, runScan, type ScanRunStatus, type SeedResponse } from "@/app/lib/api";
import { useToast } from "@/app/lib/toast";
import GlobalSearch from "./GlobalSearch";
import ProfileMenu from "./ProfileMenu";
import HelpModal from "./HelpModal";
import ThemeToggle from "./ThemeToggle";

const NAV = [
  { href: "/", label: "Overview", icon: IconOverview },
  { href: "/threats", label: "Threats", icon: IconThreats },
  { href: "/energy", label: "Energy", icon: IconEnergy },
  { href: "/rules", label: "Rules", icon: IconRules },
  { href: "/agents", label: "Agents", icon: IconAgents },
  { href: "/workflows", label: "Workflows", icon: IconWorkflows },
  { href: "/audit", label: "Audit", icon: IconAudit },
];

const SCAN_POLL_INTERVAL_MS = 5000;
const SCAN_POLL_MAX_ATTEMPTS = 1440;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLongRunningScanMessage(message: string) {
  return message.startsWith("Backend request timed out") || message === "HTTP 500";
}

function scanCompleteMessage(result: SeedResponse | null | undefined) {
  const created = result?.created_findings ?? 0;
  const updated = result?.updated_findings ?? 0;
  if (created > 0) {
    return `Scan complete - ${created} new finding${created === 1 ? "" : "s"} detected`;
  }
  if (updated > 0) {
    return `Scan complete - ${updated} finding${updated === 1 ? "" : "s"} updated`;
  }
  return "Scan complete - no new issues (estate clean)";
}

async function waitForScanToFinish(initialStatus: ScanRunStatus) {
  let latest = initialStatus;
  for (let attempt = 0; attempt < SCAN_POLL_MAX_ATTEMPTS; attempt += 1) {
    if (latest.state !== "running") return latest;
    await sleep(SCAN_POLL_INTERVAL_MS);
    const status = await getScanStatus();
    if (!initialStatus.scan_id || status.data.scan_id === initialStatus.scan_id) {
      latest = status.data;
    }
  }
  return latest;
}

function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-success-tint)]">
        <svg width={18} height={18} viewBox="0 0 32 32" fill="var(--color-footprint)" aria-hidden="true">
          <path d="M16.707 3.79c-0.419 1.062-1.464 1.645-2.334 1.301s-1.236-1.483-0.816-2.545 1.464-1.645 2.334-1.302 1.236 1.483 0.816 2.545zM21.193 5.46c-0.764 1.032-2.069 1.361-2.914 0.734s-0.911-1.97-0.146-3.002 2.069-1.361 2.914-0.734c0.845 0.626 0.911 1.97 0.146 3.002zM25.192 8.225c-0.99 0.959-2.43 1.079-3.215 0.268s-0.62-2.246 0.371-3.205 2.43-1.079 3.215-0.268 0.619 2.246-0.371 3.205zM28.906 14.051c-1.737 0.966-3.787 0.596-4.578-0.827s-0.025-3.359 1.712-4.325 3.787-0.596 4.578 0.827 0.025 3.359-1.712 4.325zM10.525 7.981c-3.809 3.407-7.519 8.305-8.761 16.165-1.451 9.181 9.858 7.521 8.738 2.618-1.43-6.264 2.129-8.805 6.739-7.747 2.049 0.47 4.152-0.306 5.366-2.523 1.46-2.666-0.463-6.665-3.922-8.712-2.697-1.596-5.773-1.935-8.16 0.2l-0 0z" />
        </svg>
      </span>
      <span className="text-[16px] font-bold tracking-tight text-ink">
        Safe<span className="font-medium text-muted">Cloud</span>
      </span>
    </span>
  );
}

export default function AppShell({
  children,
  latestScanAt,
  renderedAt,
}: {
  children: ReactNode;
  latestScanAt: string | null;
  renderedAt: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const sidebarWidth = collapsed ? "lg:w-[72px]" : "lg:w-[240px]";

  // Hamburger: on mobile open the drawer, on desktop collapse the rail.
  // (lg breakpoint = 1024px, matching the Tailwind `lg:` used for the sidebar.)
  function toggleMenu() {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      setCollapsed((c) => !c);
    } else {
      setMobileOpen((o) => !o);
    }
  }

  async function handleRunScan() {
    if (scanning) return;
    setScanning(true);
    try {
      const res = await runScan();
      const status = await waitForScanToFinish(res.data);
      if (status.state === "succeeded") {
        toast(scanCompleteMessage(status.result), res.error ? "info" : "success");
      } else if (status.state === "failed") {
        toast(`Scan failed: ${status.message ?? "Check backend logs for details."}`, "error");
      } else {
        toast("Scan is still running in the background", "info");
      }
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isLongRunningScanMessage(message)) {
        try {
          const status = await waitForScanToFinish(await getScanStatus().then((res) => res.data));
          if (status.state === "succeeded") {
            toast(scanCompleteMessage(status.result), "success");
          } else if (status.state === "failed") {
            toast(`Scan failed: ${status.message ?? "Check backend logs for details."}`, "error");
          } else {
            toast("Scan is still running in the background", "info");
          }
          router.refresh();
        } catch {
          toast("Scan is still running in the background", "info");
        }
      } else {
        toast(`Scan failed: ${message}`, "error");
      }
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="min-h-full bg-canvas text-ink">
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-canvas px-3 shadow-e1 sm:px-4">
        <button
          aria-label="Toggle menu"
          onClick={toggleMenu}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface"
        >
          <IconMenu />
        </button>
        <Link href="/" className="shrink-0">
          <BrandMark />
        </Link>

        {/* Search (center) */}
        <GlobalSearch />

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-1 md:ml-0 md:gap-2">
          {/* Run scan */}
          <button
            onClick={handleRunScan}
            disabled={scanning}
            aria-busy={scanning}
            title="Re-scan: ingest cloud events and detect findings"
            className="flex h-9 items-center gap-1.5 rounded-full bg-action px-3 text-[13px] font-medium text-on-action hover:opacity-90 disabled:opacity-75 sm:px-4"
          >
            {!scanning && <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" aria-hidden="true" />}
            <span className="hidden sm:inline">{scanning ? "Scanning..." : "Run scan"}</span>
            <span className="sm:hidden">{scanning ? "..." : "Scan"}</span>
          </button>

          <span className="hidden items-center gap-1.5 text-[12px] text-muted lg:flex">
            Latest scan: {latestScanAt ? relativeTime(latestScanAt, renderedAt) : "-"}
          </span>

          <ThemeToggle />

          {/* Profile / reviewer role */}
          <ProfileMenu />
        </div>
      </header>

      <div className="flex">
        {/* Sidebar (desktop) */}
        <aside
          className={`sticky top-14 hidden h-[calc(100vh-56px)] shrink-0 border-r border-border bg-canvas py-3 lg:block ${sidebarWidth} transition-[width] duration-200`}
        >
          <nav className="flex flex-col gap-0.5 px-2">
            {NAV.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`flex items-center gap-4 rounded-lg px-3 py-2.5 text-[14px] ${
                    active
                      ? "bg-surface font-bold text-ink"
                      : "font-normal text-ink hover:bg-surface"
                  } ${collapsed ? "justify-center px-0" : ""}`}
                >
                  <Icon
                    width={22}
                    height={22}
                    style={{ color: active ? "var(--color-ink)" : "var(--color-muted)" }}
                  />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 gg-scrim"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-[240px] bg-canvas py-3 shadow-[var(--shadow-e3)]">
              <div className="px-4 pb-3">
                <BrandMark />
              </div>
              <nav className="flex flex-col gap-0.5 px-2">
                {NAV.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-4 rounded-lg px-3 py-2.5 text-[14px] ${
                        active
                          ? "bg-surface font-bold"
                          : "hover:bg-surface"
                      }`}
                    >
                      <Icon width={22} height={22} style={{ color: active ? "var(--color-ink)" : "var(--color-muted)" }} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
