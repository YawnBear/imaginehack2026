from app.schemas import CloudEvent, Finding

_SEVERITY = {"critical": 40, "high": 30, "medium": 18, "low": 8}


def compute_criticality(finding: Finding, event: CloudEvent | None) -> tuple[int, dict[str, int]]:
    factors: dict[str, int] = {"severity": _SEVERITY.get(finding.severity, 10)}
    evidence = finding.evidence or {}

    env = (getattr(event, "environment", None) or evidence.get("environment") or "").lower()
    if bool(evidence.get("public_access")) or finding.issue_type == "public_bucket":
        factors["internet_exposure"] = 25
    if bool(evidence.get("contains_sensitive_data")) or finding.issue_type in {
        "unencrypted_database",
        "public_bucket",
    }:
        factors["data_sensitivity"] = 15
    if env == "production":
        factors["production"] = 15
    if evidence.get("application_id"):
        factors["blast_radius"] = 5

    return min(100, sum(factors.values())), factors
