/**
 * accountValidators.js — express-validator chains for accounts module.
 */

import { body, param, query } from 'express-validator';
export { validate } from './authValidators.js';

// ─── constants ────────────────────────────────────────────────────────────────
const OPENABLE_TYPES = ['savings', 'current', 'salary', 'business'];
const ALL_TYPES      = ['savings','current','fixed_deposit','recurring_deposit','salary','loan','business'];
const STATUSES       = ['pending','active','dormant','frozen','closed'];
const CURRENCIES     = ['INR','USD','EUR','GBP','AED','SGD'];

const uuidParam = (name) =>
  param(name).isUUID(4).withMessage(`${name} must be a valid UUID v4.`);

// ─── 1. OPEN ACCOUNT ─────────────────────────────────────────────────────────
export const openAccountValidator = [
  body('customerId')
    .optional({ nullable: true })
    .isUUID(4).withMessage('customerId must be a valid UUID v4.'),

  body('accountType')
    .trim().notEmpty().withMessage('accountType is required.')
    .isIn(OPENABLE_TYPES)
    .withMessage(`accountType must be one of: ${OPENABLE_TYPES.join(', ')}.`),

  body('branchId')
    .optional({ nullable: true })
    .isUUID(4).withMessage('branchId must be a valid UUID v4.'),

  body('currency')
    .optional().trim()
    .isIn(CURRENCIES).withMessage(`currency must be one of: ${CURRENCIES.join(', ')}.`),

  body('nomineeName')
    .optional({ nullable: true }).trim()
    .isLength({ max: 150 }).withMessage('nomineeName must be ≤ 150 characters.'),

  body('jointHolderId')
    .optional({ nullable: true })
    .isUUID(4).withMessage('jointHolderId must be a valid UUID v4.'),
];

// ─── 2. UPDATE ACCOUNT ───────────────────────────────────────────────────────
export const updateAccountValidator = [
  uuidParam('id'),

  body('nomineeName')
    .optional({ nullable: true }).trim()
    .isLength({ max: 150 }).withMessage('nomineeName must be ≤ 150 characters.'),

  body('branchId')
    .optional({ nullable: true })
    .isUUID(4).withMessage('branchId must be a valid UUID v4.'),

  body('currency')
    .optional().trim()
    .isIn(CURRENCIES).withMessage(`currency must be one of: ${CURRENCIES.join(', ')}.`),

  // Block injection of status, balance, account_number
  body('status').not().exists().withMessage('Use dedicated endpoints to change account status.'),
  body('balance').not().exists().withMessage('Balance cannot be set directly.'),
  body('accountNumber').not().exists().withMessage('Account number cannot be changed.'),
  body('customerId').not().exists().withMessage('Customer cannot be changed.'),
];

// ─── 3. ACCOUNT ID PARAM ─────────────────────────────────────────────────────
export const accountIdValidator = [uuidParam('id')];

// ─── 4. LIST ACCOUNTS ────────────────────────────────────────────────────────
export const listAccountsValidator = [
  query('customerId').optional().isUUID(4).withMessage('customerId must be a valid UUID v4.'),
  query('status').optional().isIn(STATUSES).withMessage(`status must be one of: ${STATUSES.join(', ')}.`),
  query('accountType').optional().isIn(ALL_TYPES).withMessage(`accountType must be one of: ${ALL_TYPES.join(', ')}.`),
  query('branchId').optional().isUUID(4).withMessage('branchId must be a valid UUID v4.'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1–100.').toInt(),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset must be ≥ 0.').toInt(),
  query('createdFrom').optional().isISO8601({ strict: true }).withMessage('createdFrom must be a valid ISO date.'),
  query('createdTo').optional().isISO8601({ strict: true }).withMessage('createdTo must be a valid ISO date.'),
  query('sortBy').optional().isIn(['created_at','account_number','balance','opened_at']).withMessage('Invalid sortBy.'),
  query('sortDir').optional().isIn(['ASC','DESC','asc','desc']).withMessage('sortDir must be ASC or DESC.'),
];

// ─── 5. HISTORY PARAMS ───────────────────────────────────────────────────────
export const historyValidator = [
  uuidParam('id'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1–100.').toInt(),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset must be ≥ 0.').toInt(),
  query('dateFrom').optional().isISO8601({ strict: true }).withMessage('dateFrom must be a valid ISO date.'),
  query('dateTo').optional().isISO8601({ strict: true }).withMessage('dateTo must be a valid ISO date.'),
];
