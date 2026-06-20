"use client";

import { useEffect, useState } from "react";
import { getAgentStatus } from "@/app/lib/api";
import type { AgentStatus } from "@/app/lib/types";

export default function AgentStatusChip() {
  const [status, setStatus] = useState<AgentStatus | null>(null);

  useEffect(() => {
    let active = true;
    const poll = () => getAgentStatus().then((r) => active && setStatus(r.data));
    poll();
    const id = setInterval(poll, 8000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const online = status?.online ?? false;
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium md:flex"
      style={{ background: online ? "#2BA64014" : "#F2F2F2", color: online ? "#1f7a3d" : "#909090" }}
      title={online ? `Agent online${status?.agent_id ? ` (${status.agent_id})` : ""}` : "Agent offline"}
    >
      <span className={`h-2 w-2 rounded-full ${online ? "bg-[#2BA640]" : "bg-[#B0B0B0]"}`} />
      Agent {online ? "online" : "offline"}
    </span>
  );
}
