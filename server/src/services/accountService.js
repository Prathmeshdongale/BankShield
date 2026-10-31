/**
 * accountService.js — Business logic for accounts module.
 *
 * Endpoints:
 *   openAccount       POST   /api/accounts
 *   getAccount        GET    /api/accounts/:id
 *   listAccounts      GET    /api/accounts
 *   updateAccount     PATCH  /api/accounts/:id
 *   freezeAccount     PATCH  /api/accounts/:id/freeze
 *   activateAccount   PATCH  /api/accounts/:id/activate
 *   closeAccount      PATCH  /api/accounts/:id/close
 *   getBalance        GET    /api/accounts/:id/balance
 *   getHistory        GET    /api/accounts/:id/history
 *   listAccountTypes  GET    /api/accounts/types
 *
 * RBAC (enforced at route level — permission codes from seeds):
 *   accounts:read    → super_admin, admin, compliance_officer, fraud_analyst,
 *                      branch_manager, teller, customer
 *   accounts:create  → super_admin, admin, branch_manager, teller
 *   accounts:update  → super_admin, admin, branch_manager
 *   accounts:freeze  → super_admin, admin, compliance_officer, branch_manager
 *   accounts:close   → super_admin, admin
 *
 * Every write emits an audit_log entry.
 */

import { logger }         from '../utils/logger.js';
import { getClient }      from '../db/connection.js';
import { insertAuditLog } from '../db/queries/authQueries.js';
import { findCustomerById, findCustomerByUserId } from '../db/queries/customerQueries.js';
import { creditAccount, insertTransaction } from '../db/queries/transactionQueries.js';
import {
  nextAccountNumber,
  listAccountTypes       as dbListAccountTypes,
  findAccountTypeByName,
  findAccountTypeById,
  upsertAccountType,
  findAccountById,
  findAccountByNumber,
  lockAccountById,
  listAccounts           as dbListAccounts,
  createAccount          as dbCreateAccount,
  updateAccount          as dbUpdateAccount,
  setAccountStatus,
  softDeleteAccount,
  getAccountBalance      as dbGetBalance,
  getAccountHistory      as dbGetHistory,
} from '../db/queries/accountQueries.js';

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT TYPES — allowed for opening via API
// ─────────────────────────────────────────────────────────────────────────────

const OPENABLE_TYPES = new Set(['savings', 'current', 'salary', 'business']);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const mkErr = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });

// ─────────────────────────────────────────────────────────────────────────────
// INIT — seed account_types reference rows (idempotent)
// Called once from server.js on startup.
// ─────────────────────────────────────────────────────────────────────────────

const ACCOUNT_TYPE_SEEDS = [
  { typeName: 'savings',           description: 'Standard savings account',                minBalance: 500,   interestRate: 3.5,  maxDailyLimit: 100000  },
  { typeName: 'current',           description: 'Current/checking account for businesses',  minBalance: 10000, interestRate: 0,    maxDailyLimit: 1000000 },
  { typeName: 'salary',            description: 'Zero-balance salary account',              minBalance: 0,     interestRate: 3.0,  maxDailyLimit: 200000  },
  { typeName: 'business',          description: 'Business banking account',                 minBalance: 25000, interestRate: 0,    maxDailyLimit: 5000000 },
  { typeName: 'fixed_deposit',     description: 'Fixed term deposit account',               minBalance: 10000, interestRate: 6.5,  maxDailyLimit: null    },
  { typeName: 'recurring_deposit', description: 'Recurring deposit account',                minBalance: 500,   interestRate: 5.5,  maxDailyLimit: null    },
  { typeName: 'loan',              description: 'Loan disbursement account',                minBalance: 0,     interestRate: 0,    maxDailyLimit: null    },
];

export const initAccountTypes = async () => {
  for (const seed of ACCOUNT_TYPE_SEEDS) {
    await upsertAccountType(seed);
  }
  logger.info('Account types seeded/verified.');
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. LIST ACCOUNT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export const listAccountTypesService = async () => dbListAccountTypes();

// ─────────────────────────────────────────────────────────────────────────────
// 2. OPEN ACCOUNT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open a new account for a customer.
 * @param {object} fields  { customerId, accountType, branchId?, currency?, nomineeName?, jointHolderId? }
 * @param {object} meta    { actorId, ipAddress, userAgent }
 */
export const openAccountService = async (fields, meta = {}) => {
  const {
    customerId, accountType, branchId = null,
    currency = 'INR', nomineeName = null, jointHolderId = null,
    accountNumber: customAccountNumber = null,
    bankName = null, ifscCode = null, initialBalance = null,
  } = fields;

  // 1. Validate account type is openable via API
  if (!OPENABLE_TYPES.has(accountType)) {
    throw mkErr('ACCOUNT_TYPE_NOT_OPENABLE', 400);
  }

  // 2. Verify account type exists and is active
  const accType = await findAccountTypeByName(accountType);
  if (!accType) throw mkErr('ACCOUNT_TYPE_NOT_FOUND', 404);

  // 3. Verify customer exists
  const customer = await findCustomerById(customerId);
  if (!customer) throw mkErr('CUSTOMER_NOT_FOUND', 404);

  // 4. Determine account number
  let finalAccountNumber = customAccountNumber ? String(customAccountNumber).trim().toUpperCase() : null;
  if (finalAccountNumber) {
    const existing = await findAccountByNumber(finalAccountNumber);
    if (existing) {
      if (existing.customer_id === customerId) {
        return findAccountById(existing.id);
      }
      throw mkErr('An account with this account number is already linked to another customer.', 409);
    }
  }

  // 5. Create / Link account inside a transaction
  const client = await getClient();
  let account;
  try {
    await client.query('BEGIN');
    if (!finalAccountNumber) {
      finalAccountNumber = await nextAccountNumber(client);
    }
    account = await dbCreateAccount({
      accountNumber: finalAccountNumber, customerId, branchId, accountTypeId: accType.id,
      currency, nomineeName, jointHolderId,
    }, client);

    // If initial verified balance is provided (from UPI bank linking), credit it immediately
    const initBal = parseFloat(initialBalance);
    if (!isNaN(initBal) && initBal > 0) {
      await creditAccount(account.id, initBal, client);
      await insertTransaction({
        transactionRef: `INIT-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
        destinationAccountId: account.id,
        amount: initBal,
        currency,
        txnType: 'deposit',
        status: 'completed',
        channel: 'branch',
        description: bankName ? `Linked ${bankName} account verified balance` : 'Opening balance for linked bank account',
        riskScore: 0.02,
        isFraud: false,
        completedAt: new Date().toISOString(),
      }, client);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await insertAuditLog({
    userId: meta.actorId, action: 'ACCOUNT_OPENED',
    entityType: 'account', entityId: account.id,
    newValue: { accountNumber: account.account_number, accountType, customerId, bankName, ifscCode },
    ipAddress: meta.ipAddress, userAgent: meta.userAgent, status: 'success',
  });

  logger.info(`Account linked: ${account.account_number} (${accountType}) for customer ${customerId}`);
  // Return full enriched row
  return findAccountById(account.id);
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET ONE
// ─────────────────────────────────────────────────────────────────────────────

export const getAccountService = async (id) => {
  const account = await findAccountById(id);
  if (!account) throw mkErr('ACCOUNT_NOT_FOUND', 404);
  return account;
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. LIST  (paginated + filtered)
// ─────────────────────────────────────────────────────────────────────────────

export const listAccountsService = async (queryParams = {}) => {
  const limit  = Math.min(parseInt(queryParams.limit,  10) || 20, 100);
  const offset = Math.max(parseInt(queryParams.offset, 10) || 0,  0);
  const page   = Math.floor(offset / limit) + 1;

  const { rows, total } = await dbListAccounts({
    customerId  : queryParams.customerId  || null,
    status      : queryParams.status      || null,
    accountType : queryParams.accountType || null,
    branchId    : queryParams.branchId    || null,
    search      : queryParams.search      || null,
    createdFrom : queryParams.createdFrom || null,
    createdTo   : queryParams.createdTo   || null,
    sortBy      : queryParams.sortBy      || 'created_at',
    sortDir     : queryParams.sortDir     || 'DESC',
    limit, offset,
  });

  return {
    data: rows,
    pagination: { total, limit, offset, page, pages: Math.ceil(total / limit) },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. UPDATE (nominee / currency / branch only — safe fields)
// ─────────────────────────────────────────────────────────────────────────────

export const updateAccountService = async (id, fields, meta = {}) => {
  const existing = await findAccountById(id);
  if (!existing) throw mkErr('ACCOUNT_NOT_FOUND', 404);
  if (existing.status === 'closed') throw mkErr('ACCOUNT_CLOSED', 409);

  const updated = await dbUpdateAccount(id, fields);

  await insertAuditLog({
    userId: meta.actorId, action: 'ACCOUNT_UPDATED',
    entityType: 'account', entityId: id,
    oldValue: { nomineeName: existing.nominee_name, branchId: existing.branch_id },
    newValue: fields,
    ipAddress: meta.ipAddress, userAgent: meta.userAgent, status: 'success',
  });

  return findAccountById(id);
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. FREEZE
// ─────────────────────────────────────────────────────────────────────────────

export const freezeAccountService = async (id, meta = {}) => {
  const existing = await findAccountById(id);
  if (!existing) throw mkErr('ACCOUNT_NOT_FOUND', 404);
  if (existing.status === 'frozen')  throw mkErr('ACCOUNT_ALREADY_FROZEN', 409);
  if (existing.status === 'closed')  throw mkErr('ACCOUNT_CLOSED', 409);

  const updated = await setAccountStatus(id, 'frozen');

  await insertAuditLog({
    userId: meta.actorId, action: 'ACCOUNT_FROZEN',
    entityType: 'account', entityId: id,
    oldValue: { status: existing.status },
    newValue: { status: 'frozen' },
    ipAddress: meta.ipAddress, userAgent: meta.userAgent, status: 'success',
  });

  logger.info(`Account frozen: ${existing.account_number}`);
  return updated;
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. ACTIVATE  (unfreeze / dormant → active)
// ─────────────────────────────────────────────────────────────────────────────

export const activateAccountService = async (id, meta = {}) => {
  const existing = await findAccountById(id);
  if (!existing) throw mkErr('ACCOUNT_NOT_FOUND', 404);
  if (existing.status === 'active')  throw mkErr('ACCOUNT_ALREADY_ACTIVE', 409);
  if (existing.status === 'closed')  throw mkErr('ACCOUNT_CLOSED', 409);

  const updated = await setAccountStatus(id, 'active');

  await insertAuditLog({
    userId: meta.actorId, action: 'ACCOUNT_ACTIVATED',
    entityType: 'account', entityId: id,
    oldValue: { status: existing.status },
    newValue: { status: 'active' },
    ipAddress: meta.ipAddress, userAgent: meta.userAgent, status: 'success',
  });

  logger.info(`Account activated: ${existing.account_number}`);
  return updated;
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. CLOSE
// ─────────────────────────────────────────────────────────────────────────────

export const closeAccountService = async (id, meta = {}) => {
  const existing = await findAccountById(id);
  if (!existing) throw mkErr('ACCOUNT_NOT_FOUND', 404);
  if (existing.status === 'closed') throw mkErr('ACCOUNT_ALREADY_CLOSED', 409);

  // If customer role, verify account belongs to them
  if (meta.customerUserId) {
    const cust = await findCustomerByUserId(meta.customerUserId);
    if (!cust || existing.customer_id !== cust.id) {
      throw mkErr('FORBIDDEN', 403);
    }
  }

  // Safety / settlement: if zeroBalance is requested, zero out the balance
  if (meta.zeroBalance && parseFloat(existing.balance) > 0) {
    const client = await getClient();
    try {
      await client.query('UPDATE accounts SET balance = 0.00, updated_at = NOW() WHERE id = $1', [id]);
    } finally {
      client.release();
    }
  } else if (parseFloat(existing.balance) > 0) {
    throw mkErr('ACCOUNT_HAS_BALANCE', 400);
  }

  const updated = await setAccountStatus(id, 'closed', new Date().toISOString().slice(0, 10));

  await insertAuditLog({
    userId: meta.actorId, action: 'ACCOUNT_CLOSED',
    entityType: 'account', entityId: id,
    oldValue: { status: existing.status, balance: existing.balance },
    newValue: { status: 'closed' },
    ipAddress: meta.ipAddress, userAgent: meta.userAgent, status: 'success',
  });

  logger.info(`Account closed: ${existing.account_number}`);
  return updated;
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. GET BALANCE
// ─────────────────────────────────────────────────────────────────────────────

export const getBalanceService = async (id) => {
  const balance = await dbGetBalance(id);
  if (!balance) throw mkErr('ACCOUNT_NOT_FOUND', 404);
  return balance;
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. GET TRANSACTION HISTORY
// ─────────────────────────────────────────────────────────────────────────────

export const getHistoryService = async (id, queryParams = {}) => {
  const account = await findAccountById(id);
  if (!account) throw mkErr('ACCOUNT_NOT_FOUND', 404);

  const limit  = Math.min(parseInt(queryParams.limit,  10) || 30, 100);
  const offset = Math.max(parseInt(queryParams.offset, 10) || 0,  0);
  const page   = Math.floor(offset / limit) + 1;

  const { rows, total } = await dbGetHistory({
    accountId: id,
    status   : queryParams.status   || null,
    txnType  : queryParams.txnType  || null,
    dateFrom : queryParams.dateFrom || null,
    dateTo   : queryParams.dateTo   || null,
    limit, offset,
  });

  return {
    account: {
      id: account.id,
      accountNumber: account.account_number,
      balance: account.balance,
      availableBalance: account.available_balance,
      currency: account.currency,
    },
    transactions: rows,
    pagination: { total, limit, offset, page, pages: Math.ceil(total / limit) },
  };
};
