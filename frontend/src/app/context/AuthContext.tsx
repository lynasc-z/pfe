import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User } from '../../types';
import { getMe, login as apiLogin, logout as apiLogout, getToken } from '../../lib/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount, verify token if it exists
  useEffect(() => {
    const token = getToken();
    if (!token) {
      // Clear any stale user data that might have been persisted without a valid token
      localStorage.removeItem('user');
      setUser(null);
      setLoading(false);
      return;
    }
    getMe()
      .then((freshUser) => {
        setUser(freshUser);
        localStorage.setItem('user', JSON.stringify(freshUser));
      })
      .catch((err: any) => {
        // Only force logout when the server explicitly says credentials are invalid
        if (err?.message?.includes('401') || err?.message?.includes('no longer active') || err?.message?.includes('Unauthorized')) {
          apiLogout();
          setUser(null);
        }
        // On network errors / 5xx — keep the cached user so the UI doesn't vanish
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const response = await apiLogin(email, password);
      setUser(response.user);
      localStorage.setItem('user', JSON.stringify(response.user));
    } catch (err: any) {
      setError(err.message || 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
  }, []);

  // Auto-logout when any API call receives a 401 (expired/revoked token)
  useEffect(() => {
    const handler = () => {
      apiLogout();
      setUser(null);
    };
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
