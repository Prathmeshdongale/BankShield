/**
 * dashboardRoutes.js
 *
 * All dashboard endpoints require authentication.
 * RBAC is enforced inside the service layer (role-scoped data).
 * The route guard only blocks unauthenticated requests.
 *
 *   GET  /api/dashboard               — full dashboard (all sections, one call)
 *   GET  /api/dashboard/summary       — totals, volumes, fraud rate, alert counts
 *   GET  /api/dashboard/risk          — score buckets, percentiles, channel breakdown
 *   GET  /api/dashboard/activity      — last 15 transactions + active HIGH/CRITICAL alerts
 *   GET  /api/dashboard/trend         — 30-day daily series (sparkline data)
 *   GET  /api/dashboard/alerts        — active alerts ordered by severity
 *   GET  /api/dashboard/top-customers — customers with highest risk scores
 *   POST /api/dashboard/cache/invalidate — admin only, flush in-process cache
 *
 * Role data scoping (enforced in dashboardService.resolveScope):
 *   super_admin / admin / compliance_officer / fraud_analyst → platform-wide
 *   branch_manager / teller → their branch only (users.branch_id)
 *   customer → their own accounts only
 */

import { Router }      from 'express';
import { authenticate, requireRoles } from '../middleware/authenticate.js';
import {
  getFullDashboard,
  getSummary,
  getRisk,
  getActivity,
  getTrend,
  getAlerts,
  getTopCustomers,
  invalidateCache,
} from '../controllers/dashboardController.js';

const router = Router();
router.use(authenticate);

router.get('/',                getFullDashboard);
router.get('/summary',         getSummary);
router.get('/risk',            getRisk);
router.get('/activity',        getActivity);
router.get('/trend',           getTrend);
router.get('/alerts',          getAlerts);
router.get('/top-customers',   getTopCustomers);

// Cache invalidation — super_admin and admin only
router.post('/cache/invalidate',
  requireRoles('super_admin', 'admin'),
  invalidateCache
);

export default router;
