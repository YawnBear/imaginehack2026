from app.services.pg_store import _energy_history_query, _energy_latest_query


LEGACY_ENERGY_COLUMNS = {
    "energy_id",
    "time",
    "operation",
    "emission",
    "current_footprint_kg",
    "estimated_reduction_kg",
    "projected_footprint_kg",
}


def test_energy_queries_do_not_reference_missing_source_id_for_legacy_schema():
    latest_query = _energy_latest_query(LEGACY_ENERGY_COLUMNS)
    history_query = _energy_history_query(LEGACY_ENERGY_COLUMNS)

    assert latest_query is not None
    assert history_query is not None
    assert "source_id" not in latest_query
    assert "source_id" not in history_query
    assert "public.energy e" in latest_query
    assert "e.operation::text" in latest_query


def test_energy_queries_prefer_source_rows_when_source_id_exists():
    columns = LEGACY_ENERGY_COLUMNS | {"source_id", "asset_id", "resource_type", "updated_at"}

    latest_query = _energy_latest_query(columns)
    history_query = _energy_history_query(columns)

    assert latest_query is not None
    assert history_query is not None
    assert "where source_id is not null" in latest_query
    assert "where source_id is not null" in history_query
    assert "e.source_id::text" in latest_query
    assert "e.updated_at desc nulls last" in latest_query
