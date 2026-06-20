"""Postgres-backed store with the same interface as InMemoryStore.

Each in-memory collection becomes rows in a single ``safecloud_kv`` jsonb table
(``collection``, ``id``, ``seq``, ``data``). Writes are write-through, so state
survives a restart. The services are untouched — they keep using
``store.findings[id]``, ``store.rules.values()``, ``store.audit_logs.append(...)``
etc., because ``PersistentDict``/``PersistentList`` mimic dict/list semantics.

Tests keep using ``InMemoryStore`` directly (conftest forces DATABASE_URL=""), so
the real database is never touched by the suite.
"""

from datetime import datetime
from typing import Type
from uuid import uuid4

from pydantic import BaseModel
from sqlalchemy import (
    BigInteger,
    Column,
    MetaData,
    String,
    Table,
    create_engine,
    delete,
    func,
    select,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.agents.seed_agents import builtin_agents
from app.rules.seed_rules import builtin_rules
from app.schemas import (
    Activity,
    Agent,
    ApprovalDecision,
    AuditLog,
    CloudEvent,
    Finding,
    Recommendation,
    Rule,
    ThreatReport,
)

_metadata = MetaData()
KV = Table(
    "safecloud_kv",
    _metadata,
    Column("collection", String, primary_key=True),
    Column("id", String, primary_key=True),
    Column("seq", BigInteger),
    Column("data", JSONB, nullable=False),
)


def _make_engine(url: str):
    # SQLAlchemy needs the psycopg(3) driver; the raw Supabase URL uses the
    # bare postgresql:// scheme which defaults to psycopg2 (not installed).
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)


class PersistentDict:
    """Dict-like view over one ``collection`` in the kv table."""

    def __init__(self, engine, collection: str, model: Type[BaseModel]) -> None:
        self._engine = engine
        self._c = collection
        self._model = model

    def __getitem__(self, key: str):
        with self._engine.connect() as conn:
            row = conn.execute(
                select(KV.c.data).where(KV.c.collection == self._c, KV.c.id == key)
            ).first()
        if row is None:
            raise KeyError(key)
        return self._model(**row[0])

    def get(self, key: str, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def __setitem__(self, key: str, value: BaseModel) -> None:
        data = value.model_dump(mode="json")
        stmt = pg_insert(KV).values(collection=self._c, id=key, data=data)
        stmt = stmt.on_conflict_do_update(
            index_elements=["collection", "id"], set_={"data": data}
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)

    def __delitem__(self, key: str) -> None:
        with self._engine.begin() as conn:
            conn.execute(delete(KV).where(KV.c.collection == self._c, KV.c.id == key))

    def pop(self, key: str, default=None):
        try:
            value = self[key]
        except KeyError:
            return default
        del self[key]
        return value

    def __contains__(self, key: str) -> bool:
        with self._engine.connect() as conn:
            row = conn.execute(
                select(KV.c.id).where(KV.c.collection == self._c, KV.c.id == key)
            ).first()
        return row is not None

    def values(self) -> list:
        with self._engine.connect() as conn:
            rows = conn.execute(
                select(KV.c.data).where(KV.c.collection == self._c).order_by(KV.c.seq)
            ).fetchall()
        return [self._model(**r[0]) for r in rows]

    def keys(self) -> list:
        with self._engine.connect() as conn:
            rows = conn.execute(
                select(KV.c.id).where(KV.c.collection == self._c).order_by(KV.c.seq)
            ).fetchall()
        return [r[0] for r in rows]

    def items(self) -> list:
        with self._engine.connect() as conn:
            rows = conn.execute(
                select(KV.c.id, KV.c.data)
                .where(KV.c.collection == self._c)
                .order_by(KV.c.seq)
            ).fetchall()
        return [(r[0], self._model(**r[1])) for r in rows]

    def __iter__(self):
        return iter(self.keys())

    def __len__(self) -> int:
        with self._engine.connect() as conn:
            return conn.execute(
                select(func.count()).select_from(KV).where(KV.c.collection == self._c)
            ).scalar() or 0

    def __bool__(self) -> bool:
        return len(self) > 0


class PersistentList:
    """Append-only, ordered list view over one ``collection``."""

    def __init__(self, engine, collection: str, model: Type[BaseModel]) -> None:
        self._engine = engine
        self._c = collection
        self._model = model

    def append(self, value: BaseModel) -> None:
        data = value.model_dump(mode="json")
        with self._engine.begin() as conn:
            conn.execute(pg_insert(KV).values(collection=self._c, id=uuid4().hex, data=data))

    def __iter__(self):
        with self._engine.connect() as conn:
            rows = conn.execute(
                select(KV.c.data).where(KV.c.collection == self._c).order_by(KV.c.seq)
            ).fetchall()
        return iter([self._model(**r[0]) for r in rows])

    def __len__(self) -> int:
        with self._engine.connect() as conn:
            return conn.execute(
                select(func.count()).select_from(KV).where(KV.c.collection == self._c)
            ).scalar() or 0


class PostgresStore:
    """Drop-in replacement for InMemoryStore, backed by Postgres."""

    def __init__(self, url: str) -> None:
        self._engine = _make_engine(url)
        with self._engine.begin() as conn:
            conn.exec_driver_sql(
                """
                CREATE TABLE IF NOT EXISTS safecloud_kv (
                    collection text NOT NULL,
                    id text NOT NULL,
                    seq bigserial,
                    data jsonb NOT NULL,
                    PRIMARY KEY (collection, id)
                );
                """
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS safecloud_kv_cseq "
                "ON safecloud_kv (collection, seq);"
            )

        self.events = PersistentDict(self._engine, "events", CloudEvent)
        self.findings = PersistentDict(self._engine, "findings", Finding)
        self.recommendations = PersistentDict(self._engine, "recommendations", Recommendation)
        self.approvals = PersistentDict(self._engine, "approvals", ApprovalDecision)
        self.audit_logs = PersistentList(self._engine, "audit_logs", AuditLog)
        self.rules = PersistentDict(self._engine, "rules", Rule)
        self.agents = PersistentDict(self._engine, "agents", Agent)
        self.threat_reports = PersistentDict(self._engine, "threat_reports", ThreatReport)
        self.activities = PersistentList(self._engine, "activities", Activity)

        # Seed built-in rules/agents ONLY when empty, so user edits survive restarts.
        if len(self.rules) == 0:
            for rule in builtin_rules():
                self.rules[rule.rule_id] = rule
        if len(self.agents) == 0:
            for agent in builtin_agents():
                self.agents[agent.output_key] = agent

    # --- scalar meta (latest_scan_at / agent_last_seen / agent_id) -----------
    def _meta_get(self, key: str):
        with self._engine.connect() as conn:
            row = conn.execute(
                select(KV.c.data).where(KV.c.collection == "meta", KV.c.id == key)
            ).first()
        return row[0]["value"] if row else None

    def _meta_set(self, key: str, value) -> None:
        data = {"value": value}
        stmt = pg_insert(KV).values(collection="meta", id=key, data=data)
        stmt = stmt.on_conflict_do_update(
            index_elements=["collection", "id"], set_={"data": data}
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)

    @property
    def latest_scan_at(self):
        value = self._meta_get("latest_scan_at")
        return datetime.fromisoformat(value) if value else None

    @latest_scan_at.setter
    def latest_scan_at(self, value) -> None:
        self._meta_set(
            "latest_scan_at", value.isoformat() if isinstance(value, datetime) else value
        )

    @property
    def agent_last_seen(self):
        value = self._meta_get("agent_last_seen")
        return datetime.fromisoformat(value) if value else None

    @agent_last_seen.setter
    def agent_last_seen(self, value) -> None:
        self._meta_set(
            "agent_last_seen", value.isoformat() if isinstance(value, datetime) else value
        )

    @property
    def agent_id(self):
        return self._meta_get("agent_id")

    @agent_id.setter
    def agent_id(self, value) -> None:
        self._meta_set("agent_id", value)

    def find_active_duplicate(self, resource_id: str, issue_type: str):
        for finding in self.findings.values():
            if (
                finding.resource_id == resource_id
                and finding.issue_type == issue_type
                and finding.status not in {"rejected", "action_completed"}
            ):
                return finding
        return None
