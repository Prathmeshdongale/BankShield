/**
 * branchAuth.js — Branch-level authorization middleware.
 *
 * Ensures branch managers can only access customers and data within their assigned branch.
 */

import { failure } from '../utils/response.js';
import { logger } from '../utils/logger.js';

/**
 * requireBranchAssignment
 * Ensures the authenticated user has a branch assignment.
 * Branch managers and tellers (now branch_manager role) require this.
 */
export const requireBranchAssignment = (req, res, next) => {
  if (!req.user) {
    return failure(res, 'Authentication required.', 401);
  }

  // Only branch managers require branch assignment
  if (req.user.role === 'branch_manager') {
    // The branch_id should be in req.user or in the user object from DB
    const branchId = req.user.branch_id || (req.user.branchId && req.user.branchId.toString());
    
    if (!branchId) {
      logger.warn(`[BranchAuth] User ${req.user.email} is a branch manager without branch assignment`);
      return failure(res, 'Forbidden — branch manager must be assigned to a branch.', 403);
    }
    
    // Store branch filter for use in service layer
    req.branchFilter = { branch_id: branchId };
  }
  
  next();
};

/**
 * requireBranchOwnership
 * Ensures a user can only access data from their branch.
 * Example: branch manager can only view customers in their branch.
 */
export const requireBranchOwnership = (paramName = 'customerId') => {
  return (req, res, next) => {
    if (!req.user) {
      return failure(res, 'Authentication required.', 401);
    }

    // Only branch managers have branch restrictions
    if (req.user.role !== 'branch_manager') {
      return next();
    }

    const branchId = req.user.branch_id || (req.user.branchId && req.user.branchId.toString());
    
    if (!branchId) {
      return failure(res, 'Forbidden — branch manager must be assigned to a branch.', 403);
    }

    // If customerId is in params, verify it belongs to user's branch
    const customerId = req.params[paramName];
    if (customerId) {
      // The actual branch verification will be done in the service layer
      // by joining customers table with branches table
      req.branchFilter = { 
        branch_id: branchId,
        customer_id: customerId 
      };
    }
    
    next();
  };
};

/**
 * requireBranchOwnershipForAccount
 * Ensures account belongs to user's branch.
 */
export const requireBranchOwnershipForAccount = (paramName = 'accountId') => {
  return (req, res, next) => {
    if (!req.user) {
      return failure(res, 'Authentication required.', 401);
    }

    if (req.user.role !== 'branch_manager') {
      return next();
    }

    const branchId = req.user.branch_id || (req.user.branchId && req.user.branchId.toString());
    
    if (!branchId) {
      return failure(res, 'Forbidden — branch manager must be assigned to a branch.', 403);
    }

    const accountId = req.params[paramName];
    if (accountId) {
      req.branchFilter = { 
        branch_id: branchId,
        account_id: accountId 
      };
    }
    
    next();
  };
};

/**
 * requireCustomerOwnership
 * Ensures branch managers can only access customers in their branch.
 */
export const requireCustomerOwnership = (paramName = 'customerId') => {
  return (req, res, next) => {
    if (!req.user) {
      return failure(res, 'Authentication required.', 401);
    }

    if (req.user.role !== 'branch_manager') {
      return next();
    }

    const branchId = req.user.branch_id || (req.user.branchId && req.user.branchId.toString());
    
    if (!branchId) {
      return failure(res, 'Forbidden — branch manager must be assigned to a branch.', 403);
    }

    // Customer ownership check - verify customer belongs to user's branch
    const customerId = req.params[paramName];
    if (customerId) {
      req.branchFilter = { 
        branch_id: branchId,
        customer_id: customerId 
      };
    }
    
    next();
  };
};
