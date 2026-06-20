from app.agent.runtime import snapshot_to_events

SNAP = {
    "resources": [
        {"resource_id": "bucket-x", "resource_type": "bucket", "config": {"public_access": True}},
        {"resource_id": "vm-y", "resource_type": "vm", "config": {}, "metrics": {"avg_cpu_percent_7d": 2}},
        {"resource_id": "vol-z", "resource_type": "storage", "config": {"attached": False}},
        {"resource_id": "db-w", "resource_type": "database", "config": {"encrypted": False}},
    ]
}


def test_snapshot_to_events_stamps_timestamp():
    events = snapshot_to_events(SNAP, "2026-06-20T10:00:00Z")
    assert len(events) == 4
    assert all(e["timestamp"] == "2026-06-20T10:00:00Z" for e in events)
    assert all("event_id" in e and "account_id" in e for e in events)
