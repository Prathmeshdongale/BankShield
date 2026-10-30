/**
 * userController.js — HTTP handlers for User Management.
 */

import {
  listUsersService,
  getUserService,
  createUserService,
  updateUserStatusService,
  updateUserRoleService,
  deleteUserService,
} from '../services/userService.js';
import { success, failure } from '../utils/response.js';
import { logger } from '../utils/logger.js';

const getMeta = (req) => ({
  actorId  : req.user?.id   ?? null,
  ipAddress: (req.ip || req.headers['x-forwarded-for'] || null),
  userAgent: req.headers['user-agent'] ?? null,
});

const STATUS_MAP = {
  USER_NOT_FOUND      : 404,
  ROLE_NOT_FOUND      : 404,
  EMAIL_ALREADY_EXISTS: 409,
};

const USER_MESSAGES = {
  USER_NOT_FOUND      : 'User not found.',
  ROLE_NOT_FOUND      : 'Role not found.',
  EMAIL_ALREADY_EXISTS: 'An account with this email address already exists.',
};

const handleErr = (err, res) => {
  const code   = err.message;
  const status = err.statusCode ?? STATUS_MAP[code] ?? 500;
  const msg    = USER_MESSAGES[code] ?? err.message ?? 'An unexpected error occurred.';
  if (status >= 500) logger.error(`[UserController] ${err.stack ?? err.message}`);
  return failure(res, msg, status);
};

export const listUsers = async (req, res) => {
  try {
    const result = await listUsersService(req.query);
    return success(res, result, 'Users retrieved successfully.');
  } catch (err) {
    return handleErr(err, res);
  }
};

export const getUser = async (req, res) => {
  try {
    const user = await getUserService(req.params.id);
    return success(res, { user }, 'User retrieved successfully.');
  } catch (err) {
    return handleErr(err, res);
  }
};

export const createUserHandler = async (req, res) => {
  try {
    const { email, phone, password, firstName, lastName, roleName, branchId } = req.body;
    const user = await createUserService(
      { email, phone, password, firstName, lastName, roleName, branchId },
      getMeta(req)
    );
    return success(res, { user }, 'User created successfully.', 201);
  } catch (err) {
    return handleErr(err, res);
  }
};

export const updateUserStatusHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const user = await updateUserStatusService(id, isActive, getMeta(req));
    return success(res, { user }, `User status updated to ${isActive ? 'active' : 'inactive'}.`);
  } catch (err) {
    return handleErr(err, res);
  }
};

export const updateUserRoleHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { roleName } = req.body;
    const user = await updateUserRoleService(id, roleName, getMeta(req));
    return success(res, { user }, `User role updated to ${roleName}.`);
  } catch (err) {
    return handleErr(err, res);
  }
};

export const deleteUserHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deleteUserService(id, getMeta(req));
    return success(res, result, 'User deleted successfully.');
  } catch (err) {
    return handleErr(err, res);
  }
};

export default {
  listUsers,
  getUser,
  createUserHandler,
  updateUserStatusHandler,
  updateUserRoleHandler,
  deleteUserHandler,
};
