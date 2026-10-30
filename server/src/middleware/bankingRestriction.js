/**
 * bankingRestriction.js — Enforce Super Admin Privacy Boundary.
 *
 * Super Admin is a technical platform administrator and developer/system controller.
 * Under BankShield's strict data privacy architecture:
 * - Super Admin must NEVER see individual customer accounts, names, balances,
 *   bank account numbers, transaction amounts, or individual transaction records.
 * - Banking routes (transactions, accounts, cards, customers, individual fraud alerts)
 *   are restricted strictly to operational roles: branch_manager, fraud_analyst, and customer.
 *
 * Super Admin accesses:
 * - Application health, service uptime, ML microservice status
 * - System configuration & feature switches
 * - User-role administration (staff provisioning)
 * - Platform audit logs
 */

import { failure } from '../utils/response.js';
import { logger }  from '../utils/logger.js';

/**
 * Restrict banking content access from Super Admin.
 * Used on banking routers (accounts, transactions, cards, customers).
 */
export const restrictBankingFromSuperAdmin = (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    logger.warn(`[PRIVACY BOUNDARY] Super Admin access blocked on banking route: ${req.originalUrl || req.url}`);
    return failure(res, 'Access denied. Super Admin is restricted from accessing individual customer and banking data.', 403);
  }
  next();
};

/**
 * Require banking operational role (customer, branch_manager, fraud_analyst).
 */
export const requireBankingRole = (req, res, next) => {
  if (!req.user) {
    return failure(res, 'Authentication required.', 401);
  }
  if (req.user.role === 'super_admin') {
    return failure(res, 'Access denied. Super Admin cannot access banking operations.', 403);
  }
  next();
};

export default {
  restrictBankingFromSuperAdmin,
  requireBankingRole,
};
