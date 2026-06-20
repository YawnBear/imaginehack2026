// Typed REST client for the GreenGuard Cloud backend.
//
// Every method gracefully falls back to bundled mock data when
// NEXT_PUBLIC_API_BASE_URL is unset OR the network request fails, so the
// demo renders fully with zero backend.

import {
  MOCK_AGENT_TEMPLATES,
  MOCK_AGENTS,
  MOCK_AUDIT_LOGS,
  MOCK_FINDINGS,
  MOCK_RULE_TEMPLATES,
  MOCK_RULES,
  MOCK_SUMMARY,
  MOCK_THREATS,
  mockFindingDetail,
} from "./mockData";
import { buildScanEvents } from "./scanEvents";
import type {
  Agent,
  AgentCreateBody,
  AgentListResponse,
  AgentPreviewResponse,
  AgentStatus,
  AgentTemplate,
  AuditLog,
  AuditLogsResponse,
  ClashWarning,
  DashboardSummary,
  Finding,
  FindingDetail,
  FindingsQuery,
  FindingsResponse,
  Rule,
  RuleCreateBody,
  RuleListResponse,
  RulePreviewResponse,
  RuleTemplate,
  ReviewBody,
  ReviewResponse,
  ThreatReport,
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

export interface ApiResult<T> {
  data: T;
  /** true when this response came from the bundled mock fallback. */
  mock: boolean;
  /** populated when a live request failed and we fell back to mock. */
  error?: string;
}

async function tryFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL not set");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function ok<T>(data: T): ApiResult<T> {
  return { data, mock: false };
}
function fallback<T>(data: T, err: unknown): ApiResult<T> {
  return { data, mock: true, error: err instanceof Error ? err.message : String(err) };
}

// ---------------------------------------------------------------------------

function filterFindings(query: FindingsQuery): FindingsResponse {
  const page = query.page ?? 1;
  const pageSize = query.page_size ?? 50;
  const items = MOCK_FINDINGS.filter((f) => {
    if (query.severity && f.severity !== query.severity) return false;
    if (query.category && f.category !== query.category) return false;
    if (query.status && f.status !== query.status) return false;
    if (query.resource_type && f.resource_type !== query.resource_type) return false;
    if (query.owner_team && f.owner_team !== query.owner_team) return false;
    return true;
  });
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    page_size: pageSize,
    total: items.length,
  };
}

export async function getHealth(): Promise<ApiResult<{ status: string }>> {
  try {
    return ok(await tryFetch<{ status: string }>("/healthz"));
  } catch (e) {
    return fallback({ status: "mock" }, e);
  }
}

export async function getSummary(): Promise<ApiResult<DashboardSummary>> {
  try {
    return ok(await tryFetch<DashboardSummary>("/api/dashboard/summary"));
  } catch (e) {
    return fallback(MOCK_SUMMARY, e);
  }
}

export async function getFindings(
  query: FindingsQuery = {},
): Promise<ApiResult<FindingsResponse>> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  try {
    const path = `/api/findings${qs.toString() ? `?${qs}` : ""}`;
    return ok(await tryFetch<FindingsResponse>(path));
  } catch (e) {
    return fallback(filterFindings(query), e);
  }
}

export async function getFinding(id: string): Promise<ApiResult<FindingDetail>> {
  try {
    return ok(await tryFetch<FindingDetail>(`/api/findings/${id}`));
  } catch (e) {
    const detail = mockFindingDetail(id);
    if (!detail) throw e instanceof Error ? e : new Error("Not found");
    return fallback(detail, e);
  }
}

export async function reviewFinding(
  id: string,
  body: ReviewBody,
): Promise<ApiResult<ReviewResponse>> {
  try {
    // Backend expects EXACTLY { decision, reviewer_id, reviewer_role, reason }
    // with decision in the 4-value enum (e.g. "needs_more_information").
    return ok(
      await tryFetch<ReviewResponse>(`/api/findings/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    );
  } catch (e) {
    // In mock mode we simulate a successful local decision.
    return fallback(
      {
        finding_id: id,
        status: body.decision,
        required_reviewers_remaining: [],
        audit_id: "mock-audit",
      },
      e,
    );
  }
}

// Response shape of POST /api/demo/seed and /api/events/ingest (ARCHITECTURE.md §5).
export interface SeedResponse {
  accepted: number;
  created_findings: number;
  duplicate_events: number;
}

// "Run scan" — ingest a pool of fresh, construction-flavored cloud events into
// the live rule engine via POST /api/events/ingest (same {accepted,
// created_findings, duplicate_events} response shape as the seed endpoint).
// The events have STABLE event_id + resource_id, so the backend dedups by
// (resource_id, issue_type): the FIRST scan surfaces the whole pool and the
// dashboard visibly grows; repeat scans correctly report 0 new findings.
// Timestamps are stamped at call time (not module top) to avoid SSR/CSR
// hydration mismatch. In mock mode we report the pool size so the toast reads
// like a real first scan.
export async function runScan(): Promise<ApiResult<SeedResponse>> {
  const events = buildScanEvents(new Date().toISOString());
  try {
    return ok(
      await tryFetch<SeedResponse>("/api/events/ingest", {
        method: "POST",
        body: JSON.stringify({ events }),
      }),
    );
  } catch (e) {
    return fallback(
      {
        accepted: events.length,
        created_findings: events.length,
        duplicate_events: 0,
      },
      e,
    );
  }
}

export async function getAuditLogs(): Promise<ApiResult<AuditLog[]>> {
  try {
    // Backend returns a paginated envelope { items, page, page_size, total };
    // unwrap to the flat array the audit page consumes.
    const res = await tryFetch<AuditLogsResponse>("/api/audit-logs?page_size=100");
    return ok(res.items);
  } catch (e) {
    return fallback(MOCK_AUDIT_LOGS, e);
  }
}

// ---- Rules (SafeCloud Phase 1) ----

export async function getRules(): Promise<ApiResult<RuleListResponse>> {
  try {
    return ok(await tryFetch<RuleListResponse>("/api/rules"));
  } catch (e) {
    return fallback({ items: MOCK_RULES, total: MOCK_RULES.length }, e);
  }
}

export async function getRuleTemplates(): Promise<ApiResult<RuleTemplate[]>> {
  try {
    return ok(await tryFetch<RuleTemplate[]>("/api/rules/templates"));
  } catch (e) {
    return fallback(MOCK_RULE_TEMPLATES, e);
  }
}

export async function getClashes(): Promise<ApiResult<ClashWarning[]>> {
  try {
    return ok(await tryFetch<ClashWarning[]>("/api/rules/clashes"));
  } catch (e) {
    return fallback([], e);
  }
}

export async function createRule(body: RuleCreateBody): Promise<ApiResult<Rule>> {
  try {
    return ok(
      await tryFetch<Rule>("/api/rules", { method: "POST", body: JSON.stringify(body) }),
    );
  } catch (e) {
    // Mock mode: echo a fake created rule so the UI can optimistically render.
    return fallback(
      {
        ...body,
        rule_id: `rule-mock-${Math.abs(hashString(body.name))}`,
        enabled: body.enabled ?? true,
        template_key: body.template_key ?? "custom",
        severity_base: body.severity_base ?? "medium",
        escalate_in_prod: body.escalate_in_prod ?? false,
        rule_confidence: body.rule_confidence ?? 0.8,
        required_reviewers: body.required_reviewers ?? [],
        evidence_fields: body.evidence_fields ?? [],
        remediation_action_key: body.remediation_action_key ?? "tag_resource",
        remediation_destructive: body.remediation_destructive ?? false,
        agent_keys: body.agent_keys ?? [],
        created_at: new Date().toISOString(),
      } as Rule,
      e,
    );
  }
}

export async function updateRule(
  id: string,
  body: Partial<RuleCreateBody> & { enabled?: boolean },
): Promise<ApiResult<Rule | null>> {
  try {
    return ok(
      await tryFetch<Rule>(`/api/rules/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    );
  } catch (e) {
    return fallback(null, e);
  }
}

export async function deleteRule(id: string): Promise<ApiResult<boolean>> {
  try {
    await tryFetch<unknown>(`/api/rules/${id}`, { method: "DELETE" });
    return ok(true);
  } catch (e) {
    return fallback(false, e);
  }
}

export async function previewRule(body: {
  resource_type: string;
  conditions: { field: string; operator: string; value?: unknown }[];
}): Promise<ApiResult<RulePreviewResponse>> {
  try {
    return ok(
      await tryFetch<RulePreviewResponse>("/api/rules/preview", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  } catch (e) {
    return fallback({ match_count: 0, matched_resource_ids: [] }, e);
  }
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

// ---- Agents (SafeCloud Phase 2) ----

export async function getAgents(): Promise<ApiResult<AgentListResponse>> {
  try {
    return ok(await tryFetch<AgentListResponse>("/api/agents"));
  } catch (e) {
    return fallback({ items: MOCK_AGENTS, total: MOCK_AGENTS.length }, e);
  }
}

export async function getAgentTemplates(): Promise<ApiResult<AgentTemplate[]>> {
  try {
    return ok(await tryFetch<AgentTemplate[]>("/api/agents/templates"));
  } catch (e) {
    return fallback(MOCK_AGENT_TEMPLATES, e);
  }
}

export async function createAgent(body: AgentCreateBody): Promise<ApiResult<Agent>> {
  try {
    return ok(await tryFetch<Agent>("/api/agents", { method: "POST", body: JSON.stringify(body) }));
  } catch (e) {
    return fallback(
      {
        ...body,
        agent_id: `agent-mock-${Math.abs(hashString(body.name))}`,
        enabled: body.enabled ?? true,
        coverage_categories: body.coverage_categories ?? [],
        coverage_issue_types: body.coverage_issue_types ?? [],
        tone: body.tone ?? "concise",
        extra_focus: body.extra_focus ?? "",
        template_key: body.template_key ?? "custom",
        created_at: new Date().toISOString(),
      } as Agent,
      e,
    );
  }
}

export async function updateAgent(
  id: string,
  body: Partial<AgentCreateBody> & { enabled?: boolean },
): Promise<ApiResult<Agent | null>> {
  try {
    return ok(await tryFetch<Agent>(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
  } catch (e) {
    return fallback(null, e);
  }
}

export async function deleteAgent(id: string): Promise<ApiResult<boolean>> {
  try {
    await tryFetch<unknown>(`/api/agents/${id}`, { method: "DELETE" });
    return ok(true);
  } catch (e) {
    return fallback(false, e);
  }
}

export async function previewAgent(body: {
  lens: string;
  issue_type: string;
  tone: string;
  extra_focus: string;
}): Promise<ApiResult<AgentPreviewResponse>> {
  try {
    return ok(await tryFetch<AgentPreviewResponse>("/api/agents/preview", { method: "POST", body: JSON.stringify(body) }));
  } catch (e) {
    return fallback({ text: "Preview unavailable offline." }, e);
  }
}

// ---- Threats (SafeCloud Phase 3) ----

export async function getThreatReport(findingId: string): Promise<ApiResult<ThreatReport | null>> {
  try {
    return ok(await tryFetch<ThreatReport>(`/api/findings/${findingId}/threat-report`));
  } catch (e) {
    return fallback(MOCK_THREATS.find((t) => t.finding_id === findingId) ?? null, e);
  }
}

export async function generateThreatReport(findingId: string): Promise<ApiResult<ThreatReport | null>> {
  try {
    return ok(await tryFetch<ThreatReport>(`/api/findings/${findingId}/threat-report`, { method: "POST" }));
  } catch (e) {
    return fallback(MOCK_THREATS.find((t) => t.finding_id === findingId) ?? null, e);
  }
}

// ---- Agent online status (SafeCloud Phase 4) ----

export async function getAgentStatus(): Promise<ApiResult<AgentStatus>> {
  try {
    return ok(await tryFetch<AgentStatus>("/api/agent/status"));
  } catch (e) {
    return fallback({ online: false, last_seen: null, agent_id: null }, e);
  }
}

export const apiBaseConfigured = Boolean(BASE_URL);
export type { Finding, FindingDetail };
