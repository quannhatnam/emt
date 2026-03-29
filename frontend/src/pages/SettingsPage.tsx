import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Paper,
  CircularProgress,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import SettingsIcon from '@mui/icons-material/Settings';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import SecurityIcon from '@mui/icons-material/Security';
import {
  getCredentials,
  saveCredential,
  deleteCredential,
  testCredential,
  triggerSync,
  triggerSyncAll,
  getSyncLogs,
  getSyncSchedule,
  updateSyncSchedule,
  getSSOConfig,
  updateSSOConfig,
  deleteSSOConfig,
  Credential,
  SyncLog,
  SyncScheduleItem,
  SSOConfig,
} from '../services/api';
import { useAuth } from '../auth/AuthContext';

interface ProviderConfig {
  label: string;
  color: string;
  fields: { key: string; label: string; type: string }[];
}

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  intune: {
    label: 'Microsoft Intune',
    color: '#1976d2',
    fields: [
      { key: 'tenant_id', label: 'Tenant ID', type: 'text' },
      { key: 'client_id', label: 'Client ID', type: 'text' },
      { key: 'client_secret', label: 'Client Secret', type: 'password' },
    ],
  },
  kandji: {
    label: 'Kandji',
    color: '#7b1fa2',
    fields: [
      { key: 'subdomain', label: 'Subdomain', type: 'text' },
      { key: 'api_token', label: 'API Token', type: 'password' },
    ],
  },
  qualys: {
    label: 'Qualys',
    color: '#e64a19',
    fields: [
      { key: 'api_url', label: 'API URL', type: 'text' },
      { key: 'username', label: 'Username', type: 'text' },
      { key: 'password', label: 'Password', type: 'password' },
    ],
  },
};

const SettingsPage: React.FC = () => {
  const { hasRole } = useAuth();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [schedules, setSchedules] = useState<SyncScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogProvider, setDialogProvider] = useState('');
  const [dialogFields, setDialogFields] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // SSO config state
  const [ssoConfig, setSsoConfig] = useState<SSOConfig | null>(null);
  const [ssoClientId, setSsoClientId] = useState('');
  const [ssoTenantId, setSsoTenantId] = useState('');
  const [ssoEnabled, setSsoEnabled] = useState(true);
  const [ssoSaving, setSsoSaving] = useState(false);
  const [ssoEditing, setSsoEditing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [creds, logs, scheds, sso] = await Promise.all([
        getCredentials(),
        getSyncLogs({ limit: 20 }),
        getSyncSchedule(),
        getSSOConfig().catch(() => null),
      ]);
      setCredentials(creds);
      setSyncLogs(logs);
      setSchedules(scheds);
      if (sso) {
        setSsoConfig(sso);
        setSsoClientId(sso.client_id);
        setSsoTenantId(sso.tenant_id);
        setSsoEnabled(sso.enabled);
      }
    } catch (err) {
      console.error('Failed to fetch settings data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const showSnack = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const getCredForProvider = (provider: string): Credential | undefined =>
    credentials.find((c) => c.provider === provider);

  const handleOpenDialog = (provider: string) => {
    setDialogProvider(provider);
    const existing = getCredForProvider(provider);
    const fields: Record<string, string> = {};
    PROVIDER_CONFIGS[provider].fields.forEach((f) => {
      fields[f.key] = existing?.fields?.[f.key] || '';
    });
    setDialogFields(fields);
    setTestResult(null);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setDialogProvider('');
    setDialogFields({});
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save first so the backend has the credentials to test
      await saveCredential(dialogProvider, dialogFields);
      const result = await testCredential(dialogProvider);
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, message: 'Connection test failed.' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveCredential(dialogProvider, dialogFields);
      showSnack(`${PROVIDER_CONFIGS[dialogProvider].label} credentials saved.`, 'success');
      handleCloseDialog();
      await fetchData();
    } catch (err) {
      showSnack('Failed to save credentials.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (provider: string) => {
    try {
      await deleteCredential(provider);
      showSnack(`${PROVIDER_CONFIGS[provider].label} credentials removed.`, 'success');
      await fetchData();
    } catch (err) {
      showSnack('Failed to delete credentials.', 'error');
    }
  };

  const handleSyncNow = async (provider: string) => {
    try {
      await triggerSync(provider);
      showSnack(`Sync triggered for ${PROVIDER_CONFIGS[provider].label}.`, 'success');
      setTimeout(fetchData, 2000);
    } catch (err) {
      showSnack('Failed to trigger sync.', 'error');
    }
  };

  const handleSyncAll = async () => {
    try {
      await triggerSyncAll();
      showSnack('Sync triggered for all providers.', 'success');
      setTimeout(fetchData, 2000);
    } catch (err) {
      showSnack('Failed to trigger sync.', 'error');
    }
  };

  const handleScheduleChange = async (provider: string, field: string, value: number | boolean) => {
    try {
      const existing = schedules.find((s) => s.provider === provider);
      await updateSyncSchedule({
        provider,
        interval_minutes: field === 'interval_minutes' ? (value as number) : (existing?.interval_minutes || 30),
        enabled: field === 'enabled' ? (value as boolean) : (existing?.enabled ?? true),
      });
      showSnack('Schedule updated.', 'success');
      await fetchData();
    } catch (err) {
      showSnack('Failed to update schedule.', 'error');
    }
  };

  const handleSsoSave = async () => {
    setSsoSaving(true);
    try {
      const result = await updateSSOConfig({
        client_id: ssoClientId,
        tenant_id: ssoTenantId,
        enabled: ssoEnabled,
      });
      setSsoConfig(result);
      setSsoEditing(false);
      showSnack('SSO configuration saved.', 'success');
    } catch (err) {
      showSnack('Failed to save SSO configuration.', 'error');
    } finally {
      setSsoSaving(false);
    }
  };

  const handleSsoDelete = async () => {
    try {
      await deleteSSOConfig();
      setSsoConfig(null);
      setSsoClientId('');
      setSsoTenantId('');
      setSsoEnabled(true);
      setSsoEditing(false);
      showSnack('SSO configuration removed.', 'success');
    } catch (err) {
      showSnack('Failed to remove SSO configuration.', 'error');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Settings
      </Typography>

      {/* SSO Configuration (Owner only) */}
      {hasRole('owner') && (
        <>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Microsoft Entra ID (SSO)
          </Typography>
          <Card sx={{ mb: 4, borderTop: '4px solid #0078d4' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SecurityIcon sx={{ color: '#0078d4' }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Single Sign-On Configuration
                  </Typography>
                </Box>
                {ssoConfig?.configured ? (
                  <Chip
                    icon={<CheckCircleIcon />}
                    label={ssoConfig.enabled ? 'Enabled' : 'Disabled'}
                    color={ssoConfig.enabled ? 'success' : 'default'}
                    size="small"
                  />
                ) : (
                  <Chip label="Not Configured" size="small" variant="outlined" />
                )}
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Enable Microsoft SSO so users can sign in with their organizational accounts.
                Register an app in Azure Portal &gt; App Registrations, set the redirect URI
                to your app URL, and add the User.Read API permission.
              </Typography>

              {(!ssoConfig?.configured || ssoEditing) ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 500 }}>
                  <TextField
                    label="Application (Client) ID"
                    value={ssoClientId}
                    onChange={(e) => setSsoClientId(e.target.value)}
                    size="small"
                    fullWidth
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    helperText="From Azure Portal > App registrations > Your app > Overview"
                  />
                  <TextField
                    label="Directory (Tenant) ID"
                    value={ssoTenantId}
                    onChange={(e) => setSsoTenantId(e.target.value)}
                    size="small"
                    fullWidth
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    helperText="From Azure Portal > App registrations > Your app > Overview"
                  />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Switch
                      checked={ssoEnabled}
                      onChange={(e) => setSsoEnabled(e.target.checked)}
                    />
                    <Typography variant="body2">
                      {ssoEnabled ? 'SSO enabled — login page will show "Sign in with Microsoft"' : 'SSO disabled — only local login available'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="contained"
                      onClick={handleSsoSave}
                      disabled={ssoSaving || !ssoClientId.trim() || !ssoTenantId.trim()}
                      sx={{ bgcolor: '#0078d4', '&:hover': { bgcolor: '#106ebe' } }}
                    >
                      {ssoSaving ? 'Saving...' : 'Save SSO Configuration'}
                    </Button>
                    {ssoEditing && (
                      <Button onClick={() => {
                        setSsoEditing(false);
                        setSsoClientId(ssoConfig?.client_id || '');
                        setSsoTenantId(ssoConfig?.tenant_id || '');
                        setSsoEnabled(ssoConfig?.enabled ?? true);
                      }}>
                        Cancel
                      </Button>
                    )}
                  </Box>
                </Box>
              ) : (
                <Box>
                  <Box sx={{ display: 'flex', gap: 4, mb: 2 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Client ID</Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {ssoConfig.client_id}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Tenant ID</Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {ssoConfig.tenant_id}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<SettingsIcon />}
                      onClick={() => setSsoEditing(true)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={handleSsoDelete}
                    >
                      Remove
                    </Button>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* API Credentials Section */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        API Credentials
      </Typography>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {Object.entries(PROVIDER_CONFIGS).map(([provider, config]) => {
          const cred = getCredForProvider(provider);
          const isConfigured = cred?.configured;
          return (
            <Grid size={{ xs: 12, md: 4 }} key={provider}>
              <Card
                sx={{
                  borderTop: `4px solid ${config.color}`,
                  height: '100%',
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" sx={{ fontSize: '1rem' }}>
                      {config.label}
                    </Typography>
                    {isConfigured ? (
                      <Chip icon={<CheckCircleIcon />} label="Connected" color="success" size="small" />
                    ) : (
                      <Chip icon={<CloudOffIcon />} label="Not Configured" size="small" variant="outlined" />
                    )}
                  </Box>
                  {cred?.last_synced && (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                      Last synced: {new Date(cred.last_synced).toLocaleString()}
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<SettingsIcon />}
                      onClick={() => handleOpenDialog(provider)}
                    >
                      Configure
                    </Button>
                    {isConfigured && (
                      <>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<SyncIcon />}
                          onClick={() => handleSyncNow(provider)}
                        >
                          Sync
                        </Button>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(provider)}
                          title="Remove credentials"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Sync Schedule Section */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Sync Schedule</Typography>
        <Button variant="contained" startIcon={<SyncIcon />} onClick={handleSyncAll}>
          Sync All Now
        </Button>
      </Box>
      <Card sx={{ mb: 4 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Provider</TableCell>
                <TableCell>Interval</TableCell>
                <TableCell>Enabled</TableCell>
                <TableCell>Next Run</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(PROVIDER_CONFIGS).map(([provider, config]) => {
                const schedule = schedules.find((s) => s.provider === provider);
                return (
                  <TableRow key={provider}>
                    <TableCell>
                      <Chip
                        label={config.label}
                        size="small"
                        sx={{ backgroundColor: config.color, color: '#fff' }}
                      />
                    </TableCell>
                    <TableCell>
                      <FormControl size="small" sx={{ minWidth: 120 }}>
                        <Select
                          value={schedule?.interval_minutes || 30}
                          onChange={(e) =>
                            handleScheduleChange(provider, 'interval_minutes', e.target.value as number)
                          }
                        >
                          <MenuItem value={15}>15 min</MenuItem>
                          <MenuItem value={30}>30 min</MenuItem>
                          <MenuItem value={60}>1 hour</MenuItem>
                          <MenuItem value={120}>2 hours</MenuItem>
                          <MenuItem value={360}>6 hours</MenuItem>
                          <MenuItem value={720}>12 hours</MenuItem>
                          <MenuItem value={1440}>24 hours</MenuItem>
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={schedule?.enabled ?? false}
                        onChange={(e) => handleScheduleChange(provider, 'enabled', e.target.checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {schedule?.next_run ? new Date(schedule.next_run).toLocaleString() : 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        startIcon={<SyncIcon />}
                        onClick={() => handleSyncNow(provider)}
                      >
                        Sync Now
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Recent Sync Logs */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Recent Sync Logs
      </Typography>
      <Card>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Provider</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Devices Synced</TableCell>
                <TableCell>Started</TableCell>
                <TableCell>Completed</TableCell>
                <TableCell>Error</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {syncLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <Chip
                      label={PROVIDER_CONFIGS[log.provider]?.label || log.provider}
                      size="small"
                      sx={{
                        backgroundColor: PROVIDER_CONFIGS[log.provider]?.color || '#757575',
                        color: '#fff',
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={log.status}
                      size="small"
                      color={
                        log.status === 'success'
                          ? 'success'
                          : log.status === 'failed'
                          ? 'error'
                          : 'warning'
                      }
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>{log.devices_synced}</TableCell>
                  <TableCell>{new Date(log.started_at).toLocaleString()}</TableCell>
                  <TableCell>
                    {log.completed_at ? new Date(log.completed_at).toLocaleString() : 'Running...'}
                  </TableCell>
                  <TableCell>
                    {log.error_message ? (
                      <Typography variant="caption" color="error">
                        {log.error_message}
                      </Typography>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {syncLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No sync logs yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Configure Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Configure {PROVIDER_CONFIGS[dialogProvider]?.label}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {PROVIDER_CONFIGS[dialogProvider]?.fields.map((field) => (
              <TextField
                key={field.key}
                label={field.label}
                type={field.type}
                fullWidth
                value={dialogFields[field.key] || ''}
                onChange={(e) =>
                  setDialogFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
              />
            ))}
          </Box>
          {testResult && (
            <Alert
              severity={testResult.success ? 'success' : 'error'}
              icon={testResult.success ? <CheckCircleIcon /> : <ErrorIcon />}
              sx={{ mt: 2 }}
            >
              {testResult.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            variant="outlined"
            onClick={handleTestConnection}
            disabled={testing}
            startIcon={testing ? <CircularProgress size={16} /> : undefined}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default SettingsPage;
