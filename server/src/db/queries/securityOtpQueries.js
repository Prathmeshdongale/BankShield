/**
 * securityOtpQueries.js — Raw SQL queries for the Security OTP & Step-Up Verification Module.
 *
 * Stores and manages short-lived cryptographic one-time passwords for
 * critical security events (account closure, card deletion, sensitive changes).
 */

import { query as poolQuery } from '../connection.js';

const run = (client, text, params) =>
  client ? client.query(text, params) : poolQuery(text, params);

/**
 * Ensure security_otps table exists with indexes.
 */
export const ensureSecurityOtpTable = async (client = null) => {
  await run(client, `
    CREATE TABLE IF NOT EXISTS security_otps (
      id                 BIGSERIAL    PRIMARY KEY,
      user_id            UUID         REFERENCES users(id) ON DELETE CASCADE,
      email              VARCHAR(255) NOT NULL,
      otp_code           VARCHAR(10)  NOT NULL,
      purpose            VARCHAR(60)  NOT NULL DEFAULT 'security_verification',
      verification_token VARCHAR(255),
      expires_at         TIMESTAMPTZ  NOT NULL,
      verified_at        TIMESTAMPTZ,
      used               BOOLEAN      NOT NULL DEFAULT FALSE,
      ip_address         INET,
      user_agent         TEXT,
      created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_security_otps_user ON security_otps(user_id, purpose, used);
    CREATE INDEX IF NOT EXISTS idx_security_otps_email ON security_otps(email, purpose, used);
  `, []);
};

/**
 * Invalidate prior unused OTPs for the same user and purpose, then insert a fresh one.
 */
export const saveSecurityOtp = async ({
  userId,
  email,
  otpCode,
  purpose = 'security_verification',
  ttlMinutes = 5,
  ipAddress = null,
  userAgent = null,
}, client = null) => {
  // Invalidate previous active OTPs for this user & purpose
  await run(client, `
    UPDATE security_otps
    SET    used = TRUE
    WHERE  user_id = $1 AND purpose = $2 AND used = FALSE;
  `, [userId, purpose]);

  // Insert fresh OTP
  const { rows } = await run(client, `
    INSERT INTO security_otps (user_id, email, otp_code, purpose, expires_at, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, NOW() + ($5 || ' minutes')::INTERVAL, $6, $7)
    RETURNING id, user_id, email, otp_code, purpose, expires_at, created_at;
  `, [userId, email, otpCode, purpose, ttlMinutes, ipAddress, userAgent]);

  return rows[0];
};

/**
 * Find an unexpired, unused OTP code for a user and purpose.
 */
export const findValidSecurityOtp = async ({
  userId,
  otpCode,
  purpose = 'security_verification',
}, client = null) => {
  const { rows } = await run(client, `
    SELECT id, user_id, email, otp_code, purpose, expires_at, created_at
    FROM   security_otps
    WHERE  user_id    = $1
      AND  otp_code   = $2
      AND  purpose    = $3
      AND  used       = FALSE
      AND  expires_at > NOW()
    ORDER  BY created_at DESC
    LIMIT  1;
  `, [userId, otpCode, purpose]);

  return rows[0] ?? null;
};

/**
 * Mark security OTP as verified and store the cryptographic verification token.
 */
export const markSecurityOtpVerified = async ({
  id,
  verificationToken,
}, client = null) => {
  const { rows } = await run(client, `
    UPDATE security_otps
    SET    used = TRUE,
           verified_at = NOW(),
           verification_token = $2
    WHERE  id = $1
    RETURNING id, user_id, email, purpose, verification_token, verified_at;
  `, [id, verificationToken]);

  return rows[0] ?? null;
};

/**
 * List recent security verification attempts for this user.
 */
export const listRecentSecurityOtps = async (userId, limit = 5, client = null) => {
  const { rows } = await run(client, `
    SELECT id, purpose, verified_at, used, expires_at, created_at,
           (CASE WHEN verified_at IS NOT NULL THEN 'verified'
                 WHEN expires_at < NOW() THEN 'expired'
                 ELSE 'pending' END) as status
    FROM   security_otps
    WHERE  user_id = $1
    ORDER  BY created_at DESC
    LIMIT  $2;
  `, [userId, limit]);

  return rows;
};

/**
 * Validate whether a verification token was generated within the last 10 minutes.
 */
export const findValidSecurityToken = async ({
  userId,
  verificationToken,
  purpose,
}, client = null) => {
  const { rows } = await run(client, `
    SELECT id, user_id, email, purpose, verified_at
    FROM   security_otps
    WHERE  user_id            = $1
      AND  verification_token = $2
      AND  purpose            = $3
      AND  verified_at        IS NOT NULL
      AND  verified_at        > NOW() - INTERVAL '10 minutes'
    ORDER  BY verified_at DESC
    LIMIT  1;
  `, [userId, verificationToken, purpose]);

  return rows[0] ?? null;
};
