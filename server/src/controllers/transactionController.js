/**
 * transactionController.js — HTTP handlers for the transaction module.
 *
 * Error code → HTTP status:
 *   SOURCE_ACCOUNT_NOT_FOUND        404
 *   DEST_ACCOUNT_NOT_FOUND          404
 *   CARD_NOT_FOUND                  404
 *   TRANSACTION_NOT_FOUND           404
 *   SOURCE_ACCOUNT_NOT_ACTIVE       409
 *   DEST_ACCOUNT_NOT_ACTIVE         409
 *   CARD_NOT_ACTIVE                 409
 *   TRANSACTION_ALREADY_REVERSED    409
 *   INSUFFICIENT_FUNDS              422
 *   CARD_LIMIT_EXCEEDED             422
 *   TRANSACTION_CANNOT_BE_REVERSED  422
 *   INSUFFICIENT_FUNDS_FOR_REVERSAL 422
 *   SAME_ACCOUNT_TRANSFER           400
 *   INVALID_CHANNEL                 400
 *   CARD_REQUIRED                   400
 */

import {
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
} from '../services/transactionService.js';
import { success, failure } from '../utils/response.js';
import { logger }           from '../utils/logger.js';

// ── helpers ───────────────────────────────────────────────────────────────────

const getMeta = (req) => ({
  actorId  : req.user?.id   ?? null,
  ipAddress: (req.ip || req.headers['x-forwarded-for'] || null),
  userAgent: req.headers['user-agent'] ?? null,
  deviceFingerprint: req.headers['x-device-fingerprint'] ?? null,
  location : {
    city   : req.headers['x-location-city']    ?? null,
    country: req.headers['x-location-country'] ?? 'IN',
  },
});

const STATUS_MAP = {
  SOURCE_ACCOUNT_NOT_FOUND        : 404,
  DEST_ACCOUNT_NOT_FOUND          : 404,
  CARD_NOT_FOUND                  : 404,
  TRANSACTION_NOT_FOUND           : 404,
  SOURCE_ACCOUNT_NOT_ACTIVE       : 409,
  DEST_ACCOUNT_NOT_ACTIVE         : 409,
  CARD_NOT_ACTIVE                 : 409,
  TRANSACTION_ALREADY_REVERSED    : 409,
  INSUFFICIENT_FUNDS              : 422,
  CARD_LIMIT_EXCEEDED             : 422,
  TRANSACTION_CANNOT_BE_REVERSED  : 422,
  INSUFFICIENT_FUNDS_FOR_REVERSAL : 422,
  SAME_ACCOUNT_TRANSFER           : 400,
  INVALID_CHANNEL                 : 400,
  CARD_REQUIRED                   : 400,
};

const USER_MESSAGES = {
  SOURCE_ACCOUNT_NOT_FOUND        : 'Source account not found.',
  DEST_ACCOUNT_NOT_FOUND          : 'Destination account not found.',
  CARD_NOT_FOUND                  : 'Card not found.',
  TRANSACTION_NOT_FOUND           : 'Transaction not found.',
  SOURCE_ACCOUNT_NOT_ACTIVE       : 'Source account is not active.',
  DEST_ACCOUNT_NOT_ACTIVE         : 'Destination account is not active (frozen or closed).',
  CARD_NOT_ACTIVE                 : 'Card is not active.',
  TRANSACTION_ALREADY_REVERSED    : 'This transaction has already been reversed.',
  INSUFFICIENT_FUNDS              : 'Insufficient funds in the source account.',
  CARD_LIMIT_EXCEEDED             : 'Card spending limit exceeded.',
  TRANSACTION_CANNOT_BE_REVERSED  : 'Only completed transactions can be reversed.',
  INSUFFICIENT_FUNDS_FOR_REVERSAL : 'Insufficient funds in the destination account to reverse this transaction.',
  SAME_ACCOUNT_TRANSFER           : 'Source and destination accounts must be different.',
  INVALID_CHANNEL                 : 'Invalid channel for this transaction type.',
  CARD_REQUIRED                   : 'A card is required for this transaction type.',
};

const handleErr = (err, res) => {
  const code   = err.message;
  const status = err.statusCode ?? STATUS_MAP[code] ?? 500;
  const msg    = USER_MESSAGES[code] ?? 'An unexpected error occurred.';
  if (status >= 500) logger.error(`[TxnController] ${err.stack ?? err.message}`);

  const extra = {};
  if (code === 'CARD_LIMIT_EXCEEDED' && err.limitType) {
    extra.limitType   = err.limitType;
    extra.limitAmount = err.limitAmount;
  }
  return failure(res, msg, status, Object.keys(extra).length ? extra : null);
};

// Wrap result to signal idempotent replay with 200 instead of 201
const txnResponse = (res, result, msg) =>
  result.duplicate
    ? success(res, { transaction: result.transaction, duplicate: true }, `${msg} (idempotent replay).`, 200)
    : success(res, {
        transaction : result.transaction,
        duplicate   : false,
        blocked     : result.blocked ?? false,
        fraud       : result.fraud ?? null,
      }, msg, 201);

// ── handlers ──────────────────────────────────────────────────────────────────

/** POST /api/transactions/deposit */
export const deposit = async (req, res) => {
  try {
    const { accountId, amount, currency, channel, description, idempotencyKey } = req.body;
    const result = await depositService(
      { accountId, amount, currency, channel, description, idempotencyKey },
      getMeta(req)
    );
    return txnResponse(res, result, 'Deposit processed.');
  } catch (err) { return handleErr(err, res); }
};

/** POST /api/transactions/withdraw */
export const withdraw = async (req, res) => {
  try {
    const { accountId, amount, currency, channel, description, cardId, idempotencyKey } = req.body;
    const result = await withdrawService(
      { accountId, amount, currency, channel, description, cardId, idempotencyKey },
      getMeta(req)
    );
    return txnResponse(res, result, 'Withdrawal processed.');
  } catch (err) { return handleErr(err, res); }
};

export const withdrawal = withdraw;

/** POST /api/transactions/transfer */
export const transfer = async (req, res) => {
  try {
    const { sourceAccountId, destinationAccountId, amount, currency,
            channel, description, beneficiaryId, idempotencyKey } = req.body;
    const result = await transferService(
      { sourceAccountId, destinationAccountId, amount, currency,
        channel, description, beneficiaryId, idempotencyKey },
      getMeta(req)
    );
    return txnResponse(res, result, 'Transfer processed.');
  } catch (err) { return handleErr(err, res); }
};

/** POST /api/transactions/card-payment */
export const cardPayment = async (req, res) => {
  try {
    const { accountId, cardId, amount, currency, channel,
            merchantName, merchantCategory, description, idempotencyKey } = req.body;
    const result = await cardPaymentService(
      { accountId, cardId, amount, currency, channel,
        merchantName, merchantCategory, description, idempotencyKey },
      getMeta(req)
    );
    return txnResponse(res, result, 'Card payment processed.');
  } catch (err) { return handleErr(err, res); }
};

/** POST /api/transactions/upi */
export const upiPayment = async (req, res) => {
  try {
    const { sourceAccountId, destinationAccountId, amount, currency,
            upiVpa, description, idempotencyKey } = req.body;
    const result = await upiPaymentService(
      { sourceAccountId, destinationAccountId, amount, currency,
        upiVpa, description, idempotencyKey },
      getMeta(req)
    );
    return txnResponse(res, result, 'UPI payment processed.');
  } catch (err) { return handleErr(err, res); }
};

/** POST /api/transactions/atm */
export const atmWithdrawal = async (req, res) => {
  try {
    const { accountId, cardId, amount, currency, locationCity, idempotencyKey } = req.body;
    const result = await atmWithdrawalService(
      { accountId, cardId, amount, currency, locationCity, idempotencyKey },
      getMeta(req)
    );
    return txnResponse(res, result, 'ATM withdrawal processed.');
  } catch (err) { return handleErr(err, res); }
};

/** POST /api/transactions/online */
export const onlinePayment = async (req, res) => {
  try {
    const { accountId, cardId, amount, currency, channel,
            merchantName, merchantCategory, description, idempotencyKey } = req.body;
    const result = await onlinePaymentService(
      { accountId, cardId, amount, currency, channel,
        merchantName, merchantCategory, description, idempotencyKey },
      getMeta(req)
    );
    return txnResponse(res, result, 'Online payment processed.');
  } catch (err) { return handleErr(err, res); }
};

/** POST /api/transactions/:id/reverse */
export const reverseTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const result = await reverseTransactionService(
      { transactionId: id, reason },
      getMeta(req)
    );
    return success(res, result, 'Transaction reversed successfully.', 200);
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/transactions/:idOrRef */
export const getTransaction = async (req, res) => {
  try {
    const txn = await getTransactionService(req.params.idOrRef);
    return success(res, { transaction: txn }, 'Transaction retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/transactions */
export const listTransactions = async (req, res) => {
  try {
    const result = await listTransactionsService(req.query, req.user);
    return success(res, result, 'Transactions retrieved.');
  } catch (err) { return handleErr(err, res); }
};

// Legacy alias for fraudRoutes
export const initiateTransfer = transfer;

export default {
  deposit, withdraw, withdrawal, transfer, cardPayment, upiPayment,
  atmWithdrawal, onlinePayment, reverseTransaction,
  getTransaction, listTransactions, initiateTransfer,
};
