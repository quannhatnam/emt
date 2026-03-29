import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Skeleton,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Paper,
  LinearProgress,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  Tooltip as MuiTooltip,
} from '@mui/material';
import DevicesIcon from '@mui/icons-material/Devices';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BugReportIcon from '@mui/icons-material/BugReport';
import WarningIcon from '@mui/icons-material/Warning';
import SecurityIcon from '@mui/icons-material/Security';
import SyncIcon from '@mui/icons-material/Sync';
import LockIcon from '@mui/icons-material/Lock';
import ShieldIcon from '@mui/icons-material/Shield';
import SystemUpdateIcon from '@mui/icons-material/SystemUpdate';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AppsIcon from '@mui/icons-material/Apps';
import DownloadIcon from '@mui/icons-material/Download';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import TimerIcon from '@mui/icons-material/Timer';
import PeopleIcon from '@mui/icons-material/People';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart,
} from 'recharts';
import {
  getDashboardSummary,
  getOsDistribution,
  getVulnerabilitySummary,
  getStaleDevices,
  getComplianceTrend,
  getVulnerabilityTrend,
  getSecurityPosture,
  getOsCurrency,
  getSyncLogs,
  getAppSummary,
  DashboardSummary,
  OsDistribution,
  VulnerabilitySummary,
  ComplianceTrend,
  VulnerabilityTrend,
  SecurityPosture,
  OsCurrency,
  SyncLog,
  Device,
  AppSummary,
  generateReports,
  GenerateReportsResponse,
} from '../services/api';

// --- Color Constants ---
const SOURCE_COLORS: Record<string, string> = {
  intune: '#1976d2',
  kandji: '#7b1fa2',
  qualys: '#e64a19',
};

const COMPLIANCE_COLORS: Record<string, string> = {
  compliant: '#388e3c',
  non_compliant: '#d32f2f',
  unknown: '#9e9e9e',
};

const SEVERITY_COLORS: Record<string, string> = {
  Critical: '#d32f2f',
  High: '#f57c00',
  Medium: '#fbc02d',
  Low: '#1976d2',
  Info: '#9e9e9e',
};

const OS_STATUS_COLORS: Record<string, string> = {
  current: '#388e3c',
  behind: '#f57c00',
  critical: '#d32f2f',
  unknown: '#9e9e9e',
};

const PIE_COLORS = ['#1976d2', '#7b1fa2', '#e64a19', '#388e3c', '#f57c00', '#00897b'];

// --- Reusable Components ---
interface KpiCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  color: string;
  loading: boolean;
  subtitle?: string;
  trend?: { direction: 'up' | 'down' | 'flat'; label: string };
}

const KpiCard: React.FC<KpiCardProps> = ({ icon, value, label, color, loading, subtitle, trend }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2.5, '&:last-child': { pb: 2.5 } }}>
      <Box sx={{ backgroundColor: `${color}15`, borderRadius: 2, p: 1.5, display: 'flex', color }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {loading ? (
          <Skeleton width={80} height={36} />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="h4" sx={{ color, lineHeight: 1, fontWeight: 700 }}>{value}</Typography>
          </Box>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>{label}</Typography>
        {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
      </Box>
    </CardContent>
  </Card>
);

interface PostureBarProps {
  label: string;
  icon: React.ReactNode;
  enabled: number;
  disabled: number;
  unknown: number;
  total: number;
  loading: boolean;
}

const PostureBar: React.FC<PostureBarProps> = ({ label, icon, enabled, disabled, unknown, total, loading }) => {
  const pct = total > 0 ? (enabled / total) * 100 : 0;
  const color = pct >= 90 ? '#388e3c' : pct >= 70 ? '#f57c00' : '#d32f2f';
  return (
    <Box sx={{ mb: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {icon}
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
        </Box>
        {loading ? (
          <Skeleton width={50} />
        ) : (
          <Typography variant="body2" sx={{ fontWeight: 700, color }}>{pct.toFixed(0)}%</Typography>
        )}
      </Box>
      {loading ? (
        <Skeleton variant="rectangular" height={10} sx={{ borderRadius: 1 }} />
      ) : (
        <Box sx={{ position: 'relative' }}>
          <LinearProgress
            variant="determinate"
            value={pct}
            sx={{
              height: 10,
              borderRadius: 1,
              bgcolor: '#e0e0e0',
              '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 1 },
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {enabled} enabled · {disabled} disabled{unknown > 0 ? ` · ${unknown} unknown` : ''}
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
};

// Mini donut for inline display
const MiniDonut: React.FC<{ value: number; total: number; color: string; size?: number }> = ({ value, total, color, size = 48 }) => {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const data = [
    { name: 'filled', value: pct },
    { name: 'empty', value: 100 - pct },
  ];
  return (
    <Box sx={{ width: size, height: size }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={size * 0.3} outerRadius={size * 0.45} dataKey="value" startAngle={90} endAngle={-270} stroke="none">
            <Cell fill={color} />
            <Cell fill="#e0e0e0" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </Box>
  );
};

// --- Helper Functions ---
function computeHealthScore(
  summary: DashboardSummary | null,
  vulnSummary: VulnerabilitySummary | null,
  posture: SecurityPosture | null,
  osCurrency: OsCurrency | null,
  appSummary: AppSummary | null,
): number {
  if (!summary || summary.total_devices === 0) return 0;

  // Compliance: 25 points
  const complianceScore = (summary.compliant_count / summary.total_devices) * 25;

  // Encryption: 15 points
  const encPct = posture && posture.total_devices > 0 ? posture.encryption_enabled / posture.total_devices : 0;
  const encScore = encPct * 15;

  // Firewall: 5 points
  const fwPct = posture && posture.total_devices > 0 ? posture.firewall_enabled / posture.total_devices : 0;
  const fwScore = fwPct * 5;

  // Antivirus: 5 points
  const avPct = posture && posture.total_devices > 0 ? posture.antivirus_active / posture.total_devices : 0;
  const avScore = avPct * 5;

  // OS Currency: 10 points
  const osPct = osCurrency ? osCurrency.overall_currency_pct / 100 : 0;
  const osScore = osPct * 10;

  // App Management: 5 points (higher ratio of managed apps = better)
  const totalApps = appSummary ? appSummary.managed_count + appSummary.unmanaged_count : 0;
  const appMgmtPct = totalApps > 0 && appSummary ? appSummary.managed_count / totalApps : 0;
  const appScore = appMgmtPct * 5;

  // Vulnerability penalty: up to -25
  const critPenalty = Math.min(15, (summary.critical_vulns || 0) * 3);
  const highPenalty = Math.min(10, ((vulnSummary?.high || 0)) * 1);

  // Stale penalty: up to -10
  const stalePenalty = Math.min(10, (summary.stale_devices || 0) * 2);

  // Patch freshness penalty: up to -5 (avg_patch_days > 14 starts losing points)
  const patchDays = summary.avg_patch_days || 0;
  const patchPenalty = patchDays > 14 ? Math.min(5, Math.floor((patchDays - 14) / 7)) : 0;

  // Base 35 + earned - penalties
  const score = 35 + complianceScore + encScore + fwScore + avScore + osScore + appScore - critPenalty - highPenalty - stalePenalty - patchPenalty;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getHealthLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Good', color: '#388e3c' };
  if (score >= 60) return { label: 'Fair', color: '#f57c00' };
  return { label: 'Needs Attention', color: '#d32f2f' };
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// --- Attention Items Builder ---
interface AttentionItem {
  severity: 'critical' | 'warning' | 'info';
  message: string;
  category: string;
}

function buildAttentionItems(
  summary: DashboardSummary | null,
  posture: SecurityPosture | null,
  osCurrency: OsCurrency | null,
  vulnSummary: VulnerabilitySummary | null,
  syncLogs: SyncLog[],
  appSummary: AppSummary | null,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (!summary) return items;

  // Critical vulns
  if (summary.critical_vulns > 0) {
    items.push({ severity: 'critical', message: `${summary.critical_vulns} critical vulnerabilities require immediate remediation`, category: 'Vulnerability' });
  }

  // High vulns
  if (vulnSummary && vulnSummary.high > 10) {
    items.push({ severity: 'warning', message: `${vulnSummary.high} high-severity vulnerabilities pending remediation`, category: 'Vulnerability' });
  }

  // Encryption gaps
  if (posture && posture.encryption_disabled > 0) {
    items.push({ severity: 'critical', message: `${posture.encryption_disabled} devices have disk encryption disabled`, category: 'Security' });
  }

  // Firewall gaps
  if (posture && posture.firewall_disabled > 0) {
    items.push({ severity: 'warning', message: `${posture.firewall_disabled} devices have firewall disabled`, category: 'Security' });
  }

  // Antivirus gaps
  if (posture && posture.antivirus_inactive > 0) {
    items.push({ severity: 'warning', message: `${posture.antivirus_inactive} devices have antivirus inactive`, category: 'Security' });
  }

  // OS critically outdated
  if (osCurrency) {
    let totalCritical = 0;
    let totalBehind = 0;
    Object.values(osCurrency.platforms).forEach((p: any) => {
      totalCritical += p.critical || 0;
      totalBehind += p.behind || 0;
    });
    if (totalCritical > 0) {
      items.push({ severity: 'critical', message: `${totalCritical} devices running critically outdated OS (2+ versions behind)`, category: 'Patch' });
    }
    if (totalBehind > 0) {
      items.push({ severity: 'warning', message: `${totalBehind} devices on previous OS version — schedule updates`, category: 'Patch' });
    }
  }

  // Stale devices
  if (summary.stale_devices > 0) {
    items.push({
      severity: summary.stale_devices > 10 ? 'warning' : 'info',
      message: `${summary.stale_devices} devices haven't checked in for 7+ days`,
      category: 'Device',
    });
  }

  // High avg patch days
  if (summary.avg_patch_days > 14) {
    items.push({ severity: 'warning', message: `Average device check-in gap is ${summary.avg_patch_days} days — indicates stale fleet data`, category: 'Device' });
  }

  // Non-compliant devices
  if (summary.non_compliant_count > 0) {
    const pct = summary.total_devices > 0 ? ((summary.non_compliant_count / summary.total_devices) * 100).toFixed(0) : '0';
    items.push({ severity: summary.non_compliant_count > summary.total_devices * 0.2 ? 'critical' : 'warning', message: `${summary.non_compliant_count} devices (${pct}%) are non-compliant with MDM policies`, category: 'Compliance' });
  }

  // Unmanaged apps
  if (appSummary && appSummary.unmanaged_count > 0) {
    const totalApps = appSummary.managed_count + appSummary.unmanaged_count;
    const unmanagedPct = totalApps > 0 ? ((appSummary.unmanaged_count / totalApps) * 100).toFixed(0) : '0';
    if (appSummary.unmanaged_count > appSummary.managed_count) {
      items.push({ severity: 'warning', message: `${appSummary.unmanaged_count} unmanaged apps (${unmanagedPct}%) — potential shadow IT risk`, category: 'Application' });
    } else {
      items.push({ severity: 'info', message: `${appSummary.unmanaged_count} unmanaged apps detected across fleet`, category: 'Application' });
    }
  }

  // Failed syncs
  const failedSyncs = syncLogs.filter((l) => l.status === 'failed');
  if (failedSyncs.length > 0) {
    const providers = Array.from(new Set(failedSyncs.map((l) => l.provider))).join(', ');
    items.push({ severity: 'warning', message: `Recent sync failure for ${providers} — data may be stale`, category: 'Sync' });
  }

  return items.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
}

// --- Main Component ---
const DashboardPage: React.FC = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [osDistribution, setOsDistribution] = useState<OsDistribution[]>([]);
  const [vulnSummary, setVulnSummary] = useState<VulnerabilitySummary | null>(null);
  const [staleDevices, setStaleDevices] = useState<Device[]>([]);
  const [complianceTrend, setComplianceTrend] = useState<ComplianceTrend[]>([]);
  const [vulnTrend, setVulnTrend] = useState<VulnerabilityTrend[]>([]);
  const [posture, setPosture] = useState<SecurityPosture | null>(null);
  const [osCurrency, setOsCurrency] = useState<OsCurrency | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [appSummary, setAppSummary] = useState<AppSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [trendDays, setTrendDays] = useState<number>(30);
  const [generating, setGenerating] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

  const fetchData = useCallback(async () => {
    try {
      const [summaryData, osData, vulnData, staleData, trendData, vulnTrendData, postureData, osCurrencyData, logsData, appSummaryData] = await Promise.all([
        getDashboardSummary(),
        getOsDistribution(),
        getVulnerabilitySummary(),
        getStaleDevices(),
        getComplianceTrend(trendDays),
        getVulnerabilityTrend(trendDays),
        getSecurityPosture(),
        getOsCurrency(),
        getSyncLogs({ limit: 10 }),
        getAppSummary(),
      ]);
      setSummary(summaryData);
      setOsDistribution(osData);
      setVulnSummary(vulnData);
      setStaleDevices(staleData);
      setComplianceTrend(trendData);
      setVulnTrend(vulnTrendData);
      setPosture(postureData);
      setOsCurrency(osCurrencyData);
      setSyncLogs(Array.isArray(logsData) ? logsData : []);
      setAppSummary(appSummaryData);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [trendDays]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleTrendRangeChange = (_: React.MouseEvent<HTMLElement>, value: number | null) => {
    if (value !== null) setTrendDays(value);
  };

  const handleGenerateReports = async () => {
    setGenerating(true);
    try {
      const result = await generateReports();
      setSnackbar({
        open: true,
        message: `${result.files.length} reports saved to ${result.export_dir}`,
        severity: 'success',
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: 'Failed to generate reports. Check backend logs.',
        severity: 'error',
      });
    } finally {
      setGenerating(false);
    }
  };

  const trendRangeLabel = trendDays <= 7 ? '7 Days' : trendDays <= 30 ? '30 Days' : trendDays <= 90 ? '3 Months' : '6 Months';

  const healthScore = computeHealthScore(summary, vulnSummary, posture, osCurrency, appSummary);
  const health = getHealthLabel(healthScore);

  const sourceData = summary
    ? Object.entries(summary.source_distribution || {}).map(([name, value]) => ({ name, value }))
    : [];

  const platformData = summary
    ? Object.entries(summary.os_distribution || {}).map(([name, value]) => ({
        name: PLATFORM_LABELS[name.toLowerCase()] || name.charAt(0).toUpperCase() + name.slice(1),
        value,
      }))
    : [];

  const complianceData = summary
    ? [
        { name: 'Compliant', value: summary.compliant_count },
        { name: 'Non-Compliant', value: summary.non_compliant_count },
        { name: 'Unknown', value: Math.max(0, summary.total_devices - summary.compliant_count - summary.non_compliant_count) },
      ]
    : [];

  const vulnBarData = vulnSummary
    ? [
        { severity: 'Critical', count: vulnSummary.critical, fill: SEVERITY_COLORS.Critical },
        { severity: 'High', count: vulnSummary.high, fill: SEVERITY_COLORS.High },
        { severity: 'Medium', count: vulnSummary.medium, fill: SEVERITY_COLORS.Medium },
        { severity: 'Low', count: vulnSummary.low, fill: SEVERITY_COLORS.Low },
        { severity: 'Info', count: vulnSummary.info, fill: SEVERITY_COLORS.Info },
      ]
    : [];

  // App management bar data
  const appMgmtData = appSummary
    ? [
        { name: 'Managed', value: appSummary.managed_count, fill: '#388e3c' },
        { name: 'Unmanaged', value: appSummary.unmanaged_count, fill: '#f57c00' },
      ]
    : [];

  const latestSyncs: Record<string, SyncLog> = {};
  syncLogs.forEach((log) => { if (!latestSyncs[log.provider]) latestSyncs[log.provider] = log; });

  const attentionItems = buildAttentionItems(summary, posture, osCurrency, vulnSummary, syncLogs, appSummary);

  // Platform name mapping for human-readable labels
  const PLATFORM_LABELS: Record<string, string> = {
    macos: 'macOS',
    windows: 'Windows',
    ios: 'iOS',
    android: 'Android',
    linux: 'Linux',
    unknown: 'Unknown',
  };

  // Build OS currency stacked bar data
  const osCurrencyBarData = osCurrency
    ? Object.entries(osCurrency.platforms).map(([platform, data]: [string, any]) => ({
        platform: PLATFORM_LABELS[platform.toLowerCase()] || platform.charAt(0).toUpperCase() + platform.slice(1),
        'Latest Version': data.current,
        'Previous Version': data.behind,
        '2+ Versions Behind': data.critical,
        Unknown: data.unknown,
        total: data.total,
        latest: data.latest_version,
      }))
    : [];

  const TimeRangeToggle = (
    <ToggleButtonGroup size="small" value={trendDays} exclusive onChange={handleTrendRangeChange}>
      <ToggleButton value={7} sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>1W</ToggleButton>
      <ToggleButton value={30} sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>1M</ToggleButton>
      <ToggleButton value={90} sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>3M</ToggleButton>
      <ToggleButton value={180} sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>6M</ToggleButton>
    </ToggleButtonGroup>
  );

  // App coverage percentage
  const totalApps = appSummary ? appSummary.managed_count + appSummary.unmanaged_count : 0;
  const managedPct = totalApps > 0 && appSummary ? ((appSummary.managed_count / totalApps) * 100).toFixed(0) : '0';

  return (
    <Box>
      {/* ===== HEADER ===== */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Executive Overview</Typography>
          <Typography variant="body2" color="text.secondary">Endpoint management health at a glance</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={generating ? <CircularProgress size={16} /> : <SaveAltIcon />}
            onClick={handleGenerateReports}
            disabled={loading || generating}
            sx={{ textTransform: 'none' }}
          >
            {generating ? 'Saving...' : 'Save Reports to ~/emt'}
          </Button>
          {!loading && (
            <Card sx={{ px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}>
              <SecurityIcon sx={{ color: health.color, fontSize: 32 }} />
              <Box>
                <Typography variant="h5" sx={{ color: health.color, fontWeight: 700, lineHeight: 1 }}>{healthScore}/100</Typography>
                <Typography variant="caption" sx={{ color: health.color, fontWeight: 600 }}>{health.label}</Typography>
              </Box>
            </Card>
          )}
        </Box>
      </Box>

      {/* ===== KPI CARDS (6 columns on large screens) ===== */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <KpiCard icon={<DevicesIcon fontSize="large" />} value={summary?.total_devices ?? 0} label="Total Devices" color="#1a237e" loading={loading} subtitle={sourceData.map((s) => `${s.name}: ${s.value}`).join(' · ')} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <KpiCard icon={<CheckCircleIcon fontSize="large" />} value={summary && summary.total_devices > 0 ? `${((summary.compliant_count / summary.total_devices) * 100).toFixed(1)}%` : '0%'} label="Compliance Rate" color="#388e3c" loading={loading} subtitle={summary ? `${summary.compliant_count} of ${summary.total_devices}` : undefined} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <KpiCard icon={<SystemUpdateIcon fontSize="large" />} value={osCurrency ? `${osCurrency.overall_currency_pct}%` : '0%'} label="OS Currency" color="#1565c0" loading={loading} subtitle="Devices on latest OS" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <KpiCard icon={<BugReportIcon fontSize="large" />} value={summary?.critical_vulns ?? 0} label="Critical Vulns" color="#d32f2f" loading={loading} subtitle={vulnSummary ? `${vulnSummary.high} high · ${vulnSummary.medium} med` : undefined} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <KpiCard icon={<AppsIcon fontSize="large" />} value={`${managedPct}%`} label="App Coverage" color="#7b1fa2" loading={loading} subtitle={appSummary ? `${appSummary.managed_count} managed · ${appSummary.unmanaged_count} unmanaged` : undefined} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <KpiCard icon={<WarningIcon fontSize="large" />} value={summary?.stale_devices ?? 0} label="Stale Devices" color="#f57c00" loading={loading} subtitle={summary ? `Avg check-in: ${summary.avg_patch_days}d` : undefined} />
        </Grid>
      </Grid>

      {/* ===== ROW: ATTENTION REQUIRED + SECURITY POSTURE + DATA FRESHNESS ===== */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Attention Required */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: 320 }}>
            <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <ErrorOutlineIcon sx={{ color: attentionItems.length > 0 ? '#d32f2f' : '#388e3c' }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Attention Required ({attentionItems.length})
                </Typography>
              </Box>
              {loading ? (
                <Skeleton variant="rectangular" height={240} />
              ) : attentionItems.length > 0 ? (
                <Box sx={{ overflow: 'auto', flex: 1 }}>
                  {attentionItems.slice(0, 8).map((item, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.75, borderBottom: i < Math.min(attentionItems.length, 8) - 1 ? '1px solid #f0f0f0' : 'none' }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', mt: 0.8, flexShrink: 0, bgcolor: item.severity === 'critical' ? '#d32f2f' : item.severity === 'warning' ? '#f57c00' : '#1976d2' }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" color="text.secondary">{item.message}</Typography>
                      </Box>
                      <Chip size="small" label={item.category} sx={{ fontSize: '0.65rem', height: 20, bgcolor: '#f5f5f5', color: '#666' }} />
                    </Box>
                  ))}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#388e3c' }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>All clear — no issues detected.</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Security Posture */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: 320 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <ShieldIcon sx={{ color: '#1a237e' }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Security Posture</Typography>
              </Box>
              <PostureBar label="Disk Encryption" icon={<LockIcon sx={{ fontSize: 18, color: '#666' }} />} enabled={posture?.encryption_enabled ?? 0} disabled={posture?.encryption_disabled ?? 0} unknown={posture?.encryption_unknown ?? 0} total={posture?.total_devices ?? 0} loading={loading} />
              <PostureBar label="Firewall" icon={<ShieldIcon sx={{ fontSize: 18, color: '#666' }} />} enabled={posture?.firewall_enabled ?? 0} disabled={posture?.firewall_disabled ?? 0} unknown={posture?.firewall_unknown ?? 0} total={posture?.total_devices ?? 0} loading={loading} />
              <PostureBar label="Antivirus" icon={<SecurityIcon sx={{ fontSize: 18, color: '#666' }} />} enabled={posture?.antivirus_active ?? 0} disabled={posture?.antivirus_inactive ?? 0} unknown={posture?.antivirus_unknown ?? 0} total={posture?.total_devices ?? 0} loading={loading} />
            </CardContent>
          </Card>
        </Grid>

        {/* Data Freshness */}
        <Grid size={{ xs: 12, md: 3 }}>
          <Card sx={{ height: 320 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <SyncIcon sx={{ color: 'text.secondary' }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Data Freshness</Typography>
              </Box>
              {loading ? (
                <Skeleton variant="rectangular" height={220} />
              ) : Object.keys(latestSyncs).length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {Object.entries(latestSyncs).map(([provider, log]) => (
                    <Box key={provider} sx={{ p: 1.5, borderRadius: 1, bgcolor: 'grey.50' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, textTransform: 'capitalize' }}>{provider}</Typography>
                        <Chip size="small" label={log.status} color={log.status === 'completed' ? 'success' : log.status === 'failed' ? 'error' : 'warning'} variant="outlined" />
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {formatTimeAgo(log.completed_at || log.started_at)} · {log.devices_synced} devices
                      </Typography>
                    </Box>
                  ))}
                  {/* Avg patch days indicator */}
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'grey.50', mt: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TimerIcon sx={{ fontSize: 16, color: '#666' }} />
                      <Typography variant="caption" color="text.secondary">
                        Avg check-in gap: <strong>{summary?.avg_patch_days ?? 0} days</strong>
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'text.secondary', gap: 1 }}>
                  <Typography variant="body2">No sync history yet.</Typography>
                  <Typography variant="caption">Configure providers in Settings to begin syncing.</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ===== ROW: OS CURRENCY + OS VERSION DETAILS ===== */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ height: 340 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SystemUpdateIcon sx={{ color: '#1565c0' }} />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>OS Update Status</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {osCurrency ? `${osCurrency.overall_currency_pct}% fleet on latest OS` : ''}
                </Typography>
              </Box>
              {loading ? (
                <Skeleton variant="rectangular" height={260} />
              ) : osCurrencyBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={270}>
                  <BarChart data={osCurrencyBarData} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" fontSize={12} />
                    <YAxis type="category" dataKey="platform" fontSize={12} width={70} />
                    <Tooltip formatter={(value: any, name: any) => [`${value} devices`, String(name)]} />
                    <Legend />
                    <Bar dataKey="Latest Version" stackId="os" fill="#388e3c" radius={0} barSize={28} />
                    <Bar dataKey="Previous Version" stackId="os" fill="#f57c00" radius={0} barSize={28} />
                    <Bar dataKey="2+ Versions Behind" stackId="os" fill="#d32f2f" radius={0} barSize={28} />
                    <Bar dataKey="Unknown" stackId="os" fill="#bdbdbd" radius={0} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 270, color: 'text.secondary' }}>
                  <Typography>No OS data available yet.</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: 340 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>OS Version Details</Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={260} />
              ) : osCurrency && Object.keys(osCurrency.platforms).length > 0 ? (
                <TableContainer sx={{ maxHeight: 270 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, py: 1 }}>Platform</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 1 }}>Version</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 1 }} align="right">Devices</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 1 }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(osCurrency.platforms).flatMap(([platform, data]: [string, any]) =>
                        data.versions.map((v: any, i: number) => (
                          <TableRow key={`${platform}-${v.version}`} sx={{ '&:last-child td': { border: 0 } }}>
                            <TableCell sx={{ py: 0.75, textTransform: 'capitalize' }}>
                              {i === 0 ? platform : ''}
                            </TableCell>
                            <TableCell sx={{ py: 0.75 }}>{v.version}</TableCell>
                            <TableCell sx={{ py: 0.75 }} align="right">{v.device_count}</TableCell>
                            <TableCell sx={{ py: 0.75 }}>
                              <Chip
                                size="small"
                                label={v.status === 'current' ? 'Latest' : v.status === 'behind' ? 'Previous' : v.status === 'critical' ? 'Outdated' : 'Unknown'}
                                sx={{ bgcolor: `${OS_STATUS_COLORS[v.status] || '#9e9e9e'}18`, color: OS_STATUS_COLORS[v.status] || '#9e9e9e', fontWeight: 600, fontSize: '0.7rem' }}
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 270, color: 'text.secondary' }}>
                  <Typography>No version data available.</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ===== ROW: COMPLIANCE TREND + COMPLIANCE PIE ===== */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ height: 360 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Compliance Trend ({trendRangeLabel})</Typography>
                {TimeRangeToggle}
              </Box>
              {loading ? (
                <Skeleton variant="rectangular" height={280} />
              ) : complianceTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={complianceTrend}>
                    <defs>
                      <linearGradient id="colorCompliant" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#388e3c" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#388e3c" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorNonCompliant" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d32f2f" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#d32f2f" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="date" tickFormatter={(d: string) => { const date = new Date(d); return `${date.getMonth() + 1}/${date.getDate()}`; }} fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip labelFormatter={(d) => new Date(String(d)).toLocaleDateString()} />
                    <Legend />
                    <Area type="monotone" dataKey="compliant" name="Compliant" stroke="#388e3c" fill="url(#colorCompliant)" strokeWidth={2} />
                    <Area type="monotone" dataKey="non_compliant" name="Non-Compliant" stroke="#d32f2f" fill="url(#colorNonCompliant)" strokeWidth={2} />
                    <Area type="monotone" dataKey="unknown" name="Unknown" stroke="#9e9e9e" fill="none" strokeWidth={1} strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280, color: 'text.secondary' }}>
                  <Typography>No trend data available yet.</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: 360 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>Compliance Status</Typography>
              {loading ? (
                <Skeleton variant="circular" width={200} height={200} sx={{ mx: 'auto' }} />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={complianceData} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={3} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                      {complianceData.map((entry) => (
                        <Cell key={entry.name} fill={COMPLIANCE_COLORS[entry.name.toLowerCase().replace('-', '_')] || '#9e9e9e'} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ===== ROW: VULNERABILITY TREND + SEVERITY BREAKDOWN ===== */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ height: 360 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Vulnerability Trend ({trendRangeLabel})</Typography>
                {TimeRangeToggle}
              </Box>
              {loading ? (
                <Skeleton variant="rectangular" height={280} />
              ) : vulnTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={vulnTrend}>
                    <defs>
                      <linearGradient id="colorCritical" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d32f2f" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#d32f2f" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f57c00" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#f57c00" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="date" tickFormatter={(d: string) => { const date = new Date(d); return `${date.getMonth() + 1}/${date.getDate()}`; }} fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip labelFormatter={(d) => new Date(String(d)).toLocaleDateString()} />
                    <Legend />
                    <Area type="monotone" dataKey="critical" name="Critical" stroke="#d32f2f" fill="url(#colorCritical)" strokeWidth={2} />
                    <Area type="monotone" dataKey="high" name="High" stroke="#f57c00" fill="url(#colorHigh)" strokeWidth={2} />
                    <Area type="monotone" dataKey="medium" name="Medium" stroke="#fbc02d" fill="none" strokeWidth={1.5} strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="low" name="Low" stroke="#1976d2" fill="none" strokeWidth={1} strokeDasharray="2 2" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280, color: 'text.secondary' }}>
                  <Typography>No vulnerability trend data available yet.</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: 360 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>Current Severity</Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={280} />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={vulnBarData} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" fontSize={12} />
                    <YAxis type="category" dataKey="severity" fontSize={12} width={60} />
                    <Tooltip />
                    <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]} barSize={24}>
                      {vulnBarData.map((entry) => (<Cell key={entry.severity} fill={entry.fill} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ===== ROW: APPLICATION OVERVIEW + PLATFORM DISTRIBUTION + DEVICES BY SOURCE ===== */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Application Overview */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: 360 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <AppsIcon sx={{ color: '#7b1fa2' }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Application Overview</Typography>
              </Box>
              {loading ? (
                <Skeleton variant="rectangular" height={270} />
              ) : appSummary ? (
                <Box>
                  {/* Summary stats */}
                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid size={{ xs: 6 }}>
                      <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 1, bgcolor: '#f5f5f5' }}>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: '#1a237e' }}>{appSummary.unique_apps}</Typography>
                        <Typography variant="caption" color="text.secondary">Unique Apps</Typography>
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 1, bgcolor: '#f5f5f5' }}>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: '#1a237e' }}>{appSummary.total_installations}</Typography>
                        <Typography variant="caption" color="text.secondary">Installations</Typography>
                      </Box>
                    </Grid>
                  </Grid>

                  {/* Managed vs Unmanaged bar */}
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>Managed vs Unmanaged</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: '#7b1fa2' }}>{managedPct}% managed</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', height: 12, borderRadius: 1, overflow: 'hidden', bgcolor: '#e0e0e0' }}>
                      {totalApps > 0 && (
                        <>
                          <Box sx={{ width: `${(appSummary.managed_count / totalApps) * 100}%`, bgcolor: '#388e3c', transition: 'width 0.5s' }} />
                          <Box sx={{ width: `${(appSummary.unmanaged_count / totalApps) * 100}%`, bgcolor: '#f57c00', transition: 'width 0.5s' }} />
                        </>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                      <Typography variant="caption" sx={{ color: '#388e3c' }}>{appSummary.managed_count} managed</Typography>
                      <Typography variant="caption" sx={{ color: '#f57c00' }}>{appSummary.unmanaged_count} unmanaged</Typography>
                    </Box>
                  </Box>

                  {/* Device coverage */}
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: '#f5f5f5' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PeopleIcon sx={{ fontSize: 18, color: '#666' }} />
                      <Typography variant="body2" color="text.secondary">
                        <strong>{appSummary.devices_with_apps}</strong> devices have app data
                        {summary && summary.total_devices > 0 && (
                          <> ({((appSummary.devices_with_apps / summary.total_devices) * 100).toFixed(0)}% of fleet)</>
                        )}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 270, color: 'text.secondary' }}>
                  <Typography>No app data available yet.</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Platform Distribution */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: 360 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>Platform Distribution</Typography>
              {loading ? (
                <Skeleton variant="circular" width={200} height={200} sx={{ mx: 'auto' }} />
              ) : platformData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={platformData} cx="50%" cy="45%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} fontSize={11}>
                      {platformData.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => [`${value} devices`]} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280, color: 'text.secondary' }}>
                  <Typography>No platform data yet.</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Devices by Source */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: 360 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>Devices by Source</Typography>
              {loading ? (
                <Skeleton variant="circular" width={200} height={200} sx={{ mx: 'auto' }} />
              ) : sourceData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={sourceData} cx="50%" cy="45%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} fontSize={11}>
                      {sourceData.map((entry, index) => (
                        <Cell key={entry.name} fill={SOURCE_COLORS[entry.name.toLowerCase()] || PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => [`${value} devices`]} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280, color: 'text.secondary' }}>
                  <Typography>No source data yet.</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ===== ROW: STALE DEVICES TABLE ===== */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>Stale Devices — Requiring Follow-up</Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={260} />
              ) : (
                <TableContainer sx={{ maxHeight: 300 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, py: 1 }}>Hostname</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 1 }}>Platform</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 1 }}>OS Version</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 1 }}>Last Check-in</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 1 }}>Days Stale</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 1 }}>Assigned User</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 1 }}>Compliance</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 1 }}>Source</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {staleDevices.slice(0, 10).map((device) => {
                        const daysSinceCheckin = device.last_checkin
                          ? Math.floor((Date.now() - new Date(device.last_checkin).getTime()) / (1000 * 60 * 60 * 24))
                          : null;
                        return (
                          <TableRow key={device.id} hover>
                            <TableCell sx={{ py: 0.75, fontWeight: 500 }}>{device.hostname || 'N/A'}</TableCell>
                            <TableCell sx={{ py: 0.75 }}>{device.platform || 'N/A'}</TableCell>
                            <TableCell sx={{ py: 0.75 }}>{device.os_version || 'N/A'}</TableCell>
                            <TableCell sx={{ py: 0.75 }}>{device.last_checkin ? new Date(device.last_checkin).toLocaleDateString() : 'Never'}</TableCell>
                            <TableCell sx={{ py: 0.75 }}>
                              {daysSinceCheckin !== null ? (
                                <Chip
                                  size="small"
                                  label={`${daysSinceCheckin}d`}
                                  sx={{
                                    bgcolor: daysSinceCheckin > 30 ? '#d32f2f18' : daysSinceCheckin > 14 ? '#f57c0018' : '#fbc02d18',
                                    color: daysSinceCheckin > 30 ? '#d32f2f' : daysSinceCheckin > 14 ? '#f57c00' : '#fbc02d',
                                    fontWeight: 600,
                                  }}
                                />
                              ) : 'N/A'}
                            </TableCell>
                            <TableCell sx={{ py: 0.75 }}>{device.assigned_user || 'N/A'}</TableCell>
                            <TableCell sx={{ py: 0.75 }}>
                              <Chip
                                size="small"
                                label={device.compliance_status || 'unknown'}
                                sx={{
                                  bgcolor: `${COMPLIANCE_COLORS[device.compliance_status] || '#9e9e9e'}18`,
                                  color: COMPLIANCE_COLORS[device.compliance_status] || '#9e9e9e',
                                  fontWeight: 600,
                                  fontSize: '0.7rem',
                                }}
                              />
                            </TableCell>
                            <TableCell sx={{ py: 0.75 }}>
                              <Chip size="small" label={device.source} sx={{ bgcolor: `${SOURCE_COLORS[device.source?.toLowerCase()] || '#9e9e9e'}15`, color: SOURCE_COLORS[device.source?.toLowerCase()] || '#9e9e9e', fontWeight: 600 }} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {staleDevices.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} align="center" sx={{ py: 4 }}>All devices are checking in regularly.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Snackbar for report generation feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
          icon={snackbar.severity === 'success' ? <FolderOpenIcon /> : undefined}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DashboardPage;
