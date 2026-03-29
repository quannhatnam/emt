from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class DeviceBase(BaseModel):
    serial_number: Optional[str] = None
    hostname: Optional[str] = None
    platform: Optional[str] = None
    os_version: Optional[str] = None
    model: Optional[str] = None
    assigned_user: Optional[str] = None
    assigned_user_email: Optional[str] = None
    department: Optional[str] = None
    compliance_status: str = "unknown"
    encryption_enabled: Optional[bool] = None
    firewall_enabled: Optional[bool] = None
    antivirus_active: Optional[bool] = None
    last_checkin: Optional[datetime] = None
    source: str
    source_id: str
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    is_managed: bool = True


class DeviceCreate(DeviceBase):
    pass


class DeviceUpdate(BaseModel):
    serial_number: Optional[str] = None
    hostname: Optional[str] = None
    platform: Optional[str] = None
    os_version: Optional[str] = None
    model: Optional[str] = None
    assigned_user: Optional[str] = None
    assigned_user_email: Optional[str] = None
    department: Optional[str] = None
    compliance_status: Optional[str] = None
    encryption_enabled: Optional[bool] = None
    firewall_enabled: Optional[bool] = None
    antivirus_active: Optional[bool] = None
    last_checkin: Optional[datetime] = None
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    is_managed: Optional[bool] = None


class DeviceResponse(DeviceBase):
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DeviceDetailResponse(DeviceResponse):
    apps: list["AppResponse"] = []
    vulnerabilities: list["VulnerabilityResponse"] = []

    model_config = {"from_attributes": True}


# Avoid circular imports by using forward references
from app.schemas.app import AppResponse
from app.schemas.vulnerability import VulnerabilityResponse

DeviceDetailResponse.model_rebuild()
