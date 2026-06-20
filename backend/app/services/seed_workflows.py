from datetime import UTC, datetime

from app.schemas import Workflow


_WORKFLOW_DEFINITIONS = [
    (
        "wf-public-bucket-review",
        "Public bucket exposure review",
        "RULE_PUBLIC_BUCKET",
        ["security", "workflow", "audit"],
    ),
    (
        "wf-idle-vm-optimization",
        "Idle VM cost and carbon review",
        "RULE_IDLE_VM",
        ["cost", "energy", "workflow"],
    ),
    (
        "wf-unused-storage-cleanup",
        "Unused storage cleanup review",
        "RULE_UNUSED_STORAGE",
        ["cost", "energy", "audit"],
    ),
    (
        "wf-database-encryption-review",
        "Database encryption review",
        "RULE_UNENCRYPTED_DATABASE",
        ["security", "workflow", "audit"],
    ),
    (
        "wf-failed-login-review",
        "Failed login security review",
        "RULE_FAILED_LOGIN",
        ["security", "audit"],
    ),
    (
        "wf-iam-change-review",
        "IAM change approval review",
        "RULE_IAM_CHANGE",
        ["security", "workflow", "audit"],
    ),
    (
        "wf-firewall-ingress-review",
        "Firewall ingress exposure review",
        "RULE_FIREWALL_INGRESS_CHANGE",
        ["security", "workflow", "audit"],
    ),
    (
        "wf-bucket-policy-review",
        "Bucket policy change review",
        "RULE_BUCKET_POLICY_CHANGE",
        ["security", "workflow", "audit"],
    ),
    (
        "wf-audit-logging-review",
        "Audit logging integrity review",
        "RULE_AUDIT_LOGGING_CHANGE",
        ["security", "audit"],
    ),
    (
        "wf-database-change-review",
        "Database change impact review",
        "RULE_DATABASE_CHANGE",
        ["security", "workflow", "audit"],
    ),
]


def builtin_workflows() -> list[Workflow]:
    now = datetime.now(UTC)
    return [
        Workflow(
            workflow_id=workflow_id,
            name=name,
            rule_id=rule_id,
            agent_keys=agent_keys,
            created_at=now,
            last_run=None,
        )
        for workflow_id, name, rule_id, agent_keys in _WORKFLOW_DEFINITIONS
    ]
