/**
 * authRoutes.js
 *
 * Route → Middleware → Validator → Controller mapping:
 *
 *  POST   /api/auth/register          authLimiter → authenticate → requireRoles(super_admin,admin) → registerValidator → validate → register
 *  POST   /api/auth/login             authLimiter → loginValidator → validate → login
 *  POST   /api/auth/logout            authenticate → logoutValidator → validate → logout
 *  POST   /api/auth/refresh           refreshLimiter → refreshTokenValidator → validate → refresh
 *  POST   /api/auth/forgot-password   forgotLimiter → forgotPasswordValidator → validate → forgotPasswordHandler
 *  POST   /api/auth/reset-password    resetLimiter → resetPasswordValidator → validate → resetPasswordHandler
 *  POST   /api/auth/change-password   authenticate → changePasswordValidator → validate → changePasswordHandler
 *  GET    /api/auth/me                authenticate → getProfileHandler
 *  PATCH  /api/auth/me                authenticate → updateProfileValidator → validate → updateProfileHandler
 */

import { Router }       from 'express';
import rateLimit        from 'express-rate-limit';
import { authLimiter }  from '../middleware/rateLimiter.js';
import { authenticate, requireRoles } from '../middleware/authenticate.js';
import { restrictBankingFromSuperAdmin } from '../middleware/bankingRestriction.js';
import {
  validate,
  registerValidator,
  loginValidator,
  logoutValidator,
  refreshTokenValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  changePasswordValidator,
  updateProfileValidator,
} from '../validators/authValidators.js';
import {
  register,
  login,
  logout,
  refresh,
  forgotPasswordHandler,
  resetPasswordHandler,
  changePasswordHandler,
  getProfileHandler,
  updateProfileHandler,
} from '../controllers/authController.js';

const router = Router();

// ── Dedicated limiters for sensitive flows ────────────────────────────────────

/** Refresh: 30 attempts / 15 min (more lenient than login — tokens expire anyway) */
const refreshLimiter = rateLimit({
  windowMs     : 15 * 60 * 1000,
  max          : 30,
  standardHeaders: true,
  legacyHeaders : false,
  message      : { success: false, error: 'Too many token refresh attempts.' },
});

/** Forgot-password: 5 attempts / 15 min (prevents reset-link flooding) */
const forgotLimiter = rateLimit({
  windowMs     : 15 * 60 * 1000,
  max          : process.env.NODE_ENV === 'production' ? 5 : 30,
  standardHeaders: true,
  legacyHeaders : false,
  message      : { success: false, error: 'Too many password reset requests.' },
});

/** Reset-password: 10 attempts / 15 min */
const resetLimiter = rateLimit({
  windowMs     : 15 * 60 * 1000,
  max          : process.env.NODE_ENV === 'production' ? 10 : 50,
  standardHeaders: true,
  legacyHeaders : false,
  message      : { success: false, error: 'Too many password reset attempts.' },
});

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Admin-only — create a new user of any role.
 * Allowed roles: super_admin, branch_manager, fraud_analyst, customer
 */
router.post(
  '/register',
  authLimiter,
  authenticate,
  requireRoles('super_admin'),
  ...registerValidator,
  validate,
  register
);

/**
 * POST /api/auth/login
 * Public — authenticate and receive JWT pair.
 */
router.post(
  '/login',
  authLimiter,
  ...loginValidator,
  validate,
  login
);

/**
 * POST /api/auth/logout
 * Authenticated — revoke current or all sessions.
 * Body: { refreshToken?: string, logoutAll?: boolean }
 */
router.post(
  '/logout',
  authenticate,
  ...logoutValidator,
  validate,
  logout
);

/**
 * POST /api/auth/refresh
 * Public (uses refresh token) — rotate refresh token and get new access token.
 * Body: { refreshToken: string }
 */
router.post(
  '/refresh',
  refreshLimiter,
  ...refreshTokenValidator,
  validate,
  refresh
);

/**
 * POST /api/auth/forgot-password
 * Public — request a password reset email.
 * Body: { email: string }
 */
router.post(
  '/forgot-password',
  forgotLimiter,
  ...forgotPasswordValidator,
  validate,
  forgotPasswordHandler
);

/**
 * POST /api/auth/reset-password
 * Public — consume a reset token and set a new password.
 * Body: { token: string, newPassword: string, confirmPassword: string }
 */
router.post(
  '/reset-password',
  resetLimiter,
  ...resetPasswordValidator,
  validate,
  resetPasswordHandler
);

/**
 * POST /api/auth/change-password
 * Authenticated — change password while logged in.
 * Body: { currentPassword, newPassword, confirmPassword }
 */
router.post(
  '/change-password',
  authenticate,
  ...changePasswordValidator,
  validate,
  changePasswordHandler
);

/**
 * GET /api/auth/me
 * Authenticated — fetch own profile + permission list.
 */
router.get(
  '/me',
  authenticate,
  getProfileHandler
);

/**
 * PATCH /api/auth/me
 * Authenticated — update firstName, lastName, phone, avatarUrl.
 */
router.patch(
  '/me',
  authenticate,
  ...updateProfileValidator,
  validate,
  updateProfileHandler
);

export default router;
