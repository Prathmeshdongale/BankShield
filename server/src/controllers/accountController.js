/**
 * accountController.js — HTTP handlers for accounts module.
 *
 * Error code → HTTP status map:
 *   ACCOUNT_NOT_FOUND        404
 *   CUSTOMER_NOT_FOUND       404
 *   ACCOUNT_TYPE_NOT_FOUND   404
 *   ACCOUNT_TYPE_NOT_OPENABLE 400
 *   ACCOUNT_CLOSED           409
 *   ACCOUNT_ALREADY_FROZEN   409
 *   ACCOUNT_ALREADY_ACTIVE   409
 *   ACCOUNT_ALREADY_CLOSED   409
 *   ACCOUNT_HAS_BALANCE      400
 */

import {
  initAccountTypes,
  listAccountTypesService,
  openAccountService,
  getAccountService,
  listAccountsService,
  updateAccountService,
  freezeAccountService,
  activateAccountService,
  closeAccountService,
  getBalanceService,
  getHistoryService,
} from '../services/accountService.js';
import { success, failure } from '../utils/response.js';
import { logger }           from '../utils/logger.js';
import { findCustomerByUserId } from '../db/queries/customerQueries.js';

const getMeta = (req) => ({
  actorId  : req.user?.id   ?? null,
  ipAddress: req.ip          ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});

const STATUS_MAP = {
  ACCOUNT_NOT_FOUND        : 404,
  CUSTOMER_NOT_FOUND       : 404,
  ACCOUNT_TYPE_NOT_FOUND   : 404,
  ACCOUNT_TYPE_NOT_OPENABLE: 400,
  ACCOUNT_CLOSED           : 409,
  ACCOUNT_ALREADY_FROZEN   : 409,
  ACCOUNT_ALREADY_ACTIVE   : 409,
  ACCOUNT_ALREADY_CLOSED   : 409,
  ACCOUNT_HAS_BALANCE      : 400,
};

const USER_MESSAGES = {
  ACCOUNT_NOT_FOUND        : 'Account not found.',
  CUSTOMER_NOT_FOUND       : 'Customer not found.',
  ACCOUNT_TYPE_NOT_FOUND   : 'Account type not found.',
  ACCOUNT_TYPE_NOT_OPENABLE: 'This account type cannot be opened via this endpoint.',
  ACCOUNT_CLOSED           : 'Account is already closed.',
  ACCOUNT_ALREADY_FROZEN   : 'Account is already frozen.',
  ACCOUNT_ALREADY_ACTIVE   : 'Account is already active.',
  ACCOUNT_ALREADY_CLOSED   : 'Account is already closed.',
  ACCOUNT_HAS_BALANCE      : 'Account cannot be closed while it holds a balance.',
};

const handleErr = (err, res) => {
  const code   = err.message;
  const status = err.statusCode ?? STATUS_MAP[code] ?? 500;
  const msg    = USER_MESSAGES[code] ?? 'An unexpected error occurred.';
  if (status >= 500) logger.error(`[AccountController] ${err.stack ?? err.message}`);
  return failure(res, msg, status);
};

// GET /api/accounts/types
export const listAccountTypes = async (_req, res) => {
  try {
    const types = await listAccountTypesService();
    return success(res, { types }, 'Account types retrieved.');
  } catch (err) { return handleErr(err, res); }
};

// POST /api/accounts
export const openAccount = async (req, res) => {
  try {
    let { customerId, accountType, branchId, currency, nomineeName, jointHolderId } = req.body;
    if (!customerId && req.user?.role === 'customer') {
      const cust = await findCustomerByUserId(req.user.id);
      if (!cust) return failure(res, 'Customer profile not found for current user.', 404);
      customerId = cust.id;
    }
    const account = await openAccountService(
      { customerId, accountType, branchId, currency, nomineeName, jointHolderId },
      getMeta(req)
    );
    return success(res, { account }, 'Account opened successfully.', 201);
  } catch (err) { return handleErr(err, res); }
};

// GET /api/accounts/:id
export const getAccount = async (req, res) => {
  try {
    const account = await getAccountService(req.params.id);
    return success(res, { account }, 'Account retrieved.');
  } catch (err) { return handleErr(err, res); }
};

// GET /api/accounts
export const listAccounts = async (req, res) => {
  try {
    const result = await listAccountsService(req.query);
    return success(res, result, 'Accounts retrieved.');
  } catch (err) { return handleErr(err, res); }
};

// PATCH /api/accounts/:id
export const updateAccount = async (req, res) => {
  try {
    const { nomineeName, branchId, currency } = req.body;
    const account = await updateAccountService(req.params.id, { nomineeName, branchId, currency }, getMeta(req));
    return success(res, { account }, 'Account updated.');
  } catch (err) { return handleErr(err, res); }
};

// PATCH /api/accounts/:id/freeze
export const freezeAccount = async (req, res) => {
  try {
    const account = await freezeAccountService(req.params.id, getMeta(req));
    return success(res, { account }, 'Account frozen.');
  } catch (err) { return handleErr(err, res); }
};

// PATCH /api/accounts/:id/activate
export const activateAccount = async (req, res) => {
  try {
    const account = await activateAccountService(req.params.id, getMeta(req));
    return success(res, { account }, 'Account activated.');
  } catch (err) { return handleErr(err, res); }
};

// PATCH /api/accounts/:id/close
export const closeAccount = async (req, res) => {
  try {
    const meta = getMeta(req);
    if (req.user?.role === 'customer') {
      meta.customerUserId = req.user.id;
    }
    meta.zeroBalance = req.body?.zeroBalance ?? true;
    const account = await closeAccountService(req.params.id, meta);
    return success(res, { account }, 'Account closed successfully.');
  } catch (err) { return handleErr(err, res); }
};

// GET /api/accounts/:id/balance
export const getBalance = async (req, res) => {
  try {
    const balance = await getBalanceService(req.params.id);
    return success(res, balance, 'Balance retrieved.');
  } catch (err) { return handleErr(err, res); }
};

// GET /api/accounts/:id/history
export const getHistory = async (req, res) => {
  try {
    const result = await getHistoryService(req.params.id, req.query);
    return success(res, result, 'Transaction history retrieved.');
  } catch (err) { return handleErr(err, res); }
};

export default {
  listAccountTypes, openAccount, getAccount, listAccounts,
  updateAccount, freezeAccount, activateAccount, closeAccount,
  getBalance, getHistory,
};
