import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  TextField,
  Typography,
  CircularProgress,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import WindowIcon from '@mui/icons-material/Window';
import { loginLocal, loginSSO, getSSOConfig, LoginResponse } from '../services/api';
import { useAuth } from '../auth/AuthContext';
import { createMsalInstance, loginRequest } from '../auth/msalConfig';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoConfig, setSsoConfig] = useState<{ client_id: string; tenant_id: string } | null>(null);

  useEffect(() => {
    getSSOConfig()
      .then((config) => {
        if (config.configured && config.enabled) {
          setSsoEnabled(true);
          setSsoConfig({ client_id: config.client_id, tenant_id: config.tenant_id });
        }
      })
      .catch(() => {
        // SSO not available — just show local login
      });
  }, []);

  const handleSuccess = (result: LoginResponse) => {
    login(result.access_token, {
      id: result.user.id,
      email: result.user.email,
      display_name: result.user.display_name,
      role: result.user.role as 'owner' | 'admin' | 'readonly',
    });
    navigate('/');
  };

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await loginLocal(email, password);
      handleSuccess(result);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as any;
        setError(axiosErr.response?.data?.detail || 'Login failed. Check your credentials.');
      } else {
        setError('Login failed. Check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSSOLogin = async () => {
    if (!ssoConfig) return;
    setError('');
    setSsoLoading(true);
    try {
      const msalInstance = createMsalInstance(ssoConfig.client_id, ssoConfig.tenant_id);
      await msalInstance.initialize();
      const msalResponse = await msalInstance.loginPopup(loginRequest);
      if (msalResponse.accessToken) {
        const result = await loginSSO(msalResponse.accessToken);
        handleSuccess(result);
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as any;
        setError(axiosErr.response?.data?.detail || 'SSO login failed.');
      } else if (err instanceof Error) {
        if (!err.message.includes('user_cancelled')) {
          setError(`Microsoft sign-in failed: ${err.message}`);
        }
      }
    } finally {
      setSsoLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a237e 0%, #283593 50%, #00897b 100%)',
      }}
    >
      <Card sx={{ width: 420, p: 2 }}>
        <CardContent>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <LockOutlinedIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
              EMT Dashboard
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in to continue
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Microsoft SSO Button */}
          {ssoEnabled && (
            <>
              <Button
                variant="outlined"
                fullWidth
                size="large"
                startIcon={ssoLoading ? <CircularProgress size={20} /> : <WindowIcon />}
                onClick={handleSSOLogin}
                disabled={ssoLoading}
                sx={{
                  mb: 2,
                  textTransform: 'none',
                  borderColor: '#0078d4',
                  color: '#0078d4',
                  '&:hover': { borderColor: '#106ebe', backgroundColor: '#f0f6ff' },
                }}
              >
                {ssoLoading ? 'Signing in...' : 'Sign in with Microsoft'}
              </Button>

              <Divider sx={{ mb: 2, color: 'text.secondary', fontSize: '0.8rem' }}>
                or sign in with credentials
              </Divider>
            </>
          )}

          {/* Local Login Form */}
          <form onSubmit={handleLocalLogin}>
            <TextField
              label="Email"
              fullWidth
              margin="normal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus={!ssoEnabled}
              placeholder="admin@local"
              size="small"
            />
            <TextField
              label="Password"
              type="password"
              fullWidth
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              size="small"
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              sx={{ mt: 2 }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* Role info */}
          <Box sx={{ mt: 3, p: 1.5, borderRadius: 1, bgcolor: '#f5f5f5' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
              Roles
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              <strong>Owner</strong> — Full access + manage users &nbsp;
              <strong>Admin</strong> — Manage devices + sync &nbsp;
              <strong>Read-Only</strong> — View dashboard only
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default LoginPage;
