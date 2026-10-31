/**
 * securityOtpService.js — Business logic for the Security OTP & Step-Up Verification Module.
 *
 * Provides cryptographic OTP generation, email dispatch, verification token minting,
 * and security event audit tracking.
 */

import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { insertAuditLog } from '../db/queries/authQueries.js';
import {
  ensureSecurityOtpTable,
  saveSecurityOtp,
  findValidSecurityOtp,
  markSecurityOtpVerified,
  listRecentSecurityOtps,
} from '../db/queries/securityOtpQueries.js';
import { sendSecurityOtpEmail } from './emailService.js';

const mkErr = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });

export const SECURITY_PURPOSES = {
  account_closure: {
    title: 'Account Closure & Balance Settlement',
    desc: 'You requested to close your account and settle all balances. Please verify to proceed.',
  },
  card_removal: {
    title: 'Permanent Card Removal',
    desc: 'You requested to permanently cancel and delete a card from your wallet.',
  },
  password_change: {
    title: 'Security Password Change',
    desc: 'A request was made to update your authentication password.',
  },
  security_verification: {
    title: 'Identity & Security Verification',
    desc: 'Verify your multi-factor identity and security profile status.',
  },
  high_value_transaction: {
    title: 'High-Value Transfer Authorization',
    desc: 'A critical financial transfer requires elevated two-step authorization.',
  },
};

/** Initialize DB table at startup */
export const initSecurityOtpTables = async () => {
  await ensureSecurityOtpTable();
  logger.info('Security OTP runtime tables verified.');
};

/**
 * 1. Request / Generate a Security OTP
 */
export const generateSecurityOtpService = async ({
  userId,
  email,
  name = 'Valued User',
  purpose = 'security_verification',
}, meta = {}) => {
  const config = SECURITY_PURPOSES[purpose] ?? {
    title: 'Security Action Verification',
    desc: 'A sensitive action requires your authorization.',
  };

  // Generate 6-digit cryptographic OTP
  const otpCode = String(crypto.randomInt(100000, 1000000));

  const saved = await saveSecurityOtp({
    userId,
    email,
    otpCode,
    purpose,
    ttlMinutes: 5,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  // Dispatch email notification
  await sendSecurityOtpEmail({
    email,
    otp: otpCode,
    name,
    purpose,
    purposeTitle: config.title,
    purposeDesc: config.desc,
  });

  await insertAuditLog({
    userId,
    action: 'SECURITY_OTP_REQUESTED',
    entityType: 'security_otp',
    entityId: String(saved.id),
    newValue: { email, purpose, purposeTitle: config.title },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    status: 'success',
  });

  logger.info(`[SecurityOTP] Code dispatched for user=${email} purpose=${purpose}`);

  return {
    email,
    purpose,
    purposeTitle: config.title,
    expiresInSeconds: 300,
    devOtp: process.env.NODE_ENV !== 'production' ? otpCode : undefined,
  };
};

/**
 * 2. Verify a Security OTP
 */
export const verifySecurityOtpService = async ({
  userId,
  email,
  otp,
  purpose = 'security_verification',
}, meta = {}) => {
  const cleanOtp = String(otp || '').trim();
  if (!cleanOtp || cleanOtp.length !== 6) {
    throw mkErr('INVALID_OTP', 400);
  }

  const validOtp = await findValidSecurityOtp({
    userId,
    otpCode: cleanOtp,
    purpose,
  });

  if (!validOtp) {
    await insertAuditLog({
      userId,
      action: 'SECURITY_OTP_FAILED',
      entityType: 'security_otp',
      entityId: userId,
      newValue: { email, purpose, failureReason: 'INVALID_OR_EXPIRED_CODE' },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      status: 'failure',
    });
    throw mkErr('INVALID_OTP', 401);
  }

  // Issue single-use 32-byte cryptographic verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');

  const updated = await markSecurityOtpVerified({
    id: validOtp.id,
    verificationToken,
  });

  await insertAuditLog({
    userId,
    action: 'SECURITY_OTP_VERIFIED',
    entityType: 'security_otp',
    entityId: String(updated.id),
    newValue: { email, purpose, verifiedAt: updated.verified_at },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    status: 'success',
  });

  logger.info(`[SecurityOTP] Verified successfully for user=${email} purpose=${purpose}`);

  return {
    verified: true,
    verificationToken,
    purpose,
    verifiedAt: updated.verified_at,
  };
};

/**
 * 3. Retrieve User's Security Verification Status & History
 */
export const getSecurityStatusService = async ({ userId, email }) => {
  const recentOtps = await listRecentSecurityOtps(userId, 5);

  const lastVerified = recentOtps.find(r => r.verified_at);

  return {
    mfaEnabled: true,
    registeredEmail: email,
    verificationMethods: [
      { type: 'email_otp', label: 'Email Cryptographic OTP', active: true, primary: true },
      { type: 'device_binding', label: 'Device & IP Fingerprint Verification', active: true },
    ],
    lastVerifiedAt: lastVerified?.verified_at ?? null,
    recentVerifications: recentOtps.map(r => ({
      id: r.id,
      purpose: r.purpose,
      purposeTitle: SECURITY_PURPOSES[r.purpose]?.title ?? r.purpose,
      status: r.status,
      createdAt: r.created_at,
      verifiedAt: r.verified_at,
    })),
  };
};
