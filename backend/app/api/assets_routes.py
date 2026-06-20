"""GET endpoints that expose the teammate's read-only tables."""

from typing import Callable

from fastapi import APIRouter, HTTPException, Query

from app.services.assets_store import (
    DatabaseNotConfigured,
    TableNotFound,
    fetch_cloud_events,
    fetch_scanned_assets,
)

router = APIRouter(prefix="/api", tags=["teammate-data"])


def _read(fetch: Callable[..., list[dict]], table_name: str, limit: int, offset: int) -> dict:
    try:
        rows = fetch(limit=limit, offset=offset)
    except DatabaseNotConfigured as exc:
        raise HTTPException(status_code=503, detail="Database is not configured") from exc
    except TableNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"table": table_name, "count": len(rows), "rows": rows}


@router.get("/cloud-events")
def get_cloud_events(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> dict:
    return _read(fetch_cloud_events, "cloud_events", limit, offset)


@router.get("/scanned-assets")
def get_scanned_assets(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> dict:
    return _read(fetch_scanned_assets, "scanned_asset_data", limit, offset)
