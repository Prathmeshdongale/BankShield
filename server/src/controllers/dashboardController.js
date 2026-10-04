/**
 * dashboardController.js — HTTP handlers for dashboard endpoints.
 *
 * Every handler:
 *   1. Delegates to dashboardService (which resolves scope + cache)
 *   2. Adds X-Cache and X-Latency-Ms headers for client awareness
 *   3. Returns 200 with data (never 4xx from data shape — only auth/RBAC errors)
 */

import {
  getSummaryService,
  getRiskService,
  getActivityService,
  getTrendService,
  getAlertsService,
  getTopCustomersService,
  getFullDashboardService,
  invalidateDashboardCache,
} from '../services/dashboardService.js';
import { success, failure } from '../utils/response.js';
import { logger }           from '../utils/logger.js';

const handleErr = (err, res) => {
  if (err.message === 'CUSTOMER_ROLE_NOT_ALLOWED') {
    return failure(res, 'This endpoint is not available for your role.', 403);
  }
  if ((err.statusCode ?? 500) >= 500) {
    logger.error(`[DashboardController] ${err.stack ?? err.message}`);
  }
  return failure(res, err.message ?? 'Dashboard data unavailable.', err.statusCode ?? 500);
};

const withCacheHeaders = (res, result) => {
  res.setHeader('X-Cache',      result._cached ? 'HIT' : 'MISS');
  res.setHeader('X-Latency-Ms', String(result._latency_ms ?? 0));
};

/** GET /api/dashboard — full dashboard (all sections, one round-trip) */
export const getFullDashboard = async (req, res) => {
  try {
    const data = await getFullDashboardService(req.user);
    res.setHeader('X-Latency-Ms', String(data._latency_ms ?? 0));
    return success(res, data, 'Dashboard loaded.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/dashboard/summary */
export const getSummary = async (req, res) => {
  try {
    const data = await getSummaryService(req.user);
    withCacheHeaders(res, data);
    return success(res, data, 'Summary retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/dashboard/risk */
export const getRisk = async (req, res) => {
  try {
    const data = await getRiskService(req.user);
    withCacheHeaders(res, data);
    return success(res, data, 'Risk distribution retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/dashboard/activity */
export const getActivity = async (req, res) => {
  try {
    const data = await getActivityService(req.user);
    withCacheHeaders(res, data);
    return success(res, data, 'Recent activity retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/dashboard/trend */
export const getTrend = async (req, res) => {
  try {
    const data = await getTrendService(req.user);
    withCacheHeaders(res, data);
    return success(res, data, '30-day trend retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/dashboard/alerts */
export const getAlerts = async (req, res) => {
  try {
    const data = await getAlertsService(req.user);
    withCacheHeaders(res, data);
    return success(res, data, 'Active alerts retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/dashboard/top-customers */
export const getTopCustomers = async (req, res) => {
  try {
    const data = await getTopCustomersService(req.user);
    withCacheHeaders(res, data);
    return success(res, data, 'Top customers by risk retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** POST /api/dashboard/cache/invalidate — admin only */
export const invalidateCache = async (req, res) => {
  try {
    invalidateDashboardCache();
    return success(res, null, 'Dashboard cache invalidated.');
  } catch (err) { return handleErr(err, res); }
};

export default {
  getFullDashboard, getSummary, getRisk, getActivity,
  getTrend, getAlerts, getTopCustomers, invalidateCache,
};
