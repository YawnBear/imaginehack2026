# INSTRUCTIONS — How 5 people (and their AI agents) build this without clashing

> **Read this before you or your AI assistant touch the repo.** Everyone is building in the
> same repo at the same time, often with an AI agent. The #1 way a hackathon repo breaks is two
> agents editing the same file and producing merge conflicts (or silently overwriting each
> other). This file prevents that with **strict file ownership + a frozen contract**.
>
> The shared contract (data model, API, enums) lives in **ARCHITECTURE.md**. This file is about
> **who edits what, and how we branch & merge.**

---

## The 5 golden rules

1. **Stay in your lane.** Only edit files your role owns (table below). If you think you need to
   edit someone else's file, **stop and message them** — don't let your agent "helpfully" rewrite it.
2. **The contract is frozen.** Field names + enum strings in `ARCHITECTURE.md §4` are law. If you
   genuinely must change one, change **both** the backend schema **and** the frontend type in the
   **same PR**, and announce it in the team chat. Never one side only.
3. **One branch per person.** Work on `feat/<your-name>` (e.g. `feat/eugine`). Never commit
   straight to `main`. Open a PR; another member skims it before merge.
4. **Pull `main` before you start, and before you open a PR.** Rebase/merge `main` into your
   branch so conflicts surface on your machine, not in the PR.
5. **Tell your AI agent its boundaries.** Paste the "Your AI agent's standing orders" block below
   into your agent at the start of every session. Agents don't know the team plan unless you tell them.

---

## File ownership map

| Member | Role | **Owns (edit freely)** | **Must NOT edit** |
| --- | --- | --- | --- |
| **M1** | Product / UX | `PRD.md`, `plan.md`, `questions.md`, `/docs/**`, demo script, wireframes | code under `app/**`, `backend/**` |
| **M2** (Eugine) | **Frontend** | `app/**` (all routes, components, lib, `globals.css`, `layout.tsx`), `app/lib/types.ts`, `app/lib/api.ts`, `app/lib/mockData.ts` | `backend/**`, `PRD.md`, `plan.md` |
| **M3** | Backend / API | `backend/app/api/**`, `backend/app/services/{store,governance,dependencies}.py`, `backend/app/db/**`, `backend/main.py`, `backend/app/core/config.py`, Alembic migrations | `app/**`, `backend/app/rules/**`, `backend/app/agents/**`, `backend/app/services/seed.py` |
| **M4** | AI / Rules | `backend/app/rules/**`, `backend/app/agents/**` (incl. `ai_client.py` — the GrafiLab LLM client), `backend/app/services/seed.py` (mock events). **🤖 Coding the AI? READ `ARCHITECTURE.md §12` FIRST — it's the full implementation guide.** | `app/**`, `backend/app/api/**`, persistence/services |
| **M5** | QA / DevOps / Integration | `render.yaml`/Render config, `vercel.json`, `.env.example` files, CI workflow, integration tests, the **Deploy** section of `README.md` | feature source in `app/**` and `backend/app/**` (report bugs to the owner; don't rewrite) |

### Shared / contract-surface files (touch ONLY by coordination)
These define the seam between two people. A change here ripples — sync in the same PR:
- **REST/data contract:** `backend/app/schemas/**` (Pydantic DTOs, **M3**) ⇄ `app/lib/types.ts` +
  `app/lib/api.ts` (TS types + client, **M2**). M3 owns the schemas, M2 owns the TS types.
- **AI enrichment hook:** `backend/app/services/governance.py` is **M3's file**, but its
  `_maybe_enrich_recommendation()` *calls* **M4's** `ai_client.py`. If M4 changes the
  `generate_agent_analysis()` signature or return shape, M4 + M3 sync together. M4 edits
  `ai_client.py`; M3 edits the hook in `governance.py`.
- **`ai_generated` flag** spans three owners: the field in `backend/app/schemas/findings.py` (M3),
  the type in `app/lib/types.ts` (M2), and the "✨ AI-generated" badge in
  `app/components/FindingModal.tsx` (M2). Keep the name + meaning identical across all three.

Nobody outside these owners edits these files.

---

## Branch & merge workflow (trunk-based)

```bash
git checkout main && git pull
git checkout -b feat/<your-name>          # e.g. feat/eugine
# ...build only the files you own...
git add <your files>                      # add specific paths, NOT `git add -A`
git commit -m "feat(<area>): <what>"
git pull --rebase origin main             # resolve conflicts locally
git push -u origin feat/<your-name>
# open PR → one teammate reviews → squash-merge to main
```

- **Add specific paths, never `git add -A`** — it sweeps in other people's WIP and build junk.
- Keep PRs small and frequent. A 200-line PR merges clean; a 2000-line one fights everyone.
- `main` should always build. If your PR breaks `next build` or the backend boot, fix before merge.

---

## Integration points (where the slices meet)

1. **Frontend ⇄ Backend** = the REST contract in `ARCHITECTURE.md §5`. The frontend reads
   `NEXT_PUBLIC_API_BASE_URL`; with it unset it runs on bundled mock data, so M2 is never blocked
   by the backend being down. When wiring live, the JSON shapes must match `§4`/`§5` exactly
   (esp. the **nested** `/api/findings/{id}`).
2. **Rules ⇄ API** = M4's `evaluate_event()` + `build_recommendation()` feed M3's
   `GovernanceService`. M4 changes detection/recommendation logic; M3 changes how it's stored/served.
3. **Seed data** = M4 owns `seed.py`. M5 relies on it for a stable demo + can hit `POST /api/demo/seed`.
4. **Deploy** = M5 wires Vercel + Render and the env vars; M2/M3 just keep their start commands intact.
5. **AI layer (hybrid)** = **M4** owns `ai_client.py` (the GrafiLab call); M3 owns the lazy-enrich
   hook in `governance.py` that invokes it. The rule engine stays the source of truth — the LLM only
   rewrites `agent_outputs` text, never detection or the $/carbon numbers. Full guide + the exact
   API request shape = **`ARCHITECTURE.md §12`**. The real `AI_PROVIDER_API_KEY` lives ONLY in the
   Render dashboard (M5); `*.env.example` carries placeholders only — **never commit a real key.**

---

## Your AI agent's standing orders (paste this into your agent each session)

```
You are working in a shared 5-person hackathon repo. Before editing:
1. Read ARCHITECTURE.md (the frozen data model + API contract) and INSTRUCTIONS.md (ownership).
2. I am Member <N>, the <role>. You may ONLY create/edit files this member owns per the
   ownership map in INSTRUCTIONS.md. Do NOT touch any other member's files — not even to
   "fix" them. If a fix seems to require editing outside my lane, STOP and tell me instead.
3. Do not rename any field or change any enum string from ARCHITECTURE.md §4. If the task
   truly needs a contract change, STOP and flag it — it must be coordinated with the other side.
4. Use `git add <specific paths>`, never `git add -A`. Work on branch feat/<my-name> only.
5. On this Windows box: Python via `uv` (not pip/py); run Next.js with `node` (not bun);
   `git add -A` and broad installs are discouraged.
```

---

## Current state (on branch `Eugine`)

- **Backend** (M3/M4): 4-rule engine, recommendation layer, approval workflow (multi-reviewer),
  audit trail, in-memory store, auto-seeds 4 findings. **+ Hybrid AI layer** (`ai_client.py` +
  lazy enrich in `governance.py`) — **disabled by default** via placeholder key; with a real
  `AI_PROVIDER_API_KEY` it rewrites `agent_outputs` text live (see `ARCHITECTURE.md §12`). Runs via
  `uv` + uvicorn.
- **Frontend** (M2/Eugine): full app — Overview/Security/Cost/Energy/Audit panels, chip filters,
  finding-detail/approval modal, "Red Broadcast" design, live carbon counter, **global search
  (`/search`), profile + 6-role reviewer switcher, "Run scan", audit export, in-app help modal**,
  mock-data fallback. Same-origin API via `next.config.ts` proxy (`API_PROXY_TARGET`).
- **Repo:** `github.com/YawnBear/imaginehack2026`, working branch **`Eugine`**. Deploy = Vercel
  (frontend) + Render (backend); runbook in `ARCHITECTURE.md §10`. Real secrets only in the host
  dashboards — `.env*` is gitignored, only `*.env.example` placeholders are committed.
