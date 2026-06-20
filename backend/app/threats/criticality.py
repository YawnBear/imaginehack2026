from app.schemas import CloudEvent, Finding

_SEVERITY = {"critical": 40, "high": 30, "medium": 18, "low": 8}
_ISSUE_FACTORS: dict[str, dict[str, int]] = {
    "public_bucket": {"internet_exposure": 25, "data_sensitivity": 15},
    "idle_vm": {"idle_compute_waste": 10},
    "unused_storage": {"orphaned_storage": 10},
    "unencrypted_database": {"data_sensitivity": 15},
    "failed_login": {"identity_attack": 20},
    "iam_policy_change": {"privilege_change": 25},
    "firewall_ingress_change": {"network_exposure": 25},
    "bucket_policy_change": {"bucket_policy_change": 20},
    "audit_logging_change": {"audit_visibility_loss": 30},
    "database_change": {"database_control_change": 15},
}


def _factor(factors: dict[str, int], name: str, value: int) -> None:
    factors[name] = max(factors.get(name, 0), value)


def compute_criticality(finding: Finding, event: CloudEvent | None) -> tuple[int, dict[str, int]]:
    factors: dict[str, int] = {"severity": _SEVERITY.get(finding.severity, 10)}
    evidence = finding.evidence or {}
    for name, value in _ISSUE_FACTORS.get(finding.issue_type, {}).items():
        _factor(factors, name, value)

    env = (getattr(event, "environment", None) or evidence.get("environment") or "").lower()
    if bool(evidence.get("public_access")):
        _factor(factors, "internet_exposure", 25)
    if bool(evidence.get("contains_sensitive_data")):
        _factor(factors, "data_sensitivity", 15)
    if env == "production":
        factors["production"] = 15
    if evidence.get("application_id"):
        factors["blast_radius"] = 5

    return min(100, sum(factors.values())), factors
