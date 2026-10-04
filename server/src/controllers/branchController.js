/**
 * branchController.js — HTTP handlers for the branches module.
 *
 * All business logic delegated to branchService.
 * Error codes → HTTP status mapping defined here.
 */

import {
  createBranchService,
  getBranchService,
  listBranchesService,
  updateBranchService,
  deactivateBranchService,
  deleteBranchService,
} from '../services/branchService.js';
import { success, failure } from '../utils/response.js';
import { logger }           from '../utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const getMeta = (req) => ({
  actorId  : req.user?.id   ?? null,
  ipAddress: req.ip          ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});

const STATUS_MAP = {
  BRANCH_NOT_FOUND       : 404,
  BRANCH_CODE_TAKEN      : 409,
  BRANCH_ALREADY_INACTIVE: 409,
};

const USER_MESSAGES = {
  BRANCH_NOT_FOUND       : 'Branch not found.',
  BRANCH_CODE_TAKEN      : 'A branch with that code already exists.',
  BRANCH_ALREADY_INACTIVE: 'Branch is already inactive.',
};

const handleErr = (err, res) => {
  const code   = err.message;
  const status = err.statusCode ?? STATUS_MAP[code] ?? 500;
  const msg    = USER_MESSAGES[code] ?? 'An unexpected error occurred.';
  if (status >= 500) logger.error(`[BranchController] ${err.stack ?? err.message}`);
  return failure(res, msg, status);
};

// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/branches */
export const createBranch = async (req, res) => {
  try {
    const { code, name, address, city, state, country, phone, email, managerId } = req.body;
    const branch = await createBranchService(
      { code, name, address, city, state, country, phone, email, managerId },
      getMeta(req)
    );
    return success(res, { branch }, 'Branch created successfully.', 201);
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/branches/:id */
export const getBranch = async (req, res) => {
  try {
    const branch = await getBranchService(req.params.id);
    return success(res, { branch }, 'Branch retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/branches */
export const listBranches = async (req, res) => {
  try {
    const result = await listBranchesService(req.query);
    return success(res, result, 'Branches retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** PATCH /api/branches/:id */
export const updateBranch = async (req, res) => {
  try {
    const { code, name, address, city, state, country, phone, email, managerId, isActive } = req.body;
    const branch = await updateBranchService(
      req.params.id,
      { code, name, address, city, state, country, phone, email, managerId, isActive },
      getMeta(req)
    );
    return success(res, { branch }, 'Branch updated successfully.');
  } catch (err) { return handleErr(err, res); }
};

/** PATCH /api/branches/:id/deactivate */
export const deactivateBranch = async (req, res) => {
  try {
    const branch = await deactivateBranchService(req.params.id, getMeta(req));
    return success(res, { branch }, 'Branch deactivated.');
  } catch (err) { return handleErr(err, res); }
};

/** DELETE /api/branches/:id */
export const deleteBranch = async (req, res) => {
  try {
    const result = await deleteBranchService(req.params.id, getMeta(req));
    return success(res, result, 'Branch deleted.');
  } catch (err) { return handleErr(err, res); }
};

export default { createBranch, getBranch, listBranches, updateBranch, deactivateBranch, deleteBranch };
