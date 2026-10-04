/**
 * branchService.js — Business logic for the branches module.
 *
 * Endpoints covered:
 *   createBranch      → POST   /api/branches
 *   getBranch         → GET    /api/branches/:id
 *   listBranches      → GET    /api/branches
 *   updateBranch      → PATCH  /api/branches/:id
 *   deactivateBranch  → PATCH  /api/branches/:id/deactivate
 *   deleteBranch      → DELETE /api/branches/:id  (soft-delete)
 *
 * RBAC (enforced at route level):
 *   Create / Update / Delete → super_admin, admin            (users:manage_roles is proxy; we use requireRoles)
 *   Read                     → any authenticated user with users:read
 *
 * Audit log written on every write operation.
 */

import { logger }        from '../utils/logger.js';
import { insertAuditLog } from '../db/queries/authQueries.js';
import {
  findBranchById,
  findBranchByCode,
  listBranches    as dbListBranches,
  createBranch    as dbCreateBranch,
  updateBranch    as dbUpdateBranch,
  softDeleteBranch,
} from '../db/queries/branchQueries.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const mkErr = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

// ─────────────────────────────────────────────────────────────────────────────
// 1. CREATE
// ─────────────────────────────────────────────────────────────────────────────

export const createBranchService = async (fields, meta = {}) => {
  // Uniqueness check on branch code
  const existing = await findBranchByCode(fields.code);
  if (existing) throw mkErr('BRANCH_CODE_TAKEN', 409);

  const branch = await dbCreateBranch(fields);

  await insertAuditLog({
    userId    : meta.actorId,
    action    : 'BRANCH_CREATED',
    entityType: 'branch',
    entityId  : branch.id,
    newValue  : { code: branch.code, name: branch.name },
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  });

  logger.info(`Branch created: ${branch.code} — ${branch.name}`);
  return branch;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET ONE
// ─────────────────────────────────────────────────────────────────────────────

export const getBranchService = async (id) => {
  const branch = await findBranchById(id);
  if (!branch) throw mkErr('BRANCH_NOT_FOUND', 404);
  return branch;
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. LIST  (paginated + filtered)
// ─────────────────────────────────────────────────────────────────────────────

export const listBranchesService = async (query = {}) => {
  const limit  = Math.min(parseInt(query.limit,  10) || 20, 100);
  const offset = Math.max(parseInt(query.offset, 10) || 0,  0);
  const page   = Math.floor(offset / limit) + 1;

  const isActive = query.isActive === undefined ? null
    : query.isActive === 'true' || query.isActive === true;

  const { rows, total } = await dbListBranches({
    search  : query.search   || null,
    isActive,
    city    : query.city     || null,
    country : query.country  || null,
    sortBy  : query.sortBy   || 'created_at',
    sortDir : query.sortDir  || 'DESC',
    limit,
    offset,
  });

  return {
    data      : rows,
    pagination: { total, limit, offset, page, pages: Math.ceil(total / limit) },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export const updateBranchService = async (id, fields, meta = {}) => {
  const existing = await findBranchById(id);
  if (!existing) throw mkErr('BRANCH_NOT_FOUND', 404);

  // If code is being changed, ensure new code is not taken by another branch
  if (fields.code && fields.code !== existing.code) {
    const taken = await findBranchByCode(fields.code);
    if (taken) throw mkErr('BRANCH_CODE_TAKEN', 409);
  }

  const updated = await dbUpdateBranch(id, fields);

  await insertAuditLog({
    userId    : meta.actorId,
    action    : 'BRANCH_UPDATED',
    entityType: 'branch',
    entityId  : id,
    oldValue  : { code: existing.code, name: existing.name, isActive: existing.is_active },
    newValue  : fields,
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  });

  logger.info(`Branch updated: ${id}`);
  return updated;
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. DEACTIVATE  (toggle is_active = false without deleting)
// ─────────────────────────────────────────────────────────────────────────────

export const deactivateBranchService = async (id, meta = {}) => {
  const existing = await findBranchById(id);
  if (!existing) throw mkErr('BRANCH_NOT_FOUND', 404);
  if (!existing.is_active) throw mkErr('BRANCH_ALREADY_INACTIVE', 409);

  const updated = await dbUpdateBranch(id, { isActive: false });

  await insertAuditLog({
    userId    : meta.actorId,
    action    : 'BRANCH_DEACTIVATED',
    entityType: 'branch',
    entityId  : id,
    oldValue  : { isActive: true },
    newValue  : { isActive: false },
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  });

  logger.info(`Branch deactivated: ${id}`);
  return updated;
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. SOFT-DELETE
// ─────────────────────────────────────────────────────────────────────────────

export const deleteBranchService = async (id, meta = {}) => {
  const existing = await findBranchById(id);
  if (!existing) throw mkErr('BRANCH_NOT_FOUND', 404);

  const deleted = await softDeleteBranch(id);

  await insertAuditLog({
    userId    : meta.actorId,
    action    : 'BRANCH_DELETED',
    entityType: 'branch',
    entityId  : id,
    oldValue  : { code: existing.code, name: existing.name },
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  });

  logger.info(`Branch soft-deleted: ${id}`);
  return deleted;
};
