/**
 * cardValidators.js — express-validator chains for cards + card_limits.
 */

import { body, param, query } from 'express-validator';
export { validate } from './authValidators.js';

const CARD_TYPES   = ['debit', 'credit', 'prepaid', 'virtual'];
const NETWORKS     = ['visa', 'mastercard', 'rupay', 'amex', 'other'];
const LIMIT_TYPES  = ['daily_atm','daily_pos','daily_online','single_txn','monthly','contactless'];

const uuidParam = (name) =>
  param(name).isUUID(4).withMessage(`${name} must be a valid UUID v4.`);

// ─── 1. ISSUE CARD ───────────────────────────────────────────────────────────
export const issueCardValidator = [
  uuidParam('accountId'),

  body('cardType')
    .optional().trim()
    .isIn(CARD_TYPES).withMessage(`cardType must be one of: ${CARD_TYPES.join(', ')}.`),

  body('network')
    .optional().trim()
    .isIn(NETWORKS).withMessage(`network must be one of: ${NETWORKS.join(', ')}.`),
];

// ─── 2. CARD ID PARAM ────────────────────────────────────────────────────────
export const cardIdValidator = [uuidParam('id')];

// ─── 3. BLOCK CARD ───────────────────────────────────────────────────────────
export const blockCardValidator = [
  uuidParam('id'),
  body('reason')
    .optional({ nullable: true }).trim()
    .isLength({ max: 300 }).withMessage('reason must be ≤ 300 characters.'),
];

// ─── 4. SET LIMIT ────────────────────────────────────────────────────────────
export const setLimitValidator = [
  uuidParam('id'),

  param('limitType')
    .isIn(LIMIT_TYPES).withMessage(`limitType must be one of: ${LIMIT_TYPES.join(', ')}.`),

  body('amountLimit')
    .notEmpty().withMessage('amountLimit is required.')
    .isFloat({ min: 1 }).withMessage('amountLimit must be a positive number.')
    .toFloat(),

  body('isActive')
    .optional()
    .isBoolean({ strict: false }).withMessage('isActive must be a boolean.')
    .toBoolean(),

  body('effectiveTo')
    .optional({ nullable: true })
    .isISO8601({ strict: true }).withMessage('effectiveTo must be a valid ISO date (YYYY-MM-DD).')
    .custom((v) => {
      if (new Date(v) <= new Date()) throw new Error('effectiveTo must be a future date.');
      return true;
    }),
];

// ─── 5. DELETE LIMIT ─────────────────────────────────────────────────────────
export const deleteLimitValidator = [
  uuidParam('id'),
  param('limitType')
    .isIn(LIMIT_TYPES).withMessage(`limitType must be one of: ${LIMIT_TYPES.join(', ')}.`),
];

// ─── 6. LIST CARDS QUERY ─────────────────────────────────────────────────────
export const listCardsValidator = [
  uuidParam('accountId'),
  query('includeInactive')
    .optional()
    .isBoolean({ strict: false }).withMessage('includeInactive must be true or false.')
    .toBoolean(),
];
