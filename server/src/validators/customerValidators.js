/**
 * customerValidators.js — express-validator chains for customers + KYC.
 */

import { body, param, query } from 'express-validator';
export { validate } from './authValidators.js';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED
// ─────────────────────────────────────────────────────────────────────────────

const VALID_GENDERS    = ['male','female','other','prefer_not_to_say'];
const VALID_RISK       = ['low','medium','high','very_high'];
const VALID_SEGMENTS   = ['retail','premium','corporate','vip'];
const VALID_DOC_TYPES  = [
  'passport','national_id','driving_licence','voter_id',
  'aadhaar','pan','utility_bill','other',
];
const VALID_KYC_STATUS = ['submitted','verified','rejected','expired'];

const uuidParam = (paramName) =>
  param(paramName).isUUID(4).withMessage(`${paramName} must be a valid UUID v4.`);

// ─────────────────────────────────────────────────────────────────────────────
// 1. CREATE CUSTOMER
// ─────────────────────────────────────────────────────────────────────────────

export const createCustomerValidator = [
  body('userId')
    .trim()
    .notEmpty().withMessage('userId is required.')
    .isUUID(4).withMessage('userId must be a valid UUID v4.'),

  body('dateOfBirth')
    .optional({ nullable: true })
    .isISO8601({ strict: true }).withMessage('dateOfBirth must be a valid date (YYYY-MM-DD).')
    .custom((v) => {
      const age = (Date.now() - new Date(v)) / (1000 * 60 * 60 * 24 * 365.25);
      if (age < 18) throw new Error('Customer must be at least 18 years old.');
      if (age > 120) throw new Error('Date of birth appears invalid.');
      return true;
    }),

  body('gender')
    .optional({ nullable: true })
    .isIn(VALID_GENDERS).withMessage(`gender must be one of: ${VALID_GENDERS.join(', ')}.`),

  body('nationality')
    .optional({ nullable: true }).trim()
    .isLength({ max: 80 }).withMessage('nationality must be ≤ 80 characters.'),

  body('occupation')
    .optional({ nullable: true }).trim()
    .isLength({ max: 150 }).withMessage('occupation must be ≤ 150 characters.'),

  body('annualIncome')
    .optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('annualIncome must be a non-negative number.')
    .toFloat(),

  body('riskRating')
    .optional()
    .isIn(VALID_RISK).withMessage(`riskRating must be one of: ${VALID_RISK.join(', ')}.`),

  body('isPep')
    .optional()
    .isBoolean({ strict: false }).withMessage('isPep must be a boolean.')
    .toBoolean(),

  body('segment')
    .optional()
    .isIn(VALID_SEGMENTS).withMessage(`segment must be one of: ${VALID_SEGMENTS.join(', ')}.`),
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. UPDATE CUSTOMER
// ─────────────────────────────────────────────────────────────────────────────

export const updateCustomerValidator = [
  uuidParam('id'),

  body('dateOfBirth')
    .optional({ nullable: true })
    .isISO8601({ strict: true }).withMessage('dateOfBirth must be a valid ISO date.'),

  body('gender')
    .optional({ nullable: true })
    .isIn(VALID_GENDERS).withMessage(`gender must be one of: ${VALID_GENDERS.join(', ')}.`),

  body('nationality')
    .optional({ nullable: true }).trim()
    .isLength({ max: 80 }).withMessage('nationality must be ≤ 80 characters.'),

  body('occupation')
    .optional({ nullable: true }).trim()
    .isLength({ max: 150 }).withMessage('occupation must be ≤ 150 characters.'),

  body('annualIncome')
    .optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('annualIncome must be a non-negative number.')
    .toFloat(),

  body('riskRating')
    .optional()
    .isIn(VALID_RISK).withMessage(`riskRating must be one of: ${VALID_RISK.join(', ')}.`),

  body('isPep')
    .optional()
    .isBoolean({ strict: false }).withMessage('isPep must be a boolean.')
    .toBoolean(),

  body('segment')
    .optional()
    .isIn(VALID_SEGMENTS).withMessage(`segment must be one of: ${VALID_SEGMENTS.join(', ')}.`),

  // Prevent field injection
  body('userId').not().exists().withMessage('userId cannot be changed.'),
  body('customerNumber').not().exists().withMessage('customerNumber cannot be changed.'),
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. ID PARAM
// ─────────────────────────────────────────────────────────────────────────────

export const customerIdValidator = [ uuidParam('id') ];

// ─────────────────────────────────────────────────────────────────────────────
// 4. LIST QUERY
// ─────────────────────────────────────────────────────────────────────────────

export const listCustomersValidator = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('limit must be 1–100.')
    .toInt(),

  query('offset')
    .optional()
    .isInt({ min: 0 }).withMessage('offset must be ≥ 0.')
    .toInt(),

  query('segment')
    .optional()
    .isIn(VALID_SEGMENTS).withMessage(`segment must be one of: ${VALID_SEGMENTS.join(', ')}.`),

  query('riskRating')
    .optional()
    .isIn(VALID_RISK).withMessage(`riskRating must be one of: ${VALID_RISK.join(', ')}.`),

  query('isPep')
    .optional()
    .isBoolean({ strict: false }).withMessage('isPep must be true or false.'),

  query('isActive')
    .optional()
    .isBoolean({ strict: false }).withMessage('isActive must be true or false.'),

  query('createdFrom')
    .optional()
    .isISO8601({ strict: true }).withMessage('createdFrom must be a valid ISO date.'),

  query('createdTo')
    .optional()
    .isISO8601({ strict: true }).withMessage('createdTo must be a valid ISO date.'),

  query('sortBy')
    .optional()
    .isIn(['created_at','customer_number','last_name','risk_rating','segment'])
    .withMessage('Invalid sortBy value.'),

  query('sortDir')
    .optional()
    .isIn(['ASC','DESC','asc','desc'])
    .withMessage('sortDir must be ASC or DESC.'),
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. KYC SUBMIT  (multipart — body fields only; file validated by Multer)
// ─────────────────────────────────────────────────────────────────────────────

export const submitKycValidator = [
  uuidParam('id'),   // customerId in URL

  body('docType')
    .trim()
    .notEmpty().withMessage('docType is required.')
    .isIn(VALID_DOC_TYPES)
    .withMessage(`docType must be one of: ${VALID_DOC_TYPES.join(', ')}.`),

  body('docNumber')
    .optional({ nullable: true, checkFalsy: true }).trim()
    .isLength({ max: 100 }).withMessage('docNumber must be ≤ 100 characters.'),

  body('expiryDate')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601({ strict: true }).withMessage('expiryDate must be a valid date (YYYY-MM-DD).')
    .custom((v) => {
      if (new Date(v) < new Date()) throw new Error('expiryDate must be in the future.');
      return true;
    }),
];

// ─────────────────────────────────────────────────────────────────────────────
// 6. UPDATE KYC STATUS
// ─────────────────────────────────────────────────────────────────────────────

export const updateKycStatusValidator = [
  uuidParam('id'),
  uuidParam('kycId'),

  body('status')
    .trim()
    .notEmpty().withMessage('status is required.')
    .isIn(VALID_KYC_STATUS)
    .withMessage(`status must be one of: ${VALID_KYC_STATUS.join(', ')}.`),

  body('rejectionReason')
    .optional({ nullable: true }).trim()
    .isLength({ max: 500 }).withMessage('rejectionReason must be ≤ 500 characters.')
    .custom((value, { req }) => {
      if (req.body.status === 'rejected' && !value) {
        throw new Error('rejectionReason is required when status is "rejected".');
      }
      return true;
    }),
];
