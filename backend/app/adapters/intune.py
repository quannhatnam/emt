from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from app.adapters.base import BaseAdapter

logger = logging.getLogger(__name__)

GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
TOKEN_URL_TEMPLATE = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"


class IntuneAdapter(BaseAdapter):
    """Adapter for Microsoft Intune via Microsoft Graph API."""

    def __init__(self, credentials: dict[str, Any]):
        super().__init__(credentials)
        self.tenant_id = credentials["tenant_id"]
        self.client_id = credentials["client_id"]
        self.client_secret = credentials["client_secret"]
        self._access_token: str | None = None

    async def _get_access_token(self) -> str:
        """Obtain an OAuth2 access token using client_credentials flow."""
        if self._access_token:
            return self._access_token

        token_url = TOKEN_URL_TEMPLATE.format(tenant_id=self.tenant_id)
        data = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scope": "https://graph.microsoft.com/.default",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(token_url, data=data)
            response.raise_for_status()
            token_data = response.json()
            self._access_token = token_data["access_token"]
            logger.info("Successfully obtained Intune access token")
            return self._access_token

    async def _get_headers(self) -> dict[str, str]:
        token = await self._get_access_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def _paginated_get(self, url: str, params: dict | None = None) -> list[dict]:
        """Perform a paginated GET request following @odata.nextLink."""
        headers = await self._get_headers()
        all_items = []
        next_url = url
        request_params = params or {}

        async with httpx.AsyncClient(timeout=60.0) as client:
            while next_url:
                response = await client.get(next_url, headers=headers, params=request_params)
                response.raise_for_status()
                data = response.json()
                all_items.extend(data.get("value", []))
                next_url = data.get("@odata.nextLink")
                # After the first request, params are embedded in nextLink
                request_params = {}

        return all_items

    def _map_platform(self, operating_system: str | None) -> str:
        if not operating_system:
            return "unknown"
        os_lower = operating_system.lower()
        if "windows" in os_lower:
            return "windows"
        if "mac" in os_lower or "macos" in os_lower:
            return "macos"
        if "ios" in os_lower:
            return "ios"
        if "android" in os_lower:
            return "android"
        return os_lower

    def _map_compliance(self, compliance_state: str | None) -> str:
        if not compliance_state:
            return "unknown"
        state = compliance_state.lower()
        if state == "compliant":
            return "compliant"
        if state in ("noncompliant", "non_compliant"):
            return "non_compliant"
        return "unknown"

    def _parse_datetime(self, dt_str: str | None) -> datetime | None:
        if not dt_str:
            return None
        try:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None

    async def test_connection(self) -> bool:
        """Test connection by requesting a small set of devices."""
        try:
            headers = await self._get_headers()
            url = f"{GRAPH_BASE_URL}/deviceManagement/managedDevices"
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers=headers, params={"$top": "1"})
                response.raise_for_status()
            logger.info("Intune connection test successful")
            return True
        except Exception as e:
            logger.error("Intune connection test failed: %s", str(e))
            return False

    async def sync_devices(self) -> list[dict[str, Any]]:
        """Fetch all managed devices from Intune and return normalized dicts."""
        logger.info("Starting Intune device sync")
        url = f"{GRAPH_BASE_URL}/deviceManagement/managedDevices"
        params = {"$top": "100"}

        try:
            raw_devices = await self._paginated_get(url, params)
        except httpx.HTTPStatusError as e:
            logger.error("Intune device sync HTTP error: %s %s", e.response.status_code, e.response.text)
            raise
        except Exception as e:
            logger.error("Intune device sync error: %s", str(e))
            raise

        devices = []
        for d in raw_devices:
            device = {
                "serial_number": d.get("serialNumber"),
                "hostname": d.get("deviceName"),
                "platform": self._map_platform(d.get("operatingSystem")),
                "os_version": d.get("osVersion"),
                "model": d.get("model"),
                "assigned_user": d.get("userDisplayName"),
                "assigned_user_email": d.get("userPrincipalName"),
                "department": None,
                "compliance_status": self._map_compliance(d.get("complianceState")),
                "encryption_enabled": d.get("isEncrypted"),
                "firewall_enabled": None,
                "antivirus_active": None,
                "last_checkin": self._parse_datetime(d.get("lastSyncDateTime")),
                "source": "intune",
                "source_id": d.get("id", ""),
                "ip_address": None,
                "mac_address": d.get("wiFiMacAddress") or d.get("ethernetMacAddress"),
                "is_managed": d.get("managementState", "").lower() == "managed",
            }
            devices.append(device)

        logger.info("Intune sync fetched %d devices", len(devices))
        return devices

    async def sync_apps(self) -> list[dict[str, Any]]:
        """Fetch detected apps from Intune."""
        logger.info("Starting Intune app sync")
        url = f"{GRAPH_BASE_URL}/deviceManagement/detectedApps"
        params = {"$top": "100", "$expand": "managedDevices($select=id)"}

        try:
            raw_apps = await self._paginated_get(url, params)
        except httpx.HTTPStatusError as e:
            logger.error("Intune app sync HTTP error: %s %s", e.response.status_code, e.response.text)
            raise
        except Exception as e:
            logger.error("Intune app sync error: %s", str(e))
            raise

        apps = []
        for a in raw_apps:
            managed_devices = a.get("managedDevices", [])
            for md in managed_devices:
                app_entry = {
                    "device_source_id": md.get("id", ""),
                    "name": a.get("displayName", "Unknown"),
                    "version": a.get("version"),
                    "publisher": a.get("publisher"),
                    "is_managed": a.get("mobileAppIdentifier") is not None or "managedApp" in a.get("@odata.type", "").lower(),
                    "source": "intune",
                }
                apps.append(app_entry)

        logger.info("Intune sync fetched %d app-device associations", len(apps))
        return apps

    async def sync_vulnerabilities(self) -> list[dict[str, Any]]:
        """Intune does not natively provide vulnerability data. Return empty list."""
        logger.info("Intune does not provide vulnerability data; skipping")
        return []
