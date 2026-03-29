import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import AppsIcon from '@mui/icons-material/Apps';
import VerifiedIcon from '@mui/icons-material/Verified';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import DevicesIcon from '@mui/icons-material/Devices';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import {
  getAppSummary,
  getFleetApps,
  AppSummary,
  FleetApp,
} from '../services/api';

const SOURCE_COLORS: Record<string, string> = {
  intune: '#1976d2',
  kandji: '#7b1fa2',
  qualys: '#e64a19',
};

interface KpiCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  color: string;
  loading: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({ icon, value, label, color, loading }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 3 }}>
      <Box
        sx={{
          backgroundColor: `${color}15`,
          borderRadius: 2,
          p: 1.5,
          display: 'flex',
          color,
        }}
      >
        {icon}
      </Box>
      <Box>
        {loading ? (
          <Skeleton width={60} height={40} />
        ) : (
          <Typography variant="h4" sx={{ color, lineHeight: 1, fontWeight: 700 }}>
            {value}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
      </Box>
    </CardContent>
  </Card>
);

type SortField = 'name' | 'publisher' | 'device_count';
type SortOrder = 'asc' | 'desc';
type ManagedFilter = 'all' | 'managed' | 'unmanaged';

const ApplicationsPage: React.FC = () => {
  const [summary, setSummary] = useState<AppSummary | null>(null);
  const [apps, setApps] = useState<FleetApp[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);

  // Filters & pagination
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [managedFilter, setManagedFilter] = useState<ManagedFilter>('all');
  const [sortBy, setSortBy] = useState<SortField>('device_count');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await getAppSummary();
      setSummary(data);
    } catch (err) {
      console.error('Failed to fetch app summary:', err);
    }
  }, []);

  const fetchApps = useCallback(async () => {
    setTableLoading(true);
    try {
      const params: Record<string, any> = {
        sort_by: sortBy,
        sort_order: sortOrder,
        skip: page * rowsPerPage,
        limit: rowsPerPage,
      };
      if (search) params.search = search;
      if (managedFilter === 'managed') params.is_managed = true;
      if (managedFilter === 'unmanaged') params.is_managed = false;

      const data = await getFleetApps(params);
      setApps(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to fetch apps:', err);
    } finally {
      setTableLoading(false);
    }
  }, [search, managedFilter, sortBy, sortOrder, page, rowsPerPage]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  useEffect(() => {
    if (!loading) return;
    // Mark loading done after both fetches
    if (summary !== null) setLoading(false);
  }, [summary, loading]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(0);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearch('');
    setPage(0);
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
    setPage(0);
  };

  const handleManagedFilterChange = (_: React.MouseEvent<HTMLElement>, value: ManagedFilter | null) => {
    if (value !== null) {
      setManagedFilter(value);
      setPage(0);
    }
  };

  const managedPct = summary && summary.total_installations > 0
    ? `${((summary.managed_count / summary.total_installations) * 100).toFixed(0)}%`
    : '0%';

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1, fontWeight: 700 }}>
        Applications
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Fleet-wide application inventory — managed and unmanaged software across all endpoints
      </Typography>

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            icon={<AppsIcon fontSize="large" />}
            value={summary?.unique_apps ?? 0}
            label="Unique Applications"
            color="#1a237e"
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            icon={<VerifiedIcon fontSize="large" />}
            value={managedPct}
            label="Managed Coverage"
            color="#388e3c"
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            icon={<ReportProblemIcon fontSize="large" />}
            value={summary?.unmanaged_count ?? 0}
            label="Unmanaged Installations"
            color="#f57c00"
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            icon={<DevicesIcon fontSize="large" />}
            value={summary?.devices_with_apps ?? 0}
            label="Devices with Apps"
            color="#1976d2"
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', py: 2, '&:last-child': { pb: 2 } }}>
          <Box component="form" onSubmit={handleSearchSubmit} sx={{ flexGrow: 1, minWidth: 200 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search by app name or publisher..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: searchInput ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={handleClearSearch}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Box>
          <ToggleButtonGroup
            size="small"
            value={managedFilter}
            exclusive
            onChange={handleManagedFilterChange}
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="managed" sx={{ color: '#388e3c' }}>Managed</ToggleButton>
            <ToggleButton value="unmanaged" sx={{ color: '#f57c00' }}>Unmanaged</ToggleButton>
          </ToggleButtonGroup>
        </CardContent>
      </Card>

      {/* Apps Table */}
      <Card>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>
                  <TableSortLabel
                    active={sortBy === 'name'}
                    direction={sortBy === 'name' ? sortOrder : 'asc'}
                    onClick={() => handleSort('name')}
                  >
                    Application
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Version</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>
                  <TableSortLabel
                    active={sortBy === 'publisher'}
                    direction={sortBy === 'publisher' ? sortOrder : 'asc'}
                    onClick={() => handleSort('publisher')}
                  >
                    Publisher
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>
                  <TableSortLabel
                    active={sortBy === 'device_count'}
                    direction={sortBy === 'device_count' ? sortOrder : 'desc'}
                    onClick={() => handleSort('device_count')}
                  >
                    Devices
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Sources</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tableLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : apps.length > 0 ? (
                apps.map((app) => (
                  <TableRow key={app.name} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {app.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {app.latest_version || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {app.publisher || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={app.is_managed ? 'Managed' : 'Unmanaged'}
                        color={app.is_managed ? 'success' : 'warning'}
                        variant="outlined"
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {app.device_count}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {app.sources.map((src) => (
                          <Chip
                            key={src}
                            size="small"
                            label={src}
                            sx={{
                              bgcolor: `${SOURCE_COLORS[src.toLowerCase()] || '#9e9e9e'}15`,
                              color: SOURCE_COLORS[src.toLowerCase()] || '#9e9e9e',
                              fontWeight: 600,
                              textTransform: 'capitalize',
                            }}
                          />
                        ))}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">
                      {search || managedFilter !== 'all'
                        ? 'No applications match your filters.'
                        : 'No applications found. Sync providers in Settings to populate app inventory.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {total > 0 && (
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        )}
      </Card>
    </Box>
  );
};

export default ApplicationsPage;
