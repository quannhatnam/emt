from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class SyncLogResponse(BaseModel):
    id: str
    provider: str
    status: str
    devices_synced: int
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SyncTriggerResponse(BaseModel):
    message: str
    provider: str
    sync_log_id: Optional[str] = None


class SyncScheduleConfig(BaseModel):
    provider: str
    interval_minutes: int = 30
    is_enabled: bool = True


class SyncScheduleResponse(BaseModel):
    schedules: list[SyncScheduleConfig]
