/**
 * transactionValidators.js — express-validator chains for all transaction endpoints.
 */

import { body, param, query } from 'express-validator';
export { validate } from './authValidators.js';

const TXN_STATUSES  = ['pending','processing','completed','failed','flagged','blocked','reversed'];
const TXN_TYPES     = ['credit','debit','transfer','deposit','withdrawal','payment','reversal','fee','interest'];
const CHANNELS      = ['web','mobile','atm','pos','branch','upi','neft','rtgs','imps','api'];

const uuidParam  = (n) => param(n).isUUID(4).withMessage(`${n} must be a valid UUID v4.`);
const uuidBody   = (n) => body(n).isUUID(4).withMessage(`${n} must be a valid UUID v4.`);
const amountBody = (n = 'amount') =>
  body(n)
    .notEmpty().withMessage(`${n} is required.`)
    .isFloat({ min: 0.01 }).withMessage(`${n} must be a positive number ≥ 0.01.`)
    .toFloat();

// ─── shared idempotency field ─────────────────────────────────────────────────
const idempotencyField = body('idempotencyKey')
  .optional({ nullable: true }).trim()
  .isString().withMessage('idempotencyKey must be a string.')
  .isLength({ min: 1, max: 128 }).withMessage('idempotencyKey must be 1–128 characters.');

// ─── 1. DEPOSIT ───────────────────────────────────────────────────────────────
export const depositValidator = [
  uuidBody('accountId').notEmpty().withMessage('accountId is required.'),
  amountBody(),
  body('currency').optional().trim().isLength({ min: 3, max: 3 }).withMessage('currency must be a 3-letter code.'),
  body('channel').optional().isIn(['branch','neft','rtgs','imps','api']).withMessage('Invalid deposit channel.'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 500 }),
  idempotencyField,
];

// ─── 2. WITHDRAWAL ────────────────────────────────────────────────────────────
export const withdrawValidator = [
  uuidBody('accountId').notEmpty().withMessage('accountId is required.'),
  amountBody(),
  body('currency').optional().trim().isLength({ min: 3, max: 3 }),
  body('channel').optional().isIn(['branch','atm','api']).withMessage('Invalid withdrawal channel.'),
  body('cardId').optional({ nullable: true }).isUUID(4).withMessage('cardId must be a valid UUID v4.'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 500 }),
  idempotencyField,
];

// ─── 3. TRANSFER ──────────────────────────────────────────────────────────────
export const transferValidator = [
  uuidBody('sourceAccountId').notEmpty().withMessage('sourceAccountId is required.'),
  uuidBody('destinationAccountId').notEmpty().withMessage('destinationAccountId is required.'),
  amountBody(),
  body('currency').optional().trim().isLength({ min: 3, max: 3 }),
  body('channel').optional().isIn(['web','mobile','upi','neft','rtgs','imps','branch','api']).withMessage('Invalid transfer channel.'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 500 }),
  body('beneficiaryId').optional({ nullable: true }).isUUID(4).withMessage('beneficiaryId must be a valid UUID v4.'),
  idempotencyField,
  body('destinationAccountId').custom((v, { req }) => {
    if (v === req.body.sourceAccountId) throw new Error('sourceAccountId and destinationAccountId must differ.');
    return true;
  }),
];

// ─── 4. CARD PAYMENT ─────────────────────────────────────────────────────────
export const cardPaymentValidator = [
  uuidBody('accountId').notEmpty().withMessage('accountId is required.'),
  uuidBody('cardId').notEmpty().withMessage('cardId is required.'),
  amountBody(),
  body('currency').optional().trim().isLength({ min: 3, max: 3 }),
  body('channel').optional().isIn(['pos','web','mobile','atm','upi','api']).withMessage('Invalid card payment channel.'),
  body('merchantName').optional({ nullable: true }).trim().isLength({ max: 150 }),
  body('merchantCategory').optional({ nullable: true }).trim().isLength({ max: 80 }),
  body('description').optional({ nullable: true }).trim().isLength({ max: 500 }),
  idempotencyField,
];

// ─── 5. UPI PAYMENT ──────────────────────────────────────────────────────────
export const upiPaymentValidator = [
  uuidBody('sourceAccountId').notEmpty().withMessage('sourceAccountId is required.'),
  body('destinationAccountId').optional({ nullable: true }).isUUID(4).withMessage('destinationAccountId must be a valid UUID v4.'),
  amountBody(),
  body('currency').optional().trim().isLength({ min: 3, max: 3 }),
  body('upiVpa').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('upiVpa must be ≤ 100 characters.'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 500 }),
  idempotencyField,
];

// ─── 6. ATM WITHDRAWAL ───────────────────────────────────────────────────────
export const atmWithdrawalValidator = [
  uuidBody('accountId').notEmpty().withMessage('accountId is required.'),
  uuidBody('cardId').notEmpty().withMessage('cardId is required.'),
  amountBody(),
  body('currency').optional().trim().isLength({ min: 3, max: 3 }),
  body('locationCity').optional({ nullable: true }).trim().isLength({ max: 100 }),
  idempotencyField,
];

// ─── 7. ONLINE PAYMENT ───────────────────────────────────────────────────────
export const onlinePaymentValidator = [
  uuidBody('accountId').notEmpty().withMessage('accountId is required.'),
  uuidBody('cardId').optional({ nullable: true, checkFalsy: true }),
  amountBody(),
  body('currency').optional().trim().isLength({ min: 3, max: 3 }),
  body('channel').optional().isIn(['web','mobile']).withMessage('Online payment channel must be web or mobile.'),
  body('merchantName').optional({ nullable: true }).trim().isLength({ max: 150 }),
  body('merchantCategory').optional({ nullable: true }).trim().isLength({ max: 80 }),
  body('description').optional({ nullable: true }).trim().isLength({ max: 500 }),
  idempotencyField,
];

// ─── 8. REVERSE TRANSACTION ──────────────────────────────────────────────────
export const reverseTransactionValidator = [
  uuidParam('id'),
  body('reason').optional({ nullable: true }).trim().isString().isLength({ max: 255 }).withMessage('reason must be ≤ 255 characters.'),
];

// ─── 9. GET TRANSACTION ───────────────────────────────────────────────────────
export const getTransactionValidator = [
  param('idOrRef')
    .trim().notEmpty().withMessage('Transaction id or ref is required.')
    .custom((v) => {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
      const isRef  = /^TXN-\d{8}-[A-F0-9]{8}$/.test(v);
      if (!isUUID && !isRef) throw new Error('Must be a UUID v4 or a transaction ref (TXN-YYYYMMDD-XXXXXXXX).');
      return true;
    }),
];

// ─── 10. LIST TRANSACTIONS ────────────────────────────────────────────────────
export const listTransactionsValidator = [
  query('accountId').optional().isUUID(4).withMessage('accountId must be a valid UUID v4.'),
  query('customerId').optional().isUUID(4).withMessage('customerId must be a valid UUID v4.'),
  query('status').optional().isIn(TXN_STATUSES).withMessage(`status must be one of: ${TXN_STATUSES.join(', ')}.`),
  query('txnType').optional().isIn(TXN_TYPES).withMessage(`txnType must be one of: ${TXN_TYPES.join(', ')}.`),
  query('channel').optional().isIn(CHANNELS).withMessage(`channel must be one of: ${CHANNELS.join(', ')}.`),
  query('isFraud').optional().isBoolean({ strict: false }).withMessage('isFraud must be true or false.'),
  query('dateFrom').optional().isISO8601({ strict: true }).withMessage('dateFrom must be a valid ISO date.'),
  query('dateTo').optional().isISO8601({ strict: true }).withMessage('dateTo must be a valid ISO date.'),
  query('minAmount').optional().isFloat({ min: 0 }).withMessage('minAmount must be ≥ 0.').toFloat(),
  query('maxAmount').optional().isFloat({ min: 0 }).withMessage('maxAmount must be ≥ 0.').toFloat(),
  query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be 1–200.').toInt(),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset must be ≥ 0.').toInt(),
  query('sortDir').optional().isIn(['ASC','DESC','asc','desc']).withMessage('sortDir must be ASC or DESC.'),
];
