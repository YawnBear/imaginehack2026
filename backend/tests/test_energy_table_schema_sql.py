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


def test_energy_table_is_created_empty():
    assert "insert into public.energy" not in SQL.lower()
    assert "generate_series" not in SQL.lower()
    assert "operation in ('idle VM', 'Unused Storage', 'idle database')" in SQL
