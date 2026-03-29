from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel


class CredentialCreate(BaseModel):
    provider: str  # intune/kandji/qualys
    credentials: dict[str, Any]  # raw credentials dict
    is_active: bool = True


class CredentialUpdate(BaseModel):
    credentials: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


class CredentialResponse(BaseModel):
    id: str
    provider: str
    is_active: bool
    last_synced_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    credentials_masked: dict[str, str] = {}

    model_config = {"from_attributes": True}


class CredentialTestResult(BaseModel):
    provider: str
    success: bool
    message: str
