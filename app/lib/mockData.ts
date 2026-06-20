// Rich, construction-flavored mock seed data so the entire UI renders
// as a complete, clickable demo with ZERO backend.

import type {
  Agent,
  AgentTemplate,
  AuditLog,
  DashboardSummary,
  Finding,
  FindingDetail,
  Recommendation,
  ResponsePolicy,
  Rule,
  RuleTemplate,
  ThreatReport,
} from "./types";

const now = new Date("2026-06-20T08:42:00+08:00");
function iso(minutesAgo: number): string {
  return new Date(now.getTime() - minutesAgo * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
// Findings (the four canonical ones + a few extras for richer panels)
// ---------------------------------------------------------------------------

export const MOCK_FINDINGS: Finding[] = [
  {
    finding_id: "FND-1042",
    source_event_id: "EVT-scan-20260620-0007",
    resource_id: "gs://acme-project-drawings",
    resource_type: "bucket",
    issue_type: "Public object storage bucket",
    category: "security",
    severity: "critical",
    status: "pending_review",
    rule_id: "SEC-PUBLIC-BUCKET",
    title: "Project Drawings Bucket is publicly readable",
    explanation:
      "The bucket holding architectural drawings, BIM models and tender documents for the Klang Valley LRT3 package is configured allUsers:READ. Anyone with the URL can download confidential construction IP.",
    evidence: {
      iam_binding: "allUsers:roles/storage.objectViewer",
      public_objects: 4127,
      contains: ["IFC/BIM models", "tender PDFs", "structural drawings"],
      last_public_access: "2026-06-19T22:11:00+08:00",
      region: "asia-southeast1",
    },
    rule_confidence: 0.99,
    ai_confidence: 0.94,
    required_reviewers: ["Security Lead", "Project Director"],
    owner_team: "Infra / DevOps",
    created_at: iso(38),
    updated_at: iso(12),
  },
  {
    finding_id: "FND-1043",
    source_event_id: "EVT-scan-20260620-0011",
    resource_id: "sql://site-progress-db-prod",
    resource_type: "database",
    issue_type: "Unencrypted database at rest",
    category: "security",
    severity: "high",
    status: "pending_review",
    rule_id: "SEC-DB-NO-ENCRYPTION",
    title: "Site Progress database stored without encryption at rest",
    explanation:
      "The production database tracking site progress, worker attendance and subcontractor payments has customer-managed encryption disabled. Sensitive payroll and progress data sits unencrypted on disk.",
    evidence: {
      encryption_at_rest: false,
      tables: ["worker_attendance", "subcontractor_payments", "site_progress"],
      records: 1840221,
      pii_present: true,
      region: "asia-southeast1",
    },
    rule_confidence: 0.97,
    ai_confidence: 0.9,
    required_reviewers: ["Security Lead", "Data Protection Officer"],
    owner_team: "Platform",
    created_at: iso(33),
    updated_at: iso(33),
  },
  {
    finding_id: "FND-1044",
    source_event_id: "EVT-scan-20260620-0019",
    resource_id: "vm://bim-render-node-07",
    resource_type: "vm",
    issue_type: "Idle compute instance",
    category: "cost",
    severity: "medium",
    status: "pending_review",
    rule_id: "COST-IDLE-VM",
    title: "BIM render node idle for 11 days on a live project",
    explanation:
      "The BIM coordination render node provisioned for the Penang Coastal Highway package has sat at <2% CPU for 11 days. The clash-detection runs finished sprint 14; the instance was never deprovisioned.",
    evidence: {
      avg_cpu_7d: "1.8%",
      avg_network_7d: "0.3 MB/s",
      idle_days: 11,
      machine_type: "n2-highmem-16",
      project: "Penang Coastal Highway - BIM",
      region: "asia-southeast1",
    },
    rule_confidence: 0.95,
    ai_confidence: 0.88,
    required_reviewers: ["FinOps Lead", "BIM Coordinator"],
    owner_team: "BIM / VDC",
    created_at: iso(31),
    updated_at: iso(31),
  },
  {
    finding_id: "FND-1045",
    source_event_id: "EVT-scan-20260620-0024",
    resource_id: "gs://drone-survey-coldline-2024",
    resource_type: "storage",
    issue_type: "Unused / orphaned storage",
    category: "cost",
    severity: "low",
    status: "pending_review",
    explanation:
      "2.4 TB of 2024 drone survey footage and orthomosaics from a completed earthworks package has had zero reads in 240 days but sits on standard (hot) storage instead of archive.",
    evidence: {
      size_tb: 2.4,
      last_access_days: 240,
      storage_class: "STANDARD",
      contains: ["drone orthomosaics", "point clouds", "raw site video"],
      project: "Johor Industrial Park - Earthworks (closed)",
      region: "asia-southeast1",
    },
    rule_id: "COST-UNUSED-STORAGE",
    title: "2.4 TB of 2024 drone footage never archived",
    rule_confidence: 0.93,
    ai_confidence: 0.86,
    required_reviewers: ["FinOps Lead"],
    owner_team: "Survey / GIS",
    created_at: iso(28),
    updated_at: iso(28),
  },
  {
    finding_id: "FND-1046",
    source_event_id: "EVT-scan-20260620-0031",
    resource_id: "vm://site-iot-gateway-kl-03",
    resource_type: "vm",
    issue_type: "Over-provisioned instance",
    category: "energy",
    severity: "medium",
    status: "approved",
    explanation:
      "The site IoT ingestion gateway for the KL site sensors is sized for 64 vCPU but peaks at 6%. Right-sizing cuts both spend and energy draw with no telemetry loss.",
    evidence: {
      peak_cpu_30d: "6%",
      machine_type: "c3-standard-64",
      suggested_type: "c3-standard-8",
      ingest_rate: "120 msg/s",
      region: "asia-southeast1",
    },
    rule_id: "ENERGY-OVERSIZED-VM",
    title: "Site IoT gateway over-provisioned at 64 vCPU (6% peak)",
    rule_confidence: 0.91,
    ai_confidence: 0.83,
    required_reviewers: ["FinOps Lead", "IoT Platform Owner"],
    owner_team: "Site Systems",
    created_at: iso(190),
    updated_at: iso(95),
  },
  {
    finding_id: "FND-1047",
    source_event_id: "EVT-scan-20260620-0036",
    resource_id: "gs://tender-archive-public",
    resource_type: "bucket",
    issue_type: "Overly broad IAM on storage",
    category: "security",
    severity: "high",
    status: "deferred",
    explanation:
      "The tender archive bucket grants write to allAuthenticatedUsers, allowing any Google account to upload or overwrite tender response documents.",
    evidence: {
      iam_binding: "allAuthenticatedUsers:roles/storage.objectAdmin",
      writable_by: "any authenticated Google account",
      region: "asia-southeast1",
    },
    rule_id: "SEC-BROAD-IAM",
    title: "Tender archive bucket writable by any Google account",
    rule_confidence: 0.96,
    ai_confidence: 0.89,
    required_reviewers: ["Security Lead"],
    owner_team: "Commercial / Tender",
    created_at: iso(220),
    updated_at: iso(140),
  },
];

// ---------------------------------------------------------------------------
// Recommendations (one per finding, with all 5 agent outputs)
// ---------------------------------------------------------------------------

export const MOCK_RECOMMENDATIONS: Record<string, Recommendation> = {
  "FND-1042": {
    recommendation_id: "REC-1042",
    finding_id: "FND-1042",
    recommended_action:
      "Remove the allUsers:objectViewer IAM binding and replace with signed-URL access scoped to the LRT3 project group.",
    rationale:
      "Confidential BIM and tender IP must never be world-readable. Signed URLs preserve contractor download workflows while closing public exposure. No data is deleted — only the public grant is revoked.",
    risk_level: "low",
    estimated_monthly_savings: 0,
    estimated_carbon_reduction_kg: 0,
    confidence: 0.94,
    safe_to_execute: false,
    agent_outputs: {
      security:
        "Public read on 4,127 confidential objects is a critical IP-leak path. Revoke allUsers and enforce uniform bucket-level access. Severity: critical.",
      cost: "No direct spend impact; this is a security remediation, not a cost play.",
      energy:
        "Negligible energy change. Egress from public scraping may drop slightly after lockdown.",
      workflow:
        "Contractors currently use raw URLs. Migrate them to time-boxed signed URLs via the existing drawings portal — minimal disruption.",
      audit:
        "Records a SEC-PUBLIC-BUCKET violation on the LRT3 package. Recommend evidencing the fix for the client's ISO 27001 pack.",
    },
  },
  "FND-1043": {
    recommendation_id: "REC-1043",
    finding_id: "FND-1043",
    recommended_action:
      "Enable customer-managed encryption at rest (CMEK) on site-progress-db-prod and rotate to a KMS-backed key.",
    rationale:
      "Payroll and attendance PII for site workers must be encrypted at rest to meet PDPA obligations. CMEK is transparent to the application and requires no schema change.",
    risk_level: "medium",
    estimated_monthly_savings: 0,
    estimated_carbon_reduction_kg: 0,
    confidence: 0.9,
    safe_to_execute: false,
    agent_outputs: {
      security:
        "1.84M records including subcontractor payments sit unencrypted. Enable CMEK and confirm KMS key rotation. Severity: high.",
      cost: "KMS adds ~$12/mo in key operations — immaterial against the compliance exposure.",
      energy: "No measurable energy impact from enabling encryption.",
      workflow:
        "Encryption enablement needs a brief maintenance window; coordinate with the site-progress reporting batch (runs 02:00).",
      audit:
        "Closes a PDPA gap. Recommend attaching the KMS key id to the data-protection register.",
    },
  },
  "FND-1044": {
    recommendation_id: "REC-1044",
    finding_id: "FND-1044",
    recommended_action:
      "Stop and deallocate bim-render-node-07; snapshot the disk first so the clash-detection environment can be restored on demand.",
    rationale:
      "The render node finished its sprint-14 clash runs and has been <2% CPU for 11 days. Snapshot-then-stop keeps the environment recoverable while ending the idle spend and the idle energy draw.",
    risk_level: "low",
    estimated_monthly_savings: 1480,
    estimated_carbon_reduction_kg: 96,
    confidence: 0.88,
    safe_to_execute: false,
    agent_outputs: {
      security:
        "Stopping the node reduces attack surface. No data loss — disk is snapshotted first.",
      cost: "n2-highmem-16 idle 24/7 ≈ $1,480/mo. Snapshot storage is ~$35/mo. Net saving ~$1,445/mo.",
      energy:
        "Estimated ~96 kg CO₂e/mo avoided (≈ 240 kWh × asia-southeast1 grid intensity ~0.40 kg/kWh).",
      workflow:
        "Notify the BIM coordinator; the node can be restarted from snapshot within ~8 min for the next clash sprint.",
      audit:
        "Logs an idle-VM remediation against the Penang Coastal Highway BIM project for the FinOps review.",
    },
  },
  "FND-1045": {
    recommendation_id: "REC-1045",
    finding_id: "FND-1045",
    recommended_action:
      "Transition the 2.4 TB drone survey dataset from STANDARD to ARCHIVE storage class with a lifecycle rule.",
    rationale:
      "Zero reads in 240 days on a closed earthworks package. Archive class keeps the footage retrievable for warranty/claims while cutting storage cost ~95%.",
    risk_level: "low",
    estimated_monthly_savings: 410,
    estimated_carbon_reduction_kg: 22,
    confidence: 0.86,
    safe_to_execute: false,
    agent_outputs: {
      security:
        "No security change; data stays within the same project and access policy.",
      cost: "2.4 TB STANDARD ≈ $432/mo vs ARCHIVE ≈ $22/mo. Net saving ~$410/mo.",
      energy:
        "Cold/archive tiers draw less continuous power. Est. ~22 kg CO₂e/mo avoided.",
      workflow:
        "Add a lifecycle rule so future drone footage auto-tiers after 90 days of no access.",
      audit:
        "Records the tiering against the closed Johor Industrial Park package; retrieval SLA changes to hours — confirm with claims team.",
    },
  },
  "FND-1046": {
    recommendation_id: "REC-1046",
    finding_id: "FND-1046",
    recommended_action:
      "Right-size site-iot-gateway-kl-03 from c3-standard-64 to c3-standard-8.",
    rationale:
      "Peak CPU over 30 days is 6%. An 8-vCPU instance comfortably handles the 120 msg/s ingest with headroom, cutting spend and energy with no telemetry loss.",
    risk_level: "low",
    estimated_monthly_savings: 920,
    estimated_carbon_reduction_kg: 58,
    confidence: 0.83,
    safe_to_execute: false,
    agent_outputs: {
      security: "No security impact; same network and firewall posture.",
      cost: "Downsizing 64→8 vCPU saves ~$920/mo.",
      energy:
        "Smaller instance draws materially less power — est. ~58 kg CO₂e/mo avoided.",
      workflow:
        "Apply during the nightly low-ingest window; the gateway buffers via the message queue during the brief restart.",
      audit: "Approved on 2026-06-20 — see audit trail for reviewer sign-offs.",
    },
  },
  "FND-1047": {
    recommendation_id: "REC-1047",
    finding_id: "FND-1047",
    recommended_action:
      "Revoke allAuthenticatedUsers:objectAdmin on the tender archive and grant write only to the commercial team group.",
    rationale:
      "Any Google account can currently overwrite tender responses — an integrity and tender-fraud risk. Scope write to the named commercial group.",
    risk_level: "medium",
    estimated_monthly_savings: 0,
    estimated_carbon_reduction_kg: 0,
    confidence: 0.89,
    safe_to_execute: false,
    agent_outputs: {
      security:
        "World-writable tender archive is a high-severity integrity risk. Scope to commercial@ group. Severity: high.",
      cost: "No spend impact.",
      energy: "No measurable energy impact.",
      workflow:
        "Deferred pending the commercial team's confirmation of which accounts need upload during the live tender window.",
      audit:
        "Deferral recorded; re-review scheduled after the tender close date.",
    },
  },
};

// ---------------------------------------------------------------------------
// Audit logs (scan -> finding -> recommendation -> approval -> action)
// ---------------------------------------------------------------------------

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    audit_id: "AUD-9001",
    entity_type: "scan_event",
    entity_id: "EVT-scan-20260620-0007",
    action: "scan.completed",
    actor_id: "scanner:greenguard-agent",
    before_state: null,
    after_state: { events_emitted: 31, resources_scanned: 412 },
    metadata: { region: "asia-southeast1", duration_s: 47 },
    created_at: iso(40),
  },
  {
    audit_id: "AUD-9002",
    entity_type: "finding",
    entity_id: "FND-1042",
    action: "finding.created",
    actor_id: "rule:SEC-PUBLIC-BUCKET",
    before_state: null,
    after_state: { severity: "critical", status: "open" },
    metadata: { resource: "gs://acme-project-drawings" },
    created_at: iso(38),
  },
  {
    audit_id: "AUD-9003",
    entity_type: "recommendation",
    entity_id: "REC-1042",
    action: "recommendation.generated",
    actor_id: "agent:security",
    before_state: null,
    after_state: { recommended_action: "Revoke public IAM binding", confidence: 0.94 },
    metadata: { finding_id: "FND-1042" },
    created_at: iso(36),
  },
  {
    audit_id: "AUD-9004",
    entity_type: "finding",
    entity_id: "FND-1046",
    action: "review.approved",
    actor_id: "user:finops-lead",
    before_state: { status: "pending" },
    after_state: { status: "approved", safe_to_execute: true },
    metadata: {
      decision: "approved",
      reviewer_role: "FinOps Lead",
      reason: "Headroom confirmed with IoT owner; right-size approved.",
    },
    created_at: iso(95),
  },
  {
    audit_id: "AUD-9005",
    entity_type: "resource",
    entity_id: "vm://site-iot-gateway-kl-03",
    action: "remediation.applied",
    actor_id: "operator:platform-eng",
    before_state: { machine_type: "c3-standard-64" },
    after_state: { machine_type: "c3-standard-8" },
    metadata: { saving_rm: 920, carbon_kg: 58, approved_via: "FND-1046" },
    created_at: iso(80),
  },
  {
    audit_id: "AUD-9006",
    entity_type: "finding",
    entity_id: "FND-1047",
    action: "review.deferred",
    actor_id: "user:security-lead",
    before_state: { status: "pending" },
    after_state: { status: "deferred" },
    metadata: {
      decision: "deferred",
      reviewer_role: "Security Lead",
      reason: "Re-review after tender close; commercial team needs upload access meanwhile.",
    },
    created_at: iso(140),
  },
  {
    audit_id: "AUD-9007",
    entity_type: "finding",
    entity_id: "FND-1043",
    action: "finding.created",
    actor_id: "rule:SEC-DB-NO-ENCRYPTION",
    before_state: null,
    after_state: { severity: "high", status: "open" },
    metadata: { resource: "sql://site-progress-db-prod" },
    created_at: iso(33),
  },
];

// ---------------------------------------------------------------------------
// Dashboard summary (derived to stay consistent with the findings above)
// ---------------------------------------------------------------------------

function buildSummary(): DashboardSummary {
  const active = MOCK_FINDINGS.filter(
    (f) => f.status !== "rejected" && f.status !== "approved",
  ).length;
  const critical = MOCK_FINDINGS.filter((f) => f.severity === "critical").length;
  const pending = MOCK_FINDINGS.filter((f) => f.status === "pending_review").length;
  const approved = MOCK_FINDINGS.filter((f) => f.status === "approved").length;

  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const f of MOCK_FINDINGS) {
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
  }

  const savings = Object.values(MOCK_RECOMMENDATIONS).reduce(
    (s, r) => s + r.estimated_monthly_savings,
    0,
  );
  const carbon = Object.values(MOCK_RECOMMENDATIONS).reduce(
    (s, r) => s + r.estimated_carbon_reduction_kg,
    0,
  );

  return {
    active_findings: active,
    critical_findings: critical,
    pending_approvals: pending,
    approved_actions: approved,
    estimated_monthly_savings: savings,
    estimated_carbon_reduction_kg: carbon,
    latest_scan_at: iso(12),
    findings_by_category: byCategory,
    findings_by_severity: bySeverity,
  };
}

export const MOCK_SUMMARY: DashboardSummary = buildSummary();

// Returns the SAME nested envelope the backend's GET /api/findings/{id} sends:
// { finding, recommendation, approvals, audit_logs }.
export function mockFindingDetail(id: string): FindingDetail | null {
  const finding = MOCK_FINDINGS.find((f) => f.finding_id === id);
  if (!finding) return null;
  const recommendation = MOCK_RECOMMENDATIONS[id] ?? null;
  const audit_logs = MOCK_AUDIT_LOGS.filter(
    (a) => a.entity_id === id || a.metadata?.["finding_id"] === id,
  );
  return { finding, recommendation, approvals: [], audit_logs };
}

export const MOCK_RULES: Rule[] = [
  {
    rule_id: "RULE_PUBLIC_BUCKET",
    name: "Public Bucket",
    enabled: true,
    template_key: "public_exposure",
    resource_type: "bucket",
    conditions: [{ field: "config.public_access", operator: "==", value: true }],
    severity_base: "high",
    escalate_in_prod: true,
    rule_confidence: 0.98,
    category: "security",
    issue_type: "public_bucket",
    required_reviewers: ["security", "devops"],
    evidence_fields: ["environment", "project_id", "owner_team"],
    remediation_action_key: "restrict_public_access",
    remediation_destructive: false,
    mode: "manual",
    auto_threshold: null,
    created_at: "2026-06-20T00:00:00Z",
  },
  {
    rule_id: "RULE_IDLE_VM",
    name: "Idle VM",
    enabled: true,
    template_key: "idle_resource",
    resource_type: "vm",
    conditions: [{ field: "metrics.avg_cpu_percent_7d", operator: "<=", value: 10 }],
    severity_base: "medium",
    escalate_in_prod: true,
    rule_confidence: 0.9,
    category: "cost",
    issue_type: "idle_vm",
    required_reviewers: ["devops", "application_owner"],
    evidence_fields: ["cost.monthly_usd"],
    remediation_action_key: "stop_vm",
    remediation_destructive: true,
    mode: "manual",
    auto_threshold: null,
    created_at: "2026-06-20T00:00:00Z",
  },
  {
    rule_id: "RULE_UNUSED_STORAGE",
    name: "Unused Storage",
    enabled: true,
    template_key: "unused_resource",
    resource_type: "storage",
    conditions: [{ field: "config.attached", operator: "==", value: false }],
    severity_base: "medium",
    escalate_in_prod: false,
    rule_confidence: 0.88,
    category: "cost",
    issue_type: "unused_storage",
    required_reviewers: ["devops", "project_owner", "compliance"],
    evidence_fields: ["cost.monthly_usd"],
    remediation_action_key: "delete_storage",
    remediation_destructive: true,
    mode: "manual",
    auto_threshold: null,
    created_at: "2026-06-20T00:00:00Z",
  },
  {
    rule_id: "RULE_UNENCRYPTED_DATABASE",
    name: "Unencrypted Database",
    enabled: true,
    template_key: "unencrypted_data",
    resource_type: "database",
    conditions: [{ field: "config.encrypted", operator: "==", value: false }],
    severity_base: "high",
    escalate_in_prod: true,
    rule_confidence: 0.97,
    category: "security",
    issue_type: "unencrypted_database",
    required_reviewers: ["security", "devops", "application_owner", "dba"],
    evidence_fields: ["environment"],
    remediation_action_key: "plan_encryption",
    remediation_destructive: false,
    mode: "manual",
    auto_threshold: null,
    created_at: "2026-06-20T00:00:00Z",
  },
];

export const MOCK_RULE_TEMPLATES: RuleTemplate[] = [
  {
    template_key: "threshold_breach",
    name: "Threshold Breach",
    description: "Flag when a numeric metric crosses a threshold you set.",
    resource_type: "vm",
    conditions: [{ field: "metrics.avg_cpu_percent_7d", operator: ">=", value: 90 }],
    severity_base: "medium",
    escalate_in_prod: true,
    rule_confidence: 0.75,
    category: "cost",
    issue_type: "threshold_breach",
    required_reviewers: ["devops"],
    evidence_fields: ["cost.monthly_usd"],
    remediation_action_key: "tag_resource",
    remediation_destructive: false,
  },
  {
    template_key: "custom",
    name: "Custom Rule",
    description: "Start from scratch with your own conditions.",
    resource_type: "vm",
    conditions: [],
    severity_base: "medium",
    escalate_in_prod: false,
    rule_confidence: 0.8,
    category: "security",
    issue_type: "custom_finding",
    required_reviewers: ["devops"],
    evidence_fields: [],
    remediation_action_key: "tag_resource",
    remediation_destructive: false,
  },
];

// ---------------------------------------------------------------------------
// Agents (SafeCloud Phase 2)
// ---------------------------------------------------------------------------

export const MOCK_AGENTS: Agent[] = [
  { agent_id: "agent-security", name: "Security Analyst", enabled: true, lens: "exposure", output_key: "security", coverage_categories: ["security"], coverage_issue_types: [], tone: "construction-aware", extra_focus: "", template_key: "security_analyst", created_at: "2026-06-20T00:00:00Z" },
  { agent_id: "agent-cost", name: "Cost Optimizer", enabled: true, lens: "cost", output_key: "cost", coverage_categories: ["cost"], coverage_issue_types: [], tone: "executive", extra_focus: "", template_key: "cost_optimizer", created_at: "2026-06-20T00:00:00Z" },
  { agent_id: "agent-energy", name: "Carbon Analyst", enabled: true, lens: "carbon", output_key: "energy", coverage_categories: [], coverage_issue_types: ["idle_vm", "unused_storage"], tone: "concise", extra_focus: "", template_key: "carbon_analyst", created_at: "2026-06-20T00:00:00Z" },
  { agent_id: "agent-workflow", name: "Workflow Impact", enabled: true, lens: "workflow", output_key: "workflow", coverage_categories: [], coverage_issue_types: ["public_bucket", "idle_vm", "unencrypted_database"], tone: "construction-aware", extra_focus: "", template_key: "workflow_impact", created_at: "2026-06-20T00:00:00Z" },
  { agent_id: "agent-audit", name: "Compliance Auditor", enabled: true, lens: "compliance", output_key: "audit", coverage_categories: [], coverage_issue_types: ["public_bucket", "unused_storage", "unencrypted_database"], tone: "detailed", extra_focus: "", template_key: "compliance_auditor", created_at: "2026-06-20T00:00:00Z" },
];

export const MOCK_AGENT_TEMPLATES: AgentTemplate[] = [
  { template_key: "security_analyst", name: "Security Analyst", description: "Explains exposure and data-protection risk.", lens: "exposure", output_key: "security", coverage_categories: ["security"], coverage_issue_types: [], tone: "construction-aware", extra_focus: "" },
  { template_key: "forensics_analyst", name: "Forensics Analyst", description: "Traces who changed a resource and when.", lens: "forensics", output_key: "forensics", coverage_categories: ["security"], coverage_issue_types: [], tone: "detailed", extra_focus: "" },
  { template_key: "custom", name: "Custom Agent", description: "Start from scratch — pick a lens and coverage.", lens: "exposure", output_key: "custom_agent", coverage_categories: [], coverage_issue_types: [], tone: "concise", extra_focus: "" },
];

// ---------------------------------------------------------------------------
// Threats + Policy (SafeCloud Phase 3)
// ---------------------------------------------------------------------------

export const MOCK_THREATS: ThreatReport[] = [
  {
    report_id: "threat-mock-1", finding_id: "FND-1042", criticality_score: 95,
    criticality_factors: { severity: 40, internet_exposure: 25, data_sensitivity: 15, production: 15 },
    summary: "Public Bucket detected on bucket-project-drawings (critical). Criticality 95/100 — driven by severity (+40), internet exposure (+25), data sensitivity (+15), production (+15).",
    timeline: [
      { actor: "Document Platform", action: "resource_entered_risky_state", target_resource_id: "bucket-project-drawings", timestamp: "2026-06-20T09:00:00Z", note: "Public Bucket condition present." },
      { actor: "system-seed", action: "finding_created", target_resource_id: "bucket-project-drawings", timestamp: "2026-06-20T09:05:00Z", note: "" },
    ],
    recommended_solution: "Restrict public access after Security and DevOps validate intended exposure.",
    agent_sections: { security: "Public bucket access is a direct exposure risk." },
    approval_status: "pending_review", ai_generated: false, generated_at: "2026-06-20T09:05:00Z",
  },
  {
    report_id: "threat-mock-2", finding_id: "FND-1045", criticality_score: 75,
    criticality_factors: { severity: 40, data_sensitivity: 15, production: 15, blast_radius: 5 },
    summary: "Unencrypted Database detected on db-project-claims-prod (critical). Criticality 75/100.",
    timeline: [
      { actor: "Claims Platform", action: "resource_entered_risky_state", target_resource_id: "db-project-claims-prod", timestamp: "2026-06-20T08:00:00Z", note: "Unencrypted Database condition present." },
    ],
    recommended_solution: "Plan encryption or migration during an approved maintenance window.",
    agent_sections: { security: "Unencrypted databases create data-protection and compliance risk." },
    approval_status: "pending_review", ai_generated: false, generated_at: "2026-06-20T08:05:00Z",
  },
];

export const MOCK_POLICY: ResponsePolicy = { default_mode: "auto", auto_threshold: 75, notify: [] };
