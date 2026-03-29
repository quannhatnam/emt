/**
 * Auth context — manages JWT token, user info, and role-based access.
 * Supports both local login and Entra ID SSO.
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface UserInfo {
  id: string;
  email: string;
  display_name: string;
  role: 'owner' | 'admin' | 'readonly';
}

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: UserInfo) => void;
  logout: () => void;
  hasRole: (minRole: 'owner' | 'admin' | 'readonly') => boolean;
}

const ROLE_HIERARCHY: Record<string, number> = {
  owner: 3,
  admin: 2,
  readonly: 1,
};

const AuthContext = createContext<AuthState>({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: () => {},
  logout: () => {},
  hasRole: () => false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('emt_token');
    const savedUser = localStorage.getItem('emt_user');
    if (savedToken && savedUser) {
      try {
        // Check if token is expired
        const payload = JSON.parse(atob(savedToken.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        } else {
          // Token expired — clear
          localStorage.removeItem('emt_token');
          localStorage.removeItem('emt_user');
        }
      } catch {
        localStorage.removeItem('emt_token');
        localStorage.removeItem('emt_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((newToken: string, newUser: UserInfo) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('emt_token', newToken);
    localStorage.setItem('emt_user', JSON.stringify(newUser));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('emt_token');
    localStorage.removeItem('emt_user');
    // Also clear old basic auth if present
    localStorage.removeItem('auth');
    window.location.href = '/login';
  }, []);

  const hasRole = useCallback(
    (minRole: 'owner' | 'admin' | 'readonly') => {
      if (!user) return false;
      return (ROLE_HIERARCHY[user.role] || 0) >= (ROLE_HIERARCHY[minRole] || 0);
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
