"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { DashboardSummary, Finding, FindingStatus, Severity } from "@/app/lib/types";
import { issueLabel, relativeTime } from "@/app/lib/format";
import { EmptyState, MockBanner, SeverityBadge, StatusBadge } from "./ui";
import { IconAlert, IconCheck, IconClock, IconLeaf, IconSearch, IconSecurity } from "./icons";
import FindingModal from "./FindingModal";
import AIAgentMascot, { type AIAgentState } from "./assistant/AIAgentMascot";
import { AnimatedCarbonLine, AnimatedCategoryPie } from "./DashboardCharts";

type Filters = { severity: string; category: string; status: string; provider: string; search: string };
type DashboardCardProps = { title: string; icon: ReactNode; children: ReactNode; onClick?: () => void; hint?: string };

const INITIAL_FILTERS: Filters = { severity: "all", category: "all", status: "all", provider: "all", search: "" };
const ACTIVE_STATUSES: FindingStatus[] = ["pending_review", "deferred", "needs_more_information"];
const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

function DashboardCard({ title, icon, children, onClick, hint }: DashboardCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{title}</p>
        <span className="text-muted">{icon}</span>
      </div>
      <div className="mt-2.5">{children}</div>
      {hint && <p className="mt-1.5 text-[10px] text-muted">{hint}</p>}
    </>
  );
  const classes = "h-full w-full overflow-hidden rounded-xl border border-border bg-surface-subtle p-3.5 text-left transition hover:border-[var(--color-link-border)] hover:bg-surface";
  return onClick ? <button type="button" onClick={onClick} className={classes}>{content}</button> : <article className={classes}>{content}</article>;
}

function categoryName(finding: Finding): string {
  const names: Record<string, string> = {
    public_bucket: "Access Risk",
    idle_vm: "Idle VM",
    unused_storage: "Unused Storage",
    unencrypted_database: "Unencrypted Database",
  };
  return names[finding.issue_type] ?? (finding.category === "security" ? "Security Misconfiguration" : issueLabel(finding.issue_type));
}

function providerOf(finding: Finding): string {
  const raw = String(finding.evidence?.cloud_provider ?? finding.evidence?.provider ?? "Cloud");
  return raw === "Cloud" ? "Cloud" : raw.toUpperCase();
}

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <label className="min-w-[140px] flex-1 sm:flex-none">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-canvas px-3 text-[13px] text-ink outline-none focus:border-ink">
        <option value="all">All {label.toLowerCase()}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function AIAgentInsight({ state, recommendations, onClose }: { state: AIAgentState; recommendations: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close AI insight panel" onClick={onClose} className="absolute inset-0 gg-scrim" />
      <aside className="gg-fade-up relative h-full w-full max-w-[480px] overflow-y-auto bg-canvas p-6 shadow-[var(--shadow-e3)]">
        <div className="flex items-start justify-between">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">AI agent insight</p><h2 className="mt-1 text-[24px] font-semibold text-ink">Cloud posture brief</h2></div>
          <button onClick={onClose} className="rounded-full border border-border px-3 py-1.5 text-[12px] text-ink">Close</button>
        </div>
        <div className="mt-6 flex items-center gap-4 rounded-2xl bg-surface-subtle p-4"><AIAgentMascot state={state} collapsed color="green" /><div><p className="font-semibold capitalize text-ink">{state.replace(/_/g, " ")}</p><p className="mt-1 text-[12px] text-muted">{recommendations} recommendations generated</p></div></div>
        <div className="mt-6 space-y-5">
          <section><h3 className="text-[13px] font-semibold text-ink">Latest AI summary</h3><p className="mt-2 text-[13px] leading-6 text-muted">The latest scan found concentrated security exposure alongside idle infrastructure that can be reviewed for carbon and cost reduction.</p></section>
          <section><h3 className="text-[13px] font-semibold text-ink">Detected risks</h3><p className="mt-2 text-[13px] leading-6 text-muted">Public access, missing encryption, and resources awaiting owner validation remain the highest-priority review areas.</p></section>
          <section><h3 className="text-[13px] font-semibold text-ink">Sustainability opportunities</h3><p className="mt-2 text-[13px] leading-6 text-muted">Idle compute and unused storage are the clearest opportunities to reduce estimated monthly cloud emissions.</p></section>
          <section><h3 className="text-[13px] font-semibold text-ink">Recommendations</h3><p className="mt-2 text-[13px] leading-6 text-muted">Review each recommendation with the assigned cloud owner before approving any remediation.</p></section>
          <div className="rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-warning-tint)] p-4 text-[13px] leading-5 text-[var(--color-warning-strong)]"><strong>Human review is required.</strong> The AI agent will not apply any cloud action without explicit approval.</div>
        </div>
      </aside>
    </div>
  );
}

export default function DashboardOverview({ summary, findings, carbonHistory, usingMock, renderedAt, mockReason }: { summary: DashboardSummary; findings: Finding[]; carbonHistory: number[]; usingMock: boolean; renderedAt: string; mockReason?: string }) {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [openFinding, setOpenFinding] = useState<string | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const agentState: AIAgentState = summary.pending_approvals > 0 ? "waiting_for_review" : "success";
  const active = findings.filter((finding) => ACTIVE_STATUSES.includes(finding.status));
  const providerOptions = Array.from(new Set(findings.map(providerOf))).sort();
  const categories = ["Security Misconfiguration", "Idle VM", "Unused Storage", "Unencrypted Database", "Access Risk"];
  const categoryCounts = Object.fromEntries(categories.map((name) => [name, findings.filter((finding) => categoryName(finding) === name).length]));
  const categoryChartData = categories.map((label, index) => ({ label, value: categoryCounts[label], color: ["var(--color-danger)", "var(--color-warning)", "var(--color-link)", "var(--color-success)", "var(--color-muted)"][index] }));
  const unresolvedPriority = findings.filter((finding) => (finding.severity === "critical" || finding.severity === "high") && ACTIVE_STATUSES.includes(finding.status));
  const carbonReductionLabel = summary.estimated_carbon_reduction_kg.toLocaleString("en-US");
  const dashboardAgents = [
    { name: "Security", state: summary.critical_findings > 0 ? "alert" : "success", color: "orange", status: summary.critical_findings > 0 ? `${summary.critical_findings} critical` : "Clear" },
    { name: "Workflow", state: summary.pending_approvals > 0 ? "waiting_for_review" : "success", color: "blue", status: summary.pending_approvals > 0 ? `${summary.pending_approvals} waiting` : "Clear" },
    { name: "Energy", state: "success", color: "green", status: `${carbonReductionLabel} kg` },
  ] as const;

  const filtered = useMemo(() => findings.filter((finding) => {
    const query = filters.search.trim().toLowerCase();
    return (filters.severity === "all" || (filters.severity === "priority" ? finding.severity === "critical" || finding.severity === "high" : finding.severity === filters.severity))
      && (filters.category === "all" || categoryName(finding) === filters.category)
      && (filters.status === "all" || (filters.status === "active" ? ACTIVE_STATUSES.includes(finding.status) : finding.status === filters.status))
      && (filters.provider === "all" || providerOf(finding) === filters.provider)
      && (!query || [finding.title, finding.finding_id, finding.resource_id, finding.resource_name, issueLabel(finding.issue_type)].filter(Boolean).join(" ").toLowerCase().includes(query));
  }), [findings, filters]);

  function applyFilters(next: Partial<Filters>) { setFilters({ ...INITIAL_FILTERS, ...next }); }

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-104px)] lg:overflow-hidden">
      {usingMock && <MockBanner reason={mockReason} />}

      <section className="grid shrink-0 gap-3 lg:h-[126px] lg:grid-cols-3">
        <DashboardCard title="Carbon emissions" icon={<IconLeaf width={16} height={16} />}><div className="flex items-center gap-3"><div className="shrink-0"><div className="flex items-end gap-1"><strong className="text-[24px] leading-none text-ink">{carbonReductionLabel}</strong><span className="text-[9px] text-muted">kgCO₂e</span></div><p className="mt-1 text-[9px] text-[var(--color-success)]">This month · estimated</p></div><AnimatedCarbonLine values={carbonHistory} /></div></DashboardCard>
        <DashboardCard title="Findings summary" icon={<IconAlert width={16} height={16} />} onClick={() => applyFilters({ status: "active" })}><div className="flex items-end justify-between gap-3"><div><strong className="text-[27px] leading-none text-ink">{active.length}</strong><p className="text-[10px] text-muted">active findings</p></div><div className="grid grid-cols-4 gap-3">{SEVERITIES.map((severity) => <span key={severity} className="text-center text-[9px] capitalize text-muted"><strong className="block text-[14px] text-ink">{active.filter((finding) => finding.severity === severity).length}</strong>{severity}</span>)}</div></div></DashboardCard>
        <DashboardCard title="Findings by category" icon={<IconSecurity width={16} height={16} />}><AnimatedCategoryPie data={categoryChartData} onSelect={(category) => applyFilters({ category })} /></DashboardCard>
      </section>

      <section className="grid shrink-0 gap-3 lg:h-[112px] lg:grid-cols-3">
        <DashboardCard title="AI agent status" icon={<span className="text-[10px] text-muted">View insights</span>} onClick={() => setAgentOpen(true)}><div className="grid grid-cols-3 gap-2">{dashboardAgents.map((agent) => <span key={agent.name} className="flex min-w-0 items-center gap-1.5 rounded-lg bg-canvas/70 px-1.5 py-1"><span className="h-7 w-7 shrink-0 overflow-hidden rounded-full [&>div]:!h-7 [&>div]:!w-7"><AIAgentMascot state={agent.state} collapsed color={agent.color} /></span><span className="min-w-0"><strong className="block truncate text-[10px] text-ink">{agent.name}</strong><span className="block truncate text-[9px] text-muted">{agent.status}</span></span></span>)}</div></DashboardCard>
        <DashboardCard title="Scan status" icon={<IconCheck width={16} height={16} />}><div className="flex items-center justify-between"><div><strong className="text-[15px] text-ink">Scan complete</strong><p className="mt-1 text-[10px] text-muted">{summary.latest_scan_at ? relativeTime(summary.latest_scan_at, renderedAt) : "—"}</p></div><p className="text-right text-[10px] text-muted"><strong className="block text-[15px] text-ink">{Number(findings[0]?.evidence?.assets_scanned ?? 412)}</strong>assets scanned</p></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-surface"><div className="h-full w-full bg-[var(--color-success)]" /></div></DashboardCard>
        <DashboardCard title="Actions required" icon={<IconClock width={16} height={16} />} onClick={() => applyFilters({ severity: "priority", status: "active" })}><div className="flex items-center justify-between"><div><strong className="text-[25px] leading-none text-ink">{unresolvedPriority.length}</strong><p className="text-[10px] text-muted">require user action</p></div><div className="flex gap-4 text-center text-[9px] text-muted"><span><strong className="block text-[14px] text-ink">{unresolvedPriority.filter((f) => f.severity === "critical").length}</strong>Critical</span><span><strong className="block text-[14px] text-ink">{unresolvedPriority.filter((f) => f.severity === "high").length}</strong>High</span><span><strong className="block text-[14px] text-ink">{summary.pending_approvals}</strong>Approval</span></div></div></DashboardCard>
      </section>

      <section className="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface-subtle p-3 lg:min-h-0">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3"><div className="flex items-baseline gap-3"><h2 className="text-[17px] font-semibold text-ink">Threats and findings</h2><p className="text-[11px] text-muted">{filtered.length} shown · {summary.critical_findings} critical · {active.length} active · {summary.pending_approvals} pending</p></div><button onClick={() => setFilters(INITIAL_FILTERS)} className="text-[11px] font-medium text-[var(--color-link)]">Clear filters</button></div>
        <div className="mt-2 flex shrink-0 flex-wrap gap-2">
          <SelectFilter label="Severity" value={filters.severity} options={[...SEVERITIES.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })), { value: "priority", label: "Critical + High" }]} onChange={(severity) => setFilters((current) => ({ ...current, severity }))} />
          <SelectFilter label="Category" value={filters.category} options={categories.map((value) => ({ value, label: value }))} onChange={(category) => setFilters((current) => ({ ...current, category }))} />
          <SelectFilter label="Status" value={filters.status} options={[{ value: "active", label: "Active" }, ...["pending_review", "approved", "deferred", "needs_more_information", "action_completed"].map((value) => ({ value, label: value.replace(/_/g, " ") }))]} onChange={(status) => setFilters((current) => ({ ...current, status }))} />
          <SelectFilter label="Cloud provider" value={filters.provider} options={providerOptions.map((value) => ({ value, label: value }))} onChange={(provider) => setFilters((current) => ({ ...current, provider }))} />
          <label className="relative min-w-[210px] flex-[2]"><span className="sr-only">Search findings</span><IconSearch width={16} height={16} className="absolute left-3 top-3 text-muted" /><input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search findings or resources" className="h-10 w-full rounded-lg border border-border bg-canvas pl-9 pr-3 text-[13px] text-ink outline-none focus:border-ink" /></label>
        </div>
        <div className="mt-2 min-h-0 flex-1 overflow-auto">{filtered.length === 0 ? <EmptyState /> : <table className="w-full min-w-[980px] border-collapse text-left"><thead className="sticky top-0 z-10 bg-surface-subtle"><tr className="border-b border-border text-[10px] uppercase tracking-[0.1em] text-muted"><th className="px-3 py-2 font-medium">Severity / finding</th><th className="px-3 py-2 font-medium">Affected resource</th><th className="px-3 py-2 font-medium">Category</th><th className="px-3 py-2 font-medium">Carbon impact</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Detected</th><th className="px-3 py-2 font-medium">Action</th></tr></thead><tbody>{filtered.map((finding) => <tr key={finding.finding_id} className="border-b border-border/70 text-[11px] last:border-0 hover:bg-surface"><td className="px-3 py-2"><div className="flex items-center gap-2"><SeverityBadge severity={finding.severity} /><p className="max-w-[220px] truncate font-medium text-ink">{finding.title ?? issueLabel(finding.issue_type)}</p></div></td><td className="px-3 py-2"><p className="max-w-[210px] truncate font-mono text-[10px] text-ink">{finding.resource_name ?? finding.resource_id}</p><p className="text-[9px] text-muted">{providerOf(finding)}</p></td><td className="px-3 py-2 text-muted">{categoryName(finding)}</td><td className="px-3 py-2 text-muted">{finding.category === "energy" || finding.issue_type === "idle_vm" || finding.issue_type === "unused_storage" ? "Applicable" : "—"}</td><td className="px-3 py-2"><StatusBadge status={finding.status} /></td><td className="px-3 py-2 text-muted">{relativeTime(finding.created_at, renderedAt)}</td><td className="px-3 py-2"><button onClick={() => setOpenFinding(finding.finding_id)} className="rounded-full bg-action px-2.5 py-1 text-[10px] font-medium text-on-action">Review</button></td></tr>)}</tbody></table>}</div>
      </section>
      {openFinding && <FindingModal findingId={openFinding} onClose={() => setOpenFinding(null)} />}
      {agentOpen && <AIAgentInsight state={agentState} recommendations={findings.length} onClose={() => setAgentOpen(false)} />}
    </div>
  );
}
