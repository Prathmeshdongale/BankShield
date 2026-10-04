/**
 * authMiddleware.js — Legacy re-export shim.
 *
 * The canonical middleware is now in authenticate.js.
 * This file keeps existing imports in transactionRoutes.js and fraudRoutes.js
 * working without changes.
 */
export { authenticate as authenticateToken, requireRoles as requireRole }
  from './authenticate.js';

export { authenticate, requireRoles, authorize, authorizeAny, isSelf, optionalAuth }
  from './authenticate.js';

export default { authenticateToken: null, requireRole: null }; // placeholder to avoid import errors
