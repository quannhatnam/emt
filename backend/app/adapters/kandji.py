from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from app.adapters.base import BaseAdapter

logger = logging.getLogger(__name__)


class KandjiAdapter(BaseAdapter):
    """Adapter for Kandji MDM API."""

    def __init__(self, credentials: dict[str, Any]):
        super().__init__(credentials)
        subdomain = credentials.get("subdomain", "")
        base_url = credentials.get("base_url")
        if base_url:
            self.base_url = base_url.rstrip("/")
        else:
            self.base_url = f"https://{subdomain}.api.kandji.io/api/v1"
        self.api_token = credentials["api_token"]

    def _get_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }

    async def _paginated_get(self, url: str, params: dict | None = None) -> list[dict]:
        """Perform paginated GET using offset-based pagination."""
        headers = self._get_headers()
        all_items = []
        offset = 0
        limit = 300

        async with httpx.AsyncClient(timeout=60.0) as client:
            while True:
                request_params = {"limit": str(limit), "offset": str(offset)}
                if params:
                    request_params.update(params)
                response = await client.get(url, headers=headers, params=request_params)
                response.raise_for_status()
                data = response.json()

                # Kandji returns a list directly or a dict with results
                if isinstance(data, list):
                    items = data
                elif isinstance(data, dict):
                    items = data.get("results", data.get("devices", []))
                else:
                    break

                if not items:
                    break

                all_items.extend(items)

                if len(items) < limit:
                    break
                offset += limit

        return all_items

    def _map_platform(self, platform: str | None) -> str:
        if not platform:
            return "unknown"
        p = platform.lower()
        if "mac" in p:
            return "macos"
        if "iphone" in p or "ios" in p or "ipad" in p:
            return "ios"
        if "apple tv" in p or "tvos" in p:
            return "tvos"
        return p

    def _parse_datetime(self, dt_str: str | None) -> datetime | None:
        if not dt_str:
            return None
        try:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None

    async def test_connection(self) -> bool:
        """Test connectivity by requesting the first device."""
        try:
            headers = self._get_headers()
            url = f"{self.base_url}/devices"
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers=headers, params={"limit": "1"})
                response.raise_for_status()
            logger.info("Kandji connection test successful")
            return True
        except Exception as e:
            logger.error("Kandji connection test failed: %s", str(e))
            return False

    async def sync_devices(self) -> list[dict[str, Any]]:
        """Fetch all devices from Kandji and return normalized dicts."""
        logger.info("Starting Kandji device sync")
        url = f"{self.base_url}/devices"

        try:
            raw_devices = await self._paginated_get(url)
        except httpx.HTTPStatusError as e:
            logger.error("Kandji device sync HTTP error: %s %s", e.response.status_code, e.response.text)
            raise
        except Exception as e:
            logger.error("Kandji device sync error: %s", str(e))
            raise

        devices = []
        for d in raw_devices:
            # Kandji provides detailed info; map to normalized format
            is_compliant = d.get("is_compliant")
            if is_compliant is True:
                compliance = "compliant"
            elif is_compliant is False:
                compliance = "non_compliant"
            else:
                compliance = "unknown"

            device = {
                "serial_number": d.get("serial_number"),
                "hostname": d.get("device_name"),
                "platform": self._map_platform(d.get("platform") or d.get("device_family")),
                "os_version": d.get("os_version"),
                "model": d.get("model"),
                "assigned_user": d.get("user", {}).get("name") if isinstance(d.get("user"), dict) else d.get("user"),
                "assigned_user_email": d.get("user", {}).get("email") if isinstance(d.get("user"), dict) else None,
                "department": None,
                "compliance_status": compliance,
                "encryption_enabled": d.get("filevault_enabled") or d.get("encryption_enabled"),
                "firewall_enabled": d.get("firewall_enabled"),
                "antivirus_active": None,
                "last_checkin": self._parse_datetime(d.get("last_check_in")),
                "source": "kandji",
                "source_id": d.get("device_id", d.get("id", "")),
                "ip_address": d.get("ip_address"),
                "mac_address": d.get("mac_address"),
                "is_managed": True,
            }
            devices.append(device)

        logger.info("Kandji sync fetched %d devices", len(devices))
        return devices

    async def sync_apps(self) -> list[dict[str, Any]]:
        """Fetch apps for each device from Kandji."""
        logger.info("Starting Kandji app sync")

        # First get all device IDs
        url = f"{self.base_url}/devices"
        try:
            raw_devices = await self._paginated_get(url)
        except Exception as e:
            logger.error("Kandji app sync - failed to fetch devices: %s", str(e))
            raise

        apps = []
        headers = self._get_headers()

        async with httpx.AsyncClient(timeout=60.0) as client:
            for device in raw_devices:
                device_id = device.get("device_id", device.get("id", ""))
                if not device_id:
                    continue

                try:
                    apps_url = f"{self.base_url}/devices/{device_id}/apps"
                    response = await client.get(apps_url, headers=headers)
                    if response.status_code == 200:
                        device_apps = response.json()
                        if isinstance(device_apps, list):
                            for a in device_apps:
                                app_entry = {
                                    "device_source_id": str(device_id),
                                    "name": a.get("app_name", a.get("name", "Unknown")),
                                    "version": a.get("version"),
                                    "publisher": a.get("publisher"),
                                    "is_managed": a.get("is_managed", False),
                                    "source": "kandji",
                                }
                                apps.append(app_entry)
                    else:
                        logger.warning(
                            "Kandji apps endpoint returned %s for device %s",
                            response.status_code,
                            device_id,
                        )
                except Exception as e:
                    logger.warning("Failed to fetch apps for Kandji device %s: %s", device_id, str(e))
                    continue

        logger.info("Kandji sync fetched %d app entries", len(apps))
        return apps

    async def sync_vulnerabilities(self) -> list[dict[str, Any]]:
        """Kandji does not provide vulnerability data. Return empty list."""
        logger.info("Kandji does not provide vulnerability data; skipping")
        return []
