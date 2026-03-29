from __future__ import annotations
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.app import App

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/apps", tags=["applications"])


@router.get("/summary")
async def app_summary(
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """Fleet-wide application summary: total apps, managed vs unmanaged counts."""
    result = await db.execute(
        select(
            func.count(func.distinct(App.name)).label("unique_apps"),
            func.count(App.id).label("total_installations"),
            func.sum(case((App.is_managed == True, 1), else_=0)).label("managed_count"),
            func.sum(case((App.is_managed == False, 1), else_=0)).label("unmanaged_count"),
        )
    )
    row = result.one()

    device_count_result = await db.execute(
        select(func.count(func.distinct(App.device_id)))
    )
    devices_with_apps = device_count_result.scalar() or 0

    return {
        "unique_apps": row.unique_apps or 0,
        "total_installations": row.total_installations or 0,
        "managed_count": int(row.managed_count or 0),
        "unmanaged_count": int(row.unmanaged_count or 0),
        "devices_with_apps": devices_with_apps,
    }


@router.get("")
async def list_apps(
    search: Optional[str] = Query(None, description="Search by app name or publisher"),
    is_managed: Optional[bool] = Query(None, description="Filter by managed status"),
    source: Optional[str] = Query(None, description="Filter by source (intune/kandji)"),
    sort_by: Optional[str] = Query("device_count", description="Sort field: name, publisher, device_count"),
    sort_order: Optional[str] = Query("desc", description="Sort order: asc or desc"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """
    List all unique applications across the fleet with aggregated info.
    Returns app name, latest version, publisher, managed status, device count, and sources.
    """
    # Use SQLite-compatible aggregations (group_concat instead of string_agg, max instead of bool_or)
    query = (
        select(
            App.name,
            func.max(App.version).label("latest_version"),
            func.max(App.publisher).label("publisher"),
            func.max(case((App.is_managed == True, 1), else_=0)).label("is_managed"),
            func.count(func.distinct(App.device_id)).label("device_count"),
            func.group_concat(func.distinct(App.source)).label("sources"),
        )
        .group_by(App.name)
    )

    if search:
        search_term = f"%{search}%"
        query = query.where(
            App.name.ilike(search_term) | App.publisher.ilike(search_term)
        )
    if source:
        query = query.where(App.source == source)
    if is_managed is not None:
        query = query.where(App.is_managed == is_managed)

    # Sorting
    sort_map = {
        "name": App.name,
        "publisher": func.max(App.publisher),
        "device_count": func.count(func.distinct(App.device_id)),
    }
    sort_col = sort_map.get(sort_by, func.count(func.distinct(App.device_id)))
    if sort_order == "asc":
        query = query.order_by(sort_col.asc())
    else:
        query = query.order_by(sort_col.desc())

    # Total count (with same filters)
    count_base = select(App.name)
    if search:
        search_term = f"%{search}%"
        count_base = count_base.where(
            App.name.ilike(search_term) | App.publisher.ilike(search_term)
        )
    if source:
        count_base = count_base.where(App.source == source)
    if is_managed is not None:
        count_base = count_base.where(App.is_managed == is_managed)
    count_base = count_base.group_by(App.name)
    count_query = select(func.count()).select_from(count_base.subquery())

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    rows = result.all()

    items = []
    for row in rows:
        items.append({
            "name": row.name,
            "latest_version": row.latest_version,
            "publisher": row.publisher,
            "is_managed": bool(row.is_managed),
            "device_count": row.device_count,
            "sources": row.sources.split(",") if row.sources else [],
        })

    return {
        "items": items,
        "total": total,
        "skip": skip,
        "limit": limit,
    }
