import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Skeleton,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Paper,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ComputerIcon from '@mui/icons-material/Computer';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import TabletMacIcon from '@mui/icons-material/TabletMac';
import { getDevice, Device } from '../services/api';

const platformIcon = (platform: string) => {
  switch (platform?.toLowerCase()) {
    case 'ios':
    case 'android':
      return <PhoneIphoneIcon sx={{ fontSize: 40 }} />;
    case 'ipad':
      return <TabletMacIcon sx={{ fontSize: 40 }} />;
    default:
      return <ComputerIcon sx={{ fontSize: 40 }} />;
  }
};

const complianceBadge = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'compliant':
      return <Chip icon={<CheckCircleIcon />} label="Compliant" color="success" />;
    case 'non_compliant':
    case 'non-compliant':
      return <Chip icon={<CancelIcon />} label="Non-Compliant" color="error" />;
    default:
      return <Chip icon={<HelpOutlineIcon />} label="Unknown" color="default" />;
  }
};

const severityColor = (severity: string): string => {
  switch (severity?.toLowerCase()) {
    case 'critical':
    case '5':
      return '#d32f2f';
    case 'high':
    case '4':
      return '#f57c00';
    case 'medium':
    case '3':
      return '#fbc02d';
    case 'low':
    case '2':
      return '#1976d2';
    default:
      return '#9e9e9e';
  }
};

const boolChip = (value: boolean | null | undefined, label: string) => {
  if (value === true) return <Chip label={label} color="success" size="small" variant="outlined" />;
  if (value === false) return <Chip label={label} color="error" size="small" variant="outlined" />;
  return <Chip label={`${label}: N/A`} size="small" variant="outlined" />;
};

interface TabPanelProps {
  children: React.ReactNode;
  value: number;
  index: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <Box role="tabpanel" hidden={value !== index} sx={{ pt: 2 }}>
    {value === index && children}
  </Box>
);

const DeviceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    if (!id) return;
    const fetchDevice = async () => {
      try {
        const data = await getDevice(id);
        setDevice(data);
      } catch (err) {
        setError('Failed to load device details.');
      } finally {
        setLoading(false);
      }
    };
    fetchDevice();
  }, [id]);

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={120} sx={{ mb: 2, borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  if (error || !device) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/devices')} sx={{ mb: 2 }}>
          Back to Devices
        </Button>
        <Alert severity="error">{error || 'Device not found'}</Alert>
      </Box>
    );
  }

  const infoFields = [
    { label: 'Serial Number', value: device.serial_number },
    { label: 'Platform', value: device.platform },
    { label: 'OS Version', value: device.os_version },
    { label: 'Model', value: device.model },
    { label: 'Assigned User', value: device.assigned_user || 'N/A' },
    { label: 'Email', value: device.assigned_email || 'N/A' },
    { label: 'IP Address', value: device.ip_address || 'N/A' },
    { label: 'MAC Address', value: device.mac_address || 'N/A' },
    { label: 'Source', value: device.source },
    { label: 'Last Check-in', value: device.last_checkin ? new Date(device.last_checkin).toLocaleString() : 'N/A' },
    { label: 'Created', value: device.created_at ? new Date(device.created_at).toLocaleString() : 'N/A' },
    { label: 'Updated', value: device.updated_at ? new Date(device.updated_at).toLocaleString() : 'N/A' },
  ];

  const apps = device.apps || [];
  const vulns = device.vulnerabilities || [];
  const managedApps = apps.filter((a) => a.managed);
  const unmanagedApps = apps.filter((a) => !a.managed);

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/devices')} sx={{ mb: 2 }}>
        Back to Devices
      </Button>

      {/* Header Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ color: 'primary.main' }}>{platformIcon(device.platform)}</Box>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h5">{device.hostname || 'Unknown Device'}</Typography>
              <Typography variant="body2" color="text.secondary">
                {device.platform} &middot; {device.os_version} &middot; {device.serial_number}
              </Typography>
            </Box>
            {complianceBadge(device.compliance_status)}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            {boolChip(device.encryption_enabled, 'Encryption')}
            {boolChip(device.firewall_enabled, 'Firewall')}
            {boolChip(device.antivirus_active, 'Antivirus')}
          </Box>
        </CardContent>
      </Card>

      {/* Device Info */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Device Information
          </Typography>
          <Grid container spacing={2}>
            {infoFields.map((field) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={field.label}>
                <Typography variant="caption" color="text.secondary">
                  {field.label}
                </Typography>
                <Typography variant="body1">{field.value}</Typography>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Tabs: Apps & Vulnerabilities */}
      <Card>
        <CardContent>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
            <Tab label={`Apps (${apps.length})`} />
            <Tab label={`Vulnerabilities (${vulns.length})`} />
          </Tabs>

          {/* Apps Tab */}
          <TabPanel value={tabValue} index={0}>
            {managedApps.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                  Managed Apps ({managedApps.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Version</TableCell>
                        <TableCell>Publisher</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {managedApps.map((app, i) => (
                        <TableRow key={`m-${i}`}>
                          <TableCell>{app.name}</TableCell>
                          <TableCell>{app.version || 'N/A'}</TableCell>
                          <TableCell>{app.publisher || 'N/A'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {unmanagedApps.length > 0 && (
              <Box>
                <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                  Unmanaged Apps ({unmanagedApps.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Version</TableCell>
                        <TableCell>Publisher</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {unmanagedApps.map((app, i) => (
                        <TableRow key={`u-${i}`}>
                          <TableCell>{app.name}</TableCell>
                          <TableCell>{app.version || 'N/A'}</TableCell>
                          <TableCell>{app.publisher || 'N/A'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {apps.length === 0 && (
              <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                No apps detected for this device
              </Typography>
            )}
          </TabPanel>

          {/* Vulnerabilities Tab */}
          <TabPanel value={tabValue} index={1}>
            {vulns.length > 0 ? (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>CVE</TableCell>
                      <TableCell>Title</TableCell>
                      <TableCell>Severity</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>First Detected</TableCell>
                      <TableCell>Last Detected</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {vulns.map((vuln, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {vuln.cve_id || 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell>{vuln.title}</TableCell>
                        <TableCell>
                          <Chip
                            label={vuln.severity}
                            size="small"
                            sx={{
                              backgroundColor: severityColor(vuln.severity),
                              color: '#fff',
                              fontWeight: 600,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={vuln.status}
                            size="small"
                            color={vuln.status === 'fixed' ? 'success' : vuln.status === 'open' ? 'error' : 'default'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          {vuln.first_detected ? new Date(vuln.first_detected).toLocaleDateString() : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {vuln.last_detected ? new Date(vuln.last_detected).toLocaleDateString() : 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                No vulnerabilities found for this device
              </Typography>
            )}
          </TabPanel>
        </CardContent>
      </Card>
    </Box>
  );
};

export default DeviceDetailPage;
