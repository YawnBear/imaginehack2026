# GreenGuard Cloud FastAPI Backend

FastAPI backend scaffold for the GreenGuard Cloud MVP.

## Local Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

The API will run at:

```text
http://127.0.0.1:8000
```

Docs:

```text
http://127.0.0.1:8000/docs
```

## Render Web Service

Use these Render settings:

```text
Root Directory: backend
Build Command: pip install -r requirements.txt
Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
```

## Environment Variables

Copy `.env.example` to `.env` for local development.

The backend currently uses an in-memory store by default. Events, rules, agents, and workflows are created explicitly through the API or UI. Render Postgres and Alembic are scaffolded as the next persistence step.
