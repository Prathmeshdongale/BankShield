/**
 * tokenStore.js — Centralised token management.
 *
 * Keeps access + refresh tokens in localStorage and exposes the
 * same interface everywhere so nothing else touches localStorage directly.
 */

const KEYS = {
  ACCESS  : 'bs_access_token',
  REFRESH : 'bs_refresh_token',
  USER    : 'bs_user',
};

export const tokenStore = {
  getAccess  : ()  => localStorage.getItem(KEYS.ACCESS),
  getRefresh : ()  => localStorage.getItem(KEYS.REFRESH),
  getUser    : ()  => {
    try { return JSON.parse(localStorage.getItem(KEYS.USER) ?? 'null'); }
    catch { return null; }
  },

  setTokens : (accessToken, refreshToken) => {
    localStorage.setItem(KEYS.ACCESS,  accessToken);
    if (refreshToken) localStorage.setItem(KEYS.REFRESH, refreshToken);
  },

  setUser : (user) => {
    localStorage.setItem(KEYS.USER, JSON.stringify(user));
  },

  clear : () => {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  },
};

export default tokenStore;
