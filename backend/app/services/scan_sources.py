from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Mapping

from app.schemas import CloudEvent


def asset_row_to_event(row: Mapping[str, Any]) -> CloudEvent | None:
    resource_type = _resource_type(row.get("asset_type"))
    if resource_type is None:
        return None

    raw = row.get("raw_scan_payload") if isinstance(row.get("raw_scan_payload"), dict) else {}
    metrics = raw.get("metrics") if isinstance(raw.get("metrics"), dict) else {}
    resource = raw.get("resource") if isinstance(raw.get("resource"), dict) else {}

    event_metrics: dict[str, Any] = {}
    config: dict[str, Any] = {
        "source_type": "asset_scan",
        "source_id": row.get("id"),
        "asset_id": row.get("asset_id"),
        "business_service": row.get("business_service"),
        "public_exposure": row.get("public_exposure"),
    }

    if resource_type == "vm":
        event_metrics.update(
            {
                "avg_cpu_percent_7d": _num(
                    metrics.get("cpu_utilization_avg"),
                    row.get("utilisation_percentage"),
                ),
                "network_in_mb_7d": _scaled_week(metrics.get("network_in_mb_per_day_avg")),
                "network_out_mb_7d": _scaled_week(metrics.get("network_out_mb_per_day_avg")),
            }
        )
        config["application_id"] = row.get("business_service")
        config["resource_status"] = row.get("resource_status")
    elif resource_type == "storage":
        config["attached"] = not _is_unattached(row, resource)
        event_metrics.update(
            {
                "read_ops_30d": _num(metrics.get("volume_read_ops_sum"), 0),
                "write_ops_30d": _num(metrics.get("volume_write_ops_sum"), 0),
            }
        )
    elif resource_type == "database":
        config.update(
            {
                "encrypted": str(row.get("encryption_status") or "").lower() == "encrypted",
                "application_id": row.get("business_service"),
                "engine": _database_engine(row, resource),
                "public_access": bool(row.get("public_exposure")),
            }
        )
        event_metrics["avg_cpu_percent_7d"] = _num(
            metrics.get("cpu_utilization_avg"),
            row.get("utilisation_percentage"),
        )
    elif resource_type == "bucket":
        config["public_access"] = bool(row.get("public_exposure"))

    timestamp = row.get("last_scanned_at") or datetime.now(UTC)
    if isinstance(timestamp, str):
        timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))

    return CloudEvent(
        event_id=f"scan-{row.get('id') or row.get('asset_id')}",
        source_type="asset_scan",
        provider=str(row.get("provider") or "mock"),
        account_id=str(row.get("cloud_account_id") or "unknown"),
        region=row.get("region"),
        resource_id=str(row.get("asset_id") or row.get("id")),
        resource_name=row.get("asset_name"),
        resource_type=resource_type,
        environment=row.get("environment"),
        project_id=row.get("business_service"),
        owner_team=row.get("owner_team"),
        timestamp=timestamp,
        config={k: v for k, v in config.items() if v is not None},
        metrics=event_metrics,
        cost={"monthly_usd": _num(row.get("estimated_cost"), 0)},
    )


def build_scan_events_from_asset_rows(rows: list[Mapping[str, Any]]) -> list[CloudEvent]:
    return [event for row in rows if (event := asset_row_to_event(row)) is not None]


def _resource_type(value: Any) -> str | None:
    text = str(value or "").lower()
    if "bucket" in text:
        return "bucket"
    if "database" in text or text in {"db", "rds"}:
        return "database"
    if "storage" in text or "volume" in text or text.startswith("disk"):
        return "storage"
    if "vm" in text or "instance" in text or "compute" in text:
        return "vm"
    return None


def _num(*values: Any) -> float:
    for value in values:
        if value is None:
            continue
        if isinstance(value, Decimal):
            return float(value)
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return 0


def _scaled_week(value: Any) -> float:
    return round(_num(value) * 7, 2)


def _is_unattached(row: Mapping[str, Any], resource: Mapping[str, Any]) -> bool:
    if str(row.get("resource_status") or "").lower() in {"available", "detached", "unused"}:
        return True
    attachments = resource.get("attachmentSet")
    return isinstance(attachments, list) and len(attachments) == 0


def _database_engine(row: Mapping[str, Any], resource: Mapping[str, Any]) -> str | None:
    if resource.get("Engine"):
        return str(resource["Engine"])
    software = row.get("installed_software")
    if isinstance(software, list) and software:
        first = software[0]
        if isinstance(first, dict) and first.get("name"):
            return str(first["name"])
    return None
