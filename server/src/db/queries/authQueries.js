/**
 * authQueries.js — All raw SQL queries for the auth module.
 *
 * Every function accepts a `client` (PoolClient) or falls back to the pool's
 * `query()` helper so callers can opt into a DB transaction when needed.
 *
 * Column reference — users table (full schema):
 *   id, email, phone, password_hash, first_name, last_name,
 *   role_id → roles(id), branch_id, is_active, is_verified,
 *   last_login_at, password_changed_at, failed_login_attempts,
 *   locked_until, avatar_url, deleted_at, created_at, updated_at
 */

import { query as poolQuery } from '../connection.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Use a supplied client (for transactions) or fall back to the pool. */
const run = (client, text, params) =>
  client ? client.query(text, params) : poolQuery(text, params);

// ─────────────────────────────────────────────────────────────────────────────
// USER LOOKUPS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a user by email with role name joined.
 * Returns null when not found.
 */
export const findUserByPhone = async (phone, client = null) => {
  const { rows } = await run(client, `
    SELECT id, email, phone FROM users WHERE phone = $1 AND deleted_at IS NULL LIMIT 1;
  `, [phone]);
  return rows[0] ?? null;
};

export const findUserByEmail = async (email, client = null) => {
  const sql = `
    SELECT
      u.id,
      u.email,
      u.phone,
      u.password_hash,
      u.first_name,
      u.last_name,
      u.role_id,
      r.name          AS role,
      u.branch_id,
      u.is_active,
      u.is_verified,
      u.last_login_at,
      u.password_changed_at,
      u.failed_login_attempts,
      u.locked_until,
      u.avatar_url,
      u.deleted_at,
      u.created_at,
      u.updated_at
    FROM  users u
    JOIN  roles r ON r.id = u.role_id
    WHERE u.email = $1
      AND u.deleted_at IS NULL
    LIMIT 1;
  `;
  const { rows } = await run(client, sql, [email]);
  return rows[0] ?? null;
};

/**
 * Find a user by their UUID.
 */
export const findUserById = async (id, client = null) => {
  const sql = `
    SELECT
      u.id,
      u.email,
      u.phone,
      u.password_hash,
      u.first_name,
      u.last_name,
      u.role_id,
      r.name          AS role,
      u.branch_id,
      u.is_active,
      u.is_verified,
      u.last_login_at,
      u.password_changed_at,
      u.failed_login_attempts,
      u.locked_until,
      u.avatar_url,
      u.deleted_at,
      u.created_at,
      u.updated_at
    FROM  users u
    JOIN  roles r ON r.id = u.role_id
    WHERE u.id = $1
      AND u.deleted_at IS NULL
    LIMIT 1;
  `;
  const { rows } = await run(client, sql, [id]);
  return rows[0] ?? null;
};

/**
 * Look up a role row by name — returns { id, name, is_active }.
 */
export const findRoleByName = async (roleName, client = null) => {
  const { rows } = await run(client,
    `SELECT id, name, is_active FROM roles WHERE name = $1::role_name LIMIT 1;`,
    [roleName]
  );
  return rows[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// USER CREATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new user row. Returns the safe public profile (no password_hash).
 */
export const createUser = async ({ email, phone = null, passwordHash, firstName, lastName, roleId }, client = null) => {
  const sql = `
    INSERT INTO users
      (email, phone, password_hash, first_name, last_name, role_id,
       is_active, is_verified, password_changed_at)
    VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, NOW())
    RETURNING
      id, email, phone, first_name, last_name, role_id,
      is_active, is_verified, created_at;
  `;
  const { rows } = await run(client, sql, [email, phone, passwordHash, firstName, lastName, roleId]);
  return rows[0];
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN SECURITY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Stamp last_login_at and reset failed_login_attempts on successful login. */
export const recordSuccessfulLogin = async (userId, client = null) => {
  await run(client, `
    UPDATE users
    SET    last_login_at          = NOW(),
           failed_login_attempts  = 0,
           locked_until           = NULL,
           updated_at             = NOW()
    WHERE  id = $1;
  `, [userId]);
};

/**
 * Increment failed_login_attempts.
 * After maxAttempts, lock the account for lockoutMinutes.
 */
export const recordFailedLogin = async (userId, maxAttempts = 5, lockoutMinutes = 30, client = null) => {
  await run(client, `
    UPDATE users
    SET    failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE
             WHEN failed_login_attempts + 1 >= $2
             THEN NOW() + ($3 || ' minutes')::INTERVAL
             ELSE locked_until
           END,
           updated_at = NOW()
    WHERE  id = $1;
  `, [userId, maxAttempts, lockoutMinutes]);
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN HISTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a login_history row.
 * status: 'success' | 'failed' | 'blocked' | 'mfa_required'
 */
export const insertLoginHistory = async ({
  userId,
  ipAddress    = null,
  userAgent    = null,
  deviceType   = 'unknown',
  locationCity = null,
  locationCountry = null,
  status       = 'success',
  failureReason = null,
}, client = null) => {
  const sql = `
    INSERT INTO login_history
      (user_id, ip_address, user_agent, device_type,
       location_city, location_country, status, failure_reason)
    VALUES ($1, $2::inet, $3, $4, $5, $6, $7, $8)
    RETURNING id;
  `;
  await run(client, sql, [
    userId, ipAddress, userAgent, deviceType,
    locationCity, locationCountry, status, failureReason,
  ]);
};

// ─────────────────────────────────────────────────────────────────────────────
// REFRESH TOKENS  (stored in refresh_tokens table created below if not exists)
// We persist refresh tokens so we can invalidate on logout.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the refresh_tokens table exists (lightweight migration inline).
 * Called once at server start from authService.init().
 */
export const ensureRefreshTokensTable = async (client = null) => {
  await run(client, `
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          BIGSERIAL    PRIMARY KEY,
      user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  VARCHAR(255) NOT NULL UNIQUE,
      expires_at  TIMESTAMPTZ  NOT NULL,
      revoked     BOOLEAN      NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_rt_user_id    ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_rt_token_hash ON refresh_tokens(token_hash);
  `, []);
};

/** Store a hashed refresh token. */
export const saveRefreshToken = async ({ userId, tokenHash, expiresAt }, client = null) => {
  await run(client, `
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3);
  `, [userId, tokenHash, expiresAt]);
};

/** Find a non-revoked, non-expired refresh token by hash. */
export const findRefreshToken = async (tokenHash, client = null) => {
  const { rows } = await run(client, `
    SELECT id, user_id, expires_at, revoked
    FROM   refresh_tokens
    WHERE  token_hash = $1
      AND  revoked    = FALSE
      AND  expires_at > NOW()
    LIMIT  1;
  `, [tokenHash]);
  return rows[0] ?? null;
};

/** Revoke one specific refresh token (logout from current device). */
export const revokeRefreshToken = async (tokenHash, client = null) => {
  await run(client, `
    UPDATE refresh_tokens
    SET    revoked = TRUE
    WHERE  token_hash = $1;
  `, [tokenHash]);
};

/** Revoke ALL refresh tokens for a user (logout from all devices). */
export const revokeAllUserRefreshTokens = async (userId, client = null) => {
  await run(client, `
    UPDATE refresh_tokens
    SET    revoked = TRUE
    WHERE  user_id = $1
      AND  revoked = FALSE;
  `, [userId]);
};

// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD RESET TOKENS
// ─────────────────────────────────────────────────────────────────────────────

/** Ensure password_reset_tokens table exists. */
export const ensurePasswordResetTable = async (client = null) => {
  await run(client, `
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id          BIGSERIAL    PRIMARY KEY,
      user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  VARCHAR(255) NOT NULL UNIQUE,
      expires_at  TIMESTAMPTZ  NOT NULL,
      used        BOOLEAN      NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_prt_user_id    ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON password_reset_tokens(token_hash);
  `, []);
};

/** Invalidate any existing unused reset tokens for this user, then insert a new one. */
export const savePasswordResetToken = async ({ userId, tokenHash, expiresAt }, client = null) => {
  // Invalidate old tokens first
  await run(client, `
    UPDATE password_reset_tokens
    SET    used = TRUE
    WHERE  user_id = $1 AND used = FALSE;
  `, [userId]);

  await run(client, `
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3);
  `, [userId, tokenHash, expiresAt]);
};

/** Look up a valid (unused, non-expired) reset token. */
export const findPasswordResetToken = async (tokenHash, client = null) => {
  const { rows } = await run(client, `
    SELECT id, user_id, expires_at, used
    FROM   password_reset_tokens
    WHERE  token_hash = $1
      AND  used       = FALSE
      AND  expires_at > NOW()
    LIMIT  1;
  `, [tokenHash]);
  return rows[0] ?? null;
};

/** Mark a reset token as used. */
export const markResetTokenUsed = async (id, client = null) => {
  await run(client, `UPDATE password_reset_tokens SET used = TRUE WHERE id = $1;`, [id]);
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN OTPs (Super Admin Email OTP Login)
// ─────────────────────────────────────────────────────────────────────────────

/** Ensure login_otps table exists. */
export const ensureLoginOtpTable = async (client = null) => {
  await run(client, `
    CREATE TABLE IF NOT EXISTS login_otps (
      id          BIGSERIAL    PRIMARY KEY,
      email       VARCHAR(255) NOT NULL,
      otp_code    VARCHAR(10)  NOT NULL,
      expires_at  TIMESTAMPTZ  NOT NULL,
      used        BOOLEAN      NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_login_otps_email ON login_otps(email);
  `, []);
};

/** Invalidate old unused OTPs for this email, then insert a new one. */
export const saveLoginOtp = async (email, otpCode, ttlMinutes = 10, client = null) => {
  await run(client, `
    UPDATE login_otps
    SET    used = TRUE
    WHERE  email = $1 AND used = FALSE;
  `, [email]);

  const { rows } = await run(client, `
    INSERT INTO login_otps (email, otp_code, expires_at)
    VALUES ($1, $2, NOW() + ($3 || ' minutes')::INTERVAL)
    RETURNING id, email, otp_code, expires_at;
  `, [email, otpCode, ttlMinutes]);
  return rows[0];
};

/** Find a valid (unused, not expired) OTP for an email. */
export const findValidLoginOtp = async (email, otpCode, client = null) => {
  const { rows } = await run(client, `
    SELECT id, email, otp_code, expires_at
    FROM   login_otps
    WHERE  email      = $1
      AND  otp_code   = $2
      AND  used       = FALSE
      AND  expires_at > NOW()
    ORDER  BY created_at DESC
    LIMIT  1;
  `, [email, otpCode]);
  return rows[0] ?? null;
};

/** Mark an OTP as used. */
export const markLoginOtpUsed = async (id, client = null) => {
  await run(client, `UPDATE login_otps SET used = TRUE WHERE id = $1;`, [id]);
};


// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD / PROFILE UPDATES
// ─────────────────────────────────────────────────────────────────────────────

/** Update password hash and stamp password_changed_at. */
export const updatePassword = async (userId, newPasswordHash, client = null) => {
  await run(client, `
    UPDATE users
    SET    password_hash        = $2,
           password_changed_at  = NOW(),
           failed_login_attempts = 0,
           locked_until          = NULL,
           updated_at            = NOW()
    WHERE  id = $1;
  `, [userId, newPasswordHash]);
};

/**
 * Update allowed profile fields (first_name, last_name, phone, avatar_url).
 * Only passes non-undefined fields to avoid overwriting with NULL.
 */
export const updateUserProfile = async (userId, { firstName, lastName, phone, avatarUrl } = {}, client = null) => {
  const sets = [];
  const values = [userId];

  if (firstName  !== undefined) { values.push(firstName);  sets.push(`first_name  = $${values.length}`); }
  if (lastName   !== undefined) { values.push(lastName);   sets.push(`last_name   = $${values.length}`); }
  if (phone      !== undefined) { values.push(phone);      sets.push(`phone       = $${values.length}`); }
  if (avatarUrl  !== undefined) { values.push(avatarUrl);  sets.push(`avatar_url  = $${values.length}`); }

  if (sets.length === 0) return null;

  sets.push(`updated_at = NOW()`);

  const sql = `
    UPDATE users
    SET    ${sets.join(', ')}
    WHERE  id = $1
      AND  deleted_at IS NULL
    RETURNING
      id, email, phone, first_name, last_name, role_id,
      avatar_url, is_active, is_verified, updated_at;
  `;
  const { rows } = await run(client, sql, values);
  return rows[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// RBAC — permissions for a role
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all permission codes for a given role_id.
 * Result is an array of strings like ['fraud:investigate', 'accounts:read', ...].
 */
export const getPermissionsForRole = async (roleId, client = null) => {
  const { rows } = await run(client, `
    SELECT p.code
    FROM   role_permissions rp
    JOIN   permissions p ON p.id = rp.permission_id
    WHERE  rp.role_id = $1;
  `, [roleId]);
  return rows.map((r) => r.code);
};

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────

export const insertAuditLog = async ({
  userId     = null,
  sessionId  = null,
  action,
  entityType = null,
  entityId   = null,
  oldValue   = null,
  newValue   = null,
  ipAddress  = null,
  userAgent  = null,
  status     = 'success',
}, client = null) => {
  await run(client, `
    INSERT INTO audit_logs
      (user_id, session_id, action, entity_type, entity_id,
       old_value, new_value, ip_address, user_agent, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet, $9, $10);
  `, [
    userId, sessionId, action, entityType, entityId,
    oldValue ? JSON.stringify(oldValue) : null,
    newValue ? JSON.stringify(newValue) : null,
    ipAddress, userAgent, status,
  ]);
};
