"""Report generation endpoints — saves CSV files to local filesystem."""
from __future__ import annotations

import csv
import io
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.app import App
from app.models.device import Device
from app.models.vulnerability import Vulnerability

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])

# Default export directory — override via EXPORT_DIR env var
EXPORT_DIR = Path(os.environ.get("EXPORT_DIR", os.path.expanduser("~/emt")))


def _ensure_export_dir() -> Path:
    """Create export directory if it doesn't exist."""
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    return EXPORT_DIR


def _timestamp() -> str:
    """Return current timestamp string for filenames."""
    return datetime.now().strftime("%Y%m%d_%H%M%S")


@router.post("/generate")
async def generate_all_reports(
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """Generate all CSV reports and save to the local export directory (~/emt)."""
    export_dir = _ensure_export_dir()
    ts = _timestamp()
    generated_files = []

    # 1. Device Inventory
    try:
        filepath = await _generate_device_inventory(db, export_dir, ts)
        generated_files.append({"name": "Device Inventory", "file": filepath.name, "path": str(filepath)})
    except Exception as e:
        logger.error("Failed to generate device inventory: %s", e)

    # 2. Compliance Report
    try:
        filepath = await _generate_compliance_report(db, export_dir, ts)
        generated_files.append({"name": "Compliance Report", "file": filepath.name, "path": str(filepath)})
    except Exception as e:
        logger.error("Failed to generate compliance report: %s", e)

    # 3. Vulnerability Report
    try:
        filepath = await _generate_vulnerability_report(db, export_dir, ts)
        generated_files.append({"name": "Vulnerability Report", "file": filepath.name, "path": str(filepath)})
    except Exception as e:
        logger.error("Failed to generate vulnerability report: %s", e)

    # 4. Application Inventory
    try:
        filepath = await _generate_app_inventory(db, export_dir, ts)
        generated_files.append({"name": "Application Inventory", "file": filepath.name, "path": str(filepath)})
    except Exception as e:
        logger.error("Failed to generate app inventory: %s", e)

    # 5. Security Posture Report
    try:
        filepath = await _generate_security_posture(db, export_dir, ts)
        generated_files.append({"name": "Security Posture", "file": filepath.name, "path": str(filepath)})
    except Exception as e:
        logger.error("Failed to generate security posture: %s", e)

    # 6. Stale Devices Report
    try:
        filepath = await _generate_stale_devices(db, export_dir, ts)
        generated_files.append({"name": "Stale Devices", "file": filepath.name, "path": str(filepath)})
    except Exception as e:
        logger.error("Failed to generate stale devices: %s", e)

    # 7. Executive Summary
    try:
        filepath = await _generate_executive_summary(db, export_dir, ts)
        generated_files.append({"name": "Executive Summary", "file": filepath.name, "path": str(filepath)})
    except Exception as e:
        logger.error("Failed to generate executive summary: %s", e)

    return {
        "message": f"Generated {len(generated_files)} reports",
        "export_dir": str(export_dir),
        "timestamp": ts,
        "files": generated_files,
    }


@router.get("/list")
async def list_reports(
    _user: dict = Depends(get_current_user),
):
    """List all previously generated reports in the export directory."""
    export_dir = _ensure_export_dir()
    files = []
    for f in sorted(export_dir.glob("*.csv"), key=lambda x: x.stat().st_mtime, reverse=True):
        stat = f.stat()
        files.append({
            "name": f.name,
            "path": str(f),
            "size_bytes": stat.st_size,
            "size_display": _human_size(stat.st_size),
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        })
    return {"export_dir": str(export_dir), "files": files}


@router.get("/download/{filename}")
async def download_report(
    filename: str,
    _user: dict = Depends(get_current_user),
):
    """Download a specific report file."""
    export_dir = _ensure_export_dir()
    filepath = export_dir / filename
    # Security: prevent path traversal
    if not filepath.resolve().is_relative_to(export_dir.resolve()):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not filepath.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(path=str(filepath), filename=filename, media_type="text/csv")


def _human_size(size_bytes: int) -> str:
    """Convert bytes to human-readable size."""
    for unit in ("B", "KB", "MB"):
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} GB"


# --- Report Generators ---

async def _generate_device_inventory(db: AsyncSession, export_dir: Path, ts: str) -> Path:
    """Full device inventory with all fields."""
    result = await db.execute(select(Device).order_by(Device.hostname))
    devices = result.scalars().all()

    filepath = export_dir / f"device_inventory_{ts}.csv"
    with open(filepath, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Hostname", "Serial Number", "Platform", "OS Version", "Model",
            "Assigned User", "Email", "Department", "Compliance Status",
            "Encryption", "Firewall", "Antivirus", "Last Check-in",
            "Source", "IP Address", "MAC Address", "Managed",
        ])
        for d in devices:
            writer.writerow([
                d.hostname, d.serial_number, d.platform, d.os_version, d.model,
                d.assigned_user, d.assigned_user_email, d.department, d.compliance_status,
                _bool_display(d.encryption_enabled), _bool_display(d.firewall_enabled),
                _bool_display(d.antivirus_active),
                d.last_checkin.strftime("%Y-%m-%d %H:%M") if d.last_checkin else "N/A",
                d.source, d.ip_address, d.mac_address,
                "Yes" if d.is_managed else "No",
            ])

    logger.info("Generated device inventory: %s (%d devices)", filepath.name, len(devices))
    return filepath


async def _generate_compliance_report(db: AsyncSession, export_dir: Path, ts: str) -> Path:
    """Compliance breakdown — non-compliant devices with details."""
    result = await db.execute(
        select(Device).order_by(
            case(
                (Device.compliance_status == "non_compliant", 0),
                (Device.compliance_status == "unknown", 1),
                else_=2,
            ),
            Device.hostname,
        )
    )
    devices = result.scalars().all()

    filepath = export_dir / f"compliance_report_{ts}.csv"
    with open(filepath, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Hostname", "Serial Number", "Platform", "OS Version",
            "Compliance Status", "Encryption", "Firewall", "Antivirus",
            "Assigned User", "Last Check-in", "Source",
        ])
        for d in devices:
            writer.writerow([
                d.hostname, d.serial_number, d.platform, d.os_version,
                d.compliance_status,
                _bool_display(d.encryption_enabled), _bool_display(d.firewall_enabled),
                _bool_display(d.antivirus_active),
                d.assigned_user,
                d.last_checkin.strftime("%Y-%m-%d %H:%M") if d.last_checkin else "N/A",
                d.source,
            ])

    logger.info("Generated compliance report: %s (%d devices)", filepath.name, len(devices))
    return filepath


async def _generate_vulnerability_report(db: AsyncSession, export_dir: Path, ts: str) -> Path:
    """All open vulnerabilities with device context."""
    result = await db.execute(
        select(Vulnerability, Device.hostname, Device.platform, Device.assigned_user)
        .join(Device, Vulnerability.device_id == Device.id)
        .where(Vulnerability.status == "open")
        .order_by(Vulnerability.severity.desc(), Device.hostname)
    )
    rows = result.all()

    filepath = export_dir / f"vulnerability_report_{ts}.csv"
    with open(filepath, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Hostname", "Platform", "Assigned User",
            "QID", "CVE ID", "Title", "Severity (1-5)", "Severity Label",
            "Status", "First Detected", "Last Detected", "Solution",
        ])
        for vuln, hostname, platform, user in rows:
            writer.writerow([
                hostname, platform, user,
                vuln.qid, vuln.cve_id, vuln.title, vuln.severity, vuln.severity_label,
                vuln.status,
                vuln.first_detected.strftime("%Y-%m-%d") if vuln.first_detected else "N/A",
                vuln.last_detected.strftime("%Y-%m-%d") if vuln.last_detected else "N/A",
                vuln.solution or "",
            ])

    logger.info("Generated vulnerability report: %s (%d vulns)", filepath.name, len(rows))
    return filepath


async def _generate_app_inventory(db: AsyncSession, export_dir: Path, ts: str) -> Path:
    """All applications across fleet with device context."""
    result = await db.execute(
        select(App, Device.hostname, Device.platform, Device.assigned_user)
        .join(Device, App.device_id == Device.id)
        .order_by(App.name, Device.hostname)
    )
    rows = result.all()

    filepath = export_dir / f"app_inventory_{ts}.csv"
    with open(filepath, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "App Name", "Version", "Publisher", "Managed",
            "Hostname", "Platform", "Assigned User", "Source",
        ])
        for app, hostname, platform, user in rows:
            writer.writerow([
                app.name, app.version, app.publisher,
                "Managed" if app.is_managed else "Unmanaged",
                hostname, platform, user, app.source,
            ])

    logger.info("Generated app inventory: %s (%d entries)", filepath.name, len(rows))
    return filepath


async def _generate_security_posture(db: AsyncSession, export_dir: Path, ts: str) -> Path:
    """Per-device security posture (encryption, firewall, AV)."""
    result = await db.execute(
        select(Device).order_by(Device.hostname)
    )
    devices = result.scalars().all()

    filepath = export_dir / f"security_posture_{ts}.csv"
    with open(filepath, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Hostname", "Serial Number", "Platform", "OS Version",
            "Encryption", "Firewall", "Antivirus",
            "Security Score", "Issues",
            "Assigned User", "Last Check-in", "Source",
        ])
        for d in devices:
            issues = []
            score = 3  # max 3
            if d.encryption_enabled is not True:
                issues.append("No Encryption")
                score -= 1
            if d.firewall_enabled is not True:
                issues.append("No Firewall")
                score -= 1
            if d.antivirus_active is not True:
                issues.append("No Antivirus")
                score -= 1

            writer.writerow([
                d.hostname, d.serial_number, d.platform, d.os_version,
                _bool_display(d.encryption_enabled), _bool_display(d.firewall_enabled),
                _bool_display(d.antivirus_active),
                f"{score}/3", "; ".join(issues) if issues else "All Clear",
                d.assigned_user,
                d.last_checkin.strftime("%Y-%m-%d %H:%M") if d.last_checkin else "N/A",
                d.source,
            ])

    logger.info("Generated security posture: %s (%d devices)", filepath.name, len(devices))
    return filepath


async def _generate_stale_devices(db: AsyncSession, export_dir: Path, ts: str) -> Path:
    """Devices that haven't checked in for 7+ days."""
    stale_cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    result = await db.execute(
        select(Device).where(
            (Device.last_checkin < stale_cutoff) | (Device.last_checkin.is_(None))
        ).order_by(Device.last_checkin.asc().nullsfirst())
    )
    devices = result.scalars().all()

    filepath = export_dir / f"stale_devices_{ts}.csv"
    now = datetime.now(timezone.utc)
    with open(filepath, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Hostname", "Serial Number", "Platform", "OS Version",
            "Last Check-in", "Days Stale", "Compliance Status",
            "Assigned User", "Email", "Source",
        ])
        for d in devices:
            days_stale = (now - d.last_checkin).days if d.last_checkin else "Never"
            writer.writerow([
                d.hostname, d.serial_number, d.platform, d.os_version,
                d.last_checkin.strftime("%Y-%m-%d %H:%M") if d.last_checkin else "Never",
                days_stale, d.compliance_status,
                d.assigned_user, d.assigned_user_email, d.source,
            ])

    logger.info("Generated stale devices: %s (%d devices)", filepath.name, len(devices))
    return filepath


async def _generate_executive_summary(db: AsyncSession, export_dir: Path, ts: str) -> Path:
    """High-level KPI summary for leadership."""
    now = datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(days=7)

    # Total devices
    total = (await db.execute(select(func.count(Device.id)))).scalar() or 0

    # Compliance
    compliant = (await db.execute(
        select(func.count(Device.id)).where(Device.compliance_status == "compliant")
    )).scalar() or 0
    non_compliant = (await db.execute(
        select(func.count(Device.id)).where(Device.compliance_status == "non_compliant")
    )).scalar() or 0

    # Security posture
    enc_on = (await db.execute(
        select(func.count(Device.id)).where(Device.encryption_enabled == True)
    )).scalar() or 0
    fw_on = (await db.execute(
        select(func.count(Device.id)).where(Device.firewall_enabled == True)
    )).scalar() or 0
    av_on = (await db.execute(
        select(func.count(Device.id)).where(Device.antivirus_active == True)
    )).scalar() or 0

    # Vulnerabilities
    critical_vulns = (await db.execute(
        select(func.count(Vulnerability.id)).where(
            Vulnerability.severity == 5, Vulnerability.status == "open"
        )
    )).scalar() or 0
    high_vulns = (await db.execute(
        select(func.count(Vulnerability.id)).where(
            Vulnerability.severity == 4, Vulnerability.status == "open"
        )
    )).scalar() or 0
    total_vulns = (await db.execute(
        select(func.count(Vulnerability.id)).where(Vulnerability.status == "open")
    )).scalar() or 0

    # Stale
    stale = (await db.execute(
        select(func.count(Device.id)).where(
            (Device.last_checkin < stale_cutoff) | (Device.last_checkin.is_(None))
        )
    )).scalar() or 0

    # Apps
    total_apps = (await db.execute(select(func.count(App.id)))).scalar() or 0
    managed_apps = (await db.execute(
        select(func.count(App.id)).where(App.is_managed == True)
    )).scalar() or 0

    # Platform distribution
    platform_result = await db.execute(
        select(Device.platform, func.count(Device.id)).group_by(Device.platform)
    )
    platforms = {(row[0] or "unknown"): row[1] for row in platform_result.all()}

    # Source distribution
    source_result = await db.execute(
        select(Device.source, func.count(Device.id)).group_by(Device.source)
    )
    sources = {row[0]: row[1] for row in source_result.all()}

    filepath = export_dir / f"executive_summary_{ts}.csv"
    with open(filepath, "w", newline="") as f:
        writer = csv.writer(f)

        writer.writerow(["EMT Dashboard - Executive Summary"])
        writer.writerow(["Generated", now.strftime("%Y-%m-%d %H:%M UTC")])
        writer.writerow([])

        writer.writerow(["--- Fleet Overview ---"])
        writer.writerow(["Metric", "Value", "Percentage"])
        writer.writerow(["Total Devices", total, ""])
        writer.writerow(["Compliant", compliant, f"{(compliant/total*100):.1f}%" if total else "0%"])
        writer.writerow(["Non-Compliant", non_compliant, f"{(non_compliant/total*100):.1f}%" if total else "0%"])
        unknown = total - compliant - non_compliant
        writer.writerow(["Unknown", unknown, f"{(unknown/total*100):.1f}%" if total else "0%"])
        writer.writerow(["Stale Devices (7+ days)", stale, f"{(stale/total*100):.1f}%" if total else "0%"])
        writer.writerow([])

        writer.writerow(["--- Security Posture ---"])
        writer.writerow(["Control", "Enabled", "Coverage"])
        writer.writerow(["Disk Encryption", enc_on, f"{(enc_on/total*100):.1f}%" if total else "0%"])
        writer.writerow(["Firewall", fw_on, f"{(fw_on/total*100):.1f}%" if total else "0%"])
        writer.writerow(["Antivirus", av_on, f"{(av_on/total*100):.1f}%" if total else "0%"])
        writer.writerow([])

        writer.writerow(["--- Vulnerabilities ---"])
        writer.writerow(["Severity", "Count"])
        writer.writerow(["Critical", critical_vulns])
        writer.writerow(["High", high_vulns])
        writer.writerow(["Total Open", total_vulns])
        writer.writerow([])

        writer.writerow(["--- Applications ---"])
        writer.writerow(["Metric", "Value"])
        writer.writerow(["Total App Installations", total_apps])
        writer.writerow(["Managed", managed_apps])
        writer.writerow(["Unmanaged", total_apps - managed_apps])
        writer.writerow([])

        writer.writerow(["--- Platform Distribution ---"])
        writer.writerow(["Platform", "Count", "Percentage"])
        for platform, count in sorted(platforms.items(), key=lambda x: x[1], reverse=True):
            writer.writerow([platform, count, f"{(count/total*100):.1f}%" if total else "0%"])
        writer.writerow([])

        writer.writerow(["--- Source Distribution ---"])
        writer.writerow(["Source", "Count", "Percentage"])
        for source, count in sorted(sources.items(), key=lambda x: x[1], reverse=True):
            writer.writerow([source, count, f"{(count/total*100):.1f}%" if total else "0%"])

    logger.info("Generated executive summary: %s", filepath.name)
    return filepath


def _bool_display(val: bool | None) -> str:
    if val is True:
        return "Enabled"
    elif val is False:
        return "Disabled"
    return "Unknown"
