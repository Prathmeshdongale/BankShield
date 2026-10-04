/**
 * branchRoutes.js
 *
 * RBAC applied per Section 4 of PROJECT_CONTEXT.md:
 *
 *   Method  Path                         Permission(s) required
 *   ──────  ───────────────────────────  ─────────────────────────────────
 *   POST    /api/branches                users:manage_roles  (admin+)
 *   GET     /api/branches                users:read          (all staff)
 *   GET     /api/branches/:id            users:read          (all staff)
 *   PATCH   /api/branches/:id            users:manage_roles  (admin+)
 *   PATCH   /api/branches/:id/deactivate users:manage_roles  (admin+)
 *   DELETE  /api/branches/:id            users:manage_roles  (super_admin, admin only)
 *
 * Note: the schema seeds don't include a dedicated "branches:*" permission
 * module, so we use the closest mapped permissions from the RBAC matrix:
 *   - writes  → users:manage_roles  (held by super_admin, admin)
 *   - reads   → users:read          (held by all 7 roles)
 */

import { Router } from 'express';
import { authenticate, authorize, requireRoles } from '../middleware/authenticate.js';
import {
  validate,
  createBranchValidator,
  updateBranchValidator,
  branchIdValidator,
  listBranchesValidator,
} from '../validators/branchValidators.js';
import {
  createBranch,
  getBranch,
  listBranches,
  updateBranch,
  deactivateBranch,
  deleteBranch,
} from '../controllers/branchController.js';

const router = Router();

// All branch routes require a valid JWT
router.use(authenticate);

// ── Reads ────────────────────────────────────────────────────────────────────

/** GET /api/branches  — paginated list with filters */
router.get(
  '/',
  authorize('users:read'),
  ...listBranchesValidator,
  validate,
  listBranches
);

/** GET /api/branches/:id */
router.get(
  '/:id',
  authorize('users:read'),
  ...branchIdValidator,
  validate,
  getBranch
);

// ── Writes  (admin and above only) ───────────────────────────────────────────

/** POST /api/branches */
router.post(
  '/',
  authorize('users:manage_roles'),
  ...createBranchValidator,
  validate,
  createBranch
);

/** PATCH /api/branches/:id */
router.patch(
  '/:id',
  authorize('users:manage_roles'),
  ...updateBranchValidator,
  validate,
  updateBranch
);

/** PATCH /api/branches/:id/deactivate */
router.patch(
  '/:id/deactivate',
  authorize('users:manage_roles'),
  ...branchIdValidator,
  validate,
  deactivateBranch
);

/** DELETE /api/branches/:id  — super_admin and admin only */
router.delete(
  '/:id',
  requireRoles('super_admin', 'admin'),
  ...branchIdValidator,
  validate,
  deleteBranch
);

export default router;
