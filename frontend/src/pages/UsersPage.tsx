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
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Tooltip,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getUsers, createUser, updateUser, deleteUser, UserRecord } from '../services/api';
import { useAuth } from '../auth/AuthContext';

const ROLE_COLORS: Record<string, string> = {
  owner: '#d32f2f',
  admin: '#1565c0',
  readonly: '#666',
};

const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Form state
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('readonly');
  const [formPassword, setFormPassword] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Failed to fetch users', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openCreateDialog = () => {
    setEditingUser(null);
    setFormEmail('');
    setFormName('');
    setFormRole('readonly');
    setFormPassword('');
    setDialogOpen(true);
  };

  const openEditDialog = (user: UserRecord) => {
    setEditingUser(user);
    setFormEmail(user.email);
    setFormName(user.display_name || '');
    setFormRole(user.role);
    setFormPassword('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          display_name: formName,
          role: formRole,
        });
        setSnackbar({ open: true, message: `User ${formEmail} updated`, severity: 'success' });
      } else {
        await createUser({
          email: formEmail,
          display_name: formName,
          role: formRole,
          password: formPassword || undefined,
        });
        setSnackbar({ open: true, message: `User ${formEmail} created`, severity: 'success' });
      }
      setDialogOpen(false);
      fetchUsers();
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || 'Failed to save user',
        severity: 'error',
      });
    }
  };

  const handleToggleActive = async (user: UserRecord) => {
    try {
      await updateUser(user.id, { is_active: !user.is_active });
      setSnackbar({
        open: true,
        message: `User ${user.email} ${user.is_active ? 'deactivated' : 'activated'}`,
        severity: 'success',
      });
      fetchUsers();
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || 'Failed to update user',
        severity: 'error',
      });
    }
  };

  const handleDelete = async (user: UserRecord) => {
    if (!window.confirm(`Delete user ${user.email}? This cannot be undone.`)) return;
    try {
      await deleteUser(user.id);
      setSnackbar({ open: true, message: `User ${user.email} deleted`, severity: 'success' });
      fetchUsers();
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || 'Failed to delete user',
        severity: 'error',
      });
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>User Management</Typography>
          <Typography variant="body2" color="text.secondary">Manage users and role assignments</Typography>
        </Box>
        <Button variant="contained" startIcon={<PersonAddIcon />} onClick={openCreateDialog}>
          Add User
        </Button>
      </Box>

      <Card>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Auth Method</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Last Login</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} sx={{ opacity: u.is_active ? 1 : 0.5 }}>
                    <TableCell sx={{ fontWeight: 500 }}>{u.display_name || '—'}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Chip
                        label={u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                        size="small"
                        sx={{
                          bgcolor: `${ROLE_COLORS[u.role] || '#666'}15`,
                          color: ROLE_COLORS[u.role] || '#666',
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {u.has_entra_id && <Chip label="Microsoft SSO" size="small" variant="outlined" sx={{ mr: 0.5, fontSize: '0.7rem' }} />}
                      {u.has_password && <Chip label="Password" size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={u.is_active ? 'Active' : 'Disabled'}
                        size="small"
                        color={u.is_active ? 'success' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                    </TableCell>
                    <TableCell align="right">
                      {u.id !== currentUser?.id && (
                        <>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => openEditDialog(u)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={u.is_active ? 'Deactivate' : 'Activate'}>
                            <IconButton size="small" onClick={() => handleToggleActive(u)}>
                              {u.is_active ? <BlockIcon fontSize="small" /> : <CheckCircleIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => handleDelete(u)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {u.id === currentUser?.id && (
                        <Typography variant="caption" color="text.secondary">You</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      No users found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingUser ? 'Edit User' : 'Add User'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Email"
            fullWidth
            margin="normal"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            disabled={!!editingUser}
            required
          />
          <TextField
            label="Display Name"
            fullWidth
            margin="normal"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            required
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>Role</InputLabel>
            <Select value={formRole} onChange={(e) => setFormRole(e.target.value)} label="Role">
              <MenuItem value="readonly">Read-Only — View dashboard only</MenuItem>
              <MenuItem value="admin">Admin — Manage devices, sync, settings</MenuItem>
              <MenuItem value="owner">Owner — Full access + user management</MenuItem>
            </Select>
          </FormControl>
          {!editingUser && (
            <TextField
              label="Password (optional for SSO users)"
              type="password"
              fullWidth
              margin="normal"
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              helperText="Leave blank if user will sign in with Microsoft SSO"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!formEmail || !formName}>
            {editingUser ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default UsersPage;
