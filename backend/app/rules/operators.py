from typing import Any

from app.schemas import CloudEvent, RuleCondition

_NESTED_ROOTS = {"config", "metrics", "cost"}


def resolve_field(event: CloudEvent, path: str) -> Any:
    """Resolve a dot-path against a CloudEvent. Missing -> None.

    Top-level attrs (resource_type, environment, ...) are read directly.
    Nested paths (config.x, metrics.y, cost.z) index the dict attribute.
    """
    if "." not in path:
        return getattr(event, path, None)
    head, _, rest = path.partition(".")
    if head not in _NESTED_ROOTS:
        return None
    container = getattr(event, head, None)
    if not isinstance(container, dict):
        return None
    cursor: Any = container
    for part in rest.split("."):
        if not isinstance(cursor, dict) or part not in cursor:
            return None
        cursor = cursor[part]
    return cursor


def _to_number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _numeric_compare(actual: Any, expected: Any, fn) -> bool:
    a = _to_number(actual)
    b = _to_number(expected)
    if a is None or b is None:
        return False
    return fn(a, b)


OPERATORS = {
    "==": lambda actual, expected: actual == expected,
    "!=": lambda actual, expected: actual != expected,
    "<": lambda actual, expected: _numeric_compare(actual, expected, lambda a, b: a < b),
    "<=": lambda actual, expected: _numeric_compare(actual, expected, lambda a, b: a <= b),
    ">": lambda actual, expected: _numeric_compare(actual, expected, lambda a, b: a > b),
    ">=": lambda actual, expected: _numeric_compare(actual, expected, lambda a, b: a >= b),
    "in": lambda actual, expected: actual in expected if isinstance(expected, (list, tuple, set)) else False,
    "not_in": lambda actual, expected: actual not in expected if isinstance(expected, (list, tuple, set)) else False,
    "exists": lambda actual, expected: actual is not None,
    "contains": lambda actual, expected: (expected in actual) if isinstance(actual, (str, list, tuple, set, dict)) else False,
}


def evaluate_condition(event: CloudEvent, condition: RuleCondition) -> bool:
    actual = resolve_field(event, condition.field)
    fn = OPERATORS.get(condition.operator)
    if fn is None:
        return False
    return bool(fn(actual, condition.value))
