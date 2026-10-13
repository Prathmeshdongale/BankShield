/**
 * authenticate.js — JWT + RBAC middleware
 *
 * Exports:
 *   authenticate         Verify JWT, load user + permissions onto req.user
 *   authorize(...perms)  Require ALL listed permission codes (AND logic)
 *   authorizeAny(...perms) Require ANY listed permission codes (OR logic)
 *   requireRoles(...roles) Require the user to hold one of the named roles
 *   optionalAuth         Populate req.user if a valid token is present, but
 *                        never reject — for public routes that show extra
 *                        data when logged in.
 *
 * req.user shape after authenticate:
 * {
 *   sub        : UUID,          // user id
 *   email      : string,
 *   role       : string,        // role name  e.g. 'fraud_analyst'
 *   roleId     : number,
 *   name       : string,
 *   permissions: string[],      // hydrated from DB on first request, then cached in JWT
 *   iat, exp, iss, aud
 * }
 *
 * RBAC matrix (4 roles):
 *
 *   super_admin        — platform administration: users, system config, audit logs
 *   branch_manager     — branch operations: customers, accounts, fraud review
 *   fraud_analyst      — fraud investigations: alerts, cases, ML predictions
 *   customer           — own accounts, transactions, cards, reporting
 */

import jwt           from 'jsonwebtoken';
import { config }    from '../config/index.js';
import { failure }   from '../utils/response.js';
import { logger }    from '../utils/logger.js';
import {
  findUserById,
  getPermissionsForRole,
} from '../db/queries/authQueries.js';

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION CACHE
// Simple in-process Map: roleId → string[]
// Invalidated on server restart; acceptable for a role-based system where
// permission sets change rarely. For multi-instance deployments swap this
// for Redis or a short TTL.
// ─────────────────────────────────────────────────────────────────────────────
const permCache = new Map();

const getCachedPermissions = async (roleId) => {
  if (permCache.has(roleId)) return permCache.get(roleId);
  const perms = await getPermissionsForRole(roleId);
  permCache.set(roleId, perms);
  return perms;
};

/** Call this after any role-permission change to force a cache rebuild. */
export const invalidatePermCache = (roleId) => {
  if (roleId) permCache.delete(roleId);
  else permCache.clear();
};

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

/** Extract Bearer token from Authorization header. Returns null if absent. */
const extractBearerToken = (req) => {
  const header = req.headers['authorization'] ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
};

// ─────────────────────────────────────────────────────────────────────────────
// CORE: authenticate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify the JWT access token and attach the full user context to req.user.
 *
 * We re-validate the user exists and is active on each request to ensure
 * revoked/locked accounts are rejected even within the 15-minute token window.
 * The DB hit is a single indexed PK lookup — negligible overhead.
 */
export const authenticate = async (req, res, next) => {
  const token = extractBearerToken(req);

  if (!token) {
    return failure(res, 'Authentication required — no token provided.', 401);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret, {
      issuer  : 'bankshield',
      audience: 'bankshield-client',
    });
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Access token has expired.'
      : 'Invalid access token.';
    return failure(res, msg, 401);
  }

  // Re-check user is still active in DB
  const user = await findUserById(decoded.sub).catch((dbErr) => {
    logger.error(`authenticate: DB error — ${dbErr.message}`);
    return null;
  });

  if (!user) {
    return failure(res, 'User account not found.', 401);
  }
  if (!user.is_active || user.deleted_at) {
    return failure(res, 'Account is inactive or has been removed.', 403);
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return failure(res, 'Account is temporarily locked.', 423);
  }

  // Hydrate permissions (cached per roleId)
  const permissions = await getCachedPermissions(user.role_id).catch(() => []);

  // Attach to req — all downstream middleware + controllers use req.user
  req.user = {
    sub        : user.id,
    id         : user.id,        // convenience alias
    email      : user.email,
    role       : user.role,      // role name string
    roleId     : user.role_id,
    name       : `${user.first_name} ${user.last_name}`,
    isActive   : user.is_active,
    isVerified : user.is_verified,
    permissions,
  };

  next();
};

// ─────────────────────────────────────────────────────────────────────────────
// OPTIONAL AUTH — populate req.user if token present, never reject
// ─────────────────────────────────────────────────────────────────────────────

export const optionalAuth = async (req, res, next) => {
  const token = extractBearerToken(req);
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer  : 'bankshield',
      audience: 'bankshield-client',
    });
    const user = await findUserById(decoded.sub).catch(() => null);
    if (user && user.is_active && !user.deleted_at) {
      const permissions = await getCachedPermissions(user.role_id).catch(() => []);
      req.user = {
        sub: user.id, id: user.id, email: user.email,
        role: user.role, roleId: user.role_id,
        name: `${user.first_name} ${user.last_name}`,
        isActive: user.is_active, isVerified: user.is_verified,
        permissions,
      };
    }
  } catch {
    // Silently ignore invalid tokens in optional mode
  }
  next();
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTHORIZATION: permission-based
// ─────────────────────────────────────────────────────────────────────────────

/**
 * authorize('fraud:investigate', 'fraud:add_notes')
 * Requires the authenticated user to hold ALL listed permission codes.
 *
 * Must be used AFTER authenticate in the middleware chain.
 */
export const authorize = (...requiredPerms) => (req, res, next) => {
  if (!req.user) {
    return failure(res, 'Authentication required.', 401);
  }

  const userPerms = new Set(req.user.permissions ?? []);
  const missing   = requiredPerms.filter((p) => !userPerms.has(p));

  if (missing.length > 0) {
    logger.warn(
      `[RBAC] DENIED  user=${req.user.email}  role=${req.user.role}` +
      `  missing=${missing.join(',')}  path=${req.originalUrl}`
    );
    return failure(
      res,
      `Forbidden — missing permission${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      403
    );
  }

  next();
};

/**
 * authorizeAny('fraud:read_alerts', 'admin')
 * Requires the user to hold AT LEAST ONE of the listed permission codes.
 */
export const authorizeAny = (...anyPerms) => (req, res, next) => {
  if (!req.user) {
    return failure(res, 'Authentication required.', 401);
  }

  const userPerms = new Set(req.user.permissions ?? []);
  const hasAny    = anyPerms.some((p) => userPerms.has(p));

  if (!hasAny) {
    logger.warn(
      `[RBAC] DENIED  user=${req.user.email}  role=${req.user.role}` +
      `  required_any=${anyPerms.join(',')}  path=${req.originalUrl}`
    );
    return failure(res, 'Forbidden — insufficient permissions.', 403);
  }

  next();
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTHORIZATION: role-based shorthand
// ─────────────────────────────────────────────────────────────────────────────

/**
 * requireRoles('super_admin', 'admin')
 * Requires the user to hold one of the named roles.
 * Use for coarse-grained guards (e.g. admin-only registration).
 *
 * Must be used AFTER authenticate.
 */
export const requireRoles = (...roles) => (req, res, next) => {
  if (!req.user) {
    return failure(res, 'Authentication required.', 401);
  }

  if (!roles.includes(req.user.role)) {
    logger.warn(
      `[RBAC] ROLE DENIED  user=${req.user.email}  role=${req.user.role}` +
      `  required=${roles.join(',')}  path=${req.originalUrl}`
    );
    return failure(res, `Forbidden — role '${req.user.role}' is not permitted here.`, 403);
  }

  next();
};

/**
 * isSelf(paramName = 'id')
 * Ensures the authenticated user is only accessing/modifying their own resource.
 * Branch managers and super_admins bypass this check.
 */
export const isSelf = (paramName = 'id') => (req, res, next) => {
  if (!req.user) {
    return failure(res, 'Authentication required.', 401);
  }

  const bypassRoles = ['super_admin', 'branch_manager'];
  if (bypassRoles.includes(req.user.role)) return next();

  const resourceId = req.params[paramName];
  if (req.user.id !== resourceId) {
    return failure(res, 'Forbidden — you can only access your own resource.', 403);
  }

  next();
};

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY ALIASES — keeps existing imports in transactionRoutes / fraudRoutes
// working without changes
// ─────────────────────────────────────────────────────────────────────────────
export const authenticateToken = authenticate;
export const requireRole       = requireRoles;

export default {
  authenticate,
  optionalAuth,
  authorize,
  authorizeAny,
  requireRoles,
  isSelf,
  invalidatePermCache,
  // legacy
  authenticateToken,
  requireRole,
};
