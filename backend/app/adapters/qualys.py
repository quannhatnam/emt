from __future__ import annotations
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any

import httpx

from app.adapters.base import BaseAdapter

logger = logging.getLogger(__name__)

SEVERITY_MAP = {
    1: "Info",
    2: "Low",
    3: "Medium",
    4: "High",
    5: "Critical",
}


class QualysAdapter(BaseAdapter):
    """Adapter for Qualys vulnerability management API."""

    def __init__(self, credentials: dict[str, Any]):
        super().__init__(credentials)
        # Support both "api_url" (frontend field name) and "base_url" (legacy)
        base_url = credentials.get("api_url") or credentials.get("base_url", "https://qualysapi.qualys.com")
        self.base_url = base_url.rstrip("/")
        self.username = credentials["username"]
        self.password = credentials["password"]

    def _get_auth(self) -> httpx.BasicAuth:
        return httpx.BasicAuth(self.username, self.password)

    def _parse_datetime(self, dt_str: str | None) -> datetime | None:
        if not dt_str:
            return None
        try:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00").replace("T", "T"))
        except (ValueError, AttributeError):
            try:
                return datetime.strptime(dt_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            except (ValueError, AttributeError):
                return None

    def _parse_host_xml(self, xml_text: str) -> list[dict]:
        """Parse Qualys host list XML response."""
        hosts = []
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as e:
            logger.error("Failed to parse Qualys host XML: %s", str(e))
            return hosts

        # Qualys host list response structure
        host_list = root.find(".//HOST_LIST")
        if host_list is None:
            # Try alternative structure
            host_list = root
            host_elements = root.findall(".//HOST")
        else:
            host_elements = host_list.findall("HOST")

        for host in host_elements:
            host_id = self._xml_text(host, "ID")
            ip = self._xml_text(host, "IP")
            dns = self._xml_text(host, "DNS") or self._xml_text(host, "DNS_DATA/HOSTNAME")
            os_info = self._xml_text(host, "OS") or self._xml_text(host, "OPERATING_SYSTEM")
            last_scan = self._xml_text(host, "LAST_SCAN_DATETIME") or self._xml_text(host, "LAST_VULN_SCAN_DATETIME")
            netbios = self._xml_text(host, "NETBIOS")
            mac = self._xml_text(host, "MAC_ADDRESS")

            platform = "unknown"
            if os_info:
                os_lower = os_info.lower()
                if "windows" in os_lower:
                    platform = "windows"
                elif "mac" in os_lower or "darwin" in os_lower:
                    platform = "macos"
                elif "linux" in os_lower:
                    platform = "linux"
                elif "ios" in os_lower:
                    platform = "ios"
                elif "android" in os_lower:
                    platform = "android"

            device = {
                "serial_number": None,
                "hostname": dns or netbios,
                "platform": platform,
                "os_version": os_info,
                "model": None,
                "assigned_user": None,
                "assigned_user_email": None,
                "department": None,
                "compliance_status": "unknown",
                "encryption_enabled": None,
                "firewall_enabled": None,
                "antivirus_active": None,
                "last_checkin": self._parse_datetime(last_scan),
                "source": "qualys",
                "source_id": host_id or ip or "",
                "ip_address": ip,
                "mac_address": mac,
                "is_managed": False,
            }
            hosts.append(device)

        return hosts

    def _parse_vuln_xml(self, xml_text: str, host_id_map: dict[str, str]) -> list[dict]:
        """Parse Qualys vulnerability/detection XML response.

        Each vulnerability includes hostname and IP so the sync service can
        match it to devices from Intune/Kandji (not by Qualys source_id).
        """
        vulns = []
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as e:
            logger.error("Failed to parse Qualys vulnerability XML: %s", str(e))
            return vulns

        # Parse host-level detections
        host_list = root.findall(".//HOST")
        for host in host_list:
            host_ip = self._xml_text(host, "IP")
            host_id = self._xml_text(host, "ID")
            hostname = self._xml_text(host, "DNS") or self._xml_text(host, "DNS_DATA/HOSTNAME") or self._xml_text(host, "NETBIOS")

            detection_list = host.findall(".//DETECTION")
            for detection in detection_list:
                qid = self._xml_text(detection, "QID") or ""
                severity_str = self._xml_text(detection, "SEVERITY")
                severity = int(severity_str) if severity_str and severity_str.isdigit() else 2
                severity = min(max(severity, 1), 5)

                status_raw = self._xml_text(detection, "STATUS") or "open"
                if status_raw.lower() in ("new", "active", "reopened"):
                    status = "open"
                elif status_raw.lower() == "fixed":
                    status = "fixed"
                else:
                    status = "open"

                vuln = {
                    "device_source_id": host_id or host_ip or "",
                    "hostname": hostname,
                    "ip_address": host_ip,
                    "qid": qid,
                    "cve_id": self._xml_text(detection, "CVE_ID"),
                    "title": self._xml_text(detection, "TITLE") or f"QID {qid}",
                    "severity": severity,
                    "severity_label": SEVERITY_MAP.get(severity, "Medium"),
                    "status": status,
                    "first_detected": self._parse_datetime(self._xml_text(detection, "FIRST_FOUND_DATETIME")),
                    "last_detected": self._parse_datetime(self._xml_text(detection, "LAST_FOUND_DATETIME")),
                    "solution": self._xml_text(detection, "SOLUTION"),
                }
                vulns.append(vuln)

        return vulns

    @staticmethod
    def _xml_text(element: ET.Element, path: str) -> str | None:
        """Safely extract text from an XML element path."""
        child = element.find(path)
        if child is not None and child.text:
            return child.text.strip()
        return None

    async def test_connection(self) -> bool:
        """Test connection by making a simple API call."""
        try:
            url = f"{self.base_url}/api/2.0/fo/asset/host/"
            params = {
                "action": "list",
                "truncation_limit": "1",
            }
            headers = {"X-Requested-With": "Python httpx"}
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, auth=self._get_auth(), params=params, headers=headers)
                response.raise_for_status()
            logger.info("Qualys connection test successful")
            return True
        except Exception as e:
            logger.error("Qualys connection test failed: %s", str(e))
            return False

    async def sync_devices(self) -> list[dict[str, Any]]:
        """Qualys is a vulnerability scanner — devices come from Intune/Kandji, not Qualys."""
        logger.info("Qualys does not manage devices; skipping device sync")
        return []

    async def sync_apps(self) -> list[dict[str, Any]]:
        """Qualys does not natively track installed apps. Return empty list."""
        logger.info("Qualys does not provide app inventory data; skipping")
        return []

    async def sync_vulnerabilities(self) -> list[dict[str, Any]]:
        """Fetch vulnerability detections from Qualys."""
        logger.info("Starting Qualys vulnerability sync")

        # First get host detections
        url = f"{self.base_url}/api/2.0/fo/asset/host/vm/detection/"
        params = {
            "action": "list",
            "show_igs": "1",
            "status": "New,Active,Re-Opened,Fixed",
            "truncation_limit": "0",
        }
        headers = {"X-Requested-With": "Python httpx"}

        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                response = await client.get(url, auth=self._get_auth(), params=params, headers=headers)
                response.raise_for_status()
                vulns = self._parse_vuln_xml(response.text, {})
        except httpx.HTTPStatusError as e:
            logger.error("Qualys vuln sync HTTP error: %s %s", e.response.status_code, e.response.text[:500])
            raise
        except Exception as e:
            logger.error("Qualys vuln sync error: %s", str(e))
            raise

        # Now enrich with knowledge base data for titles/solutions
        try:
            qids = list({v["qid"] for v in vulns if v.get("qid")})
            if qids:
                await self._enrich_vulns_from_kb(vulns, qids)
        except Exception as e:
            logger.warning("Failed to enrich vulns from KB: %s", str(e))

        logger.info("Qualys sync fetched %d vulnerability detections", len(vulns))
        return vulns

    async def _enrich_vulns_from_kb(self, vulns: list[dict], qids: list[str]):
        """Enrich vulnerability data with knowledge base details."""
        url = f"{self.base_url}/api/2.0/fo/knowledge_base/vuln/"
        headers = {"X-Requested-With": "Python httpx"}

        # Process in batches of 100 QIDs
        batch_size = 100
        kb_data: dict[str, dict] = {}

        async with httpx.AsyncClient(timeout=120.0) as client:
            for i in range(0, len(qids), batch_size):
                batch = qids[i : i + batch_size]
                params = {
                    "action": "list",
                    "ids": ",".join(batch),
                }
                try:
                    response = await client.get(url, auth=self._get_auth(), params=params, headers=headers)
                    response.raise_for_status()

                    root = ET.fromstring(response.text)
                    for vuln_elem in root.findall(".//VULN"):
                        qid = self._xml_text(vuln_elem, "QID")
                        if qid:
                            kb_data[qid] = {
                                "title": self._xml_text(vuln_elem, "TITLE"),
                                "cve_id": self._xml_text(vuln_elem, "CVE_LIST/CVE/ID"),
                                "solution": self._xml_text(vuln_elem, "SOLUTION"),
                                "severity": self._xml_text(vuln_elem, "SEVERITY_LEVEL"),
                            }
                except Exception as e:
                    logger.warning("Failed to fetch KB batch: %s", str(e))

        # Enrich vulnerability entries
        for vuln in vulns:
            qid = vuln.get("qid", "")
            if qid in kb_data:
                kb = kb_data[qid]
                if kb.get("title"):
                    vuln["title"] = kb["title"]
                if kb.get("cve_id") and not vuln.get("cve_id"):
                    vuln["cve_id"] = kb["cve_id"]
                if kb.get("solution"):
                    vuln["solution"] = kb["solution"]
                if kb.get("severity"):
                    try:
                        sev = int(kb["severity"])
                        vuln["severity"] = min(max(sev, 1), 5)
                        vuln["severity_label"] = SEVERITY_MAP.get(vuln["severity"], "Medium")
                    except ValueError:
                        pass
