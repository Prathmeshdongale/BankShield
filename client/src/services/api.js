/**
 * api.js — Axios instance with JWT interceptor and refresh-token retry.
 *
 * Request interceptor:
 *   Attaches `Authorization: Bearer <accessToken>` to every request.
 *
 * Response interceptor (401 retry loop):
 *   1. On 401, attempt ONE silent token refresh via POST /auth/refresh.
 *   2. If refresh succeeds, store new tokens and retry the original request.
 *   3. If refresh fails (expired, revoked), clear storage and redirect to /login.
 *   4. Concurrent 401s are queued and replayed after a single refresh, not
 *      triggering multiple refresh calls (isRefreshing flag + queue pattern).
 */

import axios from 'axios';
import tokenStore from './tokenStore';

// ── Instance ──────────────────────────────────────────────────────────────────
export const api = axios.create({
  baseURL : '/api',
  timeout : 15_000,
  headers : { 'Content-Type': 'application/json' },
});

// ── Refresh-token queue (prevents concurrent refresh races) ───────────────────
let isRefreshing = false;
let failedQueue  = [];   // [{ resolve, reject }]

const processQueue = (error, token = null) => {
  failedQueue.forEach(p => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
};

// ── Request interceptor — attach access token ─────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = tokenStore.getAccess();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (err) => Promise.reject(err)
);

// ── Response interceptor — 401 → refresh → retry ─────────────────────────────
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // Not a 401, or already a retry, or it's the refresh endpoint itself
    if (
      error.response?.status !== 401 ||
      original._retry ||
      original.url === '/auth/refresh'
    ) {
      return Promise.reject(error);
    }

    // Another refresh is already in flight — queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          },
          reject,
        });
      });
    }

    original._retry   = true;
    isRefreshing      = true;
    const refreshToken = tokenStore.getRefresh();

    if (!refreshToken) {
      isRefreshing = false;
      tokenStore.clear();
      window.location.replace('/login');
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post('/api/auth/refresh', { refreshToken });
      const { accessToken, refreshToken: newRefresh } = data.data;

      tokenStore.setTokens(accessToken, newRefresh);
      api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;

      processQueue(null, accessToken);
      original.headers.Authorization = `Bearer ${accessToken}`;
      return api(original);
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      tokenStore.clear();
      window.location.replace('/login');
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
