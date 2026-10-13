/**
 * bankingRestriction.js — Prevent Super Admin from accessing banking operations.
 *
 * Super Admin is a platform administrator, NOT a bank branch manager.
 * This middleware blocks all banking-content endpoints from Super Admin access.
 *
 * Banking endpoints are identified by routes:
 * - /api/transactions/*, /api/accounts/*, /api/cards/*, /api/customers/*,
 * - /api/beneficiaries/*, /api/transfers/*
 *
 * Super Admin can access:
 * - /api/auth/*, /api/admin/*, /api/audit-logs/*, /api/system/*
 * - Aggregated statistics endpoints (if properly scoped)
 *
 * Banking endpoints MUST be accessed by:
 * - branch_manager (branch-scoped)
 * - fraud_analyst (fraud-related)
 * - customer (own data only)
 */

import { failure } from '../utils/response.js';
import { logger } from '../utils/logger.js';

// Banking route prefixes — Super Admin cannot access these
const BANKING_PREFIXES = [
  '/api/transactions',
  '/api/accounts',
  '/api/cards',
  '/api/customers',
  '/api/beneficiaries',
  '/api/transfers',
  '/api/branches',
];

/**
 * Restrict banking content access from Super Admin
 */
export const restrictBankingFromSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return next(); // Let other middleware handle authentication
  }

  // Super Admin gets platform-only access
  if (req.user.role === 'super_admin') {
    const path = req.path || req.url;
    
    // Check if this is a banking route
    const isBankingRoute = BANKING_PREFIXES.some(prefix => 
      path.startsWith(prefix)
    );

    if (isBankingRoute) {
      logger.warn(
        `[BANKING RESTRICTION] Super Admin attempted access to banking route: ${path}`
      );
      return failure(res, 'Access denied. Super Admin cannot access banking operations.', 403);
    }
  }

  next();
};

/**
 * Require banking role (branch_manager, fraud_analyst, customer)
 * Used for endpoints that should NOT be accessible to platform administrators
 */
export const requireBankingRole = (req, res, next) => {
  if (!req.user) {
    return failure(res, 'Authentication required.', 401);
  }

  const bankingRoles = ['branch_manager', 'fraud_analyst', 'customer'];
  
  if (!bankingRoles.includes(req.user.role)) {
    logger.warn(
      `[BANKING ROLE] User ${req.user.email} (role: ${req.user.role}) attempted access to banking endpoint`
    );
    return failure(res, 'Access denied. Banking operations require a banking role.', 403);
  }

  next();
};

/**
 * Require platform role (super_admin only for admin endpoints)
 */
export const requirePlatformRole = (req, res, next) => {
  if (!req.user) {
    return failure(res, 'Authentication required.', 401);
  }

  const platformRoles = ['super_admin'];
  
  if (!platformRoles.includes(req.user.role)) {
    logger.warn(
      `[PLATFORM ROLE] User ${req.user.email} (role: ${req.user.role}) attempted access to platform admin endpoint`
    );
    return failure(res, 'Access denied. Platform administration requires super_admin role.', 403);
  }

  next();
};

/**
 * Verify resource ownership for customer role
 * Used by branch_manager and fraud_analyst to access branch/customer-scoped data
 */
export const requireBranchOrCustomerOwnership = (paramName = 'customerId') => {
  return (req, res, next) => {
    if (!req.user) {
      return failure(res, 'Authentication required.', 401);
    }

    // Branch managers need branch assignment
    if (req.user.role === 'branch_manager') {
      const branchId = req.user.branch_id;
      if (!branchId) {
        return failure(res, 'Branch manager must be assigned to a branch.', 403);
      }
      req.branchFilter = { branch_id: branchId };
    }

    // Customer role requires own data only
    if (req.user.role === 'customer') {
      req.customerId = req.user.id;
    }

    next();
  };
};
