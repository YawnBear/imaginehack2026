// Formatting helpers + severity/status presentation maps.

import type { Category, Finding, FindingStatus, Severity } from "./types";

// Currency: the backend computes all savings in USD and some agent_outputs
// strings embed a literal "$". We display USD with a "$" prefix so the live
// numbers and labels always agree (no conversion fudge factor anywhere).
// `usd` is the canonical name; `rm` is kept as an alias so existing callsites
// keep working — it now also renders "$", NOT "RM".
export function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export const rm = usd;

export function kg(n: number): string {
  return `${n.toLocaleString("en-MY", { maximumFractionDigits: 0 })} kg`;
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function relativeTime(isoStr: string, referenceTime: number | string | Date = Date.now()): string {
  const then = new Date(isoStr).getTime();
  const reference =
    typeof referenceTime === "number"
      ? referenceTime
      : new Date(referenceTime).getTime();
  const diff = reference - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatTime(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleString("en-MY", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return isoStr;
  }
}

// severity -> color (per Red Broadcast severity map)
export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "var(--color-danger)",
  high: "var(--color-warning)",
  medium: "var(--color-link)",
  low: "var(--color-muted)",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

// Keyed off the EXACT backend status enum strings.
export const STATUS_COLOR: Record<string, string> = {
  pending_review: "var(--color-warning)",
  approved: "var(--color-success)",
  rejected: "var(--color-muted)",
  deferred: "var(--color-muted)",
  needs_more_information: "var(--color-link)",
  action_completed: "var(--color-success)",
};

export const STATUS_LABEL: Record<FindingStatus, string> = {
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  deferred: "Deferred",
  needs_more_information: "Needs info",
  action_completed: "Action completed",
};

// Backend may emit "critical" for risk_level (mirrors severity on some rules),
// so accept any string and fall back to grey.
export const RISK_COLOR: Record<string, string> = {
  low: "var(--color-success)",
  medium: "var(--color-warning)",
  high: "var(--color-danger)",
  critical: "var(--color-danger)",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  security: "Security",
  cost: "Cost",
  energy: "Energy",
  workflow: "Workflow",
  audit: "Audit",
};

// issue_type (backend snake_case) -> human label. Covers common built-in types;
// falls back to a title-cased version of any unknown value.
export const ISSUE_TYPE_LABEL: Record<string, string> = {
  public_bucket: "Public storage bucket",
  idle_vm: "Idle compute instance",
  unused_storage: "Unused / orphaned storage",
  unencrypted_database: "Unencrypted database",
};

export function issueLabel(issueType: string): string {
  return (
    ISSUE_TYPE_LABEL[issueType] ??
    issueType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export const CATEGORY_COLOR: Record<Category, string> = {
  security: "var(--color-danger)",
  cost: "var(--color-link)",
  energy: "var(--color-success)",
  workflow: "var(--color-warning)",
  audit: "var(--color-muted)",
};

// Short, plain-language role of each specialized agent, keyed by output_key.
// Used by the Workflows pipeline cards (and reusable elsewhere). Unknown keys
// fall back to "" so the chip still renders with just the agent name.
export const AGENT_ROLE_BLURB: Record<string, string> = {
  security: "exposure & data risk",
  cost: "wasted spend & savings",
  energy: "carbon impact",
  workflow: "downtime & project risk",
  audit: "audit-trail & approvals",
};

// One canonical matcher used by BOTH the top-bar suggestions dropdown and the
// /search results page, so they always agree. Matches across resource_name,
// resource_id, project_id, owner_team, issue_type, finding_id, category,
// severity - plus title/explanation when present.
export function findingMatchesQuery(f: Finding, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const projectId = (f.evidence?.["project_id"] ?? "") as unknown;
  const haystack = [
    f.resource_name,
    f.resource_id,
    typeof projectId === "string" ? projectId : "",
    f.owner_team,
    f.issue_type,
    f.finding_id,
    f.category,
    f.severity,
    f.title,
    f.explanation,
    issueLabel(f.issue_type),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
