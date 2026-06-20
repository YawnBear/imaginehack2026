// Shared domain types for GreenGuard Cloud frontend.

export type ResourceType = "bucket" | "vm" | "storage" | "database";
export type Category = "security" | "cost" | "energy" | "workflow" | "audit";
export type Severity = "critical" | "high" | "medium" | "low";
// Exact backend status enum (app/schemas + governance service).
export type FindingStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "deferred"
  | "needs_more_information"
  | "action_completed";

export type ReviewDecision =
  | "approved"
  | "rejected"
  | "deferred"
  | "needs_more_information";

export type RiskLevel = "low" | "medium" | "high";

// issue_type enum (backend, snake_case).
export type IssueType =
  | "public_bucket"
  | "idle_vm"
  | "unused_storage"
  | "unencrypted_database";

export interface Finding {
  finding_id: string;
  source_event_id: string;
  resource_id: string;
  resource_name?: string | null;
  resource_type: ResourceType;
  issue_type: string;
  category: Category;
  severity: Severity;
  status: FindingStatus;
  rule_id: string;
  evidence: Record<string, unknown>;
  rule_confidence: number; // 0-1
  ai_confidence: number; // 0-1
  required_reviewers: string[];
  owner_team?: string | null;
  // The backend does not send title/explanation; mock data may. Optional.
  title?: string;
  explanation?: string;
  created_at: string;
  updated_at: string;
}

export interface Recommendation {
  recommendation_id: string;
  finding_id: string;
  recommended_action: string;
  rationale: string;
  risk_level: RiskLevel | string;
  estimated_monthly_savings: number; // USD ($)
  estimated_carbon_reduction_kg: number; // kg CO2e / month
  confidence: number; // 0-1
  // Free-form, keyed by agent name (backend: lowercase security/cost/energy/workflow/audit).
  // Only the keys present should be rendered.
  agent_outputs: Record<string, string>;
  safe_to_execute: boolean;
  // True when the agent analysis text was rewritten by the external LLM
  // (hybrid AI layer). False/undefined = deterministic template text.
  ai_generated?: boolean;
  // One merged paragraph synthesizing every selected agent's analysis.
  // Empty string when the AI layer is off (or no agents ran).
  agent_summary?: string;
}

export interface AuditLog {
  audit_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface DashboardSummary {
  active_findings: number;
  critical_findings: number;
  pending_approvals: number;
  approved_actions: number;
  estimated_monthly_savings: number; // USD ($)
  estimated_carbon_reduction_kg: number; // kg CO2e / month
  latest_scan_at: string | null;
  findings_by_category: Record<string, number>;
  findings_by_severity: Record<string, number>;
}

// Matches backend FindingDetail exactly: a nested envelope, NOT a flat finding.
// GET /api/findings/{id} -> { finding, recommendation, approvals, audit_logs }
export interface ApprovalDecision {
  approval_id: string;
  finding_id: string;
  decision: ReviewDecision;
  reviewer_id: string;
  reviewer_role: string;
  reason: string;
  created_at: string;
}

export interface FindingDetail {
  finding: Finding;
  recommendation: Recommendation | null;
  approvals: ApprovalDecision[];
  audit_logs: AuditLog[];
}

export interface FindingsResponse {
  items: Finding[];
  page: number;
  page_size: number;
  total: number;
}

// GET /api/audit-logs returns a paginated envelope, NOT a bare array.
export interface AuditLogsResponse {
  items: AuditLog[];
  page: number;
  page_size: number;
  total: number;
}

// PATCH /api/findings/{id}/review response.
export interface ReviewResponse {
  finding_id: string;
  status: FindingStatus;
  required_reviewers_remaining: string[];
  audit_id: string;
}

export interface FindingsQuery {
  severity?: Severity;
  category?: Category;
  status?: FindingStatus;
  resource_type?: ResourceType;
  owner_team?: string;
  page?: number;
  page_size?: number;
}

export interface ReviewBody {
  decision: ReviewDecision;
  reviewer_id: string;
  reviewer_role: string;
  reason: string;
}

// ---- Custom Rules (SafeCloud Phase 1) ----
export type ConditionOperator =
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "in"
  | "not_in"
  | "exists"
  | "contains";

export interface RuleCondition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface Rule {
  rule_id: string;
  name: string;
  enabled: boolean;
  template_key: string;
  resource_type: ResourceType | null;
  conditions: RuleCondition[];
  severity_base: Severity;
  escalate_in_prod: boolean;
  rule_confidence: number;
  category: Category;
  issue_type: string;
  required_reviewers: string[];
  evidence_fields: string[];
  remediation_action_key: string;
  remediation_destructive: boolean;
  agent_keys: string[];
  created_at: string;
}

export interface RuleListResponse {
  items: Rule[];
  total: number;
}

export interface RuleTemplate {
  template_key: string;
  name: string;
  description: string;
  resource_type: ResourceType;
  conditions: RuleCondition[];
  severity_base: Severity;
  escalate_in_prod: boolean;
  rule_confidence: number;
  category: Category;
  issue_type: string;
  required_reviewers: string[];
  evidence_fields: string[];
  remediation_action_key: string;
  remediation_destructive: boolean;
}

export interface ClashWarning {
  rule_id_a: string;
  rule_id_b: string;
  resource_type: string;
  field: string;
  message: string;
}

export interface RuleCreateBody {
  name: string;
  resource_type?: ResourceType;
  issue_type: string;
  category: Category;
  conditions: RuleCondition[];
  enabled?: boolean;
  template_key?: string;
  severity_base?: Severity;
  escalate_in_prod?: boolean;
  rule_confidence?: number;
  required_reviewers?: string[];
  evidence_fields?: string[];
  remediation_action_key?: string;
  remediation_destructive?: boolean;
  agent_keys?: string[];
}

export interface RulePreviewResponse {
  match_count: number;
  matched_resource_ids: string[];
}

// ---- Custom Agents (SafeCloud Phase 2) ----
export interface Agent {
  agent_id: string;
  name: string;
  system_prompt: string;
  output_key: string;
  enabled: boolean;
  created_at: string;
}

export interface AgentListResponse {
  items: Agent[];
  total: number;
}

export interface AgentCreateBody {
  name: string;
  system_prompt: string;
  enabled?: boolean;
}

// ---- Threats (SafeCloud Phase 3) ----
export interface TimelineEntry {
  actor: string;
  action: string;
  target_resource_id: string;
  timestamp: string;
  note: string;
}

export interface ThreatReport {
  report_id: string;
  finding_id: string;
  criticality_score: number;
  criticality_factors: Record<string, number>;
  summary: string;
  timeline: TimelineEntry[];
  recommended_solution: string;
  agent_sections: Record<string, string>;
  approval_status: string;
  ai_generated: boolean;
  generated_at: string;
}

export interface ThreatListResponse {
  items: ThreatReport[];
  total: number;
}

// ---- Agent online status (SafeCloud Phase 4) ----
export interface AgentStatus {
  online: boolean;
  last_seen: string | null;
  agent_id: string | null;
}

// ---- Workflows (SafeCloud Phase 7b) ----
export interface WorkflowRun {
  ran_at: string | null;
  finding_count: number;
  summary: string;
  agent_outputs: Record<string, string>;
  ai_generated: boolean;
}

export interface Workflow {
  workflow_id: string;
  name: string;
  rule_id: string;
  agent_keys: string[];
  created_at: string;
  last_run: WorkflowRun | null;
}

export interface WorkflowCreateBody {
  name: string;
  rule_id: string;
  agent_keys: string[];
}

export interface WorkflowListResponse {
  items: Workflow[];
  total: number;
}

export interface WorkflowRunAllResponse {
  scanned_findings: number;
  workflows: Workflow[];
}
