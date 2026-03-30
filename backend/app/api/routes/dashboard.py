from __future__ import annotations
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.device import Device
from app.models.vulnerability import Vulnerability
from app.schemas.dashboard import (
    ComplianceTrend,
    ComplianceTrendPoint,
    DashboardSummary,
    OsCurrency,
    OsDistribution,
    OsVersionDetail,
    SecurityPosture,
    VulnerabilitySummary,
    VulnerabilityTrend,
    VulnerabilityTrendPoint,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# Qualys is vulnerability-only — never count Qualys hosts as devices
DEVICE_SOURCES = ["intune", "kandji"]
_device_source_filter = Device.source.in_(DEVICE_SOURCES)


@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(days=7)

    # Total devices (Intune/Kandji only — Qualys is vulnerability-only)
    total_result = await db.execute(
        select(func.count(Device.id)).where(_device_source_filter)
    )
    total_devices = total_result.scalar() or 0

    # Compliance counts
    compliant_result = await db.execute(
        select(func.count(Device.id)).where(Device.compliance_status == "compliant", _device_source_filter)
    )
    compliant_count = compliant_result.scalar() or 0

    non_compliant_result = await db.execute(
        select(func.count(Device.id)).where(Device.compliance_status == "non_compliant", _device_source_filter)
    )
    non_compliant_count = non_compliant_result.scalar() or 0

    # Vulnerability counts
    critical_result = await db.execute(
        select(func.count(Vulnerability.id)).where(
            Vulnerability.severity == 5, Vulnerability.status == "open"
        )
    )
    critical_vulns = critical_result.scalar() or 0

    high_result = await db.execute(
        select(func.count(Vulnerability.id)).where(
            Vulnerability.severity == 4, Vulnerability.status == "open"
        )
    )
    high_vulns = high_result.scalar() or 0

    # Stale devices (no check-in > 7 days)
    stale_result = await db.execute(
        select(func.count(Device.id)).where(
            _device_source_filter,
            (Device.last_checkin < stale_cutoff) | (Device.last_checkin.is_(None)),
        )
    )
    stale_devices = stale_result.scalar() or 0

    # Average patch days (days since last check-in for managed devices)
    avg_patch_result = await db.execute(
        select(func.avg(
            func.julianday(func.datetime("now")) - func.julianday(Device.last_checkin)
        )).where(Device.last_checkin.isnot(None), _device_source_filter)
    )
    avg_patch_days = avg_patch_result.scalar() or 0.0

    # OS distribution
    os_result = await db.execute(
        select(Device.platform, func.count(Device.id)).where(_device_source_filter).group_by(Device.platform)
    )
    os_distribution = {row[0] or "unknown": row[1] for row in os_result.all()}

    # Source distribution
    source_result = await db.execute(
        select(Device.source, func.count(Device.id)).where(_device_source_filter).group_by(Device.source)
    )
    source_distribution = {row[0]: row[1] for row in source_result.all()}

    return DashboardSummary(
        total_devices=total_devices,
        compliant_count=compliant_count,
        non_compliant_count=non_compliant_count,
        critical_vulns=critical_vulns,
        high_vulns=high_vulns,
        avg_patch_days=round(float(avg_patch_days), 1),
        stale_devices=stale_devices,
        os_distribution=os_distribution,
        source_distribution=source_distribution,
    )


@router.get("/os-distribution", response_model=OsDistribution)
async def get_os_distribution(
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    # More detailed: platform + os_version (Intune/Kandji only)
    result = await db.execute(
        select(
            func.coalesce(Device.platform, "unknown"),
            func.coalesce(Device.os_version, "unknown"),
            func.count(Device.id),
        ).where(_device_source_filter).group_by(Device.platform, Device.os_version)
    )
    distribution = {}
    for platform, os_version, count in result.all():
        key = f"{platform} {os_version}".strip()
        distribution[key] = count

    return OsDistribution(distribution=distribution)


@router.get("/vulnerability-summary", response_model=VulnerabilitySummary)
async def get_vulnerability_summary(
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Vulnerability.severity, func.count(Vulnerability.id))
        .where(Vulnerability.status == "open")
        .group_by(Vulnerability.severity)
    )
    counts = {row[0]: row[1] for row in result.all()}

    critical = counts.get(5, 0)
    high = counts.get(4, 0)
    medium = counts.get(3, 0)
    low = counts.get(2, 0)
    info = counts.get(1, 0)

    return VulnerabilitySummary(
        critical=critical,
        high=high,
        medium=medium,
        low=low,
        info=info,
        total=critical + high + medium + low + info,
    )


@router.get("/compliance-trend", response_model=ComplianceTrend)
async def get_compliance_trend(
    days: int = Query(30, ge=7, le=180, description="Number of days of trend data"),
    _user: dict = Depends(get_current_user),
):
    """Return mock compliance trend data.
    In production, this would query historical snapshots stored by a periodic job.
    """
    now = datetime.now(timezone.utc)
    trend_points = []

    for i in range(days, -1, -1):
        day = now - timedelta(days=i)
        date_str = day.strftime("%Y-%m-%d")
        # Generate plausible mock data with gradual improvement
        base_compliant = 150 + (days - i) * 2
        base_non_compliant = max(50 - (days - i), 5)
        base_unknown = max(20 - (days - i) // 2, 3)

        trend_points.append(
            ComplianceTrendPoint(
                date=date_str,
                compliant=base_compliant,
                non_compliant=base_non_compliant,
                unknown=base_unknown,
            )
        )

    return ComplianceTrend(trend=trend_points)


@router.get("/vulnerability-trend", response_model=VulnerabilityTrend)
async def get_vulnerability_trend(
    days: int = Query(30, ge=7, le=180, description="Number of days of trend data"),
    _user: dict = Depends(get_current_user),
):
    """Return mock vulnerability trend data.
    In production, this would query historical snapshots stored by a periodic job.
    """
    import math
    import random

    now = datetime.now(timezone.utc)
    trend_points = []
    # Use a fixed seed based on the current date so the data is stable within a day
    seed = int(now.strftime("%Y%m%d"))
    rng = random.Random(seed)

    for i in range(days, -1, -1):
        day = now - timedelta(days=i)
        date_str = day.strftime("%Y-%m-%d")
        progress = (days - i) / max(days, 1)

        # Simulate gradual remediation: vulns decrease over time with some noise
        critical = max(2, int(12 - progress * 8 + rng.randint(-1, 1)))
        high = max(5, int(35 - progress * 15 + rng.randint(-2, 2)))
        medium = max(15, int(60 - progress * 10 + rng.randint(-3, 3)))
        low = max(20, int(45 + rng.randint(-3, 3)))

        trend_points.append(
            VulnerabilityTrendPoint(
                date=date_str,
                critical=critical,
                high=high,
                medium=medium,
                low=low,
            )
        )

    return VulnerabilityTrend(trend=trend_points)


@router.get("/security-posture", response_model=SecurityPosture)
async def get_security_posture(
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """Encryption, firewall, and antivirus status across managed devices (Intune/Kandji)."""
    total_result = await db.execute(select(func.count(Device.id)).where(_device_source_filter))
    total = total_result.scalar() or 0

    # Encryption
    enc_on = (await db.execute(
        select(func.count(Device.id)).where(Device.encryption_enabled == True, _device_source_filter)
    )).scalar() or 0
    enc_off = (await db.execute(
        select(func.count(Device.id)).where(Device.encryption_enabled == False, _device_source_filter)
    )).scalar() or 0

    # Firewall
    fw_on = (await db.execute(
        select(func.count(Device.id)).where(Device.firewall_enabled == True, _device_source_filter)
    )).scalar() or 0
    fw_off = (await db.execute(
        select(func.count(Device.id)).where(Device.firewall_enabled == False, _device_source_filter)
    )).scalar() or 0

    # Antivirus
    av_on = (await db.execute(
        select(func.count(Device.id)).where(Device.antivirus_active == True, _device_source_filter)
    )).scalar() or 0
    av_off = (await db.execute(
        select(func.count(Device.id)).where(Device.antivirus_active == False, _device_source_filter)
    )).scalar() or 0

    return SecurityPosture(
        total_devices=total,
        encryption_enabled=enc_on,
        encryption_disabled=enc_off,
        encryption_unknown=total - enc_on - enc_off,
        firewall_enabled=fw_on,
        firewall_disabled=fw_off,
        firewall_unknown=total - fw_on - fw_off,
        antivirus_active=av_on,
        antivirus_inactive=av_off,
        antivirus_unknown=total - av_on - av_off,
    )


# Known latest OS versions per platform — update as new versions release
OS_LATEST_VERSIONS: dict[str, list[str]] = {
    "macos": ["15", "14"],         # current, N-1
    "windows": ["11", "10"],       # current, N-1
    "ios": ["18", "17"],           # current, N-1
    "android": ["15", "14"],       # current, N-1
}


def _classify_os_version(platform: str, version: str) -> str:
    """Classify a version as current/behind/critical based on known latest versions."""
    if not platform or not version:
        return "unknown"
    platform_lower = platform.lower()
    known = OS_LATEST_VERSIONS.get(platform_lower)
    if not known:
        return "unknown"

    # Extract major version number
    major = version.split(".")[0].strip()

    if major == known[0]:
        return "current"
    elif len(known) > 1 and major == known[1]:
        return "behind"
    else:
        # Older than N-1
        return "critical"


@router.get("/os-currency")
async def get_os_currency(
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """OS version currency: how many devices are on current, N-1, or older OS per platform."""
    result = await db.execute(
        select(
            func.coalesce(Device.platform, "unknown"),
            func.coalesce(Device.os_version, "unknown"),
            func.count(Device.id),
        ).where(_device_source_filter).group_by(Device.platform, Device.os_version)
    )
    rows = result.all()

    platforms: dict[str, dict] = {}
    total_devices = 0
    total_current = 0

    for platform, version, count in rows:
        platform = (platform or "unknown").lower()
        version = version or "unknown"
        status = _classify_os_version(platform, version)

        if platform not in platforms:
            known = OS_LATEST_VERSIONS.get(platform, [])
            platforms[platform] = {
                "total": 0,
                "current": 0,
                "behind": 0,
                "critical": 0,
                "unknown": 0,
                "latest_version": known[0] if known else "N/A",
                "versions": [],
            }

        platforms[platform]["total"] += count
        platforms[platform][status] += count
        platforms[platform]["versions"].append({
            "version": version,
            "device_count": count,
            "status": status,
            "is_latest": status == "current",
        })
        total_devices += count
        if status == "current":
            total_current += count

    # Sort versions within each platform by device count desc
    for p in platforms.values():
        p["versions"].sort(key=lambda v: v["device_count"], reverse=True)

    overall_pct = (total_current / total_devices * 100) if total_devices > 0 else 0.0

    return OsCurrency(
        platforms=platforms,
        overall_currency_pct=round(overall_pct, 1),
    )
