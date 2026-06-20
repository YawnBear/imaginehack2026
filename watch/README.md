# SafeCloud Agent — watched folder

`safecloud-agent.py` (repo root) reads `infra-snapshot.json` here, scans it into
the control plane, and applies approved remediations back into this file.

Demo:
1. Start the backend (`cd backend && .venv/bin/python -m uvicorn main:app --port 8000`).
2. `python3 safecloud-agent.py --loop 5` (repo root).
3. In the dashboard, approve a finding (all required reviewers).
4. Next agent cycle executes it, patches `infra-snapshot.json`, and the finding
   flips to `action_completed`.
5. `python3 watch/generator.py` to reset the storyline and demo again.
