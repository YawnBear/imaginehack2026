// Fresh, construction-flavored cloud events for the live "Run scan" demo.
//
// "Run scan" POSTs these to the live POST /api/events/ingest endpoint, which
// runs the rule engine (backend/app/rules/engine.py) and creates findings.
// Each event has a STABLE unique event_id + resource_id, so the backend dedups
// (by resource_id + issue_type) on repeat scans instead of duplicating — the
// first scan surfaces the whole pool, later scans correctly report 0 new.
//
// Shapes match ARCHITECTURE.md §4 CloudEvent and backend/app/services/seed.py.
// Rule triggers (ARCHITECTURE.md §6):
//   RULE_PUBLIC_BUCKET        bucket   + config.public_access = true
//   RULE_IDLE_VM              vm       + metrics.avg_cpu_percent_7d <= 10 + net in/out <= 100MB
//   RULE_UNUSED_STORAGE       storage  + config.attached = false + 0 read/write 30d
//   RULE_UNENCRYPTED_DATABASE database + config.encrypted = false
// Severity escalates to critical/high when environment == "production".

export type ResourceType = "bucket" | "vm" | "storage" | "database";

export interface CloudEvent {
  event_id: string;
  provider: "mock";
  account_id: string;
  region?: string;
  resource_id: string;
  resource_name?: string;
  resource_type: ResourceType;
  environment?: string;
  project_id?: string;
  owner_team?: string;
  timestamp: string; // ISO 8601
  config?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  cost?: Record<string, unknown>;
}

// The pool, parameterised by timestamp so we can stamp them "now" at scan time
// (calling Date at module top would risk SSR/CSR hydration mismatch).
export function buildScanEvents(timestamp: string): CloudEvent[] {
  return [
    // 1) Public bucket, production -> critical
    {
      event_id: "evt-scan-public-bucket-prod-001",
      provider: "mock",
      account_id: "demo-account",
      region: "ap-southeast-1",
      resource_id: "bucket-drone-survey-footage",
      resource_name: "Drone Survey Footage Bucket",
      resource_type: "bucket",
      environment: "production",
      project_id: "proj-coastal-highway",
      owner_team: "Survey / GIS",
      timestamp,
      config: { public_access: true },
    },
    // 2) Public bucket, staging -> high
    {
      event_id: "evt-scan-public-bucket-staging-001",
      provider: "mock",
      account_id: "demo-account",
      region: "ap-southeast-1",
      resource_id: "bucket-tender-documents-staging",
      resource_name: "Tender Documents Bucket (staging)",
      resource_type: "bucket",
      environment: "staging",
      project_id: "proj-lrt3-package",
      owner_team: "Commercial / Tender",
      timestamp,
      config: { public_access: true },
    },
    // 3) Idle VM, production -> idle_vm (cost) with application owner
    {
      event_id: "evt-scan-idle-vm-001",
      provider: "mock",
      account_id: "demo-account",
      region: "ap-southeast-1",
      resource_id: "vm-clash-detection-node-12",
      resource_name: "Clash Detection Node 12",
      resource_type: "vm",
      environment: "production",
      project_id: "proj-hospital-wing",
      owner_team: "BIM / VDC",
      timestamp,
      config: { application_id: "bim-clash-detection" },
      metrics: {
        avg_cpu_percent_7d: 2.1,
        network_in_mb_7d: 18,
        network_out_mb_7d: 22,
      },
      cost: { monthly_usd: 1280 },
    },
    // 4) Idle VM, staging -> idle_vm (cost), no application_id
    {
      event_id: "evt-scan-idle-vm-002",
      provider: "mock",
      account_id: "demo-account",
      region: "ap-southeast-1",
      resource_id: "vm-point-cloud-batch-03",
      resource_name: "Point Cloud Batch 03",
      resource_type: "vm",
      environment: "staging",
      project_id: "proj-industrial-park",
      owner_team: "Survey / GIS",
      timestamp,
      metrics: {
        avg_cpu_percent_7d: 6.4,
        network_in_mb_7d: 51,
        network_out_mb_7d: 44,
      },
      cost: { monthly_usd: 540 },
    },
    // 5) Unused storage, production, sensitive -> unused_storage (cost) + compliance
    {
      event_id: "evt-scan-unused-storage-001",
      provider: "mock",
      account_id: "demo-account",
      region: "ap-southeast-1",
      resource_id: "vol-site-cctv-archive-2024",
      resource_name: "Site CCTV Archive 2024 Volume",
      resource_type: "storage",
      environment: "production",
      project_id: "proj-urban-tower",
      owner_team: "Site Systems",
      timestamp,
      config: { attached: false, contains_sensitive_data: true },
      metrics: { read_ops_30d: 0, write_ops_30d: 0 },
      cost: { monthly_usd: 318 },
    },
    // 6) Unencrypted database, production -> unencrypted_database (security)
    {
      event_id: "evt-scan-unencrypted-db-001",
      provider: "mock",
      account_id: "demo-account",
      region: "ap-southeast-1",
      resource_id: "db-procurement-ledger-prod",
      resource_name: "Procurement Ledger Database",
      resource_type: "database",
      environment: "production",
      project_id: "proj-lrt3-package",
      owner_team: "Commercial / Tender",
      timestamp,
      config: {
        encrypted: false,
        engine: "postgres",
        application_id: "procurement-ledger",
      },
    },
  ];
}
