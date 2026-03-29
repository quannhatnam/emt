import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

// --- Type Definitions ---

export interface Device {
  id: string;
  hostname: string;
  serial_number: string;
  platform: string;
  os_version: string;
  model: string;
  assigned_user: string;
  assigned_email: string;
  compliance_status: string;
  last_checkin: string;
  source: string;
  encryption_enabled: boolean | null;
  firewall_enabled: boolean | null;
  antivirus_active: boolean | null;
  ip_address: string;
  mac_address: string;
  apps: AppInfo[];
  vulnerabilities: VulnerabilityInfo[];
  raw_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AppInfo {
  name: string;
  version: string;
  publisher: string;
  managed: boolean;
}

export interface VulnerabilityInfo {
  cve_id: string;
  title: string;
  severity: string;
  status: string;
  first_detected: string;
  last_detected: string;
}

export interface DeviceListResponse {
  items: Device[];
  total: number;
  skip: number;
  limit: number;
}

export interface DeviceQueryParams {
  search?: string;
  source?: string;
  platform?: string;
  compliance_status?: string;
  encryption_enabled?: boolean;
  firewall_enabled?: boolean;
  antivirus_active?: boolean;
  is_managed?: boolean;
  skip?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: string;
}

export interface DashboardSummary {
  total_devices: number;
  compliant_count: number;
  non_compliant_count: number;
  unknown_count?: number;
  compliant_percentage?: number;
  critical_vulns: number;
  high_vulns: number;
  avg_patch_days: number;
  stale_devices: number;
  source_distribution: Record<string, number>;
  os_distribution: Record<string, number>;
}

export interface OsDistribution {
  os_version: string;
  count: number;
}

export interface VulnerabilitySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface ComplianceTrend {
  date: string;
  compliant: number;
  non_compliant: number;
  unknown: number;
}

export interface VulnerabilityTrend {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface SecurityPosture {
  total_devices: number;
  encryption_enabled: number;
  encryption_disabled: number;
  encryption_unknown: number;
  firewall_enabled: number;
  firewall_disabled: number;
  firewall_unknown: number;
  antivirus_active: number;
  antivirus_inactive: number;
  antivirus_unknown: number;
}

export interface OsVersionDetail {
  version: string;
  device_count: number;
  status: string; // "current" | "behind" | "critical" | "unknown"
  is_latest: boolean;
}

export interface OsPlatformDetail {
  total: number;
  current: number;
  behind: number;
  critical: number;
  unknown: number;
  latest_version: string;
  versions: OsVersionDetail[];
}

export interface OsCurrency {
  platforms: Record<string, OsPlatformDetail>;
  overall_currency_pct: number;
}

export interface AppSummary {
  unique_apps: number;
  total_installations: number;
  managed_count: number;
  unmanaged_count: number;
  devices_with_apps: number;
}

export interface FleetApp {
  name: string;
  latest_version: string | null;
  publisher: string | null;
  is_managed: boolean;
  device_count: number;
  sources: string[];
}

export interface FleetAppListResponse {
  items: FleetApp[];
  total: number;
  skip: number;
  limit: number;
}

export interface FleetAppQueryParams {
  search?: string;
  is_managed?: boolean;
  source?: string;
  sort_by?: string;
  sort_order?: string;
  skip?: number;
  limit?: number;
}

export interface Credential {
  id: string;
  provider: string;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  credentials_masked: Record<string, string>;
  // Computed helpers for the frontend
  configured: boolean;
  last_synced: string | null;
  fields: Record<string, string>;
}

export interface SyncLog {
  id: string;
  provider: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  devices_synced: number;
  error_message: string | null;
}

export interface SyncScheduleItem {
  provider: string;
  interval_minutes: number;
  enabled: boolean;
  next_run: string | null;
}

export interface SyncScheduleConfig {
  provider: string;
  interval_minutes: number;
  enabled: boolean;
}

// --- Axios Instance ---

const api: AxiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach JWT Bearer token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('emt_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: redirect to login on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('emt_token');
      localStorage.removeItem('emt_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// --- Auth Functions ---

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    display_name: string;
    role: string;
  };
}

export async function loginLocal(email: string, password: string): Promise<LoginResponse> {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
}

export async function loginSSO(accessToken: string): Promise<LoginResponse> {
  const response = await api.post('/auth/sso/entra', { access_token: accessToken });
  return response.data;
}

export async function getAuthMe(): Promise<LoginResponse['user']> {
  const response = await api.get('/auth/me');
  return response.data;
}

// Legacy compatibility
export function login(username: string, password: string): Promise<LoginResponse> {
  return loginLocal(username, password);
}

export function logout(): void {
  localStorage.removeItem('emt_token');
  localStorage.removeItem('emt_user');
  localStorage.removeItem('auth_username');
  localStorage.removeItem('auth_password');
  window.location.href = '/login';
}

export function isAuthenticated(): boolean {
  const token = localStorage.getItem('emt_token');
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

// --- User Management Functions ---

export interface UserRecord {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
  has_password: boolean;
  has_entra_id: boolean;
  last_login: string | null;
  created_at: string | null;
}

export async function getUsers(): Promise<UserRecord[]> {
  const response = await api.get('/auth/users');
  return response.data;
}

export async function createUser(data: { email: string; display_name: string; role: string; password?: string }): Promise<UserRecord> {
  const response = await api.post('/auth/users', data);
  return response.data;
}

export async function updateUser(userId: string, data: { display_name?: string; role?: string; is_active?: boolean }): Promise<UserRecord> {
  const response = await api.put(`/auth/users/${userId}`, data);
  return response.data;
}

export async function deleteUser(userId: string): Promise<void> {
  await api.delete(`/auth/users/${userId}`);
}

// --- SSO Configuration ---

export interface SSOConfig {
  client_id: string;
  tenant_id: string;
  enabled: boolean;
  configured: boolean;
}

export async function getSSOConfig(): Promise<SSOConfig> {
  const response = await api.get('/auth/sso/config');
  return response.data;
}

export async function updateSSOConfig(data: { client_id: string; tenant_id: string; enabled: boolean }): Promise<SSOConfig> {
  const response = await api.put('/auth/sso/config', data);
  return response.data;
}

export async function deleteSSOConfig(): Promise<void> {
  await api.delete('/auth/sso/config');
}

// --- Device Functions ---

export async function getDevices(params?: DeviceQueryParams): Promise<DeviceListResponse> {
  const response = await api.get('/devices', { params });
  return response.data;
}

export async function getDevice(id: string): Promise<Device> {
  const response = await api.get(`/devices/${id}`);
  return response.data;
}

export async function getStaleDevices(): Promise<Device[]> {
  const response = await api.get('/devices/stale');
  return response.data;
}

// --- Dashboard Functions ---

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const response = await api.get('/dashboard/summary');
  return response.data;
}

export async function getOsDistribution(): Promise<OsDistribution[]> {
  const response = await api.get('/dashboard/os-distribution');
  const data = response.data;
  // Backend returns {distribution: {os: count}} — convert to array
  if (data && data.distribution) {
    return Object.entries(data.distribution).map(([os_version, count]) => ({ os_version, count: count as number }));
  }
  if (Array.isArray(data)) return data;
  return [];
}

export async function getVulnerabilitySummary(): Promise<VulnerabilitySummary> {
  const response = await api.get('/dashboard/vulnerability-summary');
  return response.data;
}

export async function getComplianceTrend(days?: number): Promise<ComplianceTrend[]> {
  const response = await api.get('/dashboard/compliance-trend', { params: days ? { days } : undefined });
  const data = response.data;
  if (data && data.trend) return data.trend;
  if (Array.isArray(data)) return data;
  return [];
}

export async function getVulnerabilityTrend(days?: number): Promise<VulnerabilityTrend[]> {
  const response = await api.get('/dashboard/vulnerability-trend', { params: days ? { days } : undefined });
  const data = response.data;
  if (data && data.trend) return data.trend;
  if (Array.isArray(data)) return data;
  return [];
}

export async function getSecurityPosture(): Promise<SecurityPosture> {
  const response = await api.get('/dashboard/security-posture');
  return response.data;
}

export async function getOsCurrency(): Promise<OsCurrency> {
  const response = await api.get('/dashboard/os-currency');
  return response.data;
}

// --- Credentials Functions ---

export async function getCredentials(): Promise<Credential[]> {
  const response = await api.get('/credentials');
  // Transform backend CredentialResponse to frontend Credential
  return response.data.map((c: any) => ({
    ...c,
    configured: c.is_active && Object.keys(c.credentials_masked || {}).length > 0,
    last_synced: c.last_synced_at,
    fields: c.credentials_masked || {},
  }));
}

export async function saveCredential(provider: string, credentials: Record<string, string>): Promise<void> {
  await api.post('/credentials', { provider, credentials });
}

export async function deleteCredential(provider: string): Promise<void> {
  await api.delete(`/credentials/${provider}`);
}

export async function testCredential(provider: string): Promise<{ success: boolean; message: string }> {
  const response = await api.post(`/credentials/${provider}/test`);
  return response.data;
}

// --- Sync Functions ---

export async function triggerSync(provider: string): Promise<{ message: string }> {
  const response = await api.post(`/sync/${provider}`);
  return response.data;
}

export async function triggerSyncAll(): Promise<{ message: string }> {
  const response = await api.post('/sync/all');
  return response.data;
}

export async function getSyncLogs(params?: { provider?: string; skip?: number; limit?: number }): Promise<SyncLog[]> {
  const response = await api.get('/sync/logs', { params });
  return response.data;
}

export async function getSyncSchedule(): Promise<SyncScheduleItem[]> {
  const response = await api.get('/sync/schedule');
  const data = response.data;
  if (data && data.schedules) return data.schedules;
  if (Array.isArray(data)) return data;
  return [];
}

export async function updateSyncSchedule(config: SyncScheduleConfig): Promise<void> {
  await api.put('/sync/schedule', config);
}

// --- App Functions ---

export async function getAppSummary(): Promise<AppSummary> {
  const response = await api.get('/apps/summary');
  return response.data;
}

export async function getFleetApps(params?: FleetAppQueryParams): Promise<FleetAppListResponse> {
  const response = await api.get('/apps', { params });
  return response.data;
}

// --- Report Functions ---

export interface ReportFile {
  name: string;
  file: string;
  path: string;
}

export interface GenerateReportsResponse {
  message: string;
  export_dir: string;
  timestamp: string;
  files: ReportFile[];
}

export interface ReportListItem {
  name: string;
  path: string;
  size_bytes: number;
  size_display: string;
  created_at: string;
}

export interface ReportListResponse {
  export_dir: string;
  files: ReportListItem[];
}

export async function generateReports(): Promise<GenerateReportsResponse> {
  const response = await api.post('/reports/generate');
  return response.data;
}

export async function listReports(): Promise<ReportListResponse> {
  const response = await api.get('/reports/list');
  return response.data;
}

export async function downloadReport(filename: string): Promise<Blob> {
  const response = await api.get(`/reports/download/${filename}`, { responseType: 'blob' });
  return response.data;
}

export default api;
