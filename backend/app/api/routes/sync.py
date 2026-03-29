from __future__ import annotations
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.database import async_session, get_db
from app.models.credential import Credential
from app.models.sync_log import SyncLog
from app.schemas.sync_log import (
    SyncLogResponse,
    SyncScheduleConfig,
    SyncScheduleResponse,
    SyncTriggerResponse,
)
from app.services.scheduler import (
    add_schedule,
    get_schedules,
    remove_schedule,
)
from app.services.sync_service import SyncService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["sync"])

sync_service = SyncService()


async def _run_sync_in_background(provider: str):
    """Run sync in background with its own session."""
    async with async_session() as db:
        try:
            await sync_service.sync_provider(provider, db)
        except Exception as e:
            logger.error("Background sync failed for %s: %s", provider, str(e))


async def _run_sync_all_in_background():
    """Run sync-all in background with its own session."""
    async with async_session() as db:
        try:
            await sync_service.sync_all(db)
        except Exception as e:
            logger.error("Background sync-all failed: %s", str(e))


@router.post("/{provider}", response_model=SyncTriggerResponse)
async def trigger_sync(
    provider: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    provider = provider.lower()
    if provider not in ("intune", "kandji", "qualys"):
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    # Verify credentials exist
    result = await db.execute(
        select(Credential).where(Credential.provider == provider, Credential.is_active == True)
    )
    credential = result.scalar_one_or_none()
    if not credential:
        raise HTTPException(status_code=404, detail=f"No active credentials found for provider: {provider}")

    background_tasks.add_task(_run_sync_in_background, provider)
    logger.info("Triggered manual sync for provider: %s", provider)

    return SyncTriggerResponse(
        message=f"Sync triggered for {provider}",
        provider=provider,
    )


@router.post("/all", response_model=SyncTriggerResponse)
async def trigger_sync_all(
    background_tasks: BackgroundTasks,
    _user: dict = Depends(get_current_user),
):
    background_tasks.add_task(_run_sync_all_in_background)
    logger.info("Triggered manual sync for all providers")

    return SyncTriggerResponse(
        message="Sync triggered for all active providers",
        provider="all",
    )


@router.get("/logs", response_model=list[SyncLogResponse])
async def list_sync_logs(
    provider: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    query = select(SyncLog)

    if provider:
        query = query.where(SyncLog.provider == provider.lower())
    if status:
        query = query.where(SyncLog.status == status)

    query = query.order_by(SyncLog.started_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    logs = result.scalars().all()
    return logs


@router.get("/schedule", response_model=SyncScheduleResponse)
async def get_schedule_config(
    _user: dict = Depends(get_current_user),
):
    schedules_raw = get_schedules()
    schedules = [
        SyncScheduleConfig(
            provider=s["provider"],
            interval_minutes=s["interval_minutes"],
            is_enabled=s["is_enabled"],
        )
        for s in schedules_raw
    ]
    return SyncScheduleResponse(schedules=schedules)


@router.put("/schedule", response_model=SyncScheduleResponse)
async def update_schedule_config(
    config: SyncScheduleConfig,
    _user: dict = Depends(get_current_user),
):
    provider = config.provider.lower()
    if provider not in ("intune", "kandji", "qualys"):
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    if config.is_enabled:
        add_schedule(provider, config.interval_minutes, is_enabled=True)
    else:
        remove_schedule(provider)
        # Still store the config as disabled
        add_schedule(provider, config.interval_minutes, is_enabled=False)

    schedules_raw = get_schedules()
    schedules = [
        SyncScheduleConfig(
            provider=s["provider"],
            interval_minutes=s["interval_minutes"],
            is_enabled=s["is_enabled"],
        )
        for s in schedules_raw
    ]
    return SyncScheduleResponse(schedules=schedules)
