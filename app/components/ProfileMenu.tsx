"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useSession,
  REVIEWER_ROLES,
  roleLabel,
  roleOwns,
  roleInitials,
  type ReviewerRole,
} from "@/app/lib/session";
import { getReviewerRoles } from "@/app/lib/api";
import { useToast } from "@/app/lib/toast";
import { IconCheck } from "./icons";

export default function ProfileMenu({ onHelp }: { onHelp: () => void }) {
  const { role, roleLabel: activeRoleLabel, user, setRole, reset } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<{ role: string; label: string }[]>(
    REVIEWER_ROLES.map((value) => ({ role: value, label: roleLabel(value) })),
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    let active = true;
    getReviewerRoles()
      .then((res) => {
        if (!active || res.data.length === 0) return;
        setRoles(res.data);
      })
      .catch(() => {
        /* Keep built-in demo roles when the backend is unavailable. */
      });
    return () => {
      active = false;
    };
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
          <div className="flex items-center gap-3 border-b border-border p-4">
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

          {/* role switcher */}
          <div className="p-2">
            <p className="px-2 py-1.5 text-[11px] font-medium tracking-label text-muted">
              REVIEWER ROLE
            </p>
            <div className="max-h-[240px] overflow-y-auto">
              {roles.map((item) => {
                const selected = item.role === role;
                return (
                  <button
                    key={item.role}
                    onClick={() => {
                      setRole(item.role as ReviewerRole);
                      setOpen(false);
                      toast(`Now reviewing as ${item.label}`, "info");
                      router.refresh();
                    }}
                    className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface ${
                      selected ? "bg-surface" : ""
                    }`}
                  >
                    <span className="mt-[2px] h-4 w-4 shrink-0 text-[var(--color-success)]">
                      {selected ? <IconCheck width={16} height={16} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink">
                        {item.label}
                      </span>
                      <span className="block text-[11px] leading-snug text-muted">
                        owns {roleOwns(item.role)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* actions */}
          <div className="border-t border-border p-2">
            <button
              onClick={() => {
                setOpen(false);
                onHelp();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-surface"
            >
              How to use Safe Cloud
            </button>
            <button
              onClick={() => {
                reset();
                setOpen(false);
                toast("Demo reset — role back to default", "info");
                router.refresh();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-[var(--color-danger)] hover:bg-[var(--color-danger-tint)]"
            >
              Reset demo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
