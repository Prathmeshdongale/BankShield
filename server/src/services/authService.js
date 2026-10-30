/**
 * authService.js — Auth business logic layer.
 *
 * Responsibilities:
 *  - register          (admin-only; resolves role_id from role name)
 *  - login             (bcrypt verify, lockout check, login_history, generates 6-digit OTP)
 *  - verifyLoginOtp    (verifies single-use OTP, issues JWT pair)
 *  - resendLoginOtp    (resends fresh 5m OTP)
 *  - sendSuperAdminOtp (passwordless OTP dispatch to super_admin email)
 *  - verifySuperAdminOtp (verifies super_admin OTP, issues JWT pair)
 *  - registerCustomer  (customer self-registration + automatic savings account)
 *  - logout            (revoke refresh token, audit log)
 *  - refreshTokens     (rotate refresh token)
 *  - forgotPassword    (generate reset token, log)
 *  - resetPassword     (verify token, update hash, revoke all refresh tokens)
 *  - changePassword    (verify current password, update hash)
 *  - updateProfile     (first/last name, phone, avatar)
 *  - getProfile        (fetch + attach permissions)
 *  - init              (ensure runtime tables exist at startup)
 *
 * All DB mutations go through authQueries.js (raw SQL via pg).
 * Refresh tokens are stored hashed (SHA-256) in the refresh_tokens table.
 * Password-reset tokens are crypto-random 32-byte hex, stored as SHA-256 hash.
 */

import bcrypt          from 'bcrypt';
import jwt             from 'jsonwebtoken';
import crypto          from 'crypto';
import { config }      from '../config/index.js';
import { logger }      from '../utils/logger.js';
import { getClient }   from '../db/connection.js';
import {
  findUserByEmail,
  findUserByPhone,
  findUserById,
  findRoleByName,
  createUser,
  recordSuccessfulLogin,
  recordFailedLogin,
  insertLoginHistory,
  ensureRefreshTokensTable,
  saveRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  ensurePasswordResetTable,
  savePasswordResetToken,
  findPasswordResetToken,
  markResetTokenUsed,
  updatePassword,
  updateUserProfile,
  getPermissionsForRole,
  ensureLoginOtpTable,
  saveLoginOtp,
  findValidLoginOtp,
  markLoginOtpUsed,
  insertAuditLog,
} from '../db/queries/authQueries.js';
import { sendLoginOtpEmail, sendSuperAdminOtpEmail } from './emailService.js';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const SALT_ROUNDS          = 12;
const MAX_LOGIN_ATTEMPTS   = 5;
const LOCKOUT_MINUTES      = 30;
const RESET_TOKEN_TTL_MINS = 15;   // password-reset link valid for 15 minutes
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** SHA-256 hash of a token string — used to store tokens without plaintext. */
const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

/**
 * Build the JWT payload that goes into both access and refresh tokens.
 * Intentionally minimal — no sensitive fields.
 */
const buildJwtPayload = (user) => ({
  sub   : user.id,
  email : user.email,
  role  : user.role,        // role name string e.g. 'fraud_analyst'
  roleId: user.role_id,
  name  : `${user.first_name} ${user.last_name}`,
});

/** Sign an access token (15m). */
const signAccessToken = (payload) =>
  jwt.sign(payload, config.jwt.secret, {
    expiresIn : config.jwt.expiresIn,   // '15m'
    issuer    : 'bankshield',
    audience  : 'bankshield-client',
    jwtid     : crypto.randomUUID(),
  });

/** Sign a refresh token (7d). */
const signRefreshToken = (payload) =>
  jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn : config.jwt.refreshExpiresIn,  // '7d'
    issuer    : 'bankshield',
    audience  : 'bankshield-client',
    jwtid     : crypto.randomUUID(),
  });

/** Build the safe public user object returned in API responses. */
const publicUser = (user, permissions = []) => ({
  id          : user.id,
  email       : user.email,
  phone       : user.phone       ?? null,
  firstName   : user.first_name,
  lastName    : user.last_name,
  role        : user.role,
  isActive    : user.is_active,
  isVerified  : user.is_verified,
  avatarUrl   : user.avatar_url  ?? null,
  createdAt   : user.created_at,
  permissions,
});

/** Extract device type heuristic from User-Agent string. */
const detectDevice = (ua = '') => {
  const s = ua.toLowerCase();
  if (s.includes('mobile') || s.includes('android') || s.includes('iphone')) return 'mobile';
  if (s.includes('tablet') || s.includes('ipad')) return 'tablet';
  if (s.includes('postman') || s.includes('curl') || s.includes('insomnia') || s.includes('axios')) return 'api';
  return 'desktop';
};

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP INIT — call once when server starts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures the two runtime-created tables exist (refresh_tokens, password_reset_tokens).
 * Safe to call on every server start — uses CREATE TABLE IF NOT EXISTS.
 */
export const initAuthTables = async () => {
  await ensureRefreshTokensTable();
  await ensurePasswordResetTable();
  await ensureLoginOtpTable();
  logger.info('Auth runtime tables verified.');
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. REGISTER  (admin-only endpoint — route is guarded separately)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a new user.
 */
export const registerUser = async (
  { email, password, firstName, lastName, phone = null, roleName = 'customer' },
  meta = {},
  actorId = null
) => {
  const existing = await findUserByEmail(email);
  if (phone) {
    const existingPhone = await findUserByPhone(phone);
    if (existingPhone) {
      const err = new Error('PHONE_TAKEN');
      err.statusCode = 409;
      throw err;
    }
  }
  if (existing) {
    const err = new Error('EMAIL_TAKEN');
    err.statusCode = 409;
    throw err;
  }

  const role = await findRoleByName(roleName);
  if (!role || !role.is_active) {
    const err = new Error('INVALID_ROLE');
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await createUser({
    email,
    phone,
    passwordHash,
    firstName,
    lastName,
    roleId: role.id,
  });

  await insertAuditLog({
    userId    : actorId,
    action    : 'USER_REGISTERED',
    entityType: 'user',
    entityId  : user.id,
    newValue  : { email, role: roleName },
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  });

  logger.info(`User registered: ${email} (role: ${roleName})`);
  return publicUser({ ...user, role: roleName });
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. LOGIN (Step 1: Validate Credentials & Dispatch OTP)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Authenticate a user by email + password.
 * Returns { requiresOtp: true, email, role, firstName, devOtp } on success.
 */
export const loginUser = async ({ email, password }, meta = {}) => {
  const ip        = meta.ipAddress ?? null;
  const ua        = meta.userAgent ?? '';
  const device    = detectDevice(ua);

  // 1. Find user
  const user = await findUserByEmail(email);

  const logFail = async (reason) => {
    if (user) {
      await recordFailedLogin(user.id, MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES);
      await insertLoginHistory({
        userId      : user.id,
        ipAddress   : ip,
        userAgent   : ua,
        deviceType  : device,
        status      : 'failed',
        failureReason: reason,
      });
      await insertAuditLog({
        userId    : user.id,
        action    : 'LOGIN_FAILED',
        entityType: 'user',
        entityId  : user.id,
        ipAddress : ip,
        userAgent : ua,
        status    : 'failure',
        newValue  : { reason },
      });
    }
  };

  // 2. User not found — constant-time compare to prevent timing attacks
  if (!user) {
    await bcrypt.compare(password, '$2b$12$invalidhashpaddingtoconstanttime.');
    const err = new Error('INVALID_CREDENTIALS');
    err.statusCode = 401;
    throw err;
  }

  // 3. Soft-deleted / inactive
  if (!user.is_active || user.deleted_at) {
    await logFail('ACCOUNT_INACTIVE');
    const err = new Error('ACCOUNT_INACTIVE');
    err.statusCode = 403;
    throw err;
  }

  // 4. Account locked?
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    await insertLoginHistory({
      userId: user.id, ipAddress: ip, userAgent: ua, deviceType: device,
      status: 'blocked', failureReason: 'ACCOUNT_LOCKED',
    });
    const err = new Error('ACCOUNT_LOCKED');
    err.statusCode = 423;
    err.lockedUntil = user.locked_until;
    throw err;
  }

  // 5. Verify password
  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    await logFail('WRONG_PASSWORD');
    const err = new Error('INVALID_CREDENTIALS');
    err.statusCode = 401;
    throw err;
  }

  // 6. Generate 6-digit cryptographically secure OTP (5-minute expiry) for ALL roles
  const otp = String(crypto.randomInt(100000, 1000000));
  await saveLoginOtp(user.email, otp, 5);
  await sendLoginOtpEmail({
    email: user.email,
    otp,
    name: user.first_name,
    role: user.role,
  });

  logger.info(`Login OTP generated for: ${user.email} (role: ${user.role})`);

  // Tokens are NOT issued here. Tokens are issued ONLY upon successful OTP verification.
  return {
    requiresOtp: true,
    email: user.email,
    role: user.role,
    firstName: user.first_name,
    devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. LOGOUT
// ─────────────────────────────────────────────────────────────────────────────

export const logoutUser = async ({ userId, refreshToken, logoutAll = false }, meta = {}) => {
  if (logoutAll) {
    await revokeAllUserRefreshTokens(userId);
  } else if (refreshToken) {
    await revokeRefreshToken(hashToken(refreshToken));
  }

  await insertAuditLog({
    userId    : userId,
    action    : logoutAll ? 'LOGOUT_ALL' : 'LOGOUT',
    entityType: 'user',
    entityId  : userId,
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  });

  logger.info(`Logout: user ${userId}${logoutAll ? ' (all sessions)' : ''}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. REFRESH TOKENS
// ─────────────────────────────────────────────────────────────────────────────

export const refreshTokens = async (incomingRefreshToken, meta = {}) => {
  let decoded;
  try {
    decoded = jwt.verify(incomingRefreshToken, config.jwt.refreshSecret, {
      issuer  : 'bankshield',
      audience: 'bankshield-client',
    });
  } catch {
    const err = new Error('INVALID_REFRESH_TOKEN');
    err.statusCode = 401;
    throw err;
  }

  const tokenHash   = hashToken(incomingRefreshToken);
  const storedToken = await findRefreshToken(tokenHash);
  if (!storedToken) {
    const err = new Error('REFRESH_TOKEN_REVOKED');
    err.statusCode = 401;
    throw err;
  }

  const user = await findUserById(decoded.sub);
  if (!user || !user.is_active) {
    const err = new Error('ACCOUNT_INACTIVE');
    err.statusCode = 403;
    throw err;
  }

  await revokeRefreshToken(tokenHash);

  const permissions  = await getPermissionsForRole(user.role_id);
  const payload      = buildJwtPayload(user);
  const accessToken  = signAccessToken(payload);
  const newRefresh   = signRefreshToken(payload);

  await saveRefreshToken({
    userId   : user.id,
    tokenHash: hashToken(newRefresh),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  await insertAuditLog({
    userId    : user.id,
    action    : 'TOKEN_REFRESHED',
    entityType: 'user',
    entityId  : user.id,
    ipAddress : meta.ipAddress,
    status    : 'success',
  });

  return {
    user        : publicUser(user, permissions),
    accessToken,
    refreshToken: newRefresh,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. FORGOT PASSWORD
// ─────────────────────────────────────────────────────────────────────────────

export const forgotPassword = async (email, meta = {}) => {
  const user = await findUserByEmail(email);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINS * 60 * 1000);

  if (!user || !user.is_active) {
    return { email, expiresAt, token: null };
  }

  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  await savePasswordResetToken({ userId: user.id, tokenHash, expiresAt });

  await insertAuditLog({
    userId    : user.id,
    action    : 'PASSWORD_RESET_REQUESTED',
    entityType: 'user',
    entityId  : user.id,
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  });

  logger.info(`Password reset requested: ${email}`);
  return { email, expiresAt, token: rawToken };
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. RESET PASSWORD
// ─────────────────────────────────────────────────────────────────────────────

export const resetPassword = async ({ token, newPassword }, meta = {}) => {
  const tokenHash   = hashToken(token);
  const resetRecord = await findPasswordResetToken(tokenHash);

  if (!resetRecord) {
    const err = new Error('INVALID_OR_EXPIRED_TOKEN');
    err.statusCode = 400;
    throw err;
  }

  const user = await findUserById(resetRecord.user_id);
  if (!user) {
    const err = new Error('USER_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await updatePassword(user.id, newHash, client);
    await markResetTokenUsed(resetRecord.id, client);
    await revokeAllUserRefreshTokens(user.id, client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await insertAuditLog({
    userId    : user.id,
    action    : 'PASSWORD_RESET_COMPLETED',
    entityType: 'user',
    entityId  : user.id,
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  });

  logger.info(`Password reset completed: ${user.email}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. CHANGE PASSWORD
// ─────────────────────────────────────────────────────────────────────────────

export const changePassword = async ({ userId, currentPassword, newPassword }, meta = {}) => {
  const user = await findUserById(userId);
  if (!user) {
    const err = new Error('USER_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }

  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) {
    const err = new Error('WRONG_CURRENT_PASSWORD');
    err.statusCode = 400;
    throw err;
  }

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await updatePassword(userId, newHash, client);
    await revokeAllUserRefreshTokens(userId, client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await insertAuditLog({
    userId    : userId,
    action    : 'PASSWORD_CHANGED',
    entityType: 'user',
    entityId  : userId,
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  });

  logger.info(`Password changed: ${user.email}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. UPDATE PROFILE
// ─────────────────────────────────────────────────────────────────────────────

export const updateProfile = async (userId, fields, meta = {}) => {
  const updated = await updateUserProfile(userId, fields);
  if (!updated) {
    const err = new Error('USER_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }

  await insertAuditLog({
    userId    : userId,
    action    : 'PROFILE_UPDATED',
    entityType: 'user',
    entityId  : userId,
    newValue  : fields,
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  });

  return updated;
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. GET PROFILE
// ─────────────────────────────────────────────────────────────────────────────

export const getProfile = async (userId) => {
  const user = await findUserById(userId);
  if (!user) {
    const err = new Error('USER_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }
  const permissions = await getPermissionsForRole(user.role_id);
  return publicUser(user, permissions);
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. SUPER ADMIN PASSWORDLESS EMAIL OTP LOGIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send 6-digit OTP to Super Admin email for passwordless OTP sign-in.
 */
export const sendSuperAdminOtp = async (email) => {
  const user = await findUserByEmail(email);
  if (!user || user.role !== 'super_admin') {
    const err = new Error('SUPERADMIN_ONLY');
    err.statusCode = 403;
    throw err;
  }

  if (!user.is_active || user.deleted_at) {
    const err = new Error('ACCOUNT_INACTIVE');
    err.statusCode = 403;
    throw err;
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const err = new Error('ACCOUNT_LOCKED');
    err.statusCode = 423;
    err.lockedUntil = user.locked_until;
    throw err;
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  await saveLoginOtp(user.email, otp, 5);
  await sendSuperAdminOtpEmail(user.email, otp);

  logger.info(`Super Admin OTP generated for: ${user.email}`);

  return {
    requiresOtp: true,
    email: user.email,
    role: 'super_admin',
    firstName: user.first_name,
    message: 'Super Admin verification code dispatched to email.',
    devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
  };
};

/**
 * Verify Super Admin OTP and issue session tokens.
 */
export const verifySuperAdminOtp = async ({ email, otp }, meta = {}) => {
  const result = await verifyLoginOtp({ email, otp }, meta);
  if (result.user.role !== 'super_admin') {
    const err = new Error('SUPERADMIN_ONLY');
    err.statusCode = 403;
    throw err;
  }
  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// 11. UNIFIED OTP VERIFICATION (ALL 4 ROLES)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify Login OTP for any of the 4 roles and issue session JWT tokens.
 */
export const verifyLoginOtp = async ({ email, otp }, meta = {}) => {
  const ip     = meta.ipAddress ?? null;
  const ua     = meta.userAgent ?? '';
  const device = detectDevice(ua);

  const user = await findUserByEmail(email);
  if (!user) {
    const err = new Error('INVALID_CREDENTIALS');
    err.statusCode = 401;
    throw err;
  }

  if (!user.is_active || user.deleted_at) {
    const err = new Error('ACCOUNT_INACTIVE');
    err.statusCode = 403;
    throw err;
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const err = new Error('ACCOUNT_LOCKED');
    err.statusCode = 423;
    err.lockedUntil = user.locked_until;
    throw err;
  }

  const validOtp = await findValidLoginOtp(email, otp);
  if (!validOtp) {
    await recordFailedLogin(user.id, MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES);
    await insertLoginHistory({
      userId: user.id,
      ipAddress: ip,
      userAgent: ua,
      deviceType: device,
      status: 'failed',
      failureReason: 'INVALID_OR_EXPIRED_OTP',
    });
    const err = new Error('INVALID_OTP');
    err.statusCode = 401;
    throw err;
  }

  // Mark OTP used (single use)
  await markLoginOtpUsed(validOtp.id);
  await recordSuccessfulLogin(user.id);
  await insertLoginHistory({
    userId: user.id,
    ipAddress: ip,
    userAgent: ua,
    deviceType: device,
    status: 'success',
  });

  const permissions = await getPermissionsForRole(user.role_id);
  const payload     = buildJwtPayload(user);
  const accessToken = signAccessToken(payload);
  const refreshToken= signRefreshToken(payload);

  const tokenHash   = hashToken(refreshToken);
  await saveRefreshToken({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  await insertAuditLog({
    userId: user.id,
    action: 'LOGIN_OTP_VERIFIED',
    entityType: 'user',
    entityId: user.id,
    ipAddress: ip,
    userAgent: ua,
    status: 'success',
    newValue: { role: user.role },
  });

  logger.info(`User successfully verified OTP and authenticated: ${user.email} (role: ${user.role})`);

  return {
    user: publicUser(user, permissions),
    accessToken,
    refreshToken,
  };
};

/**
 * Resend a new 5-minute login OTP.
 */
export const resendLoginOtp = async (email) => {
  const user = await findUserByEmail(email);
  if (!user) {
    const err = new Error('USER_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }

  if (!user.is_active || user.deleted_at) {
    const err = new Error('ACCOUNT_INACTIVE');
    err.statusCode = 403;
    throw err;
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const err = new Error('ACCOUNT_LOCKED');
    err.statusCode = 423;
    err.lockedUntil = user.locked_until;
    throw err;
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  await saveLoginOtp(user.email, otp, 5);
  await sendLoginOtpEmail({
    email: user.email,
    otp,
    name: user.first_name,
    role: user.role,
  });

  return {
    message: 'New verification OTP sent to your registered email.',
    email: user.email,
    devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 12. CUSTOMER SELF-REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a normal user as a customer, create initial savings account, and issue login OTP.
 */
export const registerCustomer = async (
  { email, password, firstName, lastName, phone = null },
  meta = {}
) => {
  const ip     = meta.ipAddress ?? null;
  const ua     = meta.userAgent ?? '';
  const device = detectDevice(ua);

  // 1. Check email uniqueness
  const existing = await findUserByEmail(email);
  if (existing) {
    const err = new Error('EMAIL_TAKEN');
    err.statusCode = 409;
    throw err;
  }

  if (phone) {
    const existingPhone = await findUserByPhone(phone);
    if (existingPhone) {
      const err = new Error('PHONE_TAKEN');
      err.statusCode = 409;
      throw err;
    }
  }

  // 2. Resolve 'customer' role
  const role = await findRoleByName('customer');
  if (!role || !role.is_active) {
    const err = new Error('INVALID_ROLE');
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 3. Create user
    const user = await createUser({
      email,
      phone,
      passwordHash,
      firstName,
      lastName,
      roleId: role.id,
    }, client);

    // 4. Create customer record
    const custNum = 'CUST-' + Math.floor(10000000 + Math.random() * 90000000);
    const custRes = await client.query(`
      INSERT INTO customers (user_id, customer_number, risk_rating, segment)
      VALUES ($1, $2, 'low', 'retail')
      RETURNING id, customer_number;
    `, [user.id, custNum]);
    const customer = custRes.rows[0];

    // 5. Create initial active savings account with ₹25,000 balance
    const accTypeRes = await client.query(`SELECT id FROM account_types WHERE type_name = 'savings' LIMIT 1`);
    const accountTypeId = accTypeRes.rows[0]?.id || 1;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const accNum = `ACC-${dateStr}-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const initialDeposit = 25000.00;

    await client.query(`
      INSERT INTO accounts (account_number, customer_id, account_type_id, currency, balance, available_balance, status)
      VALUES ($1, $2, $3, 'INR', $4, $4, 'active');
    `, [accNum, customer.id, accountTypeId, initialDeposit]);

    await client.query('COMMIT');

    const fullUser = { ...user, role: 'customer' };
    const permissions = await getPermissionsForRole(role.id);
    const payload     = buildJwtPayload(fullUser);
    const accessToken = signAccessToken(payload);
    const refreshToken= signRefreshToken(payload);

    const tokenHash   = hashToken(refreshToken);
    await saveRefreshToken({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });

    await insertAuditLog({
      userId: user.id,
      action: 'CUSTOMER_SELF_REGISTERED',
      entityType: 'user',
      entityId: user.id,
      newValue: { email, customerNumber: customer.customer_number, account: accNum },
      ipAddress: ip,
      userAgent: ua,
      status: 'success',
    });

    return {
      user: publicUser(fullUser, permissions),
      accessToken,
      refreshToken,
      accountNumber: accNum,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
