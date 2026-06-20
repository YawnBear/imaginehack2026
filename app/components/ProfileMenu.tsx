"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, roleInitials } from "@/app/lib/session";

export default function ProfileMenu() {
  const { role, roleLabel: activeRoleLabel, user } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        aria-label="Profile and reviewer role"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={`${user} — ${activeRoleLabel}`}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-link)] text-[12px] font-medium text-on-accent ring-offset-2 hover:ring-2 hover:ring-[var(--color-link)]/40"
      >
        {roleInitials(role)}
      </button>

      {open && (
        <div className="absolute right-0 top-[44px] z-50 w-[280px] overflow-hidden rounded-lg border border-border bg-canvas shadow-[var(--shadow-e2)]">
          {/* identity */}
          <div className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-link)] text-[13px] font-medium text-on-accent">
              {roleInitials(role)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-ink">{user}</p>
              <p className="truncate text-[12px] text-muted">
                Active role: <span className="font-medium text-ink">{activeRoleLabel}</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
