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
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#065FD4] text-[12px] font-medium text-white ring-offset-2 hover:ring-2 hover:ring-[#065FD4]/40"
      >
        {roleInitials(role)}
      </button>

      {open && (
        <div className="absolute right-0 top-[44px] z-50 w-[280px] overflow-hidden rounded-lg border border-[#E5E5E5] bg-white shadow-[var(--shadow-e2)]">
          {/* identity */}
          <div className="flex items-center gap-3 border-b border-[#E5E5E5] p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#065FD4] text-[13px] font-medium text-white">
              {roleInitials(role)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-[#0F0F0F]">{user}</p>
              <p className="truncate text-[12px] text-[#606060]">
                Active role: <span className="font-medium text-[#0F0F0F]">{activeRoleLabel}</span>
              </p>
            </div>
          </div>

          {/* role switcher */}
          <div className="p-2">
            <p className="px-2 py-1.5 text-[11px] font-medium tracking-label text-[#606060]">
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
                    className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[#F2F2F2] ${
                      selected ? "bg-[#F2F2F2]" : ""
                    }`}
                  >
                    <span className="mt-[2px] h-4 w-4 shrink-0 text-[#2BA640]">
                      {selected ? <IconCheck width={16} height={16} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-[#0F0F0F]">
                        {item.label}
                      </span>
                      <span className="block text-[11px] leading-snug text-[#606060]">
                        owns {roleOwns(item.role)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* actions */}
          <div className="border-t border-[#E5E5E5] p-2">
            <button
              onClick={() => {
                setOpen(false);
                onHelp();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-[#0F0F0F] hover:bg-[#F2F2F2]"
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
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-[#FF0000] hover:bg-[#FF00000A]"
            >
              Reset demo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
