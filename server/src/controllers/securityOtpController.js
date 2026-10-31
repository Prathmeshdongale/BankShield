/**
 * securityOtpController.js — HTTP handlers for Security OTP & Step-Up Verification.
 */

import {
  generateSecurityOtpService,
  verifySecurityOtpService,
  getSecurityStatusService,
} from '../services/securityOtpService.js';
import { success, failure } from '../utils/response.js';
import { logger } from '../utils/logger.js';

const getMeta = (req) => ({
  actorId: req.user?.id ?? null,
  ipAddress: req.ip ?? req.socket?.remoteAddress ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});

/**
 * POST /api/security/otp/request
 * Generates and dispatches a single-use OTP for sensitive operations.
 */
export const requestOtp = async (req, res) => {
  try {
    const { purpose = 'security_verification' } = req.body;
    const result = await generateSecurityOtpService({
      userId: req.user.id,
      email: req.user.email,
      name: req.user.name || 'Valued User',
      purpose,
    }, getMeta(req));

    return success(res, result, 'Verification code dispatched to your registered email.');
  } catch (err) {
    logger.error(`[SecurityOtpController] requestOtp error: ${err.message}`);
    return failure(res, err.message || 'Failed to dispatch security code.', err.statusCode || 500);
  }
};

/**
 * POST /api/security/otp/verify
 * Validates a 6-digit OTP code and issues a verification token.
 */
export const verifyOtp = async (req, res) => {
  try {
    const { otp, purpose = 'security_verification' } = req.body;
    if (!otp) {
      return failure(res, 'Please provide the 6-digit OTP verification code.', 400);
    }

    const result = await verifySecurityOtpService({
      userId: req.user.id,
      email: req.user.email,
      otp,
      purpose,
    }, getMeta(req));

    return success(res, result, 'Security authorization confirmed.');
  } catch (err) {
    if (err.message === 'INVALID_OTP') {
      return failure(res, 'Invalid or expired OTP code. Please check your email or request a new code.', 401);
    }
    logger.error(`[SecurityOtpController] verifyOtp error: ${err.message}`);
    return failure(res, err.message || 'Verification failed.', err.statusCode || 500);
  }
};

/**
 * GET /api/security/otp/status
 * Fetches user's 2FA verification status and recent security history.
 */
export const getStatus = async (req, res) => {
  try {
    const result = await getSecurityStatusService({
      userId: req.user.id,
      email: req.user.email,
    });

    return success(res, result, 'Security verification status retrieved.');
  } catch (err) {
    logger.error(`[SecurityOtpController] getStatus error: ${err.message}`);
    return failure(res, err.message || 'Failed to retrieve security status.', err.statusCode || 500);
  }
};

export default {
  requestOtp,
  verifyOtp,
  getStatus,
};
