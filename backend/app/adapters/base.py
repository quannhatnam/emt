from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any


class BaseAdapter(ABC):
    """Abstract base adapter for device management integrations."""

    def __init__(self, credentials: dict[str, Any]):
        self.credentials = credentials

    @abstractmethod
    async def test_connection(self) -> bool:
        """Test connectivity to the external service. Returns True if successful."""
        ...

    @abstractmethod
    async def sync_devices(self) -> list[dict[str, Any]]:
        """Fetch all devices from the external service.
        Returns a list of dicts in the normalized Device schema format.
        """
        ...

    @abstractmethod
    async def sync_apps(self) -> list[dict[str, Any]]:
        """Fetch all detected apps from the external service.
        Returns a list of dicts in the normalized App schema format.
        """
        ...

    @abstractmethod
    async def sync_vulnerabilities(self) -> list[dict[str, Any]]:
        """Fetch all vulnerabilities from the external service.
        Returns a list of dicts in the normalized Vulnerability schema format.
        """
        ...
