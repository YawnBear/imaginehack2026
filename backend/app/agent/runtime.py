"""Pure agent logic, shared by the FastAPI tests and the standalone
safecloud-agent.py script. No FastAPI / no network here."""

from copy import deepcopy
from typing import Any


def apply_remediation(snapshot: dict, action_key: str, resource_id: str) -> dict:
    """Return a NEW snapshot with the remediation applied to one resource.

    Reversible-by-design for the demo: mutates the watched infra-snapshot so the
    next scan no longer detects the issue. The original snapshot is not mutated.
    """
    snap = deepcopy(snapshot)
    resources = snap.get("resources", [])
    new_resources: list[dict] = []
    for resource in resources:
        if resource.get("resource_id") != resource_id:
            new_resources.append(resource)
            continue
        if action_key == "delete_storage":
            continue  # drop the resource entirely
        config = dict(resource.get("config", {}))
        if action_key == "restrict_public_access":
            config["public_access"] = False
        elif action_key == "stop_vm":
            config["status"] = "stopped"
            resource["metrics"] = {**resource.get("metrics", {}), "avg_cpu_percent_7d": 0}
        elif action_key == "plan_encryption":
            config["encrypted"] = True
        else:  # tag_resource / snapshot_then_flag / unknown -> tag only
            resource["tags"] = [*resource.get("tags", []), "safecloud_remediated"]
        resource["config"] = config
        new_resources.append(resource)
    snap["resources"] = new_resources
    return snap


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
