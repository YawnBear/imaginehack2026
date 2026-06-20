"""Read-only reader for the teammate's existing tables.

This app's own data lives in the ``sc_*`` tables (see ``pg_store.py``). The
``cloud_events`` and ``scanned_asset_data`` tables belong to a teammate's
system. These helpers ONLY read those tables, via reflection — they never write
to them and never touch the ``sc_*`` tables.

Columns are reflected at request time (and cached), so the endpoints adapt to
whatever the teammate's schema looks like without us hardcoding column lists.
"""

from functools import lru_cache

from sqlalchemy import MetaData, Table, create_engine, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import NoSuchTableError
from sqlalchemy.pool import NullPool

from app.core.config import get_settings


class DatabaseNotConfigured(RuntimeError):
    """Raised when ``DATABASE_URL`` is not set."""


class TableNotFound(RuntimeError):
    """Raised when a requested table does not exist in the database."""

    def __init__(self, table_name: str) -> None:
        self.table_name = table_name
        super().__init__(f"Table '{table_name}' was not found in the database")


def _psycopg_url(url: str) -> str:
    # Only psycopg3 is installed; SQLAlchemy defaults ``postgresql://`` to
    # psycopg2, so steer it to the psycopg3 driver like pg_store.py does.
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


@lru_cache
def _get_engine() -> Engine:
    settings = get_settings()
    if not settings.database_url:
        raise DatabaseNotConfigured("DATABASE_URL is not configured")
    # NullPool: open a connection per query and close it immediately, so we
    # never hold idle session slots. Supabase's session-mode pooler (port 5432)
    # caps clients at 15 and is shared with pgAdmin, so being frugal matters.
    return create_engine(
        _psycopg_url(settings.database_url),
        poolclass=NullPool,
        connect_args={"connect_timeout": 10},
    )


@lru_cache
def _reflect_table(name: str) -> Table:
    """Reflect a table's schema from the live database (cached per name)."""
    engine = _get_engine()
    try:
        return Table(name, MetaData(), autoload_with=engine)
    except NoSuchTableError as exc:
        # lru_cache does not cache exceptions, so a later-created table is
        # picked up on the next request.
        raise TableNotFound(name) from exc


def _fetch(table_name: str, limit: int, offset: int) -> list[dict]:
    table = _reflect_table(table_name)
    stmt = select(table)
    if len(table.primary_key.columns):  # stable pagination when a PK exists
        stmt = stmt.order_by(*table.primary_key.columns)
    stmt = stmt.limit(limit).offset(offset)
    with _get_engine().connect() as conn:
        rows = conn.execute(stmt).mappings().all()
    return [dict(row) for row in rows]


def fetch_cloud_events(limit: int = 100, offset: int = 0) -> list[dict]:
    return _fetch("cloud_events", limit, offset)


def fetch_scanned_assets(limit: int = 100, offset: int = 0) -> list[dict]:
    return _fetch("scanned_asset_data", limit, offset)
