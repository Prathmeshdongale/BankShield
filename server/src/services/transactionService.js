/**
 * transactionService.js — Complete transaction business logic.
 *
 * Transaction types supported:
 *   deposit()                — external credit into an account (branch/NEFT/RTGS)
 *   withdraw()               — cash withdrawal (branch/ATM)
 *   transfer()               — peer-to-peer fund transfer (web/mobile/UPI/NEFT/RTGS/IMPS)
 *   cardPayment()            — POS/online/contactless card payment
 *   upiPayment()             — UPI channel simulation
 *   atmWithdrawal()          — ATM channel simulation (checks ATM card limits)
 *   onlinePayment()          — web/mobile channel card payment simulation
 *   reverseTransactionService() — compensating reversal ledger transaction
 *   listTransactions()       — paginated search
 *   getTransaction()         — single transaction by id or ref
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
 * ── FRAUD SCORING & LEDGER SAFETY ────────────────────────────────────────────
 * Fraud scoring is evaluated BEFORE balance movements.
 * If ML returns decision == 'BLOCK' (or isFraud == true):
 *   - The transaction row is recorded with status = 'blocked', is_fraud = true
 *   - Account balances are NEVER debited or credited
 *   - Fraud alert and audit logs are recorded
 *
 * ── IMMUTABILITY ─────────────────────────────────────────────────────────────
 * Transactions are NEVER deleted or retroactively modified.
 * Only status transitions are permitted (via updateTransactionStatus).
 * A reversal creates a new compensating transaction row (txn_type = 'reversal').
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
 * @param {object} account
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

/**
 * scoreTransaction — Fraud scoring hook.
 *
 * Evaluates transaction risk using fraudEngineService.
 * Passes database client so predictions and alerts are transaction-consistent.
 *
 * @param {object} txn      Transaction DB row
 * @param {object} context  { account, card, channel, amount, currency, meta }
 * @param {object} client   Postgres pool client
 * @returns {{ riskScore, isFraud, flag, reasons, decision, finalStatus, alertId }}
 */
export const scoreTransaction = async (txn, context = {}, client = null) => {
  try {
    return await evaluateTransactionRisk(txn, context, client);
  } catch (err) {
    logger.error(`[scoreTransaction] Unhandled error: ${err.message}`);
    return {
      riskScore   : 0.0,
      riskLevel   : 'LOW',
      decision    : 'APPROVE',
      isFraud     : false,
      flag        : false,
      finalStatus : 'completed',
      reasons     : [],
      shapValues  : [],
      is_fallback : true,
    };
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
 *   5. Fraud risk evaluation (PRE-BALANCE MOVEMENT)
 *   6. If blocked: set status = 'blocked', commit without balance modification
 *   7. If allowed: update account balance(s) and set status = 'completed' or 'flagged'
 *   8. Register idempotency key
 *   9. COMMIT
 *  10. Post-commit: write audit log
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
  if (idempotencyKey && idempotencyAcct) {
    const existing = await findIdempotencyKey(idempotencyKey, idempotencyAcct);
    if (existing) {
      const original = await findTransactionById(existing.transaction_id);
      logger.info(`[idempotency] Duplicate key ${idempotencyKey} → txn ${original?.id}`);
      return { transaction: original, duplicate: true };
    }
  }

  const client = await getClient();
  let txn, finalStatus, scoreResult = null;

  try {
    await client.query('BEGIN');

    // ── 2. Lock account(s) — advisory lock + FOR UPDATE ─────────────────────
    let srcAcct = null, dstAcct = null;

    if (sourceAccountId && destinationAccountId) {
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
    if (sourceAccountId) {
      if (!srcAcct) throw mkErr('SOURCE_ACCOUNT_NOT_FOUND', 404);
      assertAccountStatus(srcAcct, 'debit', 'SOURCE_ACCOUNT_NOT_ACTIVE');
      if (parseFloat(srcAcct.balance) < parseFloat(amount)) {
        throw mkErr('INSUFFICIENT_FUNDS', 422);
      }
    }
    if (destinationAccountId) {
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

    // ── 5. FRAUD SCORING (PRE-BALANCE-MOVEMENT) ──────────────────────────────
    const scoreCtx = {
      account : srcAcct ?? dstAcct,
      card    : cardId ?? null,
      channel,
      amount,
      currency,
      meta,
    };

    try {
      scoreResult = await scoreTransaction(txn, scoreCtx, client);
    } catch (err) {
      logger.warn(`[transaction] Fraud scoring failed: ${err.message}`);
      scoreResult = {
        riskScore   : 0.0,
        riskLevel   : 'LOW',
        decision    : 'APPROVE',
        isFraud     : false,
        flag        : false,
        finalStatus : 'completed',
        reasons     : [],
        shapValues  : [],
        is_fallback : true,
      };
    }

    const isBlocked = scoreResult.decision === 'BLOCK' || scoreResult.isFraud === true || scoreResult.finalStatus === 'blocked';

    if (isBlocked) {
      // ── FRAUD BLOCKED: Do NOT move any account balances ───────────────────
      finalStatus = 'blocked';
      txn = await updateTransactionStatus(txn.id, {
        status      : 'blocked',
        riskScore   : scoreResult.riskScore,
        isFraud     : true,
        flaggedAt   : new Date().toISOString(),
      }, client);

      if (idempotencyKey && idempotencyAcct) {
        await saveIdempotencyKey(idempotencyKey, idempotencyAcct, txn.id, client);
      }

      await client.query('COMMIT');

      // Post-commit: audit log
      insertAuditLog({
        userId    : actorId,
        action    : `TXN_${txnType.toUpperCase()}_BLOCKED`,
        entityType: 'transaction',
        entityId  : txn.id,
        newValue  : {
          ref       : txn.transaction_ref,
          amount,
          currency,
          channel,
          srcAcct   : sourceAccountId,
          dstAcct   : destinationAccountId,
          status    : 'blocked',
          riskScore : scoreResult.riskScore,
          reasons   : scoreResult.reasons,
        },
        ipAddress : meta.ipAddress,
        userAgent : meta.userAgent,
        status    : 'blocked',
      }).catch((e) => logger.warn(`Audit log write failed: ${e.message}`));

      logger.warn(`[transaction] BLOCKED ${txn.transaction_ref} ${txnType} ${amount} ${currency} — fraud score ${scoreResult.riskScore}`);

      return {
        transaction: txn,
        duplicate  : false,
        blocked    : true,
        fraud      : {
          riskScore   : scoreResult.riskScore,
          riskLevel   : scoreResult.riskLevel,
          decision    : 'BLOCK',
          isFraud     : true,
          flag        : false,
          finalStatus : 'blocked',
          alertId     : scoreResult.alertId ?? null,
          is_fallback : scoreResult.is_fallback ?? false,
          shapValues  : scoreResult.shapValues ?? [],
        },
      };
    }

    // ── 6. NOT BLOCKED: Update account balance(s) ───────────────────────────
    if (sourceAccountId) {
      const debited = await debitAccount(sourceAccountId, amount, client);
      if (!debited) {
        throw mkErr('INSUFFICIENT_FUNDS', 422);
      }
    }
    if (destinationAccountId) {
      await creditAccount(destinationAccountId, amount, client);
    }

    finalStatus = scoreResult.finalStatus || 'completed';
    txn = await updateTransactionStatus(txn.id, {
      status      : finalStatus,
      riskScore   : scoreResult.riskScore,
      isFraud     : false,
      flaggedAt   : scoreResult.flag ? new Date().toISOString() : null,
      completedAt : finalStatus === 'completed' ? new Date().toISOString() : null,
    }, client);

    // ── 7. Register idempotency key ─────────────────────────────────────────
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

  // ── 8. Post-commit: audit log ─────────────────────────────────────────────
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
  }).catch((e) => logger.warn(`Audit log write failed: ${e.message}`));

  logger.info(`[transaction] ${txn.transaction_ref} ${txnType} ${amount} ${currency} — ${finalStatus}`);
  return {
    transaction: txn,
    duplicate  : false,
    blocked    : false,
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

// ── 1. DEPOSIT ───────────────────────────────────────────────────────────────
/**
 * Credit funds into an account (external source).
 * Channels: branch, neft, rtgs, imps, api
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

// ── 2. WITHDRAWAL ────────────────────────────────────────────────────────────
/**
 * Debit funds from an account (cash withdrawal).
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

// ── 3. FUND TRANSFER ─────────────────────────────────────────────────────────
/**
 * Move funds from sourceAccountId to destinationAccountId.
 * Channels: web, mobile, upi, neft, rtgs, imps, branch, api
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

// ── 4. CARD PAYMENT ──────────────────────────────────────────────────────────
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

// ── 5. UPI PAYMENT (simulation) ──────────────────────────────────────────────
/**
 * UPI-channel transfer or merchant payment.
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
 * ATM cash withdrawal with active debit card.
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

// ── 8. TRANSACTION REVERSAL ──────────────────────────────────────────────────
/**
 * Compensating transaction to reverse an already settled transaction.
 *
 * ACID Rules:
 *   - Can only reverse 'completed' transactions
 *   - Locks accounts in deterministic UUID order
 *   - Verifies debtor balance before debiting
 *   - Creates new transaction with txn_type = 'reversal'
 *   - Updates original transaction with status = 'reversed'
 */
export const reverseTransactionService = async ({ transactionId, reason }, meta = {}) => {
  const { actorId, ipAddress, userAgent } = extractMeta(meta);

  const originalTxn = await findTransactionById(transactionId);
  if (!originalTxn) {
    throw mkErr('TRANSACTION_NOT_FOUND', 404);
  }

  if (originalTxn.status === 'reversed') {
    throw mkErr('TRANSACTION_ALREADY_REVERSED', 409);
  }

  if (originalTxn.status !== 'completed') {
    throw mkErr('TRANSACTION_CANNOT_BE_REVERSED', 422);
  }

  const amount = parseFloat(originalTxn.amount);
  const sourceAccountId = originalTxn.source_account_id;
  const destinationAccountId = originalTxn.destination_account_id;

  const client = await getClient();
  let reversalTxn;

  try {
    await client.query('BEGIN');

    let srcAcct = null, dstAcct = null;
    if (sourceAccountId && destinationAccountId) {
      const [first, second] = sourceAccountId < destinationAccountId
        ? [sourceAccountId, destinationAccountId]
        : [destinationAccountId, sourceAccountId];
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1)), pg_advisory_xact_lock(hashtext($2));`,
        [first, second]
      );
      [srcAcct, dstAcct] = await lockTwoAccounts(sourceAccountId, destinationAccountId, client);
    } else if (destinationAccountId) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1));`, [destinationAccountId]);
      dstAcct = await lockAccount(destinationAccountId, client);
    } else if (sourceAccountId) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1));`, [sourceAccountId]);
      srcAcct = await lockAccount(sourceAccountId, client);
    }

    // Debit the account that originally received funds (if any)
    if (destinationAccountId) {
      if (parseFloat(dstAcct.balance) < amount) {
        throw mkErr('INSUFFICIENT_FUNDS_FOR_REVERSAL', 422);
      }
      const debited = await debitAccount(destinationAccountId, amount, client);
      if (!debited) throw mkErr('INSUFFICIENT_FUNDS_FOR_REVERSAL', 422);
    }

    // Credit back the account that originally was debited (if any)
    if (sourceAccountId) {
      await creditAccount(sourceAccountId, amount, client);
    }

    // Insert compensating reversal transaction
    const reversalRef = generateTransactionRef();
    reversalTxn = await insertTransaction({
      transactionRef      : reversalRef,
      sourceAccountId     : destinationAccountId,
      destinationAccountId: sourceAccountId,
      cardId              : originalTxn.card_id,
      amount,
      currency            : originalTxn.currency,
      txnType             : 'reversal',
      status              : 'completed',
      completedAt         : new Date().toISOString(),
      description         : reason ? `Reversal: ${reason}` : `Reversal of ${originalTxn.transaction_ref}`,
      channel             : originalTxn.channel,
      reversalTxnId       : originalTxn.id,
      metadata            : { originalTransactionRef: originalTxn.transaction_ref, reason },
    }, client);

    // Update original transaction
    await updateTransactionStatus(originalTxn.id, {
      status       : 'reversed',
      reversedAt   : new Date().toISOString(),
      reversalTxnId: reversalTxn.id,
    }, client);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(`[transaction] ROLLBACK Reversal: ${err.message}`);
    throw err;
  } finally {
    client.release();
  }

  // Audit log
  insertAuditLog({
    userId    : actorId,
    action    : 'TXN_REVERSAL_COMPLETED',
    entityType: 'transaction',
    entityId  : originalTxn.id,
    newValue  : {
      originalRef: originalTxn.transaction_ref,
      reversalRef: reversalTxn.transaction_ref,
      amount,
      reason,
    },
    ipAddress,
    userAgent,
    status    : 'success',
  }).catch((e) => logger.warn(`Audit log write failed: ${e.message}`));

  logger.info(`[transaction] Reversed ${originalTxn.transaction_ref} with ${reversalTxn.transaction_ref}`);
  return {
    originalTransaction: originalTxn,
    reversalTransaction: reversalTxn,
  };
};

// ── 9. GET TRANSACTION ────────────────────────────────────────────────────────
export const getTransactionService = async (idOrRef) => {
  const isRef = idOrRef.startsWith('TXN-');
  const txn   = isRef
    ? await findTransactionByRef(idOrRef)
    : await findTransactionById(idOrRef);
  if (!txn) throw mkErr('TRANSACTION_NOT_FOUND', 404);
  return txn;
};

// ── 10. LIST TRANSACTIONS ─────────────────────────────────────────────────────
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

// Legacy exports
export const createTransfer = transferService;
export const getTransactions = listTransactionsService;
export default {
  depositService,
  withdrawService,
  transferService,
  cardPaymentService,
  upiPaymentService,
  atmWithdrawalService,
  onlinePaymentService,
  reverseTransactionService,
  getTransactionService,
  listTransactionsService,
  createTransfer,
  getTransactions,
};
