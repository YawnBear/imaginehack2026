from datetime import UTC, datetime
from typing import Any, Mapping

from app.schemas import CloudEvent


def cloud_event_row_to_event(row: Mapping[str, Any]) -> CloudEvent:
    raw = row.get("raw_payload") if isinstance(row.get("raw_payload"), dict) else {}
    action = str(row.get("action") or raw.get("eventName") or "")
    status = str(row.get("status") or "")
    event_type = str(row.get("event_type") or raw.get("eventType") or "")
    asset_id = row.get("asset_id")
    actor_id = row.get("actor_id") or _dig(raw, "userIdentity", "arn") or _dig(raw, "userIdentity", "userName")
    resource_id = str(asset_id or actor_id or row.get("cloud_account_id") or row.get("id"))

    timestamp = row.get("event_timestamp") or raw.get("eventTime") or datetime.now(UTC)
    if isinstance(timestamp, str):
        timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))

    return CloudEvent(
        event_id=f"cloud-{row.get('id') or raw.get('eventID')}",
        source_type="cloud_event",
        provider=str(row.get("provider") or "unknown"),
        account_id=str(row.get("cloud_account_id") or raw.get("recipientAccountId") or "unknown"),
        region=raw.get("awsRegion"),
        resource_id=resource_id,
        resource_name=str(asset_id) if asset_id else None,
        resource_type=_resource_type(action, event_type, asset_id),
        environment="unknown",
        project_id=None,
        owner_team=None,
        timestamp=timestamp,
        config={
            "source_type": "cloud_event",
            "source_id": row.get("id"),
            "event_type": event_type,
            "event_source": row.get("event_source"),
            "action": action,
            "status": status,
            "actor_id": actor_id,
            "actor_type": row.get("actor_type"),
            "asset_id": asset_id,
            "ip_address": row.get("ip_address") or raw.get("sourceIPAddress"),
            "raw_payload": raw,
        },
    )


def build_cloud_events_from_rows(rows: list[Mapping[str, Any]]) -> list[CloudEvent]:
    return [cloud_event_row_to_event(row) for row in rows]


def _resource_type(action: str, event_type: str, asset_id: Any) -> str:
    text = f"{action} {event_type}".lower()
    asset = str(asset_id or "").lower()
    if "bucket" in text or asset.startswith("arn:aws:s3") or asset.startswith("s3://"):
        return "bucket"
    if "dbinstance" in text or "database" in text or ":db:" in asset:
        return "database"
    if "securitygroup" in text or "firewall" in text or "ingress" in text:
        return "network"
    if "logging" in text or "trail" in text:
        return "audit"
    if "login" in text or "policy" in text or "iam" in text or "accesskey" in text:
        return "identity"
    if asset.startswith("i-"):
        return "vm"
    if asset.startswith("vol-"):
        return "storage"
    return "activity"


def _dig(value: Mapping[str, Any], *keys: str) -> Any:
    cursor: Any = value
    for key in keys:
        if not isinstance(cursor, dict):
            return None
        cursor = cursor.get(key)
    return cursor
