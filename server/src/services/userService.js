/**
 * userService.js — Business logic for User Management.
 */

import bcrypt from 'bcrypt';
import { logger } from '../utils/logger.js';
import { insertAuditLog, findRoleByName, findUserByEmail, createUser } from '../db/queries/authQueries.js';
import {
  listUsers,
  findUserWithRole,
  updateUserStatus,
  updateUserRole,
  softDeleteUser,
} from '../db/queries/userQueries.js';

const SALT_ROUNDS = 12;
const mkErr = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });

export const listUsersService = async (queryParams = {}) => {
  const limit  = Math.min(parseInt(queryParams.limit, 10) || 50, 200);
  const offset = Math.max(parseInt(queryParams.offset, 10) || 0, 0);
  const role   = queryParams.role || null;
  const search = queryParams.search || null;
  const isActive = queryParams.isActive === undefined ? null : queryParams.isActive === 'true' || queryParams.isActive === true;

  const { rows, total } = await listUsers({ role, isActive, search, limit, offset });
  return {
    data: rows,
    pagination: {
      total,
      limit,
      offset,
      page: Math.floor(offset / limit) + 1,
      pages: Math.ceil(total / limit),
    },
  };
};

export const getUserService = async (id) => {
  const user = await findUserWithRole(id);
  if (!user) throw mkErr('USER_NOT_FOUND', 404);
  return user;
};

export const createUserService = async ({ email, phone = null, password, firstName, lastName, roleName = 'customer', branchId = null }, meta = {}) => {
  const existing = await findUserByEmail(email);
  if (existing) throw mkErr('EMAIL_ALREADY_EXISTS', 409);

  const role = await findRoleByName(roleName);
  if (!role) throw mkErr('ROLE_NOT_FOUND', 404);

  const passwordHash = await bcrypt.hash(password || 'BankShield@123!', SALT_ROUNDS);
  const newUser = await createUser({
    email,
    phone,
    passwordHash,
    firstName,
    lastName,
    roleId: role.id,
  });

  await insertAuditLog({
    userId    : meta.actorId,
    action    : 'USER_CREATED',
    entityType: 'user',
    entityId  : newUser.id,
    newValue  : { email, role: roleName },
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  }).catch((e) => logger.warn(`Audit log failed: ${e.message}`));

  logger.info(`User created: ${email} (${roleName})`);
  return findUserWithRole(newUser.id);
};

export const updateUserStatusService = async (id, isActive, meta = {}) => {
  const user = await findUserWithRole(id);
  if (!user) throw mkErr('USER_NOT_FOUND', 404);

  const updated = await updateUserStatus(id, Boolean(isActive));

  await insertAuditLog({
    userId    : meta.actorId,
    action    : isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    entityType: 'user',
    entityId  : id,
    newValue  : { is_active: Boolean(isActive) },
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  }).catch((e) => logger.warn(`Audit log failed: ${e.message}`));

  return findUserWithRole(id);
};

export const updateUserRoleService = async (id, roleName, meta = {}) => {
  const user = await findUserWithRole(id);
  if (!user) throw mkErr('USER_NOT_FOUND', 404);

  const role = await findRoleByName(roleName);
  if (!role) throw mkErr('ROLE_NOT_FOUND', 404);

  await updateUserRole(id, role.id);

  await insertAuditLog({
    userId    : meta.actorId,
    action    : 'USER_ROLE_UPDATED',
    entityType: 'user',
    entityId  : id,
    newValue  : { role: roleName, roleId: role.id },
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  }).catch((e) => logger.warn(`Audit log failed: ${e.message}`));

  return findUserWithRole(id);
};

export const deleteUserService = async (id, meta = {}) => {
  const user = await findUserWithRole(id);
  if (!user) throw mkErr('USER_NOT_FOUND', 404);

  await softDeleteUser(id);

  await insertAuditLog({
    userId    : meta.actorId,
    action    : 'USER_DELETED',
    entityType: 'user',
    entityId  : id,
    newValue  : { deleted: true },
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  }).catch((e) => logger.warn(`Audit log failed: ${e.message}`));

  return { id, deleted: true };
};
