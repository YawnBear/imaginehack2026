"""Pure agent logic, shared by the FastAPI tests and the standalone
safecloud-agent.py script. No FastAPI / no network here."""

from typing import Any


def snapshot_to_events(snapshot: dict, timestamp: str) -> list[dict[str, Any]]:
    """Turn an infra-snapshot into CloudEvent dicts the ingest endpoint accepts."""
    events: list[dict[str, Any]] = []
    for index, resource in enumerate(snapshot.get("resources", [])):
        event = dict(resource)
        event["timestamp"] = timestamp
        event.setdefault("event_id", f"agent-{resource.get('resource_id', index)}")
        event.setdefault("provider", "agent")
        event.setdefault("account_id", "client-account")
        events.append(event)
    return events
