from dataclasses import dataclass
from typing import Any

from app.rules.operators import evaluate_condition, resolve_field
from app.schemas import CloudEvent, Rule

_SEVERITY_LADDER = ["low", "medium", "high", "critical"]


@dataclass(frozen=True)
class RuleMatch:
    rule_id: str
    issue_type: str
    category: str
    severity: str
    evidence: dict[str, Any]
    rule_confidence: float
    required_reviewers: list[str]


def evaluate_event(event: CloudEvent, rules: list[Rule]) -> list[RuleMatch]:
    matches: list[RuleMatch] = []
    for rule in rules:
        if not rule.enabled:
            continue
        if rule.source_type != event.source_type:
            continue
        if rule.resource_type is not None and rule.resource_type != event.resource_type:
            continue
        if all(evaluate_condition(event, condition) for condition in rule.conditions):
            matches.append(build_match(event, rule))
    return matches


def build_match(event: CloudEvent, rule: Rule) -> RuleMatch:
    severity = rule.severity_base
    if rule.escalate_in_prod and (event.environment or "").lower() == "production":
        severity = _escalate(severity)

    evidence: dict[str, Any] = {}
    for condition in rule.conditions:
        evidence[_leaf(condition.field)] = resolve_field(event, condition.field)
    for path in rule.evidence_fields:
        evidence[_leaf(path)] = resolve_field(event, path)

    return RuleMatch(
        rule_id=rule.rule_id,
        issue_type=rule.issue_type,
        category=rule.category,
        severity=severity,
        evidence=evidence,
        rule_confidence=rule.rule_confidence,
        required_reviewers=list(rule.required_reviewers),
    )


def _escalate(severity: str) -> str:
    try:
        idx = _SEVERITY_LADDER.index(severity)
    except ValueError:
        return severity
    return _SEVERITY_LADDER[min(idx + 1, len(_SEVERITY_LADDER) - 1)]


def _leaf(path: str) -> str:
    return path.rsplit(".", 1)[-1]
