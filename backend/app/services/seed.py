from app.schemas import CloudEvent


def demo_events() -> list[CloudEvent]:
    return []


def seed_builtin_configuration(
    store,
    *,
    rules: bool = True,
    agents: bool = True,
    workflows: bool = True,
) -> None:
    return None
