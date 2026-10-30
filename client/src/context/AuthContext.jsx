/**
 * AuthContext.jsx — Authentication state for the entire app.
 *
 * Provides:
 *   user                       — { id, email, role, name, permissions, ... } | null
 *   isAuthenticated           — boolean
 *   isLoading                  — true while restoring session on mount
 *   login(email, password)     — Promise ({ requiresOtp: true, email, devOtp, ... })
 *   verifyLoginOtp(email, otp) — Promise (profile)
 *   resendOtp(email)           — Promise
 *   registerCustomer(data)     — Promise
 *   logout(logoutAll?)         — Promise
 *   refreshUser()              — re-fetches /auth/me and updates state
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

  // ── Step 1: Validate Credentials & Issue OTP ────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res = await authService.login({ email, password });
    return res.data;
  }, []);

  // ── Step 2: Verify OTP & Issue Session Tokens (All Roles) ───────────────────
  const verifyLoginOtp = useCallback(async (email, otp) => {
    const res = await authService.verifyLoginOtp(email, otp);
    const { user: profile, accessToken, refreshToken } = res.data;

    tokenStore.setTokens(accessToken, refreshToken);
    tokenStore.setUser(profile);
    setUser(profile);

    toast.success(`Welcome, ${profile.firstName}!`);
    return profile;
  }, []);

  // ── Super Admin Passwordless OTP Request & Verification ─────────────────────
  const sendSuperAdminOtp = useCallback(async (email) => {
    const res = await authService.sendSuperAdminOtp(email);
    toast.success('Super Admin verification code sent to your email.');
    return res.data;
  }, []);

  const verifySuperAdminOtp = useCallback(async (email, otp) => {
    const res = await authService.verifySuperAdminOtp(email, otp);
    const { user: profile, accessToken, refreshToken } = res.data;

    tokenStore.setTokens(accessToken, refreshToken);
    tokenStore.setUser(profile);
    setUser(profile);

    toast.success(`Welcome, Super Administrator ${profile.firstName}!`);
    return profile;
  }, []);

  // ── Resend OTP ──────────────────────────────────────────────────────────────
  const resendOtp = useCallback(async (email) => {
    const res = await authService.resendLoginOtp(email);
    toast.success('Verification code resent to your email.');
    return res.data;
  }, []);

  // ── registerCustomer ────────────────────────────────────────────────────────
  const registerCustomer = useCallback(async (data) => {
    const res = await authService.registerCustomer(data);
    const result = res.data;

    // If tokens are returned directly
    if (result.accessToken && result.user) {
      tokenStore.setTokens(result.accessToken, result.refreshToken);
      tokenStore.setUser(result.user);
      setUser(result.user);
      toast.success(`Account created! Welcome, ${result.user.firstName}!`);
      return result.user;
    }

    return result;
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
      verifyLoginOtp,
      sendSuperAdminOtp,
      verifySuperAdminOtp,
      resendOtp,
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
