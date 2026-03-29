import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './theme';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DevicesPage from './pages/DevicesPage';
import DeviceDetailPage from './pages/DeviceDetailPage';
import ApplicationsPage from './pages/ApplicationsPage';
import SettingsPage from './pages/SettingsPage';
import UsersPage from './pages/UsersPage';
import { AuthProvider, useAuth } from './auth/AuthContext';

const PrivateRoute: React.FC<{ children: React.ReactNode; minRole?: 'owner' | 'admin' | 'readonly' }> = ({
  children,
  minRole = 'readonly',
}) => {
  const { isAuthenticated, isLoading, hasRole } = useAuth();

  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!hasRole(minRole)) {
    return <Navigate to="/" replace />;
  }

  return <Layout>{children}</Layout>;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
      <Route path="/devices" element={<PrivateRoute><DevicesPage /></PrivateRoute>} />
      <Route path="/devices/:id" element={<PrivateRoute><DeviceDetailPage /></PrivateRoute>} />
      <Route path="/applications" element={<PrivateRoute><ApplicationsPage /></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute minRole="admin"><SettingsPage /></PrivateRoute>} />
      <Route path="/users" element={<PrivateRoute minRole="owner"><UsersPage /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
