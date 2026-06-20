from itertools import combinations

from app.schemas import ClashWarning, Rule


def detect_clashes(rules: list[Rule]) -> list[ClashWarning]:
    """Warn when two ENABLED rules target the same resource_type and share a
    condition field — the likely source of duplicate/abnormal findings."""
    enabled = [rule for rule in rules if rule.enabled]
    warnings: list[ClashWarning] = []
    for rule_a, rule_b in combinations(enabled, 2):
        if rule_a.resource_type != rule_b.resource_type:
            continue
        fields_a = {condition.field for condition in rule_a.conditions}
        fields_b = {condition.field for condition in rule_b.conditions}
        shared = sorted(fields_a & fields_b)
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
