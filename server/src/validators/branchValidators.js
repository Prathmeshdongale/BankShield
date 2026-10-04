/**
 * branchValidators.js — express-validator chains for the branches module.
 *
 * Re-exports the shared `validate` middleware from authValidators so every
 * module uses the same error-response shape.
 */

import { body, param, query } from 'express-validator';
export { validate } from './authValidators.js';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED FIELD RULES
// ─────────────────────────────────────────────────────────────────────────────

const codeField = body('code')
  .trim()
  .notEmpty().withMessage('Branch code is required.')
  .isLength({ min: 2, max: 20 }).withMessage('Branch code must be 2–20 characters.')
  .matches(/^[A-Z0-9_-]+$/).withMessage('Branch code must be uppercase alphanumeric (A-Z, 0-9, _, -).');

const nameField = body('name')
  .trim()
  .notEmpty().withMessage('Branch name is required.')
  .isLength({ min: 2, max: 150 }).withMessage('Branch name must be 2–150 characters.');

const uuidParam = (paramName) =>
  param(paramName).isUUID(4).withMessage(`${paramName} must be a valid UUID v4.`);

// ─────────────────────────────────────────────────────────────────────────────
// 1. CREATE BRANCH
// ─────────────────────────────────────────────────────────────────────────────

export const createBranchValidator = [
  codeField,
  nameField,

  body('address')
    .optional({ nullable: true }).trim()
    .isLength({ max: 500 }).withMessage('Address must be ≤ 500 characters.'),

  body('city')
    .optional({ nullable: true }).trim()
    .isLength({ max: 100 }).withMessage('City must be ≤ 100 characters.')
    .matches(/^[A-Za-z\s'-]+$/).withMessage('City contains invalid characters.'),

  body('state')
    .optional({ nullable: true }).trim()
    .isLength({ max: 100 }).withMessage('State must be ≤ 100 characters.'),

  body('country')
    .optional({ nullable: true }).trim()
    .isLength({ min: 2, max: 80 }).withMessage('Country must be 2–80 characters.'),

  body('phone')
    .optional({ nullable: true, checkFalsy: true }).trim()
    .matches(/^\+?[\d\s\-().]{7,20}$/).withMessage('Must be a valid phone number (7–20 digits).'),

  body('email')
    .optional({ nullable: true, checkFalsy: true }).trim()
    .isEmail().withMessage('Must be a valid email address.')
    .normalizeEmail(),

  body('managerId')
    .optional({ nullable: true })
    .isUUID(4).withMessage('managerId must be a valid UUID v4.'),
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. UPDATE BRANCH
// ─────────────────────────────────────────────────────────────────────────────

export const updateBranchValidator = [
  uuidParam('id'),

  body('code')
    .optional().trim()
    .isLength({ min: 2, max: 20 }).withMessage('Branch code must be 2–20 characters.')
    .matches(/^[A-Z0-9_-]+$/).withMessage('Branch code must be uppercase alphanumeric.'),

  body('name')
    .optional().trim()
    .isLength({ min: 2, max: 150 }).withMessage('Branch name must be 2–150 characters.'),

  body('address')
    .optional({ nullable: true }).trim()
    .isLength({ max: 500 }).withMessage('Address must be ≤ 500 characters.'),

  body('city')
    .optional({ nullable: true }).trim()
    .isLength({ max: 100 }).withMessage('City must be ≤ 100 characters.'),

  body('state')
    .optional({ nullable: true }).trim()
    .isLength({ max: 100 }).withMessage('State must be ≤ 100 characters.'),

  body('country')
    .optional({ nullable: true }).trim()
    .isLength({ min: 2, max: 80 }).withMessage('Country must be 2–80 characters.'),

  body('phone')
    .optional({ nullable: true, checkFalsy: true }).trim()
    .matches(/^\+?[\d\s\-().]{7,20}$/).withMessage('Must be a valid phone number (7–20 digits).'),

  body('email')
    .optional({ nullable: true, checkFalsy: true }).trim()
    .isEmail().withMessage('Must be a valid email address.')
    .normalizeEmail(),

  body('managerId')
    .optional({ nullable: true })
    .isUUID(4).withMessage('managerId must be a valid UUID v4.'),

  body('isActive')
    .optional()
    .isBoolean({ strict: false }).withMessage('isActive must be a boolean.')
    .toBoolean(),
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. ID PARAM VALIDATOR  (for GET, DELETE, DEACTIVATE)
// ─────────────────────────────────────────────────────────────────────────────

export const branchIdValidator = [ uuidParam('id') ];

// ─────────────────────────────────────────────────────────────────────────────
// 4. LIST QUERY VALIDATOR
// ─────────────────────────────────────────────────────────────────────────────

export const listBranchesValidator = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('limit must be 1–100.')
    .toInt(),

  query('offset')
    .optional()
    .isInt({ min: 0 }).withMessage('offset must be ≥ 0.')
    .toInt(),

  query('isActive')
    .optional()
    .isBoolean({ strict: false }).withMessage('isActive must be true or false.'),

  query('sortBy')
    .optional()
    .isIn(['created_at','name','code','city','country'])
    .withMessage('sortBy must be one of: created_at, name, code, city, country.'),

  query('sortDir')
    .optional()
    .isIn(['ASC','DESC','asc','desc'])
    .withMessage('sortDir must be ASC or DESC.'),
];
