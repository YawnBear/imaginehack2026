#!/usr/bin/env python3
"""Reset watch/infra-snapshot.json to an empty resource list."""
import json
import os

WATCH = os.path.dirname(os.path.abspath(__file__))
SNAP = os.path.join(WATCH, "infra-snapshot.json")


def reset():
    snapshot = {"resources": []}
    with open(SNAP, "w") as fh:
        json.dump(snapshot, fh, indent=2)
    print("watch/infra-snapshot.json reset: no resources")


if __name__ == "__main__":
    reset()
