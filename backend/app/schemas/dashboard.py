from __future__ import annotations
from pydantic import BaseModel


class DashboardSummary(BaseModel):
    total_devices: int = 0
    compliant_count: int = 0
    non_compliant_count: int = 0
    critical_vulns: int = 0
    high_vulns: int = 0
    avg_patch_days: float = 0.0
    stale_devices: int = 0
    os_distribution: dict[str, int] = {}
    source_distribution: dict[str, int] = {}


class OsDistribution(BaseModel):
    distribution: dict[str, int] = {}


class VulnerabilitySummary(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0
    total: int = 0


class ComplianceTrendPoint(BaseModel):
    date: str
    compliant: int
    non_compliant: int
    unknown: int


class ComplianceTrend(BaseModel):
    trend: list[ComplianceTrendPoint] = []


class VulnerabilityTrendPoint(BaseModel):
    date: str
    critical: int
    high: int
    medium: int
    low: int


class VulnerabilityTrend(BaseModel):
    trend: list[VulnerabilityTrendPoint] = []


class SecurityPosture(BaseModel):
    total_devices: int = 0
    encryption_enabled: int = 0
    encryption_disabled: int = 0
    encryption_unknown: int = 0
    firewall_enabled: int = 0
    firewall_disabled: int = 0
    firewall_unknown: int = 0
    antivirus_active: int = 0
    antivirus_inactive: int = 0
    antivirus_unknown: int = 0


class OsVersionDetail(BaseModel):
    platform: str
    version: str
    device_count: int
    is_latest: bool
    status: str  # "current", "behind", "critical"


class OsCurrency(BaseModel):
    platforms: dict[str, dict] = {}  # platform -> {total, current, behind, critical, latest_version, versions: [...]}
    overall_currency_pct: float = 0.0
