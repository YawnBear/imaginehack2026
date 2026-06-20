from itertools import combinations

from app.schemas import ClashWarning, Rule, RuleCondition


def detect_clashes(rules: list[Rule]) -> list[ClashWarning]:
    """Warn when two ENABLED rules target the same resource_type and share a
    condition field — the likely source of duplicate/abnormal findings."""
    enabled = [rule for rule in rules if rule.enabled]
    warnings: list[ClashWarning] = []
    for rule_a, rule_b in combinations(enabled, 2):
        if rule_a.source_type != rule_b.source_type:
            continue
        if rule_a.resource_type != rule_b.resource_type:
            continue
        by_field_a = _conditions_by_field(rule_a.conditions)
        by_field_b = _conditions_by_field(rule_b.conditions)
        fields_a = set(by_field_a)
        fields_b = set(by_field_b)
        shared = sorted(fields_a & fields_b)
        if any(
            not _field_conditions_can_overlap(by_field_a[field], by_field_b[field])
            for field in shared
        ):
            continue
        for field in shared:
            warnings.append(
                ClashWarning(
                    rule_id_a=rule_a.rule_id,
                    rule_id_b=rule_b.rule_id,
                    resource_type=rule_a.resource_type,
                    field=field,
                    message=(
                        f"'{rule_a.name}' and '{rule_b.name}' both test "
                        f"{rule_a.resource_type}.{field} — they may double-fire."
                    ),
                )
            )
    return warnings


def _conditions_by_field(conditions: list[RuleCondition]) -> dict[str, list[RuleCondition]]:
    by_field: dict[str, list[RuleCondition]] = {}
    for condition in conditions:
        by_field.setdefault(condition.field, []).append(condition)
    return by_field


def _field_conditions_can_overlap(
    conditions_a: list[RuleCondition],
    conditions_b: list[RuleCondition],
) -> bool:
    return any(
        _condition_pair_can_overlap(condition_a, condition_b)
        for condition_a in conditions_a
        for condition_b in conditions_b
    )


def _condition_pair_can_overlap(left: RuleCondition, right: RuleCondition) -> bool:
    left_values = _allowed_values(left)
    right_values = _allowed_values(right)
    if left_values is not None and right_values is not None:
        return bool(left_values & right_values)
    if left.operator == "!=" and right_values is not None:
        return any(value != left.value for value in right_values)
    if right.operator == "!=" and left_values is not None:
        return any(value != right.value for value in left_values)
    return True


def _allowed_values(condition: RuleCondition) -> set | None:
    if condition.operator == "==":
        return {condition.value}
    if condition.operator == "in":
        if isinstance(condition.value, list):
            return set(condition.value)
        return {condition.value}
    return None
