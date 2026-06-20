#!/usr/bin/env python3
"""SafeCloud client agent. Runs on the client box. Stdlib only.

Loop: pull config -> scan watch/infra-snapshot.json -> POST events -> poll
approved remediation commands -> apply to the snapshot (+ activity.log) ->
report result. Resolves the finding the next scan.

Usage:
  SAFECLOUD_API=http://127.0.0.1:8000 python3 safecloud-agent.py            # one cycle
  python3 safecloud-agent.py --loop 5                                       # every 5s
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "backend"))
from app.agent.runtime import apply_remediation, snapshot_to_events  # noqa: E402

BASE = os.environ.get("SAFECLOUD_API", "http://127.0.0.1:8000").rstrip("/")
TOKEN = os.environ.get("SAFECLOUD_AGENT_TOKEN", "safecloud-demo-agent-token")
WATCH = os.path.join(ROOT, "watch")
SNAP_PATH = os.path.join(WATCH, "infra-snapshot.json")
ACTIVITY_PATH = os.path.join(WATCH, "activity.log")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{BASE}{path}", data=data, method=method,
        headers={"Content-Type": "application/json", "X-Agent-Token": TOKEN},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)


def _read_snapshot():
    with open(SNAP_PATH) as fh:
        return json.load(fh)


def _write_snapshot(snap):
    with open(SNAP_PATH, "w") as fh:
        json.dump(snap, fh, indent=2)


def cycle():
    _req("POST", "/api/agent/enroll")
    config = _req("GET", "/api/agent/config")
    print(f"[agent] config: {len(config['rules'])} rules, {len(config['agents'])} agents, "
          f"policy={config['policy'].get('default_mode')}")

    snap = _read_snapshot()
    events = snapshot_to_events(snap, _now())
    ingest = _req("POST", "/api/agent/events", {"events": events, "activities": []})
    print(f"[agent] scan -> {ingest['created_findings']} new findings "
          f"({ingest['duplicate_events']} dup)")

    commands = _req("GET", "/api/agent/commands")["items"]
    for cmd in commands:
        rid = cmd.get("resource_id") or ""
        print(f"[agent] executing {cmd['action_key']} on {rid} (destructive={cmd['destructive']})")
        snap = apply_remediation(snap, cmd["action_key"], rid)
        _write_snapshot(snap)
        with open(ACTIVITY_PATH, "a") as fh:
            fh.write(f"{_now()} safecloud-agent {cmd['action_key']} {rid} per command {cmd['command_id']}\n")
        _req("POST", f"/api/agent/commands/{cmd['command_id']}/result",
             {"status": "completed", "result": f"snapshot patched: {cmd['action_key']} on {rid}"})
        print(f"[agent] done -> finding resolved on next scan")
    if not commands:
        print("[agent] no approved commands pending")


def main():
    if "--loop" in sys.argv:
        interval = int(sys.argv[sys.argv.index("--loop") + 1])
        while True:
            try:
                cycle()
            except Exception as exc:  # noqa: BLE001 - keep the agent alive
                print(f"[agent] error: {exc}")
            time.sleep(interval)
    else:
        cycle()


if __name__ == "__main__":
    main()
