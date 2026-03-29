from __future__ import annotations
import asyncio
import logging
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import get_settings
from app.database import async_session
from app.services.sync_service import SyncService

logger = logging.getLogger(__name__)

settings = get_settings()

# Global scheduler instance
scheduler = AsyncIOScheduler()

# In-memory schedule configs
_schedule_configs: dict[str, dict[str, Any]] = {}

sync_service = SyncService()


async def _run_sync_job(provider: str):
    """Execute a sync job for a given provider within its own DB session."""
    logger.info("Scheduled sync triggered for provider: %s", provider)
    async with async_session() as db:
        try:
            await sync_service.sync_provider(provider, db)
        except Exception as e:
            logger.error("Scheduled sync failed for %s: %s", provider, str(e))


async def _run_sync_all_job():
    """Execute a sync job for all active providers."""
    logger.info("Scheduled sync-all triggered")
    async with async_session() as db:
        try:
            await sync_service.sync_all(db)
        except Exception as e:
            logger.error("Scheduled sync-all failed: %s", str(e))


def add_schedule(provider: str, interval_minutes: int = 30, is_enabled: bool = True):
    """Add or update a sync schedule for a provider."""
    job_id = f"sync_{provider}"

    # Remove existing job if any
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    _schedule_configs[provider] = {
        "provider": provider,
        "interval_minutes": interval_minutes,
        "is_enabled": is_enabled,
    }

    if is_enabled:
        scheduler.add_job(
            _run_sync_job,
            trigger=IntervalTrigger(minutes=interval_minutes),
            id=job_id,
            args=[provider],
            replace_existing=True,
            name=f"Sync {provider} every {interval_minutes}m",
        )
        logger.info("Scheduled sync for %s every %d minutes", provider, interval_minutes)
    else:
        logger.info("Schedule for %s is disabled", provider)


def remove_schedule(provider: str):
    """Remove a sync schedule for a provider."""
    job_id = f"sync_{provider}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    _schedule_configs.pop(provider, None)
    logger.info("Removed schedule for %s", provider)


def get_schedules() -> list[dict[str, Any]]:
    """Return all current schedule configurations."""
    return list(_schedule_configs.values())


async def trigger_sync_now(provider: str):
    """Trigger an immediate sync for a specific provider."""
    logger.info("Manual sync triggered for provider: %s", provider)
    await _run_sync_job(provider)


async def trigger_sync_all_now():
    """Trigger an immediate sync for all providers."""
    logger.info("Manual sync-all triggered")
    await _run_sync_all_job()


def start_scheduler():
    """Start the APScheduler background scheduler."""
    if not scheduler.running:
        # Add a default sync-all job
        default_interval = settings.SYNC_INTERVAL_MINUTES
        scheduler.add_job(
            _run_sync_all_job,
            trigger=IntervalTrigger(minutes=default_interval),
            id="sync_all_default",
            replace_existing=True,
            name=f"Sync all providers every {default_interval}m",
        )
        scheduler.start()
        logger.info("Scheduler started with default interval of %d minutes", default_interval)


def stop_scheduler():
    """Stop the APScheduler background scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
