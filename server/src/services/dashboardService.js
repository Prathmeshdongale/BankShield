/**
 * dashboardService.js — Dashboard orchestration with role-scoped data + caching.
 *
 * ROLE SCOPING RULES
 * ──────────────────
 * super_admin / admin / compliance_officer / fraud_analyst
 *     → platform-wide data (no branch filter, no customer filter)
 *
 * branch_manager
 *     → scoped to accounts.branch_id matching their users.branch_id
 *     → if users.branch_id IS NULL they see platform-wide (safety valve)
 *
 * teller
 *     → same as branch_manager (branch-scoped)
 *
 * customer
 *     → scoped to their own customer record (customers.user_id = req.user.id)
 *     → only sees: summary counters (own accounts), recent activity, 30d trend
 *     → does NOT see: alert details, risk distribution (no fraud:read_alerts)
 *
 * IN-PROCESS CACHE
 * ────────────────
 * Dashboard data is expensive to compute and doesn't need to be real-time.
 * A simple Map<cacheKey, { data, expiresAt }> keeps the most recent result
 * for each (role-scope, endpoint) pair.
 *
 * TTL by role:
 *   super_admin / admin   → 60 seconds
 *   branch_manager/teller → 30 seconds  (smaller dataset, more granular)
 *   customer              → 15 seconds  (personal data, low staleness tolerance)
 *
 * Cache is invalidated on server restart. For multi-instance deployments,
 * replace with Redis using the same key scheme.
 */

import { logger }    from '../utils/logger.js';
import { query }     from '../db/connection.js';
import {
  getSummaryCounters,
  getRiskDistribution,
  getRecentActivity,
  getTrend30d,
  getActiveAlerts,
  getTopCustomersByRisk,
} from '../db/queries/dashboardQueries.js';

// ─────────────────────────────────────────────────────────────────────────────
// IN-PROCESS CACHE
// ─────────────────────────────────────────────────────────────────────────────

const _cache = new Map();

const TTL_MS = {
  super_admin        : 60_000,
  admin              : 60_000,
  compliance_officer : 60_000,
  fraud_analyst      : 60_000,
  branch_manager     : 30_000,
  teller             : 30_000,
  customer           : 15_000,
};

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data, role) {
  const ttl = TTL_MS[role] ?? 60_000;
  _cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// ─────────────────────────────────────────────────────────────────────────────
// SCOPE RESOLVER — maps req.user → { branchId, customerId }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the data scope for a request.
 * Returns { branchId, customerId, scopeLabel }.
 *
 * For branch_manager / teller we need to look up users.branch_id from DB
 * because `req.user` (from JWT) doesn't carry branch_id.
 */
export const resolveScope = async (user) => {
  const role = user.role;

  // Platform-wide roles
  const GLOBAL_ROLES = new Set(['super_admin','admin','compliance_officer','fraud_analyst']);
  if (GLOBAL_ROLES.has(role)) {
    return { branchId: null, customerId: null, scopeLabel: 'platform' };
  }

  // Customer — scope to their own customer record
  if (role === 'customer') {
    const { rows } = await query(
      `SELECT id FROM customers WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1;`,
      [user.id]
    );
    const customerId = rows[0]?.id ?? null;
    return { branchId: null, customerId, scopeLabel: `customer:${customerId?.slice(0,8) ?? 'unknown'}` };
  }

  // Branch-scoped roles — fetch branch_id from users table
  if (role === 'branch_manager' || role === 'teller') {
    const { rows } = await query(
      `SELECT branch_id FROM users WHERE id = $1 LIMIT 1;`,
      [user.id]
    );
    const branchId = rows[0]?.branch_id ?? null;
    return {
      branchId,
      customerId : null,
      scopeLabel : branchId ? `branch:${branchId.slice(0,8)}` : 'platform',
    };
  }

  return { branchId: null, customerId: null, scopeLabel: 'platform' };
};

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE FUNCTIONS — one per dashboard endpoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/dashboard/summary
 * Total transactions, volumes, fraud rate, alert counts, account counts.
 */
export const getSummaryService = async (user) => {
  const t0 = Date.now();
  const { branchId, customerId, scopeLabel } = await resolveScope(user);
  const cacheKey = `summary:${scopeLabel}`;
  const cached   = cacheGet(cacheKey);
  if (cached) {
    logger.debug(`[dashboard] cache HIT summary (${scopeLabel})`);
    return { ...cached, _cached: true };
  }

  const data = await getSummaryCounters(branchId, customerId);
  cacheSet(cacheKey, data, user.role);

  const ms = Date.now() - t0;
  logger.info(`[dashboard] summary (${scopeLabel}) — ${ms}ms`);
  return { ...data, _cached: false, _latency_ms: ms };
};

/**
 * GET /api/dashboard/risk
 * Score bucket distribution, percentiles, channel breakdown, alert severities.
 * Not available to customer role.
 */
export const getRiskService = async (user) => {
  if (user.role === 'customer') {
    const e = new Error('CUSTOMER_ROLE_NOT_ALLOWED'); e.statusCode = 403; throw e;
  }
  const t0 = Date.now();
  const { branchId, customerId, scopeLabel } = await resolveScope(user);
  const cacheKey = `risk:${scopeLabel}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return { ...cached, _cached: true };

  const data = await getRiskDistribution(branchId, customerId);
  cacheSet(cacheKey, data, user.role);

  const ms = Date.now() - t0;
  logger.info(`[dashboard] risk (${scopeLabel}) — ${ms}ms`);
  return { ...data, _cached: false, _latency_ms: ms };
};

/**
 * GET /api/dashboard/activity
 * Last 15 transactions + active HIGH/CRITICAL alerts.
 */
export const getActivityService = async (user) => {
  const t0 = Date.now();
  const { branchId, customerId, scopeLabel } = await resolveScope(user);
  const cacheKey = `activity:${scopeLabel}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return { ...cached, _cached: true };

  // Customers only see their own transactions, no alert detail
  const data = await getRecentActivity(branchId, customerId, 15);
  if (user.role === 'customer') data.alerts = [];

  cacheSet(cacheKey, data, user.role);

  const ms = Date.now() - t0;
  logger.info(`[dashboard] activity (${scopeLabel}) — ${ms}ms`);
  return { ...data, _cached: false, _latency_ms: ms };
};

/**
 * GET /api/dashboard/trend
 * 30-day daily sparkline: transactions, volume, fraud rate, alert count.
 */
export const getTrendService = async (user) => {
  const t0 = Date.now();
  const { branchId, customerId, scopeLabel } = await resolveScope(user);
  const cacheKey = `trend:${scopeLabel}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return { ...cached, _cached: true };

  const data = await getTrend30d(branchId, customerId);
  cacheSet(cacheKey, data, user.role);

  const ms = Date.now() - t0;
  logger.info(`[dashboard] trend (${scopeLabel}) — ${ms}ms`);
  return { ...data, _cached: false, _latency_ms: ms };
};

/**
 * GET /api/dashboard/alerts
 * Active alerts ordered by severity. Not available to customer role.
 */
export const getAlertsService = async (user) => {
  if (user.role === 'customer') {
    const e = new Error('CUSTOMER_ROLE_NOT_ALLOWED'); e.statusCode = 403; throw e;
  }
  const t0 = Date.now();
  const { branchId, scopeLabel } = await resolveScope(user);
  const cacheKey = `alerts:${scopeLabel}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return { alerts: cached, _cached: true };

  const alerts = await getActiveAlerts(branchId, 20);
  cacheSet(cacheKey, alerts, user.role);

  const ms = Date.now() - t0;
  logger.info(`[dashboard] alerts (${scopeLabel}) — ${ms}ms`);
  return { alerts, _cached: false, _latency_ms: ms };
};

/**
 * GET /api/dashboard/top-customers
 * Customers with highest risk scores / most alerts. Staff roles only.
 */
export const getTopCustomersService = async (user) => {
  const ALLOWED = new Set(['super_admin','admin','compliance_officer',
                           'fraud_analyst','branch_manager']);
  if (!ALLOWED.has(user.role)) {
    const e = new Error('CUSTOMER_ROLE_NOT_ALLOWED'); e.statusCode = 403; throw e;
  }
  const t0 = Date.now();
  const { branchId, scopeLabel } = await resolveScope(user);
  const cacheKey = `top_customers:${scopeLabel}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return { customers: cached, _cached: true };

  const customers = await getTopCustomersByRisk(branchId, 10);
  cacheSet(cacheKey, customers, user.role);

  const ms = Date.now() - t0;
  logger.info(`[dashboard] top-customers (${scopeLabel}) — ${ms}ms`);
  return { customers, _cached: false, _latency_ms: ms };
};

/**
 * GET /api/dashboard  — full dashboard in one round-trip.
 * Fires all applicable queries in parallel; non-applicable sections return null.
 * Target: < 3 s wall time (Neon free-tier latency is the main bottleneck).
 */
export const getFullDashboardService = async (user) => {
  const t0    = Date.now();
  const scope = await resolveScope(user);
  const isCustomer = user.role === 'customer';

  // Run all parallel fetches; use settledPromises so one failure doesn't kill all
  const [summary, risk, activity, trend, alertsResult, topCustomers] =
    await Promise.allSettled([
      getSummaryCounters(scope.branchId, scope.customerId),
      isCustomer ? Promise.resolve(null) : getRiskDistribution(scope.branchId, scope.customerId),
      getRecentActivity(scope.branchId, scope.customerId, 10),
      getTrend30d(scope.branchId, scope.customerId),
      isCustomer ? Promise.resolve(null) : getActiveAlerts(scope.branchId, 10),
      isCustomer ? Promise.resolve(null) : getTopCustomersByRisk(scope.branchId, 5),
    ]);

  const resolve = (r) => r.status === 'fulfilled' ? r.value : null;

  const actData = resolve(activity);
  if (actData && isCustomer) actData.alerts = [];

  const ms = Date.now() - t0;
  logger.info(`[dashboard] full (${scope.scopeLabel}) — ${ms}ms`);

  return {
    summary      : resolve(summary),
    risk         : resolve(risk),
    activity     : actData,
    trend        : resolve(trend),
    active_alerts: resolve(alertsResult),
    top_customers: resolve(topCustomers),
    _scope       : scope.scopeLabel,
    _latency_ms  : ms,
  };
};

/** Invalidate all cache entries (e.g. after a bulk data change). */
export const invalidateDashboardCache = () => {
  _cache.clear();
  logger.info('[dashboard] cache invalidated');
};
