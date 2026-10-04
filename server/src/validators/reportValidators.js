/**
 * reportValidators.js — express-validator chains for reports + notifications.
 */
import { body, param, query } from 'express-validator';
export { validate } from './authValidators.js';

const REPORT_TYPES   = ['transaction_summary','fraud_report','audit_report','compliance_report','customer_statement','risk_report'];
const REPORT_FORMATS = ['pdf','excel','csv'];
const REPORT_STATUSES = ['queued','generating','ready','failed','expired'];
const NOTIF_CHANNELS = ['email','sms','push','in_app'];
const NOTIF_STATUSES = ['pending','sent','delivered','failed','read'];

const uuidParam = (n) => param(n).isUUID(4).withMessage(`${n} must be a valid UUID v4.`);

// ── 1. Request report ─────────────────────────────────────────────────────────
export const requestReportValidator = [
  body('reportType')
    .trim().notEmpty().withMessage('reportType is required.')
    .isIn(REPORT_TYPES).withMessage(`reportType must be one of: ${REPORT_TYPES.join(', ')}.`),

  body('format')
    .optional()
    .isIn(REPORT_FORMATS).withMessage(`format must be one of: ${REPORT_FORMATS.join(', ')}.`),

  body('parameters.dateFrom')
    .optional({ nullable: true })
    .isISO8601({ strict: true }).withMessage('parameters.dateFrom must be a valid ISO date.'),

  body('parameters.dateTo')
    .optional({ nullable: true })
    .isISO8601({ strict: true }).withMessage('parameters.dateTo must be a valid ISO date.')
    .custom((v, { req }) => {
      if (v && req.body.parameters?.dateFrom && v < req.body.parameters.dateFrom) {
        throw new Error('parameters.dateTo must be after parameters.dateFrom.');
      }
      return true;
    }),

  body('parameters.customerId')
    .optional({ nullable: true })
    .isUUID(4).withMessage('parameters.customerId must be a valid UUID v4.'),
];

// ── 2. List reports ───────────────────────────────────────────────────────────
export const listReportsValidator = [
  query('reportType').optional().isIn(REPORT_TYPES).withMessage(`Invalid reportType.`),
  query('status').optional().isIn(REPORT_STATUSES).withMessage(`Invalid status.`),
  query('requestedBy').optional().isUUID(4).withMessage('requestedBy must be a valid UUID v4.'),
  query('dateFrom').optional().isISO8601({ strict: true }).withMessage('dateFrom must be a valid ISO date.'),
  query('dateTo').optional().isISO8601({ strict: true }).withMessage('dateTo must be a valid ISO date.'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
  query('sortDir').optional().isIn(['ASC','DESC','asc','desc']),
];

// ── 3. Report id param ────────────────────────────────────────────────────────
export const reportIdValidator = [ uuidParam('id') ];

// ── 4. Notification list ──────────────────────────────────────────────────────
export const listNotificationsValidator = [
  query('status').optional().isIn(NOTIF_STATUSES).withMessage(`Invalid notification status.`),
  query('channel').optional().isIn(NOTIF_CHANNELS).withMessage(`Invalid notification channel.`),
  query('unreadOnly').optional().isBoolean({ strict: false }).withMessage('unreadOnly must be true or false.'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
];

// ── 5. Notification id param ──────────────────────────────────────────────────
export const notificationIdValidator = [
  param('id')
    .trim().notEmpty().withMessage('id is required.')
    .isInt({ min: 1 }).withMessage('id must be a positive integer.')
    .toInt(),
];
