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

const NAV = [
  { href: "/", label: "Overview", icon: IconOverview },
  { href: "/threats", label: "Threats", icon: IconThreats },
  { href: "/energy", label: "Energy", icon: IconEnergy },
  { href: "/audit", label: "Audit", icon: IconAudit },
  { href: "/rules", label: "Rules", icon: IconRules },
  { href: "/agents", label: "Agents", icon: IconAgents },
  { href: "/workflows", label: "Workflows", icon: IconWorkflows },
];

function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#FF0000]">
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </span>
      <span className="text-[16px] font-bold tracking-tight text-[#0F0F0F]">
        GreenGuard <span className="text-[#606060] font-medium">Cloud</span>
      </span>
    </span>
  );
}

export default function AppShell({
  children,
  latestScanAt,
}: {
  children: ReactNode;
  latestScanAt: string | null;
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
    <div className="min-h-full bg-white text-[#0F0F0F]">
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-[#E5E5E5] bg-white px-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:px-4">
        <button
          aria-label="Toggle menu"
          onClick={toggleMenu}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#606060] hover:bg-[#F2F2F2]"
        >
          <IconMenu />
        </button>
        <Link href="/" className="shrink-0">
          <BrandMark />
        </Link>

        {/* Search (center) */}
        <GlobalSearch />

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-2 md:ml-0 md:gap-3">
          {/* Run scan */}
          <button
            onClick={handleRunScan}
            disabled={scanning}
            title="Re-scan: ingest cloud events and detect findings"
            className="flex h-9 items-center gap-1.5 rounded-full bg-[#0F0F0F] px-3 text-[13px] font-medium text-white hover:bg-black disabled:opacity-60 sm:px-4"
          >
            <span
              className={`h-2 w-2 rounded-full bg-[#2BA640] ${scanning ? "gg-pulse" : ""}`}
            />
            <span className="hidden sm:inline">{scanning ? "Scanning..." : "Run scan"}</span>
            <span className="sm:hidden">{scanning ? "..." : "Scan"}</span>
          </button>

          <span className="hidden items-center gap-1.5 text-[12px] text-[#606060] lg:flex">
            Latest scan: {latestScanAt ? relativeTime(latestScanAt) : "-"}
          </span>

          {/* Agent online status */}
          <AgentStatusChip />

          {/* Help */}
          <button
            aria-label="How to use GreenGuard"
            onClick={() => setHelpOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#606060] hover:bg-[#F2F2F2]"
            title="How to use GreenGuard"
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
          className={`sticky top-14 hidden h-[calc(100vh-56px)] shrink-0 border-r border-[#E5E5E5] bg-white py-3 lg:block ${sidebarWidth} transition-[width] duration-200`}
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
                      ? "bg-[#F2F2F2] font-bold text-[#0F0F0F]"
                      : "font-normal text-[#0F0F0F] hover:bg-[#F2F2F2]"
                  } ${collapsed ? "justify-center px-0" : ""}`}
                >
                  <Icon
                    width={22}
                    height={22}
                    style={{ color: active ? "#0F0F0F" : "#606060" }}
                  />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>
          {!collapsed && (
            <div className="mx-3 mt-4 rounded-lg border border-[#E5E5E5] bg-[#F8F8F8] p-3">
              <p className="text-[12px] font-medium text-[#0F0F0F]">Hilti track</p>
              <p className="mt-1 text-[11px] leading-snug text-[#606060]">
                Secure &amp; Energy-Aware Cloud Platforms for Construction Tech.
              </p>
            </div>
          )}
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 gg-scrim"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-[240px] bg-white py-3 shadow-[var(--shadow-e3)]">
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
                          ? "bg-[#F2F2F2] font-bold"
                          : "hover:bg-[#F2F2F2]"
                      }`}
                    >
                      <Icon width={22} height={22} style={{ color: active ? "#0F0F0F" : "#606060" }} />
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
          <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
