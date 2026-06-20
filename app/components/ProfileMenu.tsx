"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useSession,
  REVIEWER_ROLES,
  ROLE_LABEL,
  ROLE_OWNS,
  roleInitials,
} from "@/app/lib/session";
import { useToast } from "@/app/lib/toast";
import { IconCheck } from "./icons";

export default function ProfileMenu({ onHelp }: { onHelp: () => void }) {
  const { role, roleLabel, user, setRole, autoApprove, setAutoApprove, reset } =
    useSession();
  const { toast } = useToast();
  const router = useRouter();
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
        title={`${user} — ${roleLabel}`}
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
                Active role: <span className="font-medium text-[#0F0F0F]">{roleLabel}</span>
              </p>
            </div>
          </div>

          {/* role switcher */}
          <div className="p-2">
            <p className="px-2 py-1.5 text-[11px] font-medium tracking-label text-[#606060]">
              REVIEWER ROLE
            </p>
            <div className="max-h-[240px] overflow-y-auto">
              {REVIEWER_ROLES.map((r) => {
                const selected = r === role;
                return (
                  <button
                    key={r}
                    onClick={() => {
                      setRole(r);
                      setOpen(false);
                      toast(`Now reviewing as ${ROLE_LABEL[r]}`, "info");
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
                        {ROLE_LABEL[r]}
                      </span>
                      <span className="block text-[11px] leading-snug text-[#606060]">
                        owns {ROLE_OWNS[r]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* autonomy: auto-approve toggle */}
          <div className="border-t border-[#E5E5E5] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#0F0F0F]">
                  Auto-approve (agent autonomy)
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-[#606060]">
                  {autoApprove
                    ? "ON — approving records sign-off for ALL required reviewers at once. Still only records approval; nothing is executed."
                    : "OFF — approve manually as each required role."}
                </p>
              </div>
              <button
                role="switch"
                aria-checked={autoApprove}
                aria-label="Toggle auto-approve autonomy"
                onClick={() => {
                  const next = !autoApprove;
                  setAutoApprove(next);
                  toast(
                    next
                      ? "Auto-approve ON — records all reviewers' sign-off; nothing is executed"
                      : "Auto-approve OFF — manual per-role approval",
                    "info",
                  );
                }}
                className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
                  autoApprove ? "bg-[#2BA640]" : "bg-[#D0D0D0]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                    autoApprove ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
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
              How to use GreenGuard
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
