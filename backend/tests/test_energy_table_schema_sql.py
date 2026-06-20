from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SQL = (ROOT / "backend" / "scripts" / "create_tables.sql").read_text(encoding="utf-8")


def test_energy_table_schema_matches_dashboard_contract():
    expected_columns = [
        "energy_id bigint generated always as identity primary key",
        "time timestamptz not null",
        "operation text not null",
        "emission double precision not null",
        "current_footprint_kg double precision not null",
        "estimated_reduction_kg double precision not null default 0",
        "projected_footprint_kg double precision not null",
    ]

    for column in expected_columns:
        assert column in SQL


def test_energy_seed_window_and_operation_constraint_are_fixed():
    assert "date '2026-06-01'" in SQL
    assert "date '2026-06-21'" in SQL
    assert "operation in ('idle VM', 'Unused Storage', 'idle database')" in SQL
    assert "('idle VM', 118.0::double precision, 0.28::double precision)" in SQL
    assert "('Unused Storage', 34.0::double precision, 0.14::double precision)" in SQL
    assert "('idle database', 72.0::double precision, 0.20::double precision)" in SQL
