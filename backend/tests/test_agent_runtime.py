from app.agent.runtime import apply_remediation, snapshot_to_events

SNAP = {
    "resources": [
        {"resource_id": "bucket-x", "resource_type": "bucket", "config": {"public_access": True}},
        {"resource_id": "vm-y", "resource_type": "vm", "config": {}, "metrics": {"avg_cpu_percent_7d": 2}},
        {"resource_id": "vol-z", "resource_type": "storage", "config": {"attached": False}},
        {"resource_id": "db-w", "resource_type": "database", "config": {"encrypted": False}},
    ]
}


def test_restrict_public_access():
    out = apply_remediation(SNAP, "restrict_public_access", "bucket-x")
    assert out["resources"][0]["config"]["public_access"] is False
    # original untouched (pure)
    assert SNAP["resources"][0]["config"]["public_access"] is True


def test_stop_vm():
    out = apply_remediation(SNAP, "stop_vm", "vm-y")
    vm = next(r for r in out["resources"] if r["resource_id"] == "vm-y")
    assert vm["config"]["status"] == "stopped"


def test_delete_storage_removes_resource():
    out = apply_remediation(SNAP, "delete_storage", "vol-z")
    assert all(r["resource_id"] != "vol-z" for r in out["resources"])


def test_plan_encryption():
    out = apply_remediation(SNAP, "plan_encryption", "db-w")
    db = next(r for r in out["resources"] if r["resource_id"] == "db-w")
    assert db["config"]["encrypted"] is True


def test_unknown_action_is_noop_tag():
    out = apply_remediation(SNAP, "tag_resource", "bucket-x")
    b = next(r for r in out["resources"] if r["resource_id"] == "bucket-x")
    assert "safecloud_remediated" in b.get("tags", [])


def test_snapshot_to_events_stamps_timestamp():
    events = snapshot_to_events(SNAP, "2026-06-20T10:00:00Z")
    assert len(events) == 4
    assert all(e["timestamp"] == "2026-06-20T10:00:00Z" for e in events)
    assert all("event_id" in e and "account_id" in e for e in events)
