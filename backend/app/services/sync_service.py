from __future__ import annotations
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.base import BaseAdapter
from app.adapters.intune import IntuneAdapter
from app.adapters.kandji import KandjiAdapter
from app.adapters.qualys import QualysAdapter
from app.models.app import App
from app.models.credential import Credential
from app.models.device import Device
from app.models.sync_log import SyncLog
from app.models.vulnerability import Vulnerability
from app.services.crypto import decrypt_credentials

logger = logging.getLogger(__name__)

ADAPTER_MAP: dict[str, type[BaseAdapter]] = {
    "intune": IntuneAdapter,
    "kandji": KandjiAdapter,
    "qualys": QualysAdapter,
}


class SyncService:
    """Service responsible for syncing devices, apps, and vulnerabilities from providers."""

    @staticmethod
    def _get_adapter(provider: str, credentials: dict[str, Any]) -> BaseAdapter:
        adapter_cls = ADAPTER_MAP.get(provider)
        if not adapter_cls:
            raise ValueError(f"Unknown provider: {provider}")
        return adapter_cls(credentials)

    @staticmethod
    async def _load_credentials(provider: str, db: AsyncSession) -> dict[str, Any] | None:
        result = await db.execute(
            select(Credential).where(Credential.provider == provider, Credential.is_active == True)
        )
        cred = result.scalar_one_or_none()
        if not cred:
            return None
        try:
            return decrypt_credentials(cred.credentials_json)
        except (ValueError, json.JSONDecodeError):
            logger.error("Failed to decrypt credentials for provider %s", provider)
            return None

    @staticmethod
    async def _resolve_device(
        db: AsyncSession, device_data: dict[str, Any]
    ) -> Device | None:
        """Identity resolution: match incoming device to existing record.
        Priority: serial_number > hostname > mac_address
        """
        source = device_data.get("source", "")
        source_id = device_data.get("source_id", "")

        # First try exact source match
        result = await db.execute(
            select(Device).where(Device.source == source, Device.source_id == source_id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        # Try serial number match
        serial = device_data.get("serial_number")
        if serial:
            result = await db.execute(
                select(Device).where(Device.serial_number == serial, Device.source == source)
            )
            existing = result.scalar_one_or_none()
            if existing:
                return existing

        # Try hostname match
        hostname = device_data.get("hostname")
        if hostname:
            result = await db.execute(
                select(Device).where(Device.hostname == hostname, Device.source == source)
            )
            existing = result.scalar_one_or_none()
            if existing:
                return existing

        # Try MAC address match
        mac = device_data.get("mac_address")
        if mac:
            result = await db.execute(
                select(Device).where(Device.mac_address == mac, Device.source == source)
            )
            existing = result.scalar_one_or_none()
            if existing:
                return existing

        return None

    @staticmethod
    async def _upsert_device(db: AsyncSession, device_data: dict[str, Any], existing: Device | None) -> Device:
        now = datetime.now(timezone.utc)
        if existing:
            # Update existing device
            for key, value in device_data.items():
                if value is not None:
                    setattr(existing, key, value)
            existing.updated_at = now
            return existing
        else:
            # Create new device
            device = Device(
                id=str(uuid.uuid4()),
                **device_data,
            )
            db.add(device)
            return device

    @staticmethod
    async def _match_vuln_to_device(
        db: AsyncSession, hostname: str | None, ip_address: str | None
    ) -> Device | None:
        """Match a Qualys vulnerability to a device from Intune/Kandji by hostname or IP."""
        # Try hostname match first (case-insensitive)
        if hostname:
            result = await db.execute(
                select(Device).where(
                    func.lower(Device.hostname) == hostname.lower(),
                    Device.source.in_(["intune", "kandji"]),
                )
            )
            device = result.scalar_one_or_none()
            if device:
                return device

        # Fall back to IP address match
        if ip_address:
            result = await db.execute(
                select(Device).where(
                    Device.ip_address == ip_address,
                    Device.source.in_(["intune", "kandji"]),
                )
            )
            device = result.scalar_one_or_none()
            if device:
                return device

        return None

    async def sync_provider(self, provider: str, db: AsyncSession) -> SyncLog:
        """Perform a full sync for a single provider."""
        logger.info("Starting sync for provider: %s", provider)

        # Create sync log
        sync_log = SyncLog(
            id=str(uuid.uuid4()),
            provider=provider,
            status="running",
            started_at=datetime.now(timezone.utc),
        )
        db.add(sync_log)
        await db.flush()

        try:
            # Load credentials
            credentials = await self._load_credentials(provider, db)
            if not credentials:
                raise ValueError(f"No active credentials found for provider: {provider}")

            adapter = self._get_adapter(provider, credentials)

            # Sync devices (Intune/Kandji only — Qualys returns empty list)
            device_data_list = await adapter.sync_devices()
            devices_synced = 0
            source_id_to_device: dict[str, Device] = {}

            for device_data in device_data_list:
                existing = await self._resolve_device(db, device_data)
                device = await self._upsert_device(db, device_data, existing)
                source_id_to_device[device_data.get("source_id", "")] = device
                devices_synced += 1

            await db.flush()

            # Collect all device IDs that were synced for deduplication
            synced_device_ids = [d.id for d in source_id_to_device.values() if d.id]

            # Sync apps — delete old apps for synced devices first to avoid duplicates
            try:
                app_data_list = await adapter.sync_apps()
                if app_data_list and synced_device_ids:
                    await db.execute(
                        delete(App).where(App.device_id.in_(synced_device_ids), App.source == provider)
                    )
                    await db.flush()
                for app_data in app_data_list:
                    device_source_id = app_data.pop("device_source_id", None)
                    if device_source_id and device_source_id in source_id_to_device:
                        device = source_id_to_device[device_source_id]
                        app_entry = App(
                            id=str(uuid.uuid4()),
                            device_id=device.id,
                            **app_data,
                        )
                        db.add(app_entry)
                if app_data_list:
                    logger.info("Synced %d app entries for %s", len(app_data_list), provider)
            except Exception as e:
                logger.warning("App sync failed for %s: %s", provider, str(e))

            # Sync vulnerabilities
            try:
                vuln_data_list = await adapter.sync_vulnerabilities()
                vulns_matched = 0

                if provider == "qualys" and vuln_data_list:
                    # Qualys vulns: match to Intune/Kandji devices by hostname or IP
                    # First, delete all existing Qualys vulns to avoid duplicates
                    await db.execute(
                        delete(Vulnerability).where(Vulnerability.source == "qualys")
                    )
                    await db.flush()

                    for vuln_data in vuln_data_list:
                        vuln_hostname = vuln_data.pop("hostname", None)
                        vuln_ip = vuln_data.pop("ip_address", None)
                        vuln_data.pop("device_source_id", None)

                        device = await self._match_vuln_to_device(db, vuln_hostname, vuln_ip)
                        vuln_entry = Vulnerability(
                            id=str(uuid.uuid4()),
                            device_id=device.id if device else None,
                            source="qualys",
                            **vuln_data,
                        )
                        db.add(vuln_entry)
                        if device:
                            vulns_matched += 1

                    logger.info(
                        "Qualys: %d vulns total, %d matched to devices",
                        len(vuln_data_list), vulns_matched,
                    )
                elif vuln_data_list and synced_device_ids:
                    # Non-Qualys provider vulns (Intune/Kandji don't have vulns, but keep generic)
                    await db.execute(
                        delete(Vulnerability).where(
                            Vulnerability.device_id.in_(synced_device_ids),
                            Vulnerability.source == provider,
                        )
                    )
                    await db.flush()
                    for vuln_data in vuln_data_list:
                        device_source_id = vuln_data.pop("device_source_id", None)
                        vuln_data.pop("hostname", None)
                        vuln_data.pop("ip_address", None)
                        if device_source_id and device_source_id in source_id_to_device:
                            device = source_id_to_device[device_source_id]
                            vuln_entry = Vulnerability(
                                id=str(uuid.uuid4()),
                                device_id=device.id,
                                source=provider,
                                **vuln_data,
                            )
                            db.add(vuln_entry)
            except Exception as e:
                logger.warning("Vulnerability sync failed for %s: %s", provider, str(e))

            # Update credential last_synced_at
            await db.execute(
                update(Credential)
                .where(Credential.provider == provider)
                .values(last_synced_at=datetime.now(timezone.utc))
            )

            # Update sync log
            sync_log.status = "success"
            sync_log.devices_synced = devices_synced
            sync_log.completed_at = datetime.now(timezone.utc)

            await db.commit()
            logger.info("Sync completed for %s: %d devices synced", provider, devices_synced)

        except Exception as e:
            logger.error("Sync failed for provider %s: %s", provider, str(e))
            sync_log.status = "failed"
            sync_log.error_message = str(e)
            sync_log.completed_at = datetime.now(timezone.utc)
            try:
                await db.commit()
            except Exception:
                await db.rollback()

        return sync_log

    async def sync_all(self, db: AsyncSession) -> list[SyncLog]:
        """Sync all active providers."""
        logger.info("Starting sync for all active providers")
        result = await db.execute(
            select(Credential).where(Credential.is_active == True)
        )
        credentials = result.scalars().all()

        sync_logs = []
        for cred in credentials:
            try:
                log = await self.sync_provider(cred.provider, db)
                sync_logs.append(log)
            except Exception as e:
                logger.error("Sync failed for %s during sync_all: %s", cred.provider, str(e))

        return sync_logs
