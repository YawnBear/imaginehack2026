"""Postgres-backed store using proper per-entity tables (prefixed ``sc_``).

Each in-memory collection maps to its own typed table (typed columns for the
scalar fields + ``jsonb`` for the nested/list fields). The services are
untouched — ``TableDict``/``TableList`` mimic dict/list semantics, so they keep
using ``store.findings[id]``, ``store.rules.values()``,
``store.audit_logs.append(...)``.

These tables are namespaced ``sc_*`` so they never collide with the teammate's
existing tables (cloud_events / scanned_asset_data / cve_cache / their findings /
recommendations / audit_logs). The public.energy table is read as dashboard
time-series input and is managed by the setup SQL, not by scan ingestion.

Tests keep using ``InMemoryStore`` (conftest forces DATABASE_URL=""), so the
real database is never touched by the suite.
"""

from datetime import datetime
from decimal import Decimal
from typing import Type
from uuid import uuid4

from pydantic import BaseModel
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Identity,
    Integer,
    MetaData,
    String,
    Table,
    create_engine,
    delete,
    func,
    select,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.pool import NullPool

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
    Workflow,
)
from app.services.cloud_event_sources import build_cloud_events_from_rows
from app.services.scan_sources import build_scan_events_from_asset_rows

_md = MetaData()


def _seq() -> Column:
    # GENERATED ... AS IDENTITY — preserves insertion order for values()/iter.
    return Column("seq", Integer, Identity(), nullable=False)


sc_events = Table(
    "sc_events", _md,
    Column("event_id", String, primary_key=True),
    Column("source_type", String),
    Column("provider", String), Column("account_id", String), Column("region", String),
    Column("resource_id", String), Column("resource_name", String), Column("resource_type", String),
    Column("environment", String), Column("project_id", String), Column("owner_team", String),
    Column("timestamp", DateTime(timezone=True)),
    Column("config", JSONB), Column("metrics", JSONB), Column("cost", JSONB),
    _seq(),
)

sc_findings = Table(
    "sc_findings", _md,
    Column("finding_id", String, primary_key=True),
    Column("source_event_id", String), Column("resource_id", String), Column("resource_name", String),
    Column("resource_type", String), Column("owner_team", String), Column("issue_type", String),
    Column("category", String), Column("severity", String), Column("status", String),
    Column("rule_id", String), Column("evidence", JSONB),
    Column("rule_confidence", Float), Column("ai_confidence", Float),
    Column("required_reviewers", JSONB),
    Column("created_at", DateTime(timezone=True)), Column("updated_at", DateTime(timezone=True)),
    _seq(),
)

sc_recommendations = Table(
    "sc_recommendations", _md,
    Column("finding_id", String, primary_key=True),  # store key = finding_id
    Column("recommendation_id", String), Column("recommended_action", String),
    Column("rationale", String), Column("risk_level", String),
    Column("estimated_monthly_savings", Float), Column("estimated_carbon_reduction_kg", Float),
    Column("confidence", Float), Column("agent_outputs", JSONB),
    Column("safe_to_execute", Boolean), Column("ai_generated", Boolean),
    Column("agent_summary", String),
    _seq(),
)

sc_approvals = Table(
    "sc_approvals", _md,
    Column("approval_id", String, primary_key=True),
    Column("finding_id", String), Column("decision", String), Column("reviewer_id", String),
    Column("reviewer_role", String), Column("reason", String),
    Column("created_at", DateTime(timezone=True)),
    _seq(),
)

sc_rules = Table(
    "sc_rules", _md,
    Column("rule_id", String, primary_key=True),
    Column("name", String), Column("enabled", Boolean), Column("source_type", String),
    Column("template_key", String),
    Column("resource_type", String), Column("conditions", JSONB),
    Column("severity_base", String), Column("escalate_in_prod", Boolean),
    Column("rule_confidence", Float), Column("category", String), Column("issue_type", String),
    Column("required_reviewers", JSONB), Column("evidence_fields", JSONB),
    Column("remediation_action_key", String), Column("remediation_destructive", Boolean),
    Column("agent_keys", JSONB), Column("created_at", DateTime(timezone=True)),
    _seq(),
)

sc_agents = Table(
    "sc_agents", _md,
    Column("output_key", String, primary_key=True),  # store key = output_key
    Column("agent_id", String), Column("name", String), Column("system_prompt", String),
    Column("enabled", Boolean), Column("created_at", DateTime(timezone=True)),
    _seq(),
)

sc_threat_reports = Table(
    "sc_threat_reports", _md,
    Column("finding_id", String, primary_key=True),  # store key = finding_id
    Column("report_id", String), Column("criticality_score", Integer),
    Column("criticality_factors", JSONB), Column("summary", String), Column("timeline", JSONB),
    Column("recommended_solution", String), Column("agent_sections", JSONB),
    Column("approval_status", String), Column("ai_generated", Boolean),
    Column("generated_at", DateTime(timezone=True)),
    _seq(),
)

sc_audit_logs = Table(
    "sc_audit_logs", _md,
    Column("audit_id", String, primary_key=True),
    Column("entity_type", String), Column("entity_id", String), Column("action", String),
    Column("actor_id", String), Column("before_state", JSONB), Column("after_state", JSONB),
    Column("metadata", JSONB), Column("created_at", DateTime(timezone=True)),
    _seq(),
)

sc_activities = Table(
    "sc_activities", _md,
    Column("id", String, primary_key=True),  # generated (Activity has no id)
    Column("actor", String), Column("action", String), Column("target_resource_id", String),
    Column("timestamp", DateTime(timezone=True)), Column("source", String),
    _seq(),
)

sc_workflows = Table(
    "sc_workflows", _md,
    Column("workflow_id", String, primary_key=True),
    Column("name", String), Column("rule_id", String),
    Column("agent_keys", JSONB),
    Column("created_at", DateTime(timezone=True)),
    Column("last_run", JSONB),
    _seq(),
)

sc_meta = Table(
    "sc_meta", _md,
    Column("key", String, primary_key=True),
    Column("value", JSONB),
)


def _make_engine(url: str):
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return create_engine(url, pool_pre_ping=True, poolclass=NullPool)


def _json_cols(table: Table) -> set[str]:
    return {c.name for c in table.columns if isinstance(c.type, JSONB)}


def _to_row(table: Table, model: BaseModel, extra: dict | None = None) -> dict:
    """Build an insert dict: jsonb cols from JSON dump, scalar cols from python."""
    py = model.model_dump()
    js = model.model_dump(mode="json")
    json_cols = _json_cols(table)
    row: dict = {}
    for name in table.columns.keys():
        if name == "seq":
            continue
        if extra and name in extra:
            row[name] = extra[name]
        elif name in json_cols:
            row[name] = js.get(name)
        elif name in py:
            row[name] = py.get(name)
    return row


def _to_model(model: Type[BaseModel], mapping) -> BaseModel:
    fields = model.model_fields
    return model(**{k: mapping[k] for k in fields if k in mapping})


class TableDict:
    """Dict-like view over one entity table, keyed by ``pk``."""

    def __init__(self, engine, table: Table, pk: str, model: Type[BaseModel]) -> None:
        self._engine = engine
        self._t = table
        self._pk = pk
        self._model = model

    def __getitem__(self, key: str):
        col = self._t.c[self._pk]
        with self._engine.connect() as conn:
            row = conn.execute(select(self._t).where(col == key)).mappings().first()
        if row is None:
            raise KeyError(key)
        return _to_model(self._model, row)

    def get(self, key: str, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def __setitem__(self, key: str, value: BaseModel) -> None:
        row = _to_row(self._t, value)
        update = {k: v for k, v in row.items() if k != self._pk}
        stmt = pg_insert(self._t).values(**row).on_conflict_do_update(
            index_elements=[self._pk], set_=update
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)

    def __delitem__(self, key: str) -> None:
        col = self._t.c[self._pk]
        with self._engine.begin() as conn:
            conn.execute(delete(self._t).where(col == key))

    def pop(self, key: str, default=None):
        try:
            value = self[key]
        except KeyError:
            return default
        del self[key]
        return value

    def __contains__(self, key: str) -> bool:
        col = self._t.c[self._pk]
        with self._engine.connect() as conn:
            return conn.execute(select(col).where(col == key)).first() is not None

    def values(self) -> list:
        with self._engine.connect() as conn:
            rows = conn.execute(select(self._t).order_by(self._t.c.seq)).mappings().all()
        return [_to_model(self._model, r) for r in rows]

    def keys(self) -> list:
        col = self._t.c[self._pk]
        with self._engine.connect() as conn:
            rows = conn.execute(select(col).order_by(self._t.c.seq)).all()
        return [r[0] for r in rows]

    def items(self) -> list:
        with self._engine.connect() as conn:
            rows = conn.execute(select(self._t).order_by(self._t.c.seq)).mappings().all()
        return [(r[self._pk], _to_model(self._model, r)) for r in rows]

    def __iter__(self):
        return iter(self.keys())

    def __len__(self) -> int:
        with self._engine.connect() as conn:
            return conn.execute(select(func.count()).select_from(self._t)).scalar() or 0

    def __bool__(self) -> bool:
        return len(self) > 0


class TableList:
    """Append-only ordered list view (audit_logs / activities)."""

    def __init__(self, engine, table: Table, model: Type[BaseModel], gen_id: bool = False) -> None:
        self._engine = engine
        self._t = table
        self._model = model
        self._gen_id = gen_id

    def append(self, value: BaseModel) -> None:
        extra = {"id": uuid4().hex} if self._gen_id else None
        row = _to_row(self._t, value, extra=extra)
        with self._engine.begin() as conn:
            conn.execute(pg_insert(self._t).values(**row))

    def __iter__(self):
        with self._engine.connect() as conn:
            rows = conn.execute(select(self._t).order_by(self._t.c.seq)).mappings().all()
        return iter([_to_model(self._model, r) for r in rows])

    def __len__(self) -> int:
        with self._engine.connect() as conn:
            return conn.execute(select(func.count()).select_from(self._t)).scalar() or 0


class PostgresStore:
    def __init__(self, url: str) -> None:
        self._engine = _make_engine(url)
        _md.create_all(self._engine, checkfirst=True)
        self._ensure_app_table_columns()

        self.events = TableDict(self._engine, sc_events, "event_id", CloudEvent)
        self.findings = TableDict(self._engine, sc_findings, "finding_id", Finding)
        self.recommendations = TableDict(self._engine, sc_recommendations, "finding_id", Recommendation)
        self.approvals = TableDict(self._engine, sc_approvals, "approval_id", ApprovalDecision)
        self.rules = TableDict(self._engine, sc_rules, "rule_id", Rule)
        self.agents = TableDict(self._engine, sc_agents, "output_key", Agent)
        self.threat_reports = TableDict(self._engine, sc_threat_reports, "finding_id", ThreatReport)
        self.audit_logs = TableList(self._engine, sc_audit_logs, AuditLog)
        self.activities = TableList(self._engine, sc_activities, Activity, gen_id=True)
        self.workflows = TableDict(self._engine, sc_workflows, "workflow_id", Workflow)

    def _ensure_app_table_columns(self) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                text(
                    "alter table if exists public.sc_events "
                    "add column if not exists source_type text not null default 'asset_scan'"
                )
            )
            conn.execute(
                text(
                    "alter table if exists public.sc_rules "
                    "add column if not exists source_type text not null default 'asset_scan'"
                )
            )
            conn.execute(
                text(
                    "alter table if exists public.sc_recommendations "
                    "add column if not exists agent_summary text not null default ''"
                )
            )
            conn.execute(text("update public.sc_events set source_type = 'asset_scan' where source_type is null"))
            conn.execute(text("update public.sc_rules set source_type = 'asset_scan' where source_type is null"))

    # --- scalar meta (latest_scan_at / agent_last_seen / agent_id) -----------
    def _meta_get(self, key: str):
        with self._engine.connect() as conn:
            row = conn.execute(select(sc_meta.c.value).where(sc_meta.c.key == key)).first()
        return row[0]["value"] if row else None

    def _meta_set(self, key: str, value) -> None:
        data = {"value": value}
        stmt = pg_insert(sc_meta).values(key=key, value=data).on_conflict_do_update(
            index_elements=["key"], set_={"value": data}
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)

    @property
    def latest_scan_at(self):
        v = self._meta_get("latest_scan_at")
        return datetime.fromisoformat(v) if v else None

    @latest_scan_at.setter
    def latest_scan_at(self, value) -> None:
        self._meta_set("latest_scan_at", value.isoformat() if isinstance(value, datetime) else value)

    @property
    def agent_last_seen(self):
        v = self._meta_get("agent_last_seen")
        return datetime.fromisoformat(v) if v else None

    @agent_last_seen.setter
    def agent_last_seen(self, value) -> None:
        self._meta_set("agent_last_seen", value.isoformat() if isinstance(value, datetime) else value)

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

    def scan_source_events(self) -> list[CloudEvent]:
        return build_scan_events_from_asset_rows(self.scan_source_rows())

    def scan_source_rows(self) -> list[dict]:
        with self._engine.connect() as conn:
            rows = conn.execute(
                text(
                    "select * from public.scanned_asset_data "
                    "order by last_scanned_at desc nulls last"
                )
            ).mappings().all()
        return [dict(row) for row in rows]

    def cloud_event_source_events(self) -> list[CloudEvent]:
        return build_cloud_events_from_rows(self.cloud_event_source_rows())

    def cloud_event_source_rows(self) -> list[dict]:
        with self._engine.connect() as conn:
            rows = conn.execute(
                text(
                    "select * from public.cloud_events "
                    "order by event_timestamp desc nulls last"
                )
            ).mappings().all()
        return [dict(row) for row in rows]

    def energy_source_summary(self) -> dict:
        by_operation: dict[str, float] = {}
        history: list[dict] = []
        with self._engine.connect() as conn:
            if conn.execute(text("select to_regclass('public.energy')")).scalar() is None:
                return {"by_operation": by_operation, "history": history}

            columns = _energy_table_columns(conn)
            latest_query = _energy_latest_query(columns)
            history_query = _energy_history_query(columns)
            if latest_query is None or history_query is None:
                return {"by_operation": by_operation, "history": history}

            latest_rows = conn.execute(
                text(latest_query)
            ).mappings().all()
            energy_rows = conn.execute(
                text(history_query)
            ).mappings().all()

        current_footprint = 0.0
        estimated_reduction = 0.0
        projected_footprint = 0.0
        for row in latest_rows:
            operation = str(row["operation"])
            current = _float(row["current_footprint_kg"])
            reduction = _float(row["estimated_reduction_kg"])
            projected = _float(row["projected_footprint_kg"])
            by_operation[operation] = by_operation.get(operation, 0) + current
            current_footprint += current
            estimated_reduction += reduction
            projected_footprint += projected

        for row in energy_rows:
            timestamp = row["time"]
            label = timestamp.strftime("%b %d") if isinstance(timestamp, datetime) else str(timestamp)
            history.append(
                {
                    "label": label,
                    "timestamp": timestamp,
                    "value_kg": _float(row["emission"]),
                }
            )

        return {
            "by_operation": by_operation,
            "current_footprint_kg": current_footprint,
            "estimated_reduction_kg": estimated_reduction,
            "projected_footprint_kg": projected_footprint,
            "history": history,
        }


def _energy_table_columns(conn) -> set[str]:
    rows = conn.execute(
        text(
            """
            select column_name
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'energy'
            """
        )
    ).mappings().all()
    return {str(row["column_name"]) for row in rows}


def _energy_latest_query(columns: set[str]) -> str | None:
    time_column = _energy_time_column(columns)
    if time_column is None:
        return None

    operation_expr = _energy_coalesce(columns, ("resource_type", "operation"), "'unknown'", "e")
    current_expr = _energy_coalesce(columns, ("current_footprint_kg", "emission"), "0", "e")
    current_filter = _energy_coalesce(columns, ("current_footprint_kg", "emission"), None, "e")
    reduction_expr = _energy_coalesce(columns, ("estimated_reduction_kg",), "0", "e")
    projected_expr = _energy_coalesce(columns, ("projected_footprint_kg",), "0", "e")
    key_expr = _energy_coalesce(columns, ("source_id", "asset_id", "operation"), "'energy'", "e", cast_text=True)
    scope = _energy_scope(columns)
    order_parts = [key_expr, f"e.{time_column} desc nulls last"]
    if "updated_at" in columns:
        order_parts.append("e.updated_at desc nulls last")
    if "energy_id" in columns:
        order_parts.append("e.energy_id desc")

    where = f"where {current_filter} is not null" if current_filter != "null" else ""
    return f"""
        select
            latest.operation,
            sum(latest.current_footprint_kg) as current_footprint_kg,
            sum(latest.estimated_reduction_kg) as estimated_reduction_kg,
            sum(latest.projected_footprint_kg) as projected_footprint_kg
        from (
            select distinct on ({key_expr})
                   {operation_expr} as operation,
                   {current_expr} as current_footprint_kg,
                   {reduction_expr} as estimated_reduction_kg,
                   {projected_expr} as projected_footprint_kg
            from {scope}
            {where}
            order by {", ".join(order_parts)}
        ) latest
        group by latest.operation
        order by latest.operation
    """


def _energy_history_query(columns: set[str]) -> str | None:
    time_column = _energy_time_column(columns)
    if time_column is None:
        return None

    history_value = _energy_coalesce(columns, ("emission", "current_footprint_kg"), "0", "e")
    history_filter = _energy_coalesce(columns, ("emission", "current_footprint_kg"), None, "e")
    scope = _energy_scope(columns)
    where = f"where {history_filter} is not null" if history_filter != "null" else ""
    return f"""
        select
            date_trunc('day', e.{time_column}) as time,
            sum({history_value}) as emission
        from {scope}
        {where}
        group by date_trunc('day', e.{time_column})
        order by time
    """


def _energy_scope(columns: set[str]) -> str:
    if "source_id" not in columns:
        return "public.energy e"

    return """
        (
            select *
            from public.energy
            where source_id is not null
            union all
            select *
            from public.energy
            where source_id is null
              and not exists (
                  select 1
                  from public.energy
                  where source_id is not null
              )
        ) e
    """


def _energy_time_column(columns: set[str]) -> str | None:
    if "time" in columns:
        return "time"
    if "updated_at" in columns:
        return "updated_at"
    return None


def _energy_coalesce(
    columns: set[str],
    names: tuple[str, ...],
    default: str | None,
    qualifier: str,
    *,
    cast_text: bool = False,
) -> str:
    values = [
        f"{qualifier}.{name}::text" if cast_text else f"{qualifier}.{name}"
        for name in names
        if name in columns
    ]
    if default is not None:
        values.append(default)
    if not values:
        return "null"
    if len(values) == 1:
        return values[0]
    return f"coalesce({', '.join(values)})"


def _float(value) -> float:
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0
