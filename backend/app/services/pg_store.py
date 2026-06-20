"""Postgres-backed store using proper per-entity tables (prefixed ``sc_``).

Each in-memory collection maps to its own typed table (typed columns for the
scalar fields + ``jsonb`` for the nested/list fields). The services are
untouched — ``TableDict``/``TableList`` mimic dict/list semantics, so they keep
using ``store.findings[id]``, ``store.rules.values()``,
``store.audit_logs.append(...)``.

These tables are namespaced ``sc_*`` so they never collide with the teammate's
existing tables (cloud_events / scanned_asset_data / cve_cache / energy / their
findings / recommendations / audit_logs), which this app never reads or writes.

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
    Workflow,
)
from app.services.cloud_event_sources import build_cloud_events_from_rows
from app.services.scan_sources import build_scan_events_from_asset_rows
from app.services.seed_workflows import builtin_workflows

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

        existing_rules = set(self.rules.keys())
        for rule in builtin_rules():
            if rule.rule_id not in existing_rules:
                self.rules[rule.rule_id] = rule
                existing_rules.add(rule.rule_id)
        existing_agents = set(self.agents.keys())
        for agent in builtin_agents():
            if agent.output_key not in existing_agents:
                self.agents[agent.output_key] = agent
                existing_agents.add(agent.output_key)
        existing_workflows = set(self.workflows.keys())
        for workflow in builtin_workflows():
            if workflow.workflow_id not in existing_workflows:
                self.workflows[workflow.workflow_id] = workflow
                existing_workflows.add(workflow.workflow_id)

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
            self._ensure_energy_table_columns(conn)

    def _ensure_energy_table_columns(self, conn) -> None:
        if conn.execute(text("select to_regclass('public.energy')")).scalar() is None:
            return
        self._ensure_energy_primary_key(conn)
        energy_columns = [
            ("source_type", "text not null default 'scanned_asset'"),
            ("source_id", "text"),
            ("asset_id", "text"),
            ("asset_name", "text"),
            ("resource_type", "text"),
            ("provider", "text"),
            ("cloud_account_id", "text"),
            ("region", "text"),
            ("environment", "text"),
            ("owner_team", "text"),
            ("business_service", "text"),
            ("current_footprint_kg", "double precision"),
            ("estimated_reduction_kg", "double precision not null default 0"),
            ("projected_footprint_kg", "double precision"),
            ("unit", "text not null default 'kg_co2e_per_month'"),
            ("calculation_method", "text not null default 'scanned_asset_data.estimated_carbon_impact'"),
            ("metadata", "jsonb not null default '{}'::jsonb"),
            ("created_at", "timestamp with time zone not null default now()"),
            ("updated_at", "timestamp with time zone not null default now()"),
        ]
        for name, definition in energy_columns:
            conn.execute(
                text(
                    f"alter table if exists public.energy "
                    f"add column if not exists {name} {definition}"
                )
            )
        conn.execute(
            text(
                """
                update public.energy
                set current_footprint_kg = coalesce(current_footprint_kg, emission),
                    projected_footprint_kg = coalesce(
                        projected_footprint_kg,
                        greatest(coalesce(current_footprint_kg, emission, 0) - estimated_reduction_kg, 0)
                    ),
                    resource_type = coalesce(resource_type, operation),
                    updated_at = now()
                where current_footprint_kg is null
                   or projected_footprint_kg is null
                   or resource_type is null
                """
            )
        )
        conn.execute(
            text(
                "create index if not exists energy_source_time_idx "
                "on public.energy(source_id, time desc)"
            )
        )
        conn.execute(
            text(
                "create index if not exists energy_resource_time_idx "
                "on public.energy(resource_type, time desc)"
            )
        )

    def _ensure_energy_primary_key(self, conn) -> None:
        conn.execute(text("create extension if not exists pgcrypto"))

        # The energy table may pre-date this code with an `energy_id` of a
        # different type (e.g. a bigint identity column). Only apply the uuid
        # backfill/default when the column is absent or already uuid — never
        # coerce an existing non-uuid id column (that raises DatatypeMismatch).
        energy_id_type = conn.execute(
            text(
                "select data_type from information_schema.columns "
                "where table_schema = 'public' and table_name = 'energy' "
                "and column_name = 'energy_id'"
            )
        ).scalar()

        if energy_id_type is None or energy_id_type == "uuid":
            conn.execute(
                text(
                    "alter table if exists public.energy "
                    "add column if not exists energy_id uuid"
                )
            )
            conn.execute(
                text(
                    "update public.energy "
                    "set energy_id = gen_random_uuid() "
                    "where energy_id is null"
                )
            )
            conn.execute(
                text(
                    "alter table if exists public.energy "
                    "alter column energy_id set default gen_random_uuid()"
                )
            )
            conn.execute(
                text(
                    "alter table if exists public.energy "
                    "alter column energy_id set not null"
                )
            )
        # else: energy_id already exists as a non-uuid id column — leave its
        # type, default, and values untouched.

        # Ensure a primary key exists on energy_id (whatever its type) only when
        # the table has no primary key and every row already has a non-null id.
        conn.execute(
            text(
                """
                do $$
                begin
                    if to_regclass('public.energy') is not null
                       and not exists (
                           select 1
                           from pg_constraint
                           where conrelid = 'public.energy'::regclass
                             and contype = 'p'
                       )
                       and not exists (
                           select 1 from public.energy where energy_id is null
                       ) then
                        alter table public.energy
                        add constraint energy_pkey primary key (energy_id);
                    end if;
                end $$;
                """
            )
        )

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

    def seed_energy_snapshots(self) -> int:
        with self._engine.begin() as conn:
            self._ensure_energy_table_columns(conn)
            conn.execute(
                text(
                    """
                    with recommendation_reductions as (
                        select f.resource_id,
                               sum(r.estimated_carbon_reduction_kg)::double precision as estimated_reduction_kg
                        from public.sc_findings f
                        join public.sc_recommendations r on r.finding_id = f.finding_id
                        where f.status not in ('rejected', 'action_completed')
                        group by f.resource_id
                    ),
                    source_rows as (
                        select
                            s.last_scanned_at as time,
                            s.asset_type as operation,
                            s.estimated_carbon_impact::double precision as emission,
                            'scanned_asset' as source_type,
                            s.id::text as source_id,
                            s.asset_id::text as asset_id,
                            s.asset_name::text as asset_name,
                            case
                                when lower(coalesce(s.asset_type::text, '')) like '%bucket%' then 'bucket'
                                when lower(coalesce(s.asset_type::text, '')) like '%database%'
                                  or lower(coalesce(s.asset_type::text, '')) in ('db', 'rds') then 'database'
                                when lower(coalesce(s.asset_type::text, '')) like '%storage%'
                                  or lower(coalesce(s.asset_type::text, '')) like '%volume%'
                                  or lower(coalesce(s.asset_type::text, '')) like 'disk%' then 'storage'
                                when lower(coalesce(s.asset_type::text, '')) like '%vm%'
                                  or lower(coalesce(s.asset_type::text, '')) like '%instance%'
                                  or lower(coalesce(s.asset_type::text, '')) like '%compute%' then 'vm'
                                else lower(coalesce(s.asset_type::text, 'unknown'))
                            end as resource_type,
                            s.provider::text as provider,
                            s.cloud_account_id::text as cloud_account_id,
                            s.region::text as region,
                            s.environment::text as environment,
                            s.owner_team::text as owner_team,
                            s.business_service::text as business_service,
                            s.estimated_carbon_impact::double precision as current_footprint_kg,
                            least(
                                s.estimated_carbon_impact::double precision,
                                coalesce(rr.estimated_reduction_kg, 0)::double precision
                            ) as estimated_reduction_kg,
                            s.estimated_carbon_impact::double precision
                              - least(
                                    s.estimated_carbon_impact::double precision,
                                    coalesce(rr.estimated_reduction_kg, 0)::double precision
                                ) as projected_footprint_kg,
                            'kg_co2e_per_month' as unit,
                            'scanned_asset_data.estimated_carbon_impact' as calculation_method,
                            jsonb_strip_nulls(
                                jsonb_build_object(
                                    'estimated_cost', s.estimated_cost,
                                    'utilisation_percentage', s.utilisation_percentage,
                                    'public_exposure', s.public_exposure,
                                    'encryption_status', s.encryption_status,
                                    'resource_status', s.resource_status,
                                    'installed_software', s.installed_software,
                                    'raw_recommendation_reduction_kg', coalesce(rr.estimated_reduction_kg, 0),
                                    'raw_scan_payload', s.raw_scan_payload
                                )
                            ) as metadata
                        from public.scanned_asset_data s
                        left join recommendation_reductions rr on rr.resource_id = s.asset_id::text
                        where s.estimated_carbon_impact is not null
                          and s.last_scanned_at is not null
                    ),
                    updated as (
                        update public.energy e
                        set operation = s.operation,
                            emission = s.emission,
                            source_type = s.source_type,
                            asset_id = s.asset_id,
                            asset_name = s.asset_name,
                            resource_type = s.resource_type,
                            provider = s.provider,
                            cloud_account_id = s.cloud_account_id,
                            region = s.region,
                            environment = s.environment,
                            owner_team = s.owner_team,
                            business_service = s.business_service,
                            current_footprint_kg = s.current_footprint_kg,
                            estimated_reduction_kg = s.estimated_reduction_kg,
                            projected_footprint_kg = s.projected_footprint_kg,
                            unit = s.unit,
                            calculation_method = s.calculation_method,
                            metadata = s.metadata,
                            updated_at = now()
                        from source_rows s
                        where e.source_id = s.source_id
                          and e.time = s.time
                        returning e.source_id, e.time
                    )
                    insert into public.energy(
                        time,
                        operation,
                        emission,
                        source_type,
                        source_id,
                        asset_id,
                        asset_name,
                        resource_type,
                        provider,
                        cloud_account_id,
                        region,
                        environment,
                        owner_team,
                        business_service,
                        current_footprint_kg,
                        estimated_reduction_kg,
                        projected_footprint_kg,
                        unit,
                        calculation_method,
                        metadata
                    )
                    select
                        s.time,
                        s.operation,
                        s.emission,
                        s.source_type,
                        s.source_id,
                        s.asset_id,
                        s.asset_name,
                        s.resource_type,
                        s.provider,
                        s.cloud_account_id,
                        s.region,
                        s.environment,
                        s.owner_team,
                        s.business_service,
                        s.current_footprint_kg,
                        s.estimated_reduction_kg,
                        s.projected_footprint_kg,
                        s.unit,
                        s.calculation_method,
                        s.metadata
                    from source_rows s
                    where not exists (
                          select 1
                          from public.energy e
                          where e.source_id = s.source_id
                            and e.time = s.time
                      )
                    """
                )
            )
            return conn.execute(
                text(
                    """
                    select count(*)
                    from public.energy
                    where source_type = 'scanned_asset'
                    """
                )
            ).scalar() or 0

    def energy_source_summary(self) -> dict:
        by_resource_type: dict[str, float] = {}
        history: list[dict] = []
        with self._engine.connect() as conn:
            latest_rows = conn.execute(
                text(
                    """
                    with energy_scope as (
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
                    )
                    select distinct on (coalesce(source_id, asset_id, operation))
                           coalesce(resource_type, operation) as resource_type,
                           coalesce(current_footprint_kg, emission, 0) as current_footprint_kg,
                           estimated_reduction_kg,
                           projected_footprint_kg
                    from energy_scope
                    where coalesce(current_footprint_kg, emission) is not null
                    order by coalesce(source_id, asset_id, operation),
                             time desc nulls last,
                             updated_at desc nulls last
                    """
                )
            ).mappings().all()
            energy_rows = conn.execute(
                text(
                    """
                    with energy_scope as (
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
                    ),
                    daily_latest as (
                        select distinct on (
                            date_trunc('day', time),
                            coalesce(source_id, asset_id, operation)
                        )
                               date_trunc('day', time) as time,
                               coalesce(current_footprint_kg, emission, 0) as emission
                        from energy_scope
                        where time is not null
                          and coalesce(current_footprint_kg, emission) is not null
                        order by date_trunc('day', time),
                                 coalesce(source_id, asset_id, operation),
                                 time desc,
                                 updated_at desc nulls last
                    )
                    select time, sum(emission) as emission
                    from daily_latest
                    group by time
                    order by time
                    """
                )
            ).mappings().all()

        estimated_reduction = 0.0
        projected_footprint = 0.0
        for row in latest_rows:
            kind = _resource_kind(row["resource_type"])
            if kind is None:
                continue
            current = _float(row["current_footprint_kg"])
            reduction = _float(row["estimated_reduction_kg"])
            projected = row["projected_footprint_kg"]
            if projected is None:
                projected = max(current - reduction, 0)
            by_resource_type[kind] = by_resource_type.get(kind, 0) + current
            estimated_reduction += reduction
            projected_footprint += _float(projected)

        for row in energy_rows:
            timestamp = row["time"]
            label = timestamp.strftime("%b %d") if isinstance(timestamp, datetime) else str(row["operation"])
            history.append(
                {
                    "label": label,
                    "timestamp": timestamp,
                    "value_kg": _float(row["emission"]),
                }
            )

        return {
            "by_resource_type": by_resource_type,
            "current_footprint_kg": sum(by_resource_type.values()),
            "estimated_reduction_kg": estimated_reduction,
            "projected_footprint_kg": projected_footprint,
            "history": history,
        }


def _float(value) -> float:
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0


def _resource_kind(value) -> str | None:
    text_value = str(value or "").lower()
    if "bucket" in text_value:
        return "bucket"
    if "database" in text_value or text_value in {"db", "rds"}:
        return "database"
    if "storage" in text_value or "volume" in text_value or text_value.startswith("disk"):
        return "storage"
    if "vm" in text_value or "instance" in text_value or "compute" in text_value:
        return "vm"
    return None
