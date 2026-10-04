/**
 * dashboardService.js — API calls for the dashboard module.
 * Mirrors server/src/routes/dashboardRoutes.js
 */
import api from './api';

export const dashboardService = {
  /** Full dashboard — all sections in one round-trip */
  getFull: () =>
    api.get('/dashboard').then(r => r.data),

  /** KPI totals — transactions, fraud rate, alert counts, accounts */
  getSummary: () =>
    api.get('/dashboard/summary').then(r => r.data),

  /** Risk score buckets, percentiles, channel breakdown, alert severity */
  getRisk: () =>
    api.get('/dashboard/risk').then(r => r.data),

  /** Last 15 transactions + active HIGH/CRITICAL alerts */
  getActivity: () =>
    api.get('/dashboard/activity').then(r => r.data),

  /** 30-day daily series for sparkline/trend charts */
  getTrend: () =>
    api.get('/dashboard/trend').then(r => r.data),

  /** Active alerts ordered by severity */
  getAlerts: () =>
    api.get('/dashboard/alerts').then(r => r.data),

  /** Customers with highest risk scores */
  getTopCustomers: () =>
    api.get('/dashboard/top-customers').then(r => r.data),

  /** Admin only — flush in-process cache */
  invalidateCache: () =>
    api.post('/dashboard/cache/invalidate').then(r => r.data),
};

export default dashboardService;
