from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class AppBase(BaseModel):
    device_id: str
    name: str
    version: Optional[str] = None
    publisher: Optional[str] = None
    is_managed: bool = False
    source: str


class AppCreate(AppBase):
    pass


class AppResponse(AppBase):
    id: str
    detected_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
