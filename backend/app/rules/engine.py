from dataclasses import dataclass
from typing import Any

from app.schemas import CloudEvent


@dataclass(frozen=True)
class RuleMatch:
    rule_id: str
    issue_type: str
    category: str
    severity: str
    evidence: dict[str, Any]
    rule_confidence: float
    required_reviewers: list[str]


def evaluate_event(event: CloudEvent) -> list[RuleMatch]:
    matches: list[RuleMatch] = []

    public_bucket = event.resource_type == "bucket" and event.config.get("public_access") is True
    if public_bucket:
        matches.append(
            RuleMatch(
                rule_id="RULE_PUBLIC_BUCKET",
                issue_type="public_bucket",
                category="security",
                severity=_production_severity(event, production="critical", default="high"),
                evidence={
                    "public_access": True,
                    "environment": event.environment,
                    "project_id": event.project_id,
                    "owner_team": event.owner_team,
                },
                rule_confidence=0.98,
                required_reviewers=["security", "devops"],
            )
        )

    idle_vm = (
        event.resource_type == "vm"
        and _number(event.metrics.get("avg_cpu_percent_7d"), 100) <= 10
        and _number(event.metrics.get("network_in_mb_7d"), 0) <= 100
        and _number(event.metrics.get("network_out_mb_7d"), 0) <= 100
    )
    if idle_vm:
        reviewers = ["devops"]
        if event.config.get("application_id"):
            reviewers.append("application_owner")
        matches.append(
            RuleMatch(
                rule_id="RULE_IDLE_VM",
                issue_type="idle_vm",
                category="cost",
                severity=_production_severity(event, production="high", default="medium"),
                evidence={
                    "avg_cpu_percent_7d": event.metrics.get("avg_cpu_percent_7d"),
                    "network_in_mb_7d": event.metrics.get("network_in_mb_7d"),
                    "network_out_mb_7d": event.metrics.get("network_out_mb_7d"),
                    "monthly_cost_usd": event.cost.get("monthly_usd", 0),
                    "application_id": event.config.get("application_id"),
                },
                rule_confidence=0.9,
                required_reviewers=reviewers,
            )
        )

    unused_storage = (
        event.resource_type == "storage"
        and event.config.get("attached") is False
        and _number(event.metrics.get("read_ops_30d"), 0) == 0
        and _number(event.metrics.get("write_ops_30d"), 0) == 0
    )
    if unused_storage:
        reviewers = ["devops", "project_owner"]
        if event.config.get("contains_sensitive_data"):
            reviewers.append("compliance")
        matches.append(
            RuleMatch(
                rule_id="RULE_UNUSED_STORAGE",
                issue_type="unused_storage",
                category="cost",
                severity="medium",
                evidence={
                    "attached": False,
                    "read_ops_30d": event.metrics.get("read_ops_30d"),
                    "write_ops_30d": event.metrics.get("write_ops_30d"),
                    "monthly_cost_usd": event.cost.get("monthly_usd", 0),
                    "contains_sensitive_data": event.config.get("contains_sensitive_data", False),
                },
                rule_confidence=0.88,
                required_reviewers=reviewers,
            )
        )

    unencrypted_db = event.resource_type == "database" and event.config.get("encrypted") is False
    if unencrypted_db:
        matches.append(
            RuleMatch(
                rule_id="RULE_UNENCRYPTED_DATABASE",
                issue_type="unencrypted_database",
                category="security",
                severity=_production_severity(event, production="critical", default="high"),
                evidence={
                    "encrypted": False,
                    "environment": event.environment,
                    "database_engine": event.config.get("engine"),
                    "application_id": event.config.get("application_id"),
                },
                rule_confidence=0.97,
                required_reviewers=["security", "devops", "application_owner", "dba"],
            )
        )

    return matches


def _production_severity(event: CloudEvent, production: str, default: str) -> str:
    return production if (event.environment or "").lower() == "production" else default


def _number(value: Any, default: float) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
