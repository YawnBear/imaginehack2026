from datetime import UTC, datetime
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
        agent_outputs=payload.pop("agent_outputs"),
        safe_to_execute=False,
        **payload,
    )


def _public_bucket(finding: Finding) -> dict:
    return {
        "recommended_action": (
            "Replace the public-access grant with scoped signed URLs (or a "
            "project-group IAM binding) so the documents stay reachable for the "
            "right contractors without being world-readable — revoke the public "
            "grant only, delete nothing."
        ),
        "rationale": "The bucket is publicly accessible and may expose construction documents or project data.",
        "risk_level": finding.severity,
        "estimated_monthly_savings": 0,
        "estimated_carbon_reduction_kg": 0,
        "confidence": 0.9,
        "agent_outputs": {
            "security": "Public bucket access is a direct exposure risk.",
            "workflow": "Confirm whether the bucket is intentionally public before changing permissions.",
            "audit": "Security and DevOps approvals are required before remediation is recorded.",
            "remediation": (
                "1. List current public bindings: gsutil iam get gs://<bucket> "
                "(record them for rollback).\n"
                "2. Confirm with DevOps whether any live contractor workflow "
                "depends on the public URL before changing anything.\n"
                "3. Issue scoped, time-boxed signed URLs (or grant the project "
                "group bucket-level read) so legitimate users keep access.\n"
                "4. Revoke ONLY the public grant: gsutil iam ch -d "
                "allUsers:objectViewer gs://<bucket>.\n"
                "5. Re-verify access from an anonymous client (should 403) and "
                "from an authorised user (should succeed).\n"
                "6. If anything breaks, re-add the recorded binding from step 1 "
                "to roll back instantly. No objects are deleted at any point."
            ),
        },
    }


def _idle_vm(finding: Finding) -> dict:
    monthly_cost = float(finding.evidence.get("monthly_cost_usd") or 0)
    savings = round(monthly_cost * 0.8, 2)
    carbon = round(savings * 0.35, 2)
    return {
        "recommended_action": (
            "Snapshot the disk first, then stop (deallocate) the idle VM so the "
            "environment can be restored on demand — this ends the idle spend "
            "and energy draw while keeping the machine fully recoverable."
        ),
        "rationale": "The VM has very low CPU and network usage over the observed period.",
        "risk_level": finding.severity,
        "estimated_monthly_savings": savings,
        "estimated_carbon_reduction_kg": carbon,
        "confidence": 0.82,
        "agent_outputs": {
            "cost": f"Estimated monthly savings are ${savings}.",
            "energy": f"Estimated carbon reduction is {carbon} kg CO2e.",
            "workflow": "Application ownership must be checked before stopping production-linked compute.",
            "remediation": (
                "1. Confirm with the application/BIM owner that no live job or "
                "deployment depends on this VM right now.\n"
                "2. Take a full disk snapshot first (e.g. gcloud compute disks "
                "snapshot <disk>) so the environment is recoverable.\n"
                "3. Verify the snapshot completed successfully before stopping "
                "anything.\n"
                "4. Stop/deallocate the VM (gcloud compute instances stop "
                "<vm>) — do NOT delete the instance or disk.\n"
                "5. Note the snapshot id in the audit trail so the box can be "
                "restarted from snapshot (~minutes) when next needed.\n"
                "6. To roll back, simply start the instance again — state and "
                "data are intact."
            ),
        },
    }


def _unused_storage(finding: Finding) -> dict:
    monthly_cost = float(finding.evidence.get("monthly_cost_usd") or 0)
    savings = round(monthly_cost * 0.7, 2)
    carbon = round(savings * 0.2, 2)
    return {
        "recommended_action": (
            "Lifecycle-tier the unattached volume to cold/archive storage "
            "(keeping it retrievable for warranty/claims) instead of deleting "
            "it — this captures most of the saving while the data stays "
            "recoverable; delete only after a project-owner-approved retention "
            "period."
        ),
        "rationale": "The storage is unattached and has no recent read or write activity.",
        "risk_level": finding.severity,
        "estimated_monthly_savings": savings,
        "estimated_carbon_reduction_kg": carbon,
        "confidence": 0.78,
        "agent_outputs": {
            "cost": f"Estimated monthly savings are ${savings}.",
            "energy": f"Estimated carbon reduction is {carbon} kg CO2e.",
            "audit": "Project-owner approval is required because deleted storage can affect historical records.",
            "remediation": (
                "1. Confirm with the project owner that the volume belongs to a "
                "closed package and has no retention/compliance hold.\n"
                "2. Snapshot or copy the volume to archive storage first so the "
                "data is preserved before any change.\n"
                "3. Add a lifecycle rule transitioning the object/volume to a "
                "cold/archive class (retrievable in hours, ~95% cheaper).\n"
                "4. Verify the archived copy is readable and intact.\n"
                "5. Only after the approved retention window passes, and with a "
                "second project-owner sign-off, consider deleting the original.\n"
                "6. To roll back, restore from the archive tier — nothing is "
                "lost during tiering."
            ),
        },
    }


def _unencrypted_database(finding: Finding) -> dict:
    return {
        "recommended_action": (
            "Enable customer-managed encryption at rest (CMEK/KMS-backed key) "
            "during an approved maintenance window — take a verified backup "
            "first so the change is reversible; encryption is transparent to "
            "the application and requires no schema change."
        ),
        "rationale": "The database is unencrypted and may contain sensitive project or customer records.",
        "risk_level": finding.severity,
        "estimated_monthly_savings": 0,
        "estimated_carbon_reduction_kg": 0,
        "confidence": 0.86,
        "agent_outputs": {
            "security": "Unencrypted databases create data-protection and compliance risk.",
            "workflow": "Application downtime and backup readiness must be confirmed before changes.",
            "audit": "Security, DevOps, application owner, and DBA approvals are required.",
            "remediation": (
                "1. Confirm a current, verified backup/export of the database "
                "exists before touching encryption.\n"
                "2. Provision a KMS/CMEK key (with rotation enabled) in the "
                "same region as the database.\n"
                "3. Schedule a maintenance window with the application owner, "
                "avoiding the nightly reporting batch.\n"
                "4. Enable encryption at rest using the CMEK key (engine-"
                "native setting or an encrypted replica/restore, per platform).\n"
                "5. Verify the database comes up healthy, the app connects, and "
                "encryption status now reads enabled.\n"
                "6. Record the KMS key id in the data-protection register. "
                "Rollback path: restore the pre-change backup from step 1."
            ),
        },
    }


def _generic(finding: Finding) -> dict:
    return {
        "recommended_action": "Review the finding and confirm the safest remediation path.",
        "rationale": "The system detected a cloud governance issue that requires human review.",
        "risk_level": finding.severity,
        "estimated_monthly_savings": 0,
        "estimated_carbon_reduction_kg": 0,
        "confidence": 0.65,
        "agent_outputs": {
            "audit": f"Generated at {datetime.now(UTC).isoformat()}",
        },
    }
