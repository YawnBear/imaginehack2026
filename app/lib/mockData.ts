import type {
  Agent,
  AuditLog,
  DashboardSummary,
  Finding,
  FindingDetail,
  Rule,
  RuleTemplate,
  ThreatReport,
} from "./types";

export const MOCK_FINDINGS: Finding[] = [];
export const MOCK_AUDIT_LOGS: AuditLog[] = [];

export const MOCK_SUMMARY: DashboardSummary = {
  active_findings: 0,
  critical_findings: 0,
  pending_approvals: 0,
  approved_actions: 0,
  estimated_monthly_savings: 0,
  estimated_carbon_reduction_kg: 0,
  latest_scan_at: null,
  findings_by_category: {},
  findings_by_severity: {},
};

export function mockFindingDetail(id: string): FindingDetail | null {
  void id;
  return null;
}

export const MOCK_RULES: Rule[] = [];
export const MOCK_RULE_TEMPLATES: RuleTemplate[] = [];
export const MOCK_AGENTS: Agent[] = [];
export const MOCK_THREATS: ThreatReport[] = [];
