#!/usr/bin/env python3
"""Re-inject the demo storyline into watch/infra-snapshot.json (reset to a
risky state so the detect->approve->resolve loop can be demoed again)."""
import json
import os

WATCH = os.path.dirname(os.path.abspath(__file__))
SNAP = os.path.join(WATCH, "infra-snapshot.json")


def reset():
    snapshot = {
        "resources": [
            {"event_id": "agent-bucket-001", "provider": "agent", "account_id": "client-account",
             "resource_id": "bucket-project-drawings", "resource_name": "Project Drawings Bucket",
             "resource_type": "bucket", "environment": "production", "owner_team": "Document Platform",
             "config": {"public_access": True}, "metrics": {}, "cost": {}},
        ]
    }
    with open(SNAP, "w") as fh:
        json.dump(snapshot, fh, indent=2)
    print("watch/infra-snapshot.json reset: bucket-project-drawings is public again")


if __name__ == "__main__":
    reset()
