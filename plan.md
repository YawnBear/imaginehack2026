# Product Requirements Document

# Safe Cloud: AI-Assisted Cloud Governance for Security, Cost, and Carbon Optimization

## 1. Product Overview

Safe Cloud is an AI-assisted cloud governance platform designed to help construction organizations improve cloud security, reduce cloud waste, lower cloud-related carbon footprint, and support better operational decision-making.

The system assumes that the organization’s cloud provider is already connected to the platform. Instead of manually scanning the entire cloud environment from scratch, Safe Cloud extracts cloud logs, scan events, configuration data, usage metrics, billing data, and resource metadata from the connected cloud provider.

These extracted events are normalized and checked by a rule engine. The rule engine detects predefined risk and optimization issues such as public cloud buckets, idle virtual machines, unused storage, and unencrypted databases. Once a rule is triggered, a finding is created and passed to a master agent. The master agent assigns the finding to specialized AI agents for analysis, explanation, impact scoring, and recommendation generation.

The system does not allow AI agents to directly execute cloud actions. All recommended actions require human review and approval before execution. The dashboard displays security findings, cost optimization opportunities, energy and carbon impact, approval status, actions taken, and audit history.

---

## 2. Problem Statement

Construction organizations increasingly depend on cloud systems to manage project documents, site reports, design files, collaboration platforms, databases, and operational workflows. However, cloud environments often grow quickly and become difficult to govern. Resources may be created for temporary projects, forgotten after use, misconfigured during deployment, or left running even after they are no longer needed.

This creates several key issues:

1. Cloud buckets may become publicly accessible and expose sensitive construction documents.
2. Virtual machines may remain idle while still consuming cost and energy.
3. Storage volumes or backups may be unused but continue generating cloud expenses.
4. Databases may be left unencrypted, creating security and compliance risks.
5. Cloud usage may contribute to unnecessary energy consumption and carbon emissions.
6. DevOps teams may understand the infrastructure but may not always understand the full business logic behind each resource.
7. Developers may understand application dependencies but may not have full visibility into cloud cost, security, and sustainability impact.
8. Existing cloud monitoring tools may detect issues, but they often do not provide workflow-aware recommendations, ownership routing, or human-approved decision flows.

Therefore, construction organizations need a platform that can continuously process cloud logs and scan events, detect issues, explain their impact, recommend safe actions, route findings to the right reviewers, and maintain a complete audit trail.

---

## 3. Product Goals

The goals of Safe Cloud are:

1. Detect security risks from cloud logs and scan events.
2. Identify unused or inefficient cloud resources.
3. Estimate potential cost savings from optimization actions.
4. Estimate energy and carbon reduction from reducing cloud waste.
5. Provide explainable recommendations using AI agents.
6. Route findings to the right reviewers based on resource type, ownership, environment, and risk level.
7. Require human approval before any cloud action is performed.
8. Maintain a full audit trail for governance and accountability.
9. Support construction workflows by avoiding unsafe resource changes.
10. Improve operational efficiency through centralized cloud visibility.

---

## 4. Target Users

### 4.1 Primary Users

| User Group                                  | Role in the Product                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| DevOps / Cloud Operations Team              | Main operator of the system. Reviews cloud findings, validates infrastructure impact, and performs approved actions. |
| Security / Compliance Team                  | Reviews high-risk security findings such as public buckets and unencrypted databases.                                |
| Application Developers / Application Owners | Validate whether a resource is still needed by application logic before changes are made.                            |
| Project Managers / Business Owners          | Confirm whether cloud resources support active construction workflows or project operations.                         |

### 4.2 Secondary Users

| User Group                | Role in the Product                                            |
| ------------------------- | -------------------------------------------------------------- |
| Finance / Operations Team | Reviews cost optimization opportunities and estimated savings. |
| Sustainability / ESG Team | Reviews estimated energy usage and carbon footprint reduction. |
| Auditors / Management     | Reviews audit logs, approval history, and governance reports.  |

---

## 5. Key User Difference

The system is designed around the idea that no single team has complete context.

| User               | What They Know                                                                        | What They May Not Know                             |
| ------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------- |
| DevOps / Cloud Ops | Cloud infrastructure, resource configuration, deployment, monitoring, and remediation | Full business logic or why a resource exists       |
| Developers         | Application logic, service dependencies, database usage, and backend workflows        | Cloud cost, carbon impact, and infrastructure risk |
| Security Team      | Security exposure, compliance impact, and data protection risk                        | Application dependency or business workflow impact |
| Project Managers   | Construction project workflow, reporting schedules, and business impact               | Cloud configuration and technical remediation      |
| Finance / ESG Team | Cost and sustainability impact                                                        | Technical feasibility of the recommended action    |

Because of this, Safe Cloud must not only detect findings. It must also route findings to the correct reviewers before any action is taken.

---

## 6. Assumptions

The product is based on the following assumptions:

1. The system is already linked to a cloud provider.
2. The system can extract logs, scan events, configuration data, usage metrics, billing data, and resource metadata from the cloud provider.
3. Cloud resources are already available in the provider environment.
4. The system does not need to manually discover every resource from scratch.
5. Every scan event will be processed through a hybrid check involving a rule engine and AI agents.
6. The rule engine is responsible for deterministic detection.
7. AI agents are responsible for explanation, prioritization, impact analysis, and recommendation generation.
8. The initial rule criteria are:

   * Cloud bucket risk
   * Idle virtual machine
   * Unused storage
   * Unencrypted database
9. Rule criteria may change in future versions.
10. All suggested actions require human approval.
11. AI agents cannot directly delete, stop, encrypt, or modify cloud resources without approval.
12. Carbon and energy values are estimated, not exact physical measurements.
13. The dashboard should display findings, recommendations, approval status, actions taken, and audit history.

---

## 7. Scope

### 7.1 In Scope

The MVP includes:

1. Cloud provider connection assumption.
2. Log and scan event ingestion.
3. Data normalization and filtering.
4. Rule engine checks.
5. Finding generation.
6. Master agent routing.
7. Specialized AI agent analysis.
8. Agent weightage and priority scoring.
9. Recommendation generation.
10. Human approval workflow.
11. Dashboard panels for security, cost, and energy.
12. Audit log for findings, recommendations, approvals, and actions.
13. Explanation for each finding.
14. Reviewer assignment based on finding type and resource context.

### 7.2 Out of Scope

The MVP does not include:

1. Fully autonomous remediation.
2. Direct deletion of cloud resources without approval.
3. Real-time cyberattack detection.
4. Full incident response automation.
5. Advanced compliance framework mapping.
6. Full multi-cloud support across every provider.
7. Exact data center-level energy measurement.
8. Deep integration with BIM or construction project management tools.
9. Predictive project scheduling.
10. Complex custom rule builder for non-technical users.

---

## 8. Data Flow

### 8.1 High-Level Data Flow

```text
Connected Cloud Provider
        ↓
Cloud Logs and Scan Events
        ↓
Log / Event Ingestion Layer
        ↓
Data Normalization and Filtering
        ↓
Rule Engine
        ↓
Findings Store
        ↓
Master Agent
        ↓
Specialized Sub-Agents
        ↓
Recommendation Engine
        ↓
Human Approval Workflow
        ↓
Dashboard and Audit Log
```

### 8.2 Detailed Data Flow

```text
┌────────────────────────────┐
│ Connected Cloud Provider    │
│ AWS / Azure / GCP           │
└─────────────┬──────────────┘
              ↓
┌────────────────────────────┐
│ Logs and Scan Events        │
│ Config logs, access logs,   │
│ scan results, usage metrics │
└─────────────┬──────────────┘
              ↓
┌────────────────────────────┐
│ Ingestion Layer             │
│ Extracts or receives cloud  │
│ data from provider          │
└─────────────┬──────────────┘
              ↓
┌────────────────────────────┐
│ Normalization Layer         │
│ Converts provider-specific  │
│ data into standard format   │
└─────────────┬──────────────┘
              ↓
┌────────────────────────────┐
│ Rule Engine                 │
│ Performs deterministic      │
│ checks based on criteria    │
└─────────────┬──────────────┘
              ↓
┌────────────────────────────┐
│ Findings Store              │
│ Stores detected issues      │
│ with supporting evidence    │
└─────────────┬──────────────┘
              ↓
┌────────────────────────────┐
│ Master Agent                │
│ Classifies finding and      │
│ assigns sub-agents          │
└─────────────┬──────────────┘
              ↓
┌────────────────────────────┐
│ Specialized AI Agents       │
│ Security, Cost, Energy,     │
│ Workflow, Audit             │
└─────────────┬──────────────┘
              ↓
┌────────────────────────────┐
│ Recommendation Engine       │
│ Combines agent outputs      │
│ using weighted scoring      │
└─────────────┬──────────────┘
              ↓
┌────────────────────────────┐
│ Human Approval Workflow     │
│ Approve, reject, defer,     │
│ request more information    │
└─────────────┬──────────────┘
              ↓
┌────────────────────────────┐
│ Dashboard and Audit Log     │
│ Security, cost, energy,     │
│ approvals, actions          │
└────────────────────────────┘
```

---

## 9. Core System Modules

| Module                   | Description                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Cloud Provider Connector | Connects to the cloud provider and extracts logs, scan events, usage metrics, metadata, and cost data. |
| Event Ingestion Layer    | Receives or pulls cloud data and prepares it for processing.                                           |
| Data Normalization Layer | Converts cloud provider data into a standard internal format.                                          |
| Rule Engine              | Performs deterministic checks against predefined criteria.                                             |
| Findings Store           | Stores detected findings and supporting evidence.                                                      |
| Master Agent             | Receives findings and assigns them to specialized sub-agents.                                          |
| Security Agent           | Evaluates security and compliance impact.                                                              |
| Cost Agent               | Estimates cost waste and optimization potential.                                                       |
| Energy Agent             | Estimates energy usage and carbon impact.                                                              |
| Workflow Impact Agent    | Checks whether actions may affect application logic or construction workflows.                         |
| Audit Agent              | Reviews approval requirements and audit readiness.                                                     |
| Recommendation Engine    | Combines agent outputs using weightage and produces final recommendations.                             |
| Approval Manager         | Handles human approval, rejection, deferral, and reviewer assignment.                                  |
| Action Manager           | Performs approved actions or records manual action completion.                                         |
| Dashboard UI             | Displays findings, recommendations, approval status, actions, and charts.                              |
| Audit Logger             | Records all scans, findings, recommendations, approvals, and actions.                                  |

---

## 10. Input Data Requirements

The system should extract or receive the following data from the connected cloud provider.

### 10.1 Configuration Data

| Data                       | Purpose                          |
| -------------------------- | -------------------------------- |
| Bucket permission status   | Detect public or risky buckets   |
| Database encryption status | Detect unencrypted databases     |
| Storage attachment status  | Detect unused storage            |
| Resource security settings | Detect security misconfiguration |

### 10.2 Usage Metrics

| Data                    | Purpose                      |
| ----------------------- | ---------------------------- |
| VM CPU usage            | Detect idle virtual machines |
| VM memory usage         | Support idle VM detection    |
| Network activity        | Confirm resource usage       |
| Storage access history  | Detect unused storage        |
| Database access history | Understand active usage      |

### 10.3 Resource Metadata

| Data             | Purpose                                               |
| ---------------- | ----------------------------------------------------- |
| Resource ID      | Identify affected resource                            |
| Resource type    | Classify resource                                     |
| Resource name    | Infer possible application or purpose                 |
| Tags             | Identify project, owner, environment, and application |
| Region           | Support carbon estimation                             |
| Created by       | Support owner detection                               |
| Last modified by | Support ownership and audit                           |
| Environment      | Determine risk level, such as production or staging   |

### 10.4 Billing and Cost Data

| Data                  | Purpose                         |
| --------------------- | ------------------------------- |
| Monthly resource cost | Estimate cost savings           |
| Storage cost          | Estimate unused storage cost    |
| Compute cost          | Estimate idle VM savings        |
| Cost by project       | Support project-level reporting |

### 10.5 Logs and Events

| Data                      | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| Configuration scan events | Trigger rule checks                      |
| Access logs               | Confirm whether resources are being used |
| Security scan events      | Support security findings                |
| Audit logs                | Track who changed what and when          |

---

## 11. Rule Engine

The rule engine is responsible for objective detection. It should not rely on the LLM to decide whether a technical issue exists.

### 11.1 Initial Rule Criteria

| Rule Category        | Detection Logic                                            | Example Finding         |
| -------------------- | ---------------------------------------------------------- | ----------------------- |
| Cloud Bucket Risk    | Bucket is public or has risky access permission            | Public bucket detected  |
| Idle Virtual Machine | VM usage remains below threshold for a defined period      | Idle VM detected        |
| Unused Storage       | Storage is unattached or not accessed for a defined period | Unused storage detected |
| Unencrypted Database | Database encryption is disabled                            | Unencrypted DB detected |

### 11.2 Example Rules

```text
IF resource_type = database
AND encryption_enabled = false
THEN create finding = UNENCRYPTED_DB
```

```text
IF resource_type = virtual_machine
AND average_cpu_usage < 5%
AND network_activity = low
AND duration >= 30 days
THEN create finding = IDLE_VM
```

```text
IF resource_type = bucket
AND public_access = true
THEN create finding = PUBLIC_BUCKET_RISK
```

```text
IF resource_type = storage
AND attached_status = false
AND last_accessed > 90 days
THEN create finding = UNUSED_STORAGE
```

### 11.3 Rule Engine Output

Each triggered rule should produce a structured finding.

```json
{
  "finding_id": "F-1001",
  "source_event_id": "EVT-9001",
  "resource_id": "db-project-claims-prod",
  "resource_type": "database",
  "finding_type": "UNENCRYPTED_DB",
  "severity": "High",
  "rule_triggered": "DB_ENCRYPTION_DISABLED",
  "evidence": {
    "environment": "production",
    "project": "Site A Construction",
    "application": "claims-system",
    "encryption_enabled": false
  },
  "created_at": "2026-06-20T10:00:00Z"
}
```

### 11.4 Acceptance Criteria

1. The system must trigger rules based on normalized cloud data.
2. The system must generate findings only when rule conditions are met.
3. The system must store the evidence that caused the rule to trigger.
4. The system must support the four initial rule categories.
5. The system must allow rule criteria to be changed in future versions.

---

## 12. AI Agent Design

The AI agents are not the source of truth for detection. They only analyze findings created by the rule engine.

### 12.1 Master Agent

The master agent receives each finding and determines which sub-agents should analyze it.

### Responsibilities

1. Classify the finding type.
2. Select relevant sub-agents.
3. Pass only relevant context to each sub-agent.
4. Collect outputs from sub-agents.
5. Send results to the recommendation engine.

### 12.2 Specialized Sub-Agents

| Agent                 | Responsibility                                                                 |
| --------------------- | ------------------------------------------------------------------------------ |
| Security Agent        | Explains security risk and compliance concern.                                 |
| Cost Agent            | Estimates cost impact and possible savings.                                    |
| Energy Agent          | Estimates carbon and energy impact.                                            |
| Workflow Impact Agent | Checks application dependency, business logic, and construction workflow risk. |
| Audit Agent           | Determines approval requirements and audit fields.                             |

### 12.3 Agent Output

Each sub-agent should output:

1. Analysis summary
2. Impact score
3. Confidence level
4. Evidence used
5. Uncertainty or missing context
6. Suggested reviewer, if applicable
7. Suggested action, if applicable

### 12.4 LLM Safety Boundary

The LLM must not:

1. Create findings without rule engine evidence.
2. Invent missing ownership details.
3. Make final approval decisions.
4. Execute cloud actions directly.
5. Hide uncertainty.
6. Recommend destructive action without human approval.

The LLM can:

1. Summarize evidence.
2. Explain why the finding matters.
3. Identify possible risks.
4. Recommend who should review the finding.
5. Suggest safer remediation options.
6. Highlight missing context.

---

## 13. Agent Routing by Finding Type

### 13.1 Public Cloud Bucket

| Agent                 | Purpose                                  | Weightage |
| --------------------- | ---------------------------------------- | --------: |
| Security Agent        | Assess exposure risk                     |       70% |
| Workflow Impact Agent | Identify project or document impact      |       15% |
| Audit Agent           | Determine approval and audit requirement |       10% |
| Cost Agent            | Minor cost relevance                     |        5% |

Required reviewers:

1. Security Team
2. DevOps Team
3. Project Owner, if project-related documents are involved

---

### 13.2 Idle Virtual Machine

| Agent                 | Purpose                          | Weightage |
| --------------------- | -------------------------------- | --------: |
| Cost Agent            | Estimate savings                 |       40% |
| Energy Agent          | Estimate carbon reduction        |       30% |
| Workflow Impact Agent | Check app or business dependency |       20% |
| Security Agent        | Minor security relevance         |       10% |

Required reviewers:

1. DevOps Team
2. Application Owner, if linked to an app
3. Project Owner, if production or project-critical

---

### 13.3 Unused Storage

| Agent                 | Purpose                                | Weightage |
| --------------------- | -------------------------------------- | --------: |
| Cost Agent            | Estimate storage savings               |       35% |
| Workflow Impact Agent | Check retention and business need      |       30% |
| Audit Agent           | Check data retention and deletion risk |       20% |
| Energy Agent          | Estimate storage carbon impact         |       15% |

Required reviewers:

1. DevOps Team
2. Project Owner
3. Security or Compliance Team, if sensitive data or retention policy applies

---

### 13.4 Unencrypted Database

| Agent                 | Purpose                                    | Weightage |
| --------------------- | ------------------------------------------ | --------: |
| Security Agent        | Assess security and compliance risk        |       60% |
| Workflow Impact Agent | Check application and downtime impact      |       20% |
| Audit Agent           | Determine approval and record requirements |       10% |
| Cost Agent            | Minor cost relevance                       |        5% |
| Energy Agent          | Minor energy relevance                     |        5% |

Required reviewers:

1. Security Team
2. DevOps Team
3. Database Owner or DBA, if available
4. Application Owner
5. Project Owner, if production downtime is required

---

## 14. Recommendation Engine

The recommendation engine combines the outputs from sub-agents into one final recommendation.

### 14.1 Recommendation Fields

Each final recommendation should include:

1. Finding ID
2. Resource ID
3. Resource type
4. Finding type
5. Severity
6. Priority score
7. Explanation
8. Evidence summary
9. Security impact
10. Cost impact
11. Energy or carbon impact
12. Workflow impact
13. Recommended action
14. Required reviewers
15. Approval requirement
16. Risk of action
17. Confidence level
18. Missing context, if any
19. Current status

### 14.2 Example Recommendation

```text
Finding:
Database db-project-claims-prod is not encrypted.

Severity:
High

Evidence:
Encryption is disabled. The database is tagged as production and linked to the claims-system application.

Impact:
This creates a security and compliance risk because the database may store project or customer-related records.

Recommended Action:
Do not modify immediately. First confirm database backup, application dependency, and maintenance window. Then enable encryption or migrate to an encrypted database during an approved maintenance window.

Required Reviewers:
Security Team, DevOps Team, Application Owner, Database Owner, Project Owner if downtime is required.

Approval Required:
Yes

Detection Confidence:
High

Remediation Impact Confidence:
Medium

Reason for Confidence:
The encryption status is clear from the cloud scan event, but downtime and application impact require human validation.
```

---

## 15. Human Approval Workflow

All actions require human approval before execution.

### 15.1 Approval Statuses

| Status                 | Description                                   |
| ---------------------- | --------------------------------------------- |
| Pending Review         | Finding has been created and requires review. |
| Needs More Information | Reviewer requires additional context.         |
| Approved               | Recommendation has been approved.             |
| Rejected               | Recommendation has been rejected.             |
| Deferred               | Action is postponed.                          |
| Action Completed       | Approved action has been completed.           |
| Action Failed          | Approved action failed during execution.      |

### 15.2 Approval Rules

| Finding Type        | Required Approval                                                 |
| ------------------- | ----------------------------------------------------------------- |
| Public bucket       | Security and DevOps approval                                      |
| Idle VM             | DevOps approval, application owner if linked to an app            |
| Unused storage      | DevOps and project owner approval, compliance review if sensitive |
| Unencrypted DB      | Security, DevOps, application owner, and DBA review               |
| Production resource | Additional business or project owner approval                     |
| Destructive action  | Strong approval required                                          |
| Low-risk alert only | No action approval required                                       |

### 15.3 Acceptance Criteria

1. The system must display required reviewers for each finding.
2. The system must prevent action execution until approval is completed.
3. The system must record approver identity and timestamp.
4. The system must allow rejection with reason.
5. The system must allow deferral with reason.
6. The system must allow reviewers to request more information.

---

## 16. Dashboard Requirements

### 16.1 Overview Dashboard

The overview dashboard should display:

1. Total active findings
2. Critical findings
3. Pending approvals
4. Approved actions
5. Estimated monthly cost savings
6. Estimated carbon reduction
7. Latest scan event timestamp
8. Findings by category
9. Findings by severity

---

### 16.2 Security Panel

The security panel should show security-related findings.

| Column             | Description                                |
| ------------------ | ------------------------------------------ |
| Finding ID         | Unique finding identifier                  |
| Resource           | Affected resource                          |
| Issue Type         | Public bucket or unencrypted database      |
| Severity           | Critical, High, Medium, Low                |
| Evidence           | Rule evidence                              |
| Explanation        | Why the issue matters                      |
| Required Reviewers | Security, DevOps, developer, project owner |
| Approval Status    | Current review status                      |
| Action Taken       | Final action, if any                       |

---

### 16.3 Cost Panel

The cost panel should show cost optimization findings.

| Column                | Description                           |
| --------------------- | ------------------------------------- |
| Finding ID            | Unique finding identifier             |
| Resource              | Affected resource                     |
| Issue Type            | Idle VM or unused storage             |
| Current Cost          | Estimated current cost                |
| Estimated Saving      | Potential saving                      |
| Optimization Strategy | Stop, resize, archive, delete, retain |
| Risk Level            | Low, Medium, High                     |
| Required Reviewers    | DevOps, developer, project owner      |
| Approval Status       | Current review status                 |

---

### 16.4 Energy Panel

The energy panel should display estimated energy and carbon impact.

Required charts:

1. Estimated carbon footprint trend
2. Estimated carbon reduction after approved actions
3. Energy impact by resource type
4. Monthly reduction trend
5. Before and after optimization comparison

The energy panel must clearly state that the values are estimated.

---

### 16.5 Audit Panel

The audit panel should show:

1. Scan event history
2. Finding history
3. Agent recommendation history
4. Approval history
5. Action history
6. Before and after resource state
7. Export option for audit reports

---

## 17. Audit Log Requirements

Every major event must be recorded.

### 17.1 Audit Log Fields

| Field                      | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| Audit ID                   | Unique audit record                                  |
| Source Event ID            | Cloud log or scan event reference                    |
| Finding ID                 | Linked finding                                       |
| Resource ID                | Affected cloud resource                              |
| Rule Triggered             | Rule that created the finding                        |
| Agent Output               | Summary of AI agent analysis                         |
| Recommendation             | Final recommendation                                 |
| Required Reviewers         | Users or teams required for approval                 |
| Approval Decision          | Approved, rejected, deferred, needs more information |
| Approver                   | User who made the decision                           |
| Approval Timestamp         | Time of decision                                     |
| Action Taken               | Final action performed                               |
| Before State               | Resource state before action                         |
| After State                | Resource state after action                          |
| Estimated Savings          | Cost saving estimate                                 |
| Estimated Carbon Reduction | Carbon reduction estimate                            |

### 17.2 Acceptance Criteria

1. The system must log every scan event processed.
2. The system must log every triggered rule.
3. The system must log every agent recommendation.
4. The system must log every approval decision.
5. The system must log every completed action.
6. Audit records must be searchable and filterable.
7. Audit records should not be editable by normal users.

---

## 18. Functional Requirements

| ID     | Requirement                                                                            | Priority    |
| ------ | -------------------------------------------------------------------------------------- | ----------- |
| FR-001 | The system shall extract logs and scan events from the connected cloud provider.       | Must Have   |
| FR-002 | The system shall normalize cloud provider data into a standard format.                 | Must Have   |
| FR-003 | The system shall support rule checks for cloud bucket risk.                            | Must Have   |
| FR-004 | The system shall support rule checks for idle virtual machines.                        | Must Have   |
| FR-005 | The system shall support rule checks for unused storage.                               | Must Have   |
| FR-006 | The system shall support rule checks for unencrypted databases.                        | Must Have   |
| FR-007 | The system shall generate findings when rule conditions are met.                       | Must Have   |
| FR-008 | The system shall store finding evidence.                                               | Must Have   |
| FR-009 | The system shall pass findings to the master agent.                                    | Must Have   |
| FR-010 | The master agent shall assign findings to relevant sub-agents.                         | Must Have   |
| FR-011 | Sub-agents shall generate analysis, impact scores, and recommendations.                | Must Have   |
| FR-012 | The system shall apply weightage based on finding type.                                | Must Have   |
| FR-013 | The system shall generate a final recommendation.                                      | Must Have   |
| FR-014 | The system shall identify required reviewers.                                          | Must Have   |
| FR-015 | The system shall require human approval before action execution.                       | Must Have   |
| FR-016 | The system shall support approve, reject, defer, and request more information actions. | Must Have   |
| FR-017 | The dashboard shall display security findings.                                         | Must Have   |
| FR-018 | The dashboard shall display cost findings.                                             | Must Have   |
| FR-019 | The dashboard shall display energy and carbon charts.                                  | Must Have   |
| FR-020 | The system shall store audit logs for every major event.                               | Must Have   |
| FR-021 | The system shall allow filtering by severity, category, and approval status.           | Should Have |
| FR-022 | The system shall allow exporting audit reports.                                        | Should Have |
| FR-023 | The system shall allow rule criteria to be updated.                                    | Should Have |
| FR-024 | The system shall support multi-cloud providers.                                        | Future      |
| FR-025 | The system shall support low-risk auto-remediation after pre-approval.                 | Future      |

---

## 19. Non-Functional Requirements

### 19.1 Security

1. The system must protect cloud credentials.
2. The system must use secure authentication.
3. The system must support role-based access control.
4. Only authorized users can approve or perform actions.
5. Audit logs must be protected from unauthorized modification.

### 19.2 Reliability

1. Failed ingestion events must be logged.
2. Failed rule checks must be logged.
3. The dashboard must show the latest successful event processing time.
4. The system must avoid duplicate findings from repeated scan events.
5. The system must support retry handling for failed ingestion.

### 19.3 Explainability

1. Each finding must show the rule that triggered it.
2. Each recommendation must show supporting evidence.
3. Each recommendation must explain why reviewers are required.
4. The system must clearly separate rule confidence from AI recommendation confidence.
5. The system must show uncertainty when metadata is incomplete.

### 19.4 Safety

1. AI agents must not execute actions directly.
2. Destructive actions must require explicit approval.
3. Production resources must require stronger review.
4. The system must warn users if a recommendation may disrupt application or business workflows.

### 19.5 Performance

1. The dashboard should load recent findings efficiently.
2. Large finding tables should support pagination.
3. Rule checks should process scan events within an acceptable time.
4. The system should support asynchronous agent analysis if finding volume is high.

### 19.6 Auditability

1. Every finding must be traceable to a source event.
2. Every recommendation must be traceable to agent output.
3. Every approval must be traceable to a user.
4. Every action must include before and after state where available.

---

## 20. Success Metrics

| Metric                                             | Purpose                                       |
| -------------------------------------------------- | --------------------------------------------- |
| Number of findings detected                        | Measures visibility into cloud issues         |
| Percentage of findings reviewed                    | Measures operational usage                    |
| Number of approved actions                         | Measures actionability                        |
| Estimated monthly cost savings                     | Measures financial impact                     |
| Estimated carbon reduction                         | Measures sustainability impact                |
| Average time to approval                           | Measures workflow efficiency                  |
| False positive rate                                | Measures detection and recommendation quality |
| Number of findings with clear owner                | Measures routing effectiveness                |
| Number of deferred findings due to missing context | Measures metadata quality                     |
| Audit completeness rate                            | Measures governance readiness                 |

---

## 21. Example User Stories

### 21.1 Security Officer Reviews Unencrypted Database

As a Security Officer, I want to see unencrypted database findings so that I can assess security and compliance risk.

Acceptance criteria:

1. The finding shows the affected database.
2. The finding shows the rule evidence.
3. The recommendation explains the security impact.
4. The system requires Security and DevOps approval.
5. The audit log records the decision.

---

### 21.2 DevOps Engineer Reviews Idle VM

As a DevOps Engineer, I want to see idle VM findings so that I can reduce unnecessary cloud cost and resource usage.

Acceptance criteria:

1. The cost panel shows idle VM findings.
2. The finding includes usage evidence.
3. The recommendation includes estimated savings.
4. The system checks if the VM is linked to an application.
5. The system requires application owner validation if needed.

---

### 21.3 Developer Validates Application Impact

As an Application Owner, I want to review findings related to resources used by my application so that optimization actions do not break business logic.

Acceptance criteria:

1. The system routes relevant findings to the application owner.
2. The finding shows resource metadata and evidence.
3. The developer can approve, reject, defer, or request more information.
4. The decision is recorded in the audit log.

---

### 21.4 Sustainability Officer Tracks Carbon Reduction

As a Sustainability Officer, I want to view estimated carbon reduction so that I can monitor the sustainability impact of cloud optimization.

Acceptance criteria:

1. The energy dashboard shows estimated carbon trends.
2. The dashboard shows reduction after approved actions.
3. The system groups impact by resource type.
4. The system clearly labels carbon values as estimates.

---

## 22. MVP Requirements

The MVP should include:

1. Mock or actual cloud provider event ingestion.
2. Normalized cloud event schema.
3. Rule engine for four criteria:

   * Public bucket
   * Idle VM
   * Unused storage
   * Unencrypted DB
4. Findings database.
5. Master agent routing.
6. Four to five specialized agents:

   * Security Agent
   * Cost Agent
   * Energy Agent
   * Workflow Impact Agent
   * Audit Agent
7. Recommendation engine with weightage.
8. Human approval workflow.
9. Dashboard with:

   * Security panel
   * Cost panel
   * Energy panel
   * Audit panel
10. Explanation and evidence display for each finding.

---

## 23. Future Enhancements

Future versions may include:

1. Multi-cloud support.
2. Custom rule builder.
3. Integration with Slack, Microsoft Teams, or email alerts.
4. Integration with Jira or ticketing systems.
5. Integration with project management tools.
6. Auto-remediation for low-risk actions after pre-approval.
7. Monthly cost and carbon reports.
8. Advanced compliance mapping.
9. AI chatbot for querying findings.
10. Resource ownership learning based on past approvals.
11. Dependency mapping between cloud resources and applications.
12. Construction project-level cloud carbon budgeting.

---

## 24. Risks and Mitigations

| Risk                                | Impact                                 | Mitigation                                                    |
| ----------------------------------- | -------------------------------------- | ------------------------------------------------------------- |
| LLM gives inaccurate recommendation | User may lose trust                    | Use rule engine as source of truth and require human approval |
| Missing resource metadata           | Wrong reviewer may be assigned         | Show confidence level and allow manual owner confirmation     |
| False positives                     | Important resources may be flagged     | Use usage metrics, tags, access logs, and workflow review     |
| Dangerous cloud actions             | Service disruption or data loss        | No action without approval                                    |
| Too many alerts                     | Users may ignore findings              | Use severity, priority score, and filtering                   |
| Carbon estimate is inaccurate       | Sustainability claim may be challenged | Clearly state that carbon impact is estimated                 |
| DevOps lacks business context       | Unsafe optimization decisions          | Include developer and business owner review flow              |
| Developers lack cloud context       | Security or cost impact may be missed  | Include DevOps and Security review flow                       |

---

## 25. Open Questions

1. Which cloud provider will be supported first?
2. What logs and scan events are available from the cloud provider?
3. Is cost data available at resource level?
4. Are resource tags consistently used?
5. How will application ownership be mapped?
6. Who should approve production resource changes?
7. Should high-risk actions require multiple approvals?
8. Should the system execute approved actions or only record manual completion?
9. What carbon estimation method should be used?
10. How often should each rule be evaluated?

---

## 26. Summary

Safe Cloud is a cloud governance platform that uses connected cloud provider logs and scan events to detect security, cost, and sustainability issues. The rule engine performs objective detection based on predefined criteria, while AI agents provide explanation, impact analysis, reviewer routing, and recommendations. Human approval is required before any action is taken. The dashboard provides security, cost, energy, and audit visibility, helping construction organizations optimize their cloud environment without disrupting application logic or business workflows.
