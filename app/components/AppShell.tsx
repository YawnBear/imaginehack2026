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
  IconInfo,
} from "./icons";
import { relativeTime } from "@/app/lib/format";
import { runScan } from "@/app/lib/api";
import { useToast } from "@/app/lib/toast";
import GlobalSearch from "./GlobalSearch";
import ProfileMenu from "./ProfileMenu";
import HelpModal from "./HelpModal";
import AgentStatusChip from "./AgentStatusChip";
import ThemeToggle from "./ThemeToggle";

const NAV = [
  { href: "/", label: "Overview", icon: IconOverview },
  { href: "/threats", label: "Threats", icon: IconThreats },
  { href: "/energy", label: "Energy", icon: IconEnergy },
  { href: "/workflows", label: "Workflows", icon: IconWorkflows },
  { href: "/rules", label: "Rules", icon: IconRules },
  { href: "/agents", label: "Agents", icon: IconAgents },
  { href: "/audit", label: "Audit", icon: IconAudit },
];

function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-danger)]">
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--color-on-accent)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </span>
      <span className="text-[16px] font-bold tracking-tight text-ink">
        Safe <span className="font-medium text-muted">Cloud</span>
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
      const n = res.data.created_findings;
      const updated = res.data.updated_findings ?? 0;
      toast(
        n > 0
          ? `Scan complete - ${n} new finding${n === 1 ? "" : "s"} detected`
          : updated > 0
            ? `Scan complete - ${updated} finding${updated === 1 ? "" : "s"} updated`
          : "Scan complete - no new issues (estate clean)",
        res.error ? "info" : "success",
      );
      // Refresh server components so counts/statuses/lists update live.
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(`Scan failed: ${message}`, "error");
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
            title="Re-scan: ingest cloud events and detect findings"
            className="flex h-9 items-center gap-1.5 rounded-full bg-action px-3 text-[13px] font-medium text-on-action hover:opacity-90 disabled:opacity-60 sm:px-4"
          >
            <span
              className={`h-2 w-2 rounded-full bg-[var(--color-success)] ${scanning ? "gg-pulse" : ""}`}
            />
            <span className="hidden sm:inline">{scanning ? "Scanning..." : "Run scan"}</span>
            <span className="sm:hidden">{scanning ? "..." : "Scan"}</span>
          </button>

          <span className="hidden items-center gap-1.5 text-[12px] text-muted lg:flex">
            Latest scan: {latestScanAt ? relativeTime(latestScanAt, renderedAt) : "-"}
          </span>

          {/* Agent online status */}
          <AgentStatusChip />

          <ThemeToggle />

          {/* Help */}
          <button
            aria-label="How to use Safe Cloud"
            onClick={() => setHelpOpen(true)}
            className="gg-icon-button"
            title="How to use Safe Cloud"
          >
            <IconInfo width={20} height={20} />
          </button>

          {/* Profile / reviewer role */}
          <ProfileMenu onHelp={() => setHelpOpen(true)} />
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
