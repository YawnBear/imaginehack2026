from app.rules.seed_rules import builtin_rules
from app.services.seed import demo_events


def test_demo_events_are_not_seeded():
    assert demo_events() == []


def test_builtin_rules_are_not_seeded():
    assert builtin_rules() == []
