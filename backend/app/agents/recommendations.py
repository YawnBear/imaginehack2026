from uuid import uuid4

from app.schemas import Finding, Recommendation


def build_recommendation(finding: Finding) -> Recommendation:
    builders = {
        "public_bucket": _public_bucket,
        "idle_vm": _idle_vm,
        "unused_storage": _unused_storage,
        "unencrypted_database": _unencrypted_database,
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


def _generic(finding: Finding) -> dict:
    return {
        "recommended_action": "Review the finding and confirm the safest remediation path.",
        "rationale": "The system detected a cloud governance issue that requires human review.",
        "risk_level": finding.severity,
        "estimated_monthly_savings": 0,
        "estimated_carbon_reduction_kg": 0,
        "confidence": 0.65,
    }
