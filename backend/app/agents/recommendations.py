from uuid import uuid4

from app.schemas import Finding, Recommendation


def build_recommendation(finding: Finding) -> Recommendation:
    builders = {
        "public_bucket": _public_bucket,
        "idle_vm": _idle_vm,
        "unused_storage": _unused_storage,
        "unencrypted_database": _unencrypted_database,
        "failed_login": _failed_login,
        "iam_policy_change": _iam_policy_change,
        "firewall_ingress_change": _firewall_ingress_change,
        "bucket_policy_change": _bucket_policy_change,
        "audit_logging_change": _audit_logging_change,
        "database_change": _database_change,
    }
    builder = builders.get(finding.issue_type, _generic)
    payload = builder(finding)

    return Recommendation(
        recommendation_id=f"rec-{uuid4().hex[:10]}",
        finding_id=finding.finding_id,
        confidence=payload.pop("confidence"),
        agent_outputs=payload.pop("agent_outputs", {}),
        safe_to_execute=False,
        **payload,
    )


def _public_bucket(finding: Finding) -> dict:
    return {
        "recommended_action": "Restrict public access after Security and DevOps validate intended exposure.",
        "rationale": "The bucket is publicly accessible and may expose construction documents or project data.",
        "risk_level": finding.severity,
        "estimated_monthly_savings": 0,
        "estimated_carbon_reduction_kg": 0,
        "confidence": 0.9,
    }


def _idle_vm(finding: Finding) -> dict:
    monthly_cost = float(finding.evidence.get("monthly_usd") or finding.evidence.get("monthly_cost_usd") or 0)
    savings = round(monthly_cost * 0.8, 2)
    carbon = round(savings * 0.35, 2)
    return {
        "recommended_action": "Stop or resize the VM after owner validation confirms it is not needed.",
        "rationale": "The VM has very low CPU and network usage over the observed period.",
        "risk_level": finding.severity,
        "estimated_monthly_savings": savings,
        "estimated_carbon_reduction_kg": carbon,
        "confidence": 0.82,
    }


def _unused_storage(finding: Finding) -> dict:
    monthly_cost = float(finding.evidence.get("monthly_usd") or finding.evidence.get("monthly_cost_usd") or 0)
    savings = round(monthly_cost * 0.7, 2)
    carbon = round(savings * 0.2, 2)
    return {
        "recommended_action": "Archive or delete the storage only after project-owner approval.",
        "rationale": "The storage is unattached and has no recent read or write activity.",
        "risk_level": finding.severity,
        "estimated_monthly_savings": savings,
        "estimated_carbon_reduction_kg": carbon,
        "confidence": 0.78,
    }


def _unencrypted_database(finding: Finding) -> dict:
    return {
        "recommended_action": "Plan encryption or migration during an approved maintenance window.",
        "rationale": "The database is unencrypted and may contain sensitive project or customer records.",
        "risk_level": finding.severity,
        "estimated_monthly_savings": 0,
        "estimated_carbon_reduction_kg": 0,
        "confidence": 0.86,
    }


def _failed_login(finding: Finding) -> dict:
    return _security_event(
        finding,
        "Review the failed login, confirm the actor and source IP, and rotate credentials if suspicious.",
        "A failed console login can indicate credential misuse or a blocked intrusion attempt.",
    )


def _iam_policy_change(finding: Finding) -> dict:
    return _security_event(
        finding,
        "Review the IAM policy change and confirm it matches an approved deployment or access request.",
        "IAM policy changes can expand access to cloud resources and require prompt human review.",
    )


def _firewall_ingress_change(finding: Finding) -> dict:
    return _security_event(
        finding,
        "Review the ingress rule and restrict exposure if it was not part of an approved change.",
        "Firewall ingress changes can expose project systems or databases to unintended networks.",
    )


def _bucket_policy_change(finding: Finding) -> dict:
    return _security_event(
        finding,
        "Inspect the bucket policy change and verify that public or cross-account access is intended.",
        "Bucket policy changes can expose construction documents or project data.",
    )


def _audit_logging_change(finding: Finding) -> dict:
    return _security_event(
        finding,
        "Verify audit logging is still enabled and investigate the actor behind the logging change.",
        "Audit logging changes can weaken traceability and may indicate attempted cover-up activity.",
    )


def _database_change(finding: Finding) -> dict:
    return _security_event(
        finding,
        "Review the database change with DBA and application owners before accepting the new posture.",
        "Database create/modify/delete events can affect sensitive records, availability, and compliance.",
    )


def _security_event(finding: Finding, action: str, rationale: str) -> dict:
    return {
        "recommended_action": action,
        "rationale": rationale,
        "risk_level": finding.severity,
        "estimated_monthly_savings": 0,
        "estimated_carbon_reduction_kg": 0,
        "confidence": 0.78,
    }


def _generic(finding: Finding) -> dict:
    return {
        "recommended_action": "Review the finding and confirm the safest remediation path.",
        "rationale": "The system detected a cloud governance issue that requires human review.",
        "risk_level": finding.severity,
        "estimated_monthly_savings": 0,
        "estimated_carbon_reduction_kg": 0,
        "confidence": 0.65,
    }
