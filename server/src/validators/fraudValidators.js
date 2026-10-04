/**
 * fraudValidators.js — express-validator chains for the fraud investigation module.
 */

import { body, param, query } from 'express-validator';
export { validate } from './authValidators.js';

// ── Constants matching schema enums ──────────────────────────────────────────
const ALERT_STATUSES = ['open','investigating','escalated','confirmed_fraud','false_positive','resolved','closed'];
const ALERT_SEVERITIES = ['low','medium','high','critical'];
const INV_STATUSES  = ['open','in_progress','pending_review','closed_fraud','closed_no_fraud'];
const INV_PRIORITIES = ['low','medium','high','critical'];

const uuidParam = (name) =>
  param(name).isUUID(4).withMessage(`${name} must be a valid UUID v4.`);

// ── 1. List alerts ────────────────────────────────────────────────────────────
export const listAlertsValidator = [
  query('status').optional().isIn(ALERT_STATUSES).withMessage(`status must be one of: ${ALERT_STATUSES.join(', ')}.`),
  query('severity').optional().isIn(ALERT_SEVERITIES).withMessage(`severity must be one of: ${ALERT_SEVERITIES.join(', ')}.`),
  query('assignedTo').optional().isUUID(4).withMessage('assignedTo must be a valid UUID v4.'),
  query('isAssigned').optional().isBoolean({ strict: false }).withMessage('isAssigned must be true or false.'),
  query('dateFrom').optional().isISO8601({ strict: true }).withMessage('dateFrom must be a valid ISO date.'),
  query('dateTo').optional().isISO8601({ strict: true }).withMessage('dateTo must be a valid ISO date.'),
  query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be 1–200.').toInt(),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset must be ≥ 0.').toInt(),
  query('sortDir').optional().isIn(['ASC','DESC','asc','desc']).withMessage('sortDir must be ASC or DESC.'),
];

// ── 2. Alert id param ─────────────────────────────────────────────────────────
export const alertIdValidator = [ uuidParam('id') ];

// ── 3. Assign alert ───────────────────────────────────────────────────────────
export const assignAlertValidator = [
  uuidParam('id'),
  body('analystId')
    .trim().notEmpty().withMessage('analystId is required.')
    .isUUID(4).withMessage('analystId must be a valid UUID v4.'),
];

// ── 4. Transition alert status ────────────────────────────────────────────────
export const transitionAlertValidator = [
  uuidParam('id'),
  body('status')
    .trim().notEmpty().withMessage('status is required.')
    .isIn(ALERT_STATUSES).withMessage(`status must be one of: ${ALERT_STATUSES.join(', ')}.`),
];

// ── 5. Open investigation ─────────────────────────────────────────────────────
export const openInvestigationValidator = [
  uuidParam('alertId'),
  body('priority')
    .optional().isIn(INV_PRIORITIES)
    .withMessage(`priority must be one of: ${INV_PRIORITIES.join(', ')}.`),
  body('assignedTo')
    .optional({ nullable: true }).isUUID(4)
    .withMessage('assignedTo must be a valid UUID v4.'),
];

// ── 6. Update investigation ───────────────────────────────────────────────────
export const updateInvestigationValidator = [
  uuidParam('id'),
  body('status')
    .optional().isIn(INV_STATUSES)
    .withMessage(`status must be one of: ${INV_STATUSES.join(', ')}.`),
  body('priority')
    .optional().isIn(INV_PRIORITIES)
    .withMessage(`priority must be one of: ${INV_PRIORITIES.join(', ')}.`),
  body('assignedTo')
    .optional({ nullable: true }).isUUID(4)
    .withMessage('assignedTo must be a valid UUID v4.'),
  body('outcome')
    .optional({ nullable: true }).trim()
    .isLength({ max: 5000 }).withMessage('outcome must be ≤ 5000 characters.'),
  body('evidenceUrls')
    .optional({ nullable: true })
    .isArray().withMessage('evidenceUrls must be an array.'),
  // Require outcome when closing
  body('outcome').custom((value, { req }) => {
    const s = req.body.status;
    if ((s === 'closed_fraud' || s === 'closed_no_fraud') && !value?.trim()) {
      throw new Error('outcome is required when closing an investigation.');
    }
    return true;
  }),
];

// ── 7. Investigation id param ─────────────────────────────────────────────────
export const investigationIdValidator = [ uuidParam('id') ];

// ── 8. Add analyst note ───────────────────────────────────────────────────────
export const addNoteValidator = [
  body('noteText')
    .trim().notEmpty().withMessage('noteText is required.')
    .isLength({ min: 1, max: 10_000 }).withMessage('noteText must be 1–10,000 characters.'),
  body('isInternal')
    .optional()
    .isBoolean({ strict: false }).withMessage('isInternal must be a boolean.')
    .toBoolean(),
];

// ── 9. List investigations ────────────────────────────────────────────────────
export const listInvestigationsValidator = [
  query('status').optional().isIn(INV_STATUSES).withMessage(`status must be one of: ${INV_STATUSES.join(', ')}.`),
  query('priority').optional().isIn(INV_PRIORITIES).withMessage(`priority must be one of: ${INV_PRIORITIES.join(', ')}.`),
  query('assignedTo').optional().isUUID(4).withMessage('assignedTo must be a valid UUID v4.'),
  query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be 1–200.').toInt(),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset must be ≥ 0.').toInt(),
  query('sortDir').optional().isIn(['ASC','DESC','asc','desc']).withMessage('sortDir must be ASC or DESC.'),
];
