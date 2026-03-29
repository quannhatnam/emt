import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import DownloadIcon from '@mui/icons-material/Download';
import { getDevices, Device, DeviceListResponse } from '../services/api';

const complianceColor = (status: string): 'success' | 'error' | 'default' => {
  switch (status?.toLowerCase()) {
    case 'compliant':
      return 'success';
    case 'non_compliant':
    case 'non-compliant':
      return 'error';
    default:
      return 'default';
  }
};

const sourceColor = (source: string): string => {
  switch (source?.toLowerCase()) {
    case 'intune':
      return '#1976d2';
    case 'kandji':
      return '#7b1fa2';
    case 'qualys':
      return '#e64a19';
    default:
      return '#757575';
  }
};

const securityStatusChip = (value: boolean | null | undefined, enabledLabel: string, disabledLabel: string) => {
  if (value === true) return <Chip label={enabledLabel} size="small" color="success" variant="outlined" sx={{ fontSize: '0.7rem' }} />;
  if (value === false) return <Chip label={disabledLabel} size="small" color="error" variant="outlined" sx={{ fontSize: '0.7rem' }} />;
  return <Chip label="Unknown" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />;
};

const columns: GridColDef[] = [
  { field: 'hostname', headerName: 'Hostname', flex: 1, minWidth: 150 },
  { field: 'serial_number', headerName: 'Serial', flex: 1, minWidth: 120 },
  { field: 'platform', headerName: 'Platform', width: 100 },
  { field: 'os_version', headerName: 'OS Version', flex: 1, minWidth: 120 },
  { field: 'assigned_user', headerName: 'User', flex: 1, minWidth: 120 },
  {
    field: 'compliance_status',
    headerName: 'Compliance',
    width: 130,
    renderCell: (params) => (
      <Chip
        label={params.value || 'Unknown'}
        color={complianceColor(params.value)}
        size="small"
        variant="filled"
      />
    ),
  },
  {
    field: 'encryption_enabled',
    headerName: 'Encryption',
    width: 110,
    renderCell: (params) => securityStatusChip(params.value, 'On', 'Off'),
  },
  {
    field: 'firewall_enabled',
    headerName: 'Firewall',
    width: 100,
    renderCell: (params) => securityStatusChip(params.value, 'On', 'Off'),
  },
  {
    field: 'antivirus_active',
    headerName: 'Antivirus',
    width: 100,
    renderCell: (params) => securityStatusChip(params.value, 'Active', 'Off'),
  },
  {
    field: 'source',
    headerName: 'Source',
    width: 100,
    renderCell: (params) => (
      <Chip
        label={params.value}
        size="small"
        sx={{
          backgroundColor: sourceColor(params.value),
          color: '#fff',
        }}
      />
    ),
  },
  {
    field: 'last_checkin',
    headerName: 'Last Check-in',
    width: 160,
    valueFormatter: (value: string) =>
      value ? new Date(value).toLocaleString() : 'N/A',
  },
];

const DevicesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<DeviceListResponse>({
    items: [],
    total: 0,
    skip: 0,
    limit: 25,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState(searchParams.get('source') || '');
  const [platform, setPlatform] = useState(searchParams.get('platform') || '');
  const [compliance, setCompliance] = useState(searchParams.get('compliance_status') || '');
  const [encryptionFilter, setEncryptionFilter] = useState(searchParams.get('encryption_enabled') || '');
  const [firewallFilter, setFirewallFilter] = useState(searchParams.get('firewall_enabled') || '');
  const [antivirusFilter, setAntivirusFilter] = useState(searchParams.get('antivirus_active') || '');
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 25,
  });

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getDevices({
        search: search || undefined,
        source: source || undefined,
        platform: platform || undefined,
        compliance_status: compliance || undefined,
        encryption_enabled: encryptionFilter === '' ? undefined : encryptionFilter === 'true',
        firewall_enabled: firewallFilter === '' ? undefined : firewallFilter === 'true',
        antivirus_active: antivirusFilter === '' ? undefined : antivirusFilter === 'true',
        skip: paginationModel.page * paginationModel.pageSize,
        limit: paginationModel.pageSize,
      });
      setData(result);
    } catch (err) {
      console.error('Failed to fetch devices:', err);
    } finally {
      setLoading(false);
    }
  }, [search, source, platform, compliance, encryptionFilter, firewallFilter, antivirusFilter, paginationModel]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleExportCsv = () => {
    const header = [
      'Hostname',
      'Serial',
      'Platform',
      'OS Version',
      'User',
      'Compliance',
      'Source',
      'Last Check-in',
    ];
    const rows = data.items.map((d: Device) => [
      d.hostname,
      d.serial_number,
      d.platform,
      d.os_version,
      d.assigned_user,
      d.compliance_status,
      d.source,
      d.last_checkin,
    ]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'devices.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Devices</Typography>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleExportCsv}
        >
          Export CSV
        </Button>
      </Box>

      {/* Filter Bar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          label="Search"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 200 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Source</InputLabel>
          <Select
            value={source}
            label="Source"
            onChange={(e) => setSource(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="intune">Intune</MenuItem>
            <MenuItem value="kandji">Kandji</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Platform</InputLabel>
          <Select
            value={platform}
            label="Platform"
            onChange={(e) => setPlatform(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="windows">Windows</MenuItem>
            <MenuItem value="macos">macOS</MenuItem>
            <MenuItem value="linux">Linux</MenuItem>
            <MenuItem value="ios">iOS</MenuItem>
            <MenuItem value="android">Android</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Compliance</InputLabel>
          <Select
            value={compliance}
            label="Compliance"
            onChange={(e) => setCompliance(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="compliant">Compliant</MenuItem>
            <MenuItem value="non_compliant">Non-Compliant</MenuItem>
            <MenuItem value="unknown">Unknown</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Encryption</InputLabel>
          <Select
            value={encryptionFilter}
            label="Encryption"
            onChange={(e) => setEncryptionFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="true">Enabled</MenuItem>
            <MenuItem value="false">Disabled</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Firewall</InputLabel>
          <Select
            value={firewallFilter}
            label="Firewall"
            onChange={(e) => setFirewallFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="true">Enabled</MenuItem>
            <MenuItem value="false">Disabled</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Antivirus</InputLabel>
          <Select
            value={antivirusFilter}
            label="Antivirus"
            onChange={(e) => setAntivirusFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="true">Active</MenuItem>
            <MenuItem value="false">Inactive</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Data Grid */}
      <Box sx={{ height: 'calc(100vh - 280px)', width: '100%' }}>
        <DataGrid
          rows={data.items}
          columns={columns}
          rowCount={data.total}
          loading={loading}
          pageSizeOptions={[10, 25, 50, 100]}
          paginationModel={paginationModel}
          paginationMode="server"
          onPaginationModelChange={setPaginationModel}
          onRowClick={(params) => navigate(`/devices/${params.row.id}`)}
          sx={{
            backgroundColor: 'white',
            borderRadius: 2,
            '& .MuiDataGrid-row': { cursor: 'pointer' },
          }}
          disableRowSelectionOnClick
        />
      </Box>
    </Box>
  );
};

export default DevicesPage;
