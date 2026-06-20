from datetime import UTC, datetime
from decimal import Decimal

from app.services.scan_sources import asset_row_to_event


def _base_row(**overrides):
    row = {
        "id": "scan-1",
        "asset_id": "i-123",
        "asset_name": "Render worker",
        "asset_type": "VM",
        "provider": "AWS",
        "cloud_account_id": "acct-1",
        "region": "ap-southeast-1",
        "environment": "development",
        "owner_team": "BIM",
        "business_service": "Rendering",
        "public_exposure": False,
        "encryption_status": "encrypted",
        "resource_status": "running",
        "utilisation_percentage": Decimal("2.4"),
        "estimated_cost": Decimal("118.40"),
        "estimated_carbon_impact": Decimal("18.72"),
        "last_scanned_at": datetime(2026, 6, 20, tzinfo=UTC),
        "installed_software": [],
        "raw_scan_payload": {"metrics": {}},
    }
    row.update(overrides)
    return row


def test_vm_asset_maps_to_idle_vm_event_shape():
    event = asset_row_to_event(
        _base_row(
            raw_scan_payload={
                "metrics": {
                    "cpu_utilization_avg": 1.8,
                    "network_in_mb_per_day_avg": 12.6,
                    "network_out_mb_per_day_avg": 9.2,
                }
            }
        )
    )

    assert event is not None
    assert event.resource_type == "vm"
    assert event.metrics["avg_cpu_percent_7d"] == 1.8
    assert event.metrics["network_in_mb_7d"] == 88.2
    assert event.metrics["network_out_mb_7d"] == 64.4
    assert event.cost["monthly_usd"] == 118.4


def test_storage_asset_maps_to_unused_storage_event_shape():
    event = asset_row_to_event(
        _base_row(
            asset_id="vol-123",
            asset_type="storage volume",
            resource_status="available",
            raw_scan_payload={"metrics": {"volume_read_ops_sum": 0, "volume_write_ops_sum": 0}},
        )
    )

    assert event is not None
    assert event.resource_type == "storage"
    assert event.config["attached"] is False
    assert event.metrics["read_ops_30d"] == 0
    assert event.metrics["write_ops_30d"] == 0


def test_database_asset_maps_to_unencrypted_database_event_shape():
    event = asset_row_to_event(
        _base_row(
            asset_id="db-123",
            asset_type="database",
            encryption_status="unencrypted",
            public_exposure=True,
            installed_software=[{"name": "postgres", "version": "14"}],
        )
    )

    assert event is not None
    assert event.resource_type == "database"
    assert event.config["encrypted"] is False
    assert event.config["engine"] == "postgres"
    assert event.config["public_access"] is True
