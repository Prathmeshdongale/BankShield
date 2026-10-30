/**
 * AuthContext.jsx — Authentication state for the entire app.
 *
 * Provides:
 *   user                   — { id, email, role, name, permissions, ... } | null
 *   isAuthenticated       — boolean
 *   isLoading              — true while restoring session on mount
 *   login(email, password) — Promise
 *   loginWithOtp(email, otp) — Promise
 *   registerCustomer(data) — Promise
 *   logout(logoutAll?)     — Promise
 *   refreshUser()          — re-fetches /auth/me and updates state
 *
 * Session is restored from tokenStore on mount by calling GET /auth/me.
 * If the token is expired but a refresh token exists, the Axios interceptor
 * in api.js handles the silent refresh transparently.
 */

import React, {
  createContext, useContext, useState, useEffect, useCallback, useRef,
} from 'react';
import toast                from 'react-hot-toast';
import tokenStore           from '@/services/tokenStore';
import { authService }      from '@/services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,      setUser]      = useState(null);
  const [isLoading, setIsLoading] = useState(true);   // true until session restored
  const didInit = useRef(false);

  // ── Restore session on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const restore = async () => {
      const token = tokenStore.getAccess();
      if (!token) { setIsLoading(false); return; }

      try {
        const res  = await authService.getProfile();
        const profile = res.data;
        tokenStore.setUser(profile);
        setUser(profile);
      } catch {
        // Token is invalid or expired and refresh also failed (interceptor cleared storage)
        tokenStore.clear();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    restore();
  }, []);

  // ── login ───────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res = await authService.login({ email, password });
    const { user: profile, accessToken, refreshToken } = res.data;

    tokenStore.setTokens(accessToken, refreshToken);
    tokenStore.setUser(profile);
    setUser(profile);

    toast.success(`Welcome back, ${profile.firstName}!`);
    return profile;
  }, []);

  // ── loginWithOtp (Super Admin) ──────────────────────────────────────────────
  const loginWithOtp = useCallback(async (email, otp) => {
    const res = await authService.verifySuperAdminOtp(email, otp);
    const { user: profile, accessToken, refreshToken } = res.data;

    tokenStore.setTokens(accessToken, refreshToken);
    tokenStore.setUser(profile);
    setUser(profile);

    toast.success(`Super Admin logged in successfully! Welcome, ${profile.firstName}!`);
    return profile;
  }, []);

  // ── registerCustomer ────────────────────────────────────────────────────────
  const registerCustomer = useCallback(async (data) => {
    const res = await authService.registerCustomer(data);
    const { user: profile, accessToken, refreshToken } = res.data;

    tokenStore.setTokens(accessToken, refreshToken);
    tokenStore.setUser(profile);
    setUser(profile);

    toast.success(`Account created! Welcome to BankShield, ${profile.firstName}!`);
    return profile;
  }, []);

  // ── logout ──────────────────────────────────────────────────────────────────
  const logout = useCallback(async (logoutAll = false) => {
    try {
      const rt = tokenStore.getRefresh();
      await authService.logout(rt, logoutAll);
    } catch {
      // best-effort — clear regardless
    } finally {
      tokenStore.clear();
      setUser(null);
    }
  }, []);

  // ── refreshUser — re-fetch profile (after permission change etc.) ───────────
  const refreshUser = useCallback(async () => {
    try {
      const res = await authService.getProfile();
      const profile = res.data;
      tokenStore.setUser(profile);
      setUser(profile);
      return profile;
    } catch {
      return null;
    }
  }, []);

  // ── Role helpers ─────────────────────────────────────────────────────────────
  const hasRole = useCallback((roles) => {
    if (!user) return false;
    const list = Array.isArray(roles) ? roles : [roles];
    return list.includes(user.role);
  }, [user]);

  const hasPermission = useCallback((perms) => {
    if (!user) return false;
    const list = Array.isArray(perms) ? perms : [perms];
    const set  = new Set(user.permissions ?? []);
    return list.every(p => set.has(p));
  }, [user]);

  const hasAnyPermission = useCallback((perms) => {
    if (!user) return false;
    const list = Array.isArray(perms) ? perms : [perms];
    const set  = new Set(user.permissions ?? []);
    return list.some(p => set.has(p));
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated : !!user,
      isLoading,
      login,
      loginWithOtp,
      registerCustomer,
      logout,
      refreshUser,
      hasRole,
      hasPermission,
      hasAnyPermission,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
