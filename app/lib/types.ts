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
