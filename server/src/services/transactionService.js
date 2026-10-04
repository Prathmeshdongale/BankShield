/**
 * transactionService.js — Complete transaction business logic.
 *
 * Transaction types supported:
 *   deposit()      — external credit into an account (branch/NEFT/RTGS)
 *   withdraw()     — cash withdrawal (branch/ATM)
 *   transfer()     — peer-to-peer fund transfer (web/mobile/UPI/NEFT/RTGS/IMPS)
 *   cardPayment()  — POS/online/contactless card payment
 *   upiPayment()   — UPI channel simulation
 *   atmWithdrawal()— ATM channel simulation (checks ATM card limits)
 *   onlinePayment()— web/mobile channel card payment simulation
 *   listTransactions() — paginated search
 *   getTransaction()   — single transaction by id or ref
 *
 * ── CONCURRENCY ──────────────────────────────────────────────────────────────
 * Every debit/credit path uses:
 *   BEGIN → SELECT ... FOR UPDATE → balance check → INSERT → UPDATE → COMMIT
 *
 * Two-account transfers lock accounts in DETERMINISTIC UUID ORDER to prevent
 * deadlocks when two concurrent transfers involve the same pair of accounts
 * in opposite directions (see lockTwoAccounts in transactionQueries.js).
 *
 * ── IDEMPOTENCY ──────────────────────────────────────────────────────────────
 * Callers may pass an `idempotencyKey` (e.g. UUID v4 generated client-side).
 * If the same (idempotencyKey, accountId) pair arrives again, the original
 * transaction row is returned immediately — no duplicate debit/credit.
 *
 * ── FRAUD SCORING HOOK ───────────────────────────────────────────────────────
 * After the transaction is inserted and before the final COMMIT, the function:
 *
 *   scoreTransaction(txn, context)
 *
 * is called. It is deliberately a no-op stub so the ML fraud module can drop in
 * without touching any transaction logic. See the clearly-marked section below.
 *
 * ── IMMUTABILITY ─────────────────────────────────────────────────────────────
 * Transactions are NEVER deleted or retroactively modified.
 * Only status transitions are permitted (via updateTransactionStatus).
 * A "reversal" creates a new transaction row, does NOT touch the original.
 *
 * ── RBAC ─────────────────────────────────────────────────────────────────────
 * Enforced at route level:
 *   transactions:read    → all roles
 *   transactions:create  → super_admin, admin, branch_manager, teller, customer
 *   transactions:reverse → super_admin, admin
 */

import crypto          from 'crypto';
import { logger }      from '../utils/logger.js';
import { getClient }   from '../db/connection.js';
import { insertAuditLog } from '../db/queries/authQueries.js';
import { evaluateTransactionRisk } from './fraudEngineService.js';
import {
  ensureIdempotencyTable,
  findIdempotencyKey,
  saveIdempotencyKey,
  generateTransactionRef,
  lockAccount,
  lockTwoAccounts,
  creditAccount,
  debitAccount,
  insertTransaction,
  updateTransactionStatus,
  checkCardLimits,
  findTransactionById,
  findTransactionByRef,
  listTransactions    as dbListTransactions,
} from '../db/queries/transactionQueries.js';
import { findAccountById, lockAccountById } from '../db/queries/accountQueries.js';
import { findCardById }                     from '../db/queries/cardQueries.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const mkErr = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });

const ACTIVE_STATUSES   = new Set(['active']);
const DEBIT_STATUSES    = new Set(['active']);       // account must be active to debit
const CREDIT_STATUSES   = new Set(['active', 'dormant']); // dormant accounts may receive credits

/**
 * Validate that account status permits the operation.
 * @param {string} status  — current account status
 * @param {'debit'|'credit'} direction
 * @param {string} errorCode  — error code to throw
 */
const assertAccountStatus = (account, direction, errorCode) => {
  const allowed = direction === 'debit' ? DEBIT_STATUSES : CREDIT_STATUSES;
  if (!allowed.has(account.status)) {
    throw mkErr(errorCode, 409);
  }
};

/** Extract IP / user-agent / device metadata from a meta object. */
const extractMeta = (meta = {}) => ({
  ipAddress  : meta.ipAddress  ?? null,
  userAgent  : meta.userAgent  ?? null,
  actorId    : meta.actorId    ?? null,
  location   : meta.location   ?? null,
  deviceFp   : meta.deviceFingerprint ?? null,
});

// ─────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────
//  ███████╗ ██████╗ ██████╗ ██████╗ ███████╗    ██╗  ██╗ ██████╗  ██████╗ ██╗  ██╗
//  ██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝    ██║  ██║██╔═══██╗██╔═══██╗██║ ██╔╝
//  ███████╗██║     ██║   ██║██████╔╝█████╗      ███████║██║   ██║██║   ██║█████╔╝
//  ╚════██║██║     ██║   ██║██╔══██╗██╔══╝      ██╔══██║██║   ██║██║   ██║██╔═██╗
//  ███████║╚██████╗╚██████╔╝██║  ██║███████╗    ██║  ██║╚██████╔╝╚██████╔╝██║  ██╗
//  ╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝    ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝
//
//  FRAUD SCORING HOOK — scoreTransaction(txn, context)
//
//  This function is called INSIDE the database transaction, AFTER the
//  transaction row has been inserted and BEFORE the COMMIT.
//
//  Replace the body of this function with your ML fraud-scoring integration.
//  Return shape:
//    { riskScore: number (0–1), isFraud: boolean, flag: boolean, reasons: string[] }
//
//  - riskScore: 0.0 = clean, 1.0 = certain fraud
//  - isFraud  : true  → transaction marked as is_fraud = TRUE, status = 'blocked'
//  - flag     : true  → status = 'flagged', risk score recorded
//  - reasons  : array of human-readable trigger strings stored in metadata
//
//  The hook receives:
//    txn     — the inserted transaction row (from insertTransaction RETURNING)
//    context — { account, card?, channel, amount, currency, meta }
//
//  IMPORTANT: Do NOT call external HTTP services from inside this function
//  if they might fail (it would roll back the ledger entry). Perform async
//  scoring AFTER commit and update the transaction row via updateTransactionStatus.
//  The stub below follows this safe pattern.
// ──────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * scoreTransaction — Fraud scoring hook.
 *
 * Called POST-COMMIT so ML service failures never roll back a ledger entry.
 * Delegates to fraudEngineService which:
 *   1. Builds the 18-feature ML payload from live DB data
 *   2. Calls the FastAPI /predict endpoint (800 ms timeout + fallback)
 *   3. Stores fraud_predictions row
 *   4. Updates transaction status (flagged/blocked/completed)
 *   5. Creates fraud_alerts for HIGH/CRITICAL risk
 *   6. Sends email + in-app notifications async
 *
 * @param {object} txn      Committed transaction DB row (RETURNING *)
 * @param {object} context  { account, card, channel, amount, currency, meta }
 * @returns {{ riskScore, isFraud, flag, reasons }}
 */
export const scoreTransaction = async (txn, context = {}) => {
  try {
    return await evaluateTransactionRisk(txn, context);
  } catch (err) {
    logger.error(`[scoreTransaction] Unhandled error: ${err.message}`);
    return { riskScore: 0.0, isFraud: false, flag: false, reasons: [] };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP INIT
// ─────────────────────────────────────────────────────────────────────────────

export const initTransactionTables = async () => {
  await ensureIdempotencyTable();
  logger.info('Transaction idempotency table verified.');
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: core transaction execution engine
// All public service functions funnel through _executeTransaction.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * _executeTransaction — the single atomic unit that wraps every money movement.
 *
 * Steps (all inside BEGIN/COMMIT):
 *   1. Idempotency check
 *   2. Lock account(s) with SELECT ... FOR UPDATE
 *   3. Business rule checks (status, balance, card limits)
 *   4. Insert transaction row (status = 'processing')
 *   5. Update account balance(s)
 *   6. Call scoreTransaction hook (post-insert, pre-commit)
 *   7. Update transaction status based on score result
 *   8. Register idempotency key
 *   9. COMMIT
 *  10. Post-commit: write audit log
 *
 * @param {object} opts
 * @param {string}   opts.idempotencyKey   — client-supplied idempotency key
 * @param {string}   opts.idempotencyAcct  — account to scope idempotency to
 * @param {'deposit'|'withdrawal'|'transfer'|'payment'} opts.operation
 * @param {string|null} opts.sourceAccountId
 * @param {string|null} opts.destinationAccountId
 * @param {string|null} opts.cardId
 * @param {number}   opts.amount
 * @param {string}   opts.currency
 * @param {string}   opts.txnType          — txn_type enum value
 * @param {string}   opts.channel
 * @param {string}   [opts.description]
 * @param {string}   [opts.merchantName]
 * @param {string}   [opts.merchantCategory]
 * @param {object}   [opts.metadata]
 * @param {object}   opts.meta             — { actorId, ipAddress, userAgent, location, deviceFp }
 */
const _executeTransaction = async ({
  idempotencyKey,
  idempotencyAcct,
  operation,
  sourceAccountId      = null,
  destinationAccountId = null,
  cardId               = null,
  amount,
  currency             = 'INR',
  txnType,
  channel,
  description          = null,
  merchantName         = null,
  merchantCategory     = null,
  metadata             = null,
  meta                 = {},
}) => {
  const { actorId, ipAddress, deviceFp, location } = extractMeta(meta);
  const locationCity    = location?.city    ?? null;
  const locationCountry = location?.country ?? null;

  // ── 1. Idempotency check (BEFORE acquiring a client) ─────────────────────
  // Do this outside any transaction to avoid the double-release bug.
  if (idempotencyKey && idempotencyAcct) {
    const existing = await findIdempotencyKey(idempotencyKey, idempotencyAcct);
    if (existing) {
      const original = await findTransactionById(existing.transaction_id);
      logger.info(`[idempotency] Duplicate key ${idempotencyKey} → txn ${original?.id}`);
      return { transaction: original, duplicate: true };
    }
  }

  const client = await getClient();
  let txn, finalStatus, scoreCtx;

  try {
    await client.query('BEGIN');

    // ── 2. Lock account(s) — advisory lock + FOR UPDATE ─────────────────────
    // pg_try_advisory_xact_lock uses a 64-bit key derived from the UUID.
    // It's automatically released at COMMIT/ROLLBACK. Combined with
    // SELECT ... FOR UPDATE this handles both Neon pooler (transaction mode)
    // and standard PostgreSQL serialization.
    let srcAcct = null, dstAcct = null;

    if (sourceAccountId && destinationAccountId) {
      // Acquire advisory locks in consistent UUID order (deadlock prevention)
      const [first, second] = sourceAccountId < destinationAccountId
        ? [sourceAccountId, destinationAccountId]
        : [destinationAccountId, sourceAccountId];
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1)), pg_advisory_xact_lock(hashtext($2));`,
        [first, second]
      );
      [srcAcct, dstAcct] = await lockTwoAccounts(sourceAccountId, destinationAccountId, client);
    } else if (sourceAccountId) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1));`, [sourceAccountId]);
      srcAcct = await lockAccount(sourceAccountId, client);
    } else if (destinationAccountId) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1));`, [destinationAccountId]);
      dstAcct = await lockAccount(destinationAccountId, client);
    }

    // ── 3. Business rule checks ───────────────────────────────────────────────

    if (srcAcct) {
      if (!srcAcct) throw mkErr('SOURCE_ACCOUNT_NOT_FOUND', 404);
      assertAccountStatus(srcAcct, 'debit', 'SOURCE_ACCOUNT_NOT_ACTIVE');
      if (parseFloat(srcAcct.balance) < parseFloat(amount)) {
        throw mkErr('INSUFFICIENT_FUNDS', 422);
      }
    }
    if (dstAcct) {
      if (!dstAcct) throw mkErr('DEST_ACCOUNT_NOT_FOUND', 404);
      assertAccountStatus(dstAcct, 'credit', 'DEST_ACCOUNT_NOT_ACTIVE');
    }

    // Card limit checks (only for card-based transactions)
    if (cardId) {
      const card = await findCardById(cardId, client);
      if (!card) throw mkErr('CARD_NOT_FOUND', 404);
      if (card.status !== 'active') throw mkErr('CARD_NOT_ACTIVE', 409);

      const txnDate = new Date().toISOString();
      const limitCheck = await checkCardLimits(cardId, amount, channel, txnDate, client);
      if (!limitCheck.allowed) {
        throw Object.assign(
          mkErr('CARD_LIMIT_EXCEEDED', 422),
          { limitType: limitCheck.violated, limitAmount: limitCheck.limitAmount }
        );
      }
    }

    // ── 4. Insert transaction row (status = 'processing') ────────────────────
    const transactionRef = generateTransactionRef();
    txn = await insertTransaction({
      transactionRef,
      sourceAccountId,
      destinationAccountId,
      cardId,
      amount,
      currency,
      txnType,
      status: 'processing',
      description,
      merchantName,
      merchantCategory,
      ipAddress,
      deviceFingerprint: deviceFp,
      locationCity,
      locationCountry,
      channel,
      metadata,
    }, client);

    // ── 5. Update account balance(s) ─────────────────────────────────────────
    if (sourceAccountId) {
      const debited = await debitAccount(sourceAccountId, amount, client);
      if (!debited) {
        // The DB rejected the debit — balance was insufficient at commit time
        // (can happen when two concurrent transactions race past the app-level check)
        throw mkErr('INSUFFICIENT_FUNDS', 422);
      }
    }
    if (destinationAccountId) await creditAccount(destinationAccountId, amount, client);

    // ── 6. FRAUD SCORING HOOK — runs POST-COMMIT (safe async path) ───────────
    // scoreTransaction is called AFTER client.release() below, in step 10.
    // Inside the DB transaction we only set status = 'processing' → 'completed'.
    // The fraud engine will override status to flagged/blocked if needed.
    const scoreCtx = {
      account : srcAcct ?? dstAcct,
      card    : cardId ?? null,
      channel,
      amount,
      currency,
      meta,
    };

    // ── 7. Mark transaction completed for now (fraud engine may override) ────
    finalStatus = 'completed';

    txn = await updateTransactionStatus(txn.id, {
      status      : 'completed',
      completedAt : new Date().toISOString(),
    }, client);

    // If we can already tell it's fraudulent from balance/card signals
    // (these were checked in step 3), keep completed status — the fraud
    // engine handles post-commit classification.

    // ── 8. Register idempotency key ───────────────────────────────────────────
    if (idempotencyKey && idempotencyAcct) {
      await saveIdempotencyKey(idempotencyKey, idempotencyAcct, txn.id, client);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(`[transaction] ROLLBACK — ${operation}: ${err.message}`);
    throw err;
  } finally {
    client.release();
  }

  // ── 10. Post-commit: fraud scoring + audit log ───────────────────────────
  // Run these in parallel — neither can roll back the ledger.
  const postCommit = [
    // Fraud scoring (calls ML service, stores prediction, creates alerts, notifies)
    scoreTransaction(txn, scoreCtx).catch(
      (e) => logger.warn(`[post-commit] scoreTransaction failed: ${e.message}`)
    ),
    // Audit log
    insertAuditLog({
      userId    : actorId,
      action    : `TXN_${txnType.toUpperCase()}_${finalStatus.toUpperCase()}`,
      entityType: 'transaction',
      entityId  : txn.id,
      newValue  : {
        ref       : txn.transaction_ref,
        amount,
        currency,
        channel,
        srcAcct   : sourceAccountId,
        dstAcct   : destinationAccountId,
        status    : finalStatus,
      },
      ipAddress : meta.ipAddress,
      userAgent : meta.userAgent,
      status    : 'success',
    }).catch((e) => logger.warn(`Audit log write failed: ${e.message}`)),
  ];

  // Await fraud scoring so the response includes the score
  const [score] = await Promise.allSettled(postCommit);
  const scoreResult = score.status === 'fulfilled' ? score.value : null;

  logger.info(`[transaction] ${txn.transaction_ref} ${txnType} ${amount} ${currency} — ${finalStatus}`);
  return {
    transaction: txn,
    duplicate  : false,
    fraud      : scoreResult ? {
      riskScore   : scoreResult.riskScore,
      riskLevel   : scoreResult.riskLevel,
      decision    : scoreResult.decision,
      isFraud     : scoreResult.isFraud,
      flag        : scoreResult.flag,
      finalStatus : scoreResult.finalStatus,
      alertId     : scoreResult.alertId ?? null,
      is_fallback : scoreResult.is_fallback ?? false,
      shapValues  : scoreResult.shapValues ?? [],
    } : null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC SERVICE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. DEPOSIT ────────────────────────────────────────────────────────────────
/**
 * Credit funds into a single account (no source account).
 * Channels: branch, neft, rtgs, api
 */
export const depositService = async ({
  accountId, amount, currency = 'INR', channel = 'branch',
  description = null, metadata = null, idempotencyKey = null,
}, meta = {}) => {
  const ALLOWED_CHANNELS = ['branch', 'neft', 'rtgs', 'imps', 'api'];
  if (!ALLOWED_CHANNELS.includes(channel)) throw mkErr('INVALID_CHANNEL', 400);

  return _executeTransaction({
    idempotencyKey,
    idempotencyAcct: accountId,
    operation: 'deposit',
    destinationAccountId: accountId,
    amount, currency,
    txnType: 'deposit',
    channel,
    description,
    metadata,
    meta,
  });
};

// ── 2. WITHDRAWAL ─────────────────────────────────────────────────────────────
/**
 * Debit funds from a single account (no destination account).
 * Channels: branch, atm, api
 */
export const withdrawService = async ({
  accountId, amount, currency = 'INR', channel = 'branch',
  description = null, cardId = null, idempotencyKey = null, metadata = null,
}, meta = {}) => {
  const ALLOWED_CHANNELS = ['branch', 'atm', 'api'];
  if (!ALLOWED_CHANNELS.includes(channel)) throw mkErr('INVALID_CHANNEL', 400);

  return _executeTransaction({
    idempotencyKey,
    idempotencyAcct: accountId,
    operation: 'withdrawal',
    sourceAccountId: accountId,
    cardId,
    amount, currency,
    txnType: 'withdrawal',
    channel,
    description,
    metadata,
    meta,
  });
};

// ── 3. FUND TRANSFER ──────────────────────────────────────────────────────────
/**
 * Move funds from sourceAccountId to destinationAccountId.
 * Channels: web, mobile, upi, neft, rtgs, imps, branch
 */
export const transferService = async ({
  sourceAccountId, destinationAccountId, amount, currency = 'INR',
  channel = 'web', description = null, beneficiaryId = null,
  idempotencyKey = null, metadata = null,
}, meta = {}) => {
  if (sourceAccountId === destinationAccountId) {
    throw mkErr('SAME_ACCOUNT_TRANSFER', 400);
  }

  const ALLOWED_CHANNELS = ['web', 'mobile', 'upi', 'neft', 'rtgs', 'imps', 'branch', 'api'];
  if (!ALLOWED_CHANNELS.includes(channel)) throw mkErr('INVALID_CHANNEL', 400);

  return _executeTransaction({
    idempotencyKey,
    idempotencyAcct: sourceAccountId,
    operation: 'transfer',
    sourceAccountId,
    destinationAccountId,
    amount, currency,
    txnType: 'transfer',
    channel,
    description,
    metadata: { ...(metadata ?? {}), beneficiaryId },
    meta,
  });
};

// ── 4. CARD PAYMENT ───────────────────────────────────────────────────────────
/**
 * Debit a card-linked account for a merchant payment.
 * Enforces per-card limits (single_txn, daily_pos, daily_online, monthly).
 */
export const cardPaymentService = async ({
  accountId, cardId, amount, currency = 'INR',
  channel = 'pos', merchantName = null, merchantCategory = null,
  description = null, idempotencyKey = null, metadata = null,
}, meta = {}) => {
  const ALLOWED_CHANNELS = ['pos', 'web', 'mobile', 'atm', 'upi', 'api'];
  if (!ALLOWED_CHANNELS.includes(channel)) throw mkErr('INVALID_CHANNEL', 400);
  if (!cardId) throw mkErr('CARD_REQUIRED', 400);

  return _executeTransaction({
    idempotencyKey,
    idempotencyAcct: accountId,
    operation: 'card_payment',
    sourceAccountId: accountId,
    cardId,
    amount, currency,
    txnType: 'payment',
    channel,
    description,
    merchantName,
    merchantCategory,
    metadata,
    meta,
  });
};

// ── 5. UPI PAYMENT (simulation) ───────────────────────────────────────────────
/**
 * UPI-channel transfer. Functionally identical to transfer but channel = 'upi'.
 * UPI VPA is stored in metadata.
 */
export const upiPaymentService = async ({
  sourceAccountId, destinationAccountId = null,
  amount, currency = 'INR',
  upiVpa = null, description = null,
  idempotencyKey = null, metadata = null,
}, meta = {}) => {
  return _executeTransaction({
    idempotencyKey,
    idempotencyAcct: sourceAccountId,
    operation: 'upi',
    sourceAccountId,
    destinationAccountId,
    amount, currency,
    txnType: destinationAccountId ? 'transfer' : 'payment',
    channel: 'upi',
    description: description ?? `UPI payment to ${upiVpa ?? 'unknown'}`,
    metadata: { ...(metadata ?? {}), upiVpa },
    meta,
  });
};

// ── 6. ATM WITHDRAWAL (simulation) ───────────────────────────────────────────
/**
 * ATM cash withdrawal. Requires an active card on the account.
 * Enforces daily_atm and single_txn card limits.
 */
export const atmWithdrawalService = async ({
  accountId, cardId, amount, currency = 'INR',
  locationCity = null, idempotencyKey = null,
}, meta = {}) => {
  if (!cardId) throw mkErr('CARD_REQUIRED', 400);
  return _executeTransaction({
    idempotencyKey,
    idempotencyAcct: accountId,
    operation: 'atm_withdrawal',
    sourceAccountId: accountId,
    cardId,
    amount, currency,
    txnType: 'withdrawal',
    channel: 'atm',
    description: 'ATM cash withdrawal',
    metadata: { locationCity },
    meta: { ...meta, location: { city: locationCity ?? null, country: meta.location?.country ?? null } },
  });
};

// ── 7. ONLINE PAYMENT (simulation) ───────────────────────────────────────────
/**
 * Online (web/mobile) card payment.
 * Enforces daily_online and single_txn card limits.
 */
export const onlinePaymentService = async ({
  accountId, cardId, amount, currency = 'INR',
  merchantName = null, merchantCategory = null,
  description = null, channel = 'web',
  idempotencyKey = null, metadata = null,
}, meta = {}) => {
  if (!cardId) throw mkErr('CARD_REQUIRED', 400);
  const ALLOWED = ['web', 'mobile'];
  if (!ALLOWED.includes(channel)) throw mkErr('INVALID_CHANNEL', 400);

  return _executeTransaction({
    idempotencyKey,
    idempotencyAcct: accountId,
    operation: 'online_payment',
    sourceAccountId: accountId,
    cardId,
    amount, currency,
    txnType: 'payment',
    channel,
    description,
    merchantName,
    merchantCategory,
    metadata,
    meta,
  });
};

// ── 8. GET TRANSACTION ────────────────────────────────────────────────────────

export const getTransactionService = async (idOrRef) => {
  // Accept UUID or transaction_ref (TXN-YYYYMMDD-XXXXXXXX)
  const isRef = idOrRef.startsWith('TXN-');
  const txn   = isRef
    ? await findTransactionByRef(idOrRef)
    : await findTransactionById(idOrRef);
  if (!txn) throw mkErr('TRANSACTION_NOT_FOUND', 404);
  return txn;
};

// ── 9. LIST TRANSACTIONS ──────────────────────────────────────────────────────

export const listTransactionsService = async (queryParams = {}) => {
  const limit  = Math.min(parseInt(queryParams.limit,  10) || 50, 200);
  const offset = Math.max(parseInt(queryParams.offset, 10) || 0,  0);
  const page   = Math.floor(offset / limit) + 1;

  const isFraud = queryParams.isFraud === undefined ? null
    : queryParams.isFraud === 'true' || queryParams.isFraud === true;

  const minAmount = queryParams.minAmount != null ? parseFloat(queryParams.minAmount) : null;
  const maxAmount = queryParams.maxAmount != null ? parseFloat(queryParams.maxAmount) : null;

  const { rows, total } = await dbListTransactions({
    accountId  : queryParams.accountId   || null,
    customerId : queryParams.customerId  || null,
    status     : queryParams.status      || null,
    txnType    : queryParams.txnType     || null,
    channel    : queryParams.channel     || null,
    isFraud,
    dateFrom   : queryParams.dateFrom    || null,
    dateTo     : queryParams.dateTo      || null,
    minAmount,
    maxAmount,
    sortDir    : queryParams.sortDir     || 'DESC',
    limit,
    offset,
  });

  return {
    data      : rows,
    pagination: { total, limit, offset, page, pages: Math.ceil(total / limit) },
  };
};

// Legacy export so existing fraudRoutes/transactionRoutes don't break
export const createTransfer = transferService;
export const getTransactions = listTransactionsService;
export default { createTransfer, getTransactions };
