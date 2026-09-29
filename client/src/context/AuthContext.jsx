import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client.js';

const AuthContext = createContext(null);
const TOKEN_KEY = 'orthoviewplus_token';
const USER_KEY = 'orthoviewplus_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
          clearSession();
        }

        return Promise.reject(error);
      },
    );

    return () => {
      api.interceptors.response.eject(interceptor);
    };
  }, [clearSession]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);

      if (!storedToken) {
        if (!cancelled) {
          setReady(true);
        }
        return;
      }

      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
          setToken(storedToken);
        } catch {
          clearSession();
        }
      } else {
        setToken(storedToken);
      }

      try {
        const response = await api.get('/auth/me');
        if (cancelled) {
          return;
        }

        localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
        setUser(response.data.user);
        setToken(storedToken);
      } catch {
        if (!cancelled) {
          clearSession();
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      token,
      ready,
      isAuthenticated: Boolean(token),
      async login(username, password) {
        const response = await api.post('/auth/login', { username, password });
        localStorage.setItem(TOKEN_KEY, response.data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
        setToken(response.data.token);
        setUser(response.data.user);
        return response.data.user;
      },
      async logout() {
        try {
          await api.post('/auth/logout');
        } catch {
          // Local session is still cleared even if the audit request fails.
        }
        clearSession();
      },
    }),
    [user, token, ready, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
