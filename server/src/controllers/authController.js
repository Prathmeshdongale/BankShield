/**
 * authController.js — HTTP handlers for the auth module.
 *
 * Each handler:
 *   1. Reads validated req.body / req.user (validation done in middleware)
 *   2. Delegates all business logic to authService
 *   3. Maps coded service errors to appropriate HTTP status codes
 *   4. Returns a consistent { success, message, data } envelope via response utils
 *
 * Error code → HTTP status map:
 *   EMAIL_TAKEN              409  Conflict
 *   INVALID_ROLE             400  Bad Request
 *   INVALID_CREDENTIALS      401  Unauthorized
 *   ACCOUNT_INACTIVE         403  Forbidden
 *   ACCOUNT_LOCKED           423  Locked
 *   INVALID_REFRESH_TOKEN    401  Unauthorized
 *   REFRESH_TOKEN_REVOKED    401  Unauthorized
 *   INVALID_OR_EXPIRED_TOKEN 400  Bad Request
 *   WRONG_CURRENT_PASSWORD   400  Bad Request
 *   USER_NOT_FOUND           404  Not Found
 */

import {
  registerUser,
  loginUser,
  logoutUser,
  refreshTokens,
  forgotPassword,
  resetPassword,
  changePassword,
  updateProfile,
  getProfile,
  sendSuperAdminOtp,
  verifySuperAdminOtp,
  registerCustomer,
} from '../services/authService.js';
import { success, failure } from '../utils/response.js';
import { logger }           from '../utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Extract request metadata (IP + UA) for audit/history logging. */
const getMeta = (req) => ({
  ipAddress: req.ip ?? req.socket?.remoteAddress ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});

/**
 * Map coded service errors to HTTP status codes.
 * Falls back to 500 for unexpected errors.
 */
const STATUS_MAP = {
  EMAIL_TAKEN              : 409,
  PHONE_TAKEN              : 409,
  INVALID_ROLE             : 400,
  INVALID_CREDENTIALS      : 401,
  ACCOUNT_INACTIVE         : 403,
  ACCOUNT_LOCKED           : 423,
  INVALID_REFRESH_TOKEN    : 401,
  REFRESH_TOKEN_REVOKED    : 401,
  INVALID_OR_EXPIRED_TOKEN : 400,
  WRONG_CURRENT_PASSWORD   : 400,
  USER_NOT_FOUND           : 404,
  SUPERADMIN_OTP_REQUIRED  : 403,
  SUPERADMIN_ONLY          : 403,
  INVALID_OTP              : 401,
};

/** User-facing messages (no internal error codes leaked). */
const USER_MESSAGES = {
  EMAIL_TAKEN              : 'An account with this email already exists.',
  PHONE_TAKEN              : 'An account with this phone number already exists.',
  INVALID_ROLE             : 'The specified role is invalid or inactive.',
  INVALID_CREDENTIALS      : 'Invalid email or password.',
  ACCOUNT_INACTIVE         : 'Your account is inactive. Contact support.',
  ACCOUNT_LOCKED           : 'Account temporarily locked due to too many failed attempts.',
  INVALID_REFRESH_TOKEN    : 'Invalid or expired refresh token.',
  REFRESH_TOKEN_REVOKED    : 'Session has been revoked. Please log in again.',
  INVALID_OR_EXPIRED_TOKEN : 'Password reset link is invalid or has expired.',
  WRONG_CURRENT_PASSWORD   : 'Current password is incorrect.',
  USER_NOT_FOUND           : 'User account not found.',
  SUPERADMIN_OTP_REQUIRED  : 'Super Admin must sign in using OTP sent to email. Please switch to Super Admin OTP Login.',
  SUPERADMIN_ONLY          : 'This login method is exclusively reserved for the Super Administrator.',
  INVALID_OTP              : 'Invalid or expired OTP. Please check your email or request a new code.',
};

const handleServiceError = (err, res) => {
  const code   = err.message;
  const status = err.statusCode ?? STATUS_MAP[code] ?? 500;
  const msg    = USER_MESSAGES[code] ?? 'An unexpected error occurred.';

  if (status >= 500) {
    logger.error(`[AuthController] Unexpected error: ${err.stack ?? err.message}`);
  }

  const extra = {};
  if (code === 'ACCOUNT_LOCKED' && err.lockedUntil) {
    extra.lockedUntil = err.lockedUntil;
  }

  return failure(res, msg, status, Object.keys(extra).length ? extra : null);
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. REGISTER  — POST /api/auth/register
//    Protected: authenticate + requireRoles('super_admin', 'admin')
// ─────────────────────────────────────────────────────────────────────────────

export const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, roleName } = req.body;
    const user = await registerUser(
      { email, password, firstName, lastName, phone, roleName },
      getMeta(req),
      req.user?.id   // actor = the admin performing registration
    );
    return success(res, { user }, 'User registered successfully.', 201);
  } catch (err) {
    return handleServiceError(err, res);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. LOGIN  — POST /api/auth/login
//    Public (protected by authLimiter rate limit)
// ─────────────────────────────────────────────────────────────────────────────

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await loginUser({ email, password }, getMeta(req));

    return success(res, result, 'Login successful.');
  } catch (err) {
    return handleServiceError(err, res);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. LOGOUT  — POST /api/auth/logout
//    Protected: authenticate
// ─────────────────────────────────────────────────────────────────────────────

export const logout = async (req, res) => {
  try {
    const { refreshToken, logoutAll = false } = req.body;
    await logoutUser(
      { userId: req.user.id, refreshToken, logoutAll },
      getMeta(req)
    );
    return success(res, null, logoutAll ? 'Logged out from all sessions.' : 'Logged out successfully.');
  } catch (err) {
    return handleServiceError(err, res);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. REFRESH TOKEN  — POST /api/auth/refresh
//    Public (caller supplies the refresh token in the body)
// ─────────────────────────────────────────────────────────────────────────────

export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const result = await refreshTokens(refreshToken, getMeta(req));
    return success(res, result, 'Tokens refreshed successfully.');
  } catch (err) {
    return handleServiceError(err, res);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. FORGOT PASSWORD  — POST /api/auth/forgot-password
//    Public
// ─────────────────────────────────────────────────────────────────────────────

export const forgotPasswordHandler = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await forgotPassword(email, getMeta(req));

    // TODO: pass result.token to an email service (nodemailer / SendGrid).
    // For now we return the token in dev so you can test the reset flow
    // without an SMTP server.  Strip this from production.
    const data = process.env.NODE_ENV === 'production'
      ? { email: result.email }
      : { email: result.email, resetToken: result.token, expiresAt: result.expiresAt };

    return success(
      res,
      data,
      'If an account with that email exists, a password reset link has been sent.'
    );
  } catch (err) {
    return handleServiceError(err, res);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. RESET PASSWORD  — POST /api/auth/reset-password
//    Public (token from email link / dev response)
// ─────────────────────────────────────────────────────────────────────────────

export const resetPasswordHandler = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    await resetPassword({ token, newPassword }, getMeta(req));
    return success(res, null, 'Password has been reset. Please log in with your new password.');
  } catch (err) {
    return handleServiceError(err, res);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. CHANGE PASSWORD  — POST /api/auth/change-password
//    Protected: authenticate
// ─────────────────────────────────────────────────────────────────────────────

export const changePasswordHandler = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await changePassword(
      { userId: req.user.id, currentPassword, newPassword },
      getMeta(req)
    );
    return success(res, null, 'Password changed successfully. Please log in again.');
  } catch (err) {
    return handleServiceError(err, res);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. GET PROFILE  — GET /api/auth/me
//    Protected: authenticate
// ─────────────────────────────────────────────────────────────────────────────

export const getProfileHandler = async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);
    return success(res, profile, 'Profile retrieved successfully.');
  } catch (err) {
    return handleServiceError(err, res);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. UPDATE PROFILE  — PATCH /api/auth/me
//    Protected: authenticate
// ─────────────────────────────────────────────────────────────────────────────

export const updateProfileHandler = async (req, res) => {
  try {
    const { firstName, lastName, phone, avatarUrl } = req.body;
    const updated = await updateProfile(
      req.user.id,
      { firstName, lastName, phone, avatarUrl },
      getMeta(req)
    );
    return success(res, updated, 'Profile updated successfully.');
  } catch (err) {
    return handleServiceError(err, res);
  }
};

export default {
  register,
  login,
  logout,
  refresh,
  forgotPasswordHandler,
  resetPasswordHandler,
  changePasswordHandler,
  getProfileHandler,
  updateProfileHandler,
};


// ─────────────────────────────────────────────────────────────────────────────
// SUPER ADMIN OTP LOGIN HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export const sendSuperAdminOtpHandler = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await sendSuperAdminOtp(email);
    return success(res, result, result.message);
  } catch (err) {
    return handleServiceError(err, res);
  }
};

export const verifySuperAdminOtpHandler = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const result = await verifySuperAdminOtp({ email, otp }, getMeta(req));
    return success(res, result, 'Super admin authentication successful.');
  } catch (err) {
    return handleServiceError(err, res);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER SELF-REGISTRATION HANDLER
// ─────────────────────────────────────────────────────────────────────────────

export const registerCustomerHandler = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;
    const result = await registerCustomer(
      { email, password, firstName, lastName, phone },
      getMeta(req)
    );
    return success(res, result, 'Customer account created successfully.', 201);
  } catch (err) {
    return handleServiceError(err, res);
  }
};
