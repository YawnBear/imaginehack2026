"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconOverview,
  IconSecurity,
  IconCost,
  IconEnergy,
  IconAudit,
  IconMenu,
  IconSearch,
} from "./icons";
import { relativeTime } from "@/app/lib/format";

const NAV = [
  { href: "/", label: "Overview", icon: IconOverview },
  { href: "/security", label: "Security", icon: IconSecurity },
  { href: "/cost", label: "Cost", icon: IconCost },
  { href: "/energy", label: "Energy", icon: IconEnergy },
  { href: "/audit", label: "Audit", icon: IconAudit },
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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const sidebarWidth = collapsed ? "lg:w-[72px]" : "lg:w-[240px]";

  return (
    <div className="min-h-full bg-white text-[#0F0F0F]">
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-[#E5E5E5] bg-white px-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:px-4">
        <button
          aria-label="Toggle menu"
          onClick={() => {
            setCollapsed((c) => !c);
            setMobileOpen((o) => !o);
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#606060] hover:bg-[#F2F2F2]"
        >
          <IconMenu />
        </button>
        <Link href="/" className="shrink-0">
          <BrandMark />
        </Link>

        {/* Search (center) */}
        <div className="mx-auto hidden w-full max-w-[520px] items-center md:flex">
          <div className="flex h-[40px] flex-1 items-center rounded-l-full border border-[#E5E5E5] bg-white px-4">
            <input
              placeholder="Search findings, resources, projects…"
              className="w-full bg-transparent text-[14px] text-[#0F0F0F] placeholder:text-[#909090] focus:outline-none"
            />
          </div>
          <button
            aria-label="Search"
            className="flex h-[40px] w-[60px] items-center justify-center rounded-r-full border border-l-0 border-[#E5E5E5] bg-[#F8F8F8] text-[#606060] hover:bg-[#F2F2F2]"
          >
            <IconSearch width={18} height={18} />
          </button>
        </div>

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <span className="hidden items-center gap-1.5 text-[12px] text-[#606060] sm:flex">
            <span className="h-2 w-2 rounded-full bg-[#2BA640] gg-pulse" />
            Latest scan: {latestScanAt ? relativeTime(latestScanAt) : "—"}
          </span>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#065FD4] text-[12px] font-medium text-white"
            title="Demo user — Site Ops Lead"
          >
            SO
          </span>
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
    </div>
  );
}
