from __future__ import annotations
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.app import App
from app.models.device import Device
from app.models.vulnerability import Vulnerability
from app.schemas.app import AppResponse
from app.schemas.device import DeviceDetailResponse, DeviceResponse
from app.schemas.vulnerability import VulnerabilityResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("")
async def list_devices(
    source: Optional[str] = Query(None, description="Filter by source (intune/kandji)"),
    platform: Optional[str] = Query(None, description="Filter by platform"),
    compliance_status: Optional[str] = Query(None, description="Filter by compliance status"),
    search: Optional[str] = Query(None, description="Search by hostname, serial number, or assigned user"),
    encryption_enabled: Optional[bool] = Query(None, description="Filter by encryption status"),
    firewall_enabled: Optional[bool] = Query(None, description="Filter by firewall status"),
    antivirus_active: Optional[bool] = Query(None, description="Filter by antivirus status"),
    is_managed: Optional[bool] = Query(None, description="Filter by managed status"),
    sort_by: Optional[str] = Query("hostname", description="Sort field"),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    # Devices only come from Intune/Kandji — Qualys is vulnerability-only
    base_query = select(Device).where(Device.source.in_(["intune", "kandji"]))

    if source:
        base_query = base_query.where(Device.source == source)
    if platform:
        base_query = base_query.where(Device.platform == platform)
    if compliance_status:
        base_query = base_query.where(Device.compliance_status == compliance_status)
    if search:
        search_term = f"%{search}%"
        base_query = base_query.where(
            or_(
                Device.hostname.ilike(search_term),
                Device.serial_number.ilike(search_term),
                Device.assigned_user.ilike(search_term),
                Device.assigned_user_email.ilike(search_term),
            )
        )
    if encryption_enabled is not None:
        base_query = base_query.where(Device.encryption_enabled == encryption_enabled)
    if firewall_enabled is not None:
        base_query = base_query.where(Device.firewall_enabled == firewall_enabled)
    if antivirus_active is not None:
        base_query = base_query.where(Device.antivirus_active == antivirus_active)
    if is_managed is not None:
        base_query = base_query.where(Device.is_managed == is_managed)

    # Get total count with same filters
    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Sorting
    sort_column = getattr(Device, sort_by, Device.hostname)
    if sort_order == "desc":
        base_query = base_query.order_by(sort_column.desc())
    else:
        base_query = base_query.order_by(sort_column.asc())

    base_query = base_query.offset(skip).limit(limit)

    result = await db.execute(base_query)
    devices = result.scalars().all()

    return {
        "items": [DeviceResponse.model_validate(d) for d in devices],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/stale", response_model=list[DeviceResponse])
async def list_stale_devices(
    days: int = Query(7, ge=1, description="Number of days without check-in"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    query = (
        select(Device)
        .where(
            Device.source.in_(["intune", "kandji"]),
            or_(
                Device.last_checkin < cutoff,
                Device.last_checkin.is_(None),
            ),
        )
        .order_by(Device.last_checkin.asc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    devices = result.scalars().all()
    return devices


@router.get("/{device_id}", response_model=DeviceDetailResponse)
async def get_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    query = (
        select(Device)
        .options(selectinload(Device.apps), selectinload(Device.vulnerabilities))
        .where(Device.id == device_id)
    )
    result = await db.execute(query)
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.get("/{device_id}/apps", response_model=list[AppResponse])
async def get_device_apps(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    # Verify device exists
    device_result = await db.execute(select(Device).where(Device.id == device_id))
    if not device_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Device not found")

    result = await db.execute(select(App).where(App.device_id == device_id))
    apps = result.scalars().all()
    return apps


@router.get("/{device_id}/vulnerabilities", response_model=list[VulnerabilityResponse])
async def get_device_vulnerabilities(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    # Verify device exists
    device_result = await db.execute(select(Device).where(Device.id == device_id))
    if not device_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Device not found")

    result = await db.execute(
        select(Vulnerability).where(Vulnerability.device_id == device_id).order_by(Vulnerability.severity.desc())
    )
    vulns = result.scalars().all()
    return vulns
