/**
 * authValidators.js — express-validator chains for every auth endpoint.
 *
 * Each export is an array of ValidationChain items that can be spread
 * directly into a route definition:
 *
 *   router.post('/login', authLimiter, ...loginValidator, loginController)
 *
 * After the chains run, call validate(req, res, next) as the next middleware
 * to short-circuit and return 422 with a structured error list if anything
 * failed.
 *
 * Password rules (applied consistently):
 *   - minimum 8 characters
 *   - at least one uppercase letter
 *   - at least one lowercase letter
 *   - at least one digit
 *   - at least one special character  (!@#$%^&*...)
 */

import { body, param, validationResult } from 'express-validator';
import { failure } from '../utils/response.js';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED RULES
// ─────────────────────────────────────────────────────────────────────────────

const VALID_ROLES = [
  'super_admin', 'admin', 'compliance_officer',
  'fraud_analyst', 'branch_manager', 'teller', 'customer',
];

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{};:'",.<>/?\\|`~]).{8,}$/;

const passwordField = (fieldName = 'password') =>
  body(fieldName)
    .trim()
    .notEmpty().withMessage('Password is required.')
    .matches(PASSWORD_REGEX)
    .withMessage(
      'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.'
    );

const emailField = (fieldName = 'email') =>
  body(fieldName)
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Must be a valid email address.')
    .normalizeEmail();

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION RESULT HANDLER — use as middleware after validator chains
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call after validator chains to collect errors and short-circuit.
 * Returns 422 Unprocessable Entity with structured field-level errors.
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const details = errors.array().map((e) => ({
    field  : e.path ?? e.param,
    message: e.msg,
    value  : e.value !== undefined ? String(e.value).substring(0, 40) : undefined,
  }));

  return failure(res, 'Validation failed.', 422, details);
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. REGISTER
// ─────────────────────────────────────────────────────────────────────────────

export const registerValidator = [
  emailField(),

  body('password')
    .trim()
    .notEmpty().withMessage('Password is required.')
    .matches(PASSWORD_REGEX)
    .withMessage(
      'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.'
    ),

  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required.')
    .isLength({ min: 1, max: 100 }).withMessage('First name must be 1–100 characters.')
    .matches(/^[A-Za-z\s'-]+$/).withMessage('First name contains invalid characters.'),

  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required.')
    .isLength({ min: 1, max: 100 }).withMessage('Last name must be 1–100 characters.')
    .matches(/^[A-Za-z\s'-]+$/).withMessage('Last name contains invalid characters.'),

  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Must be a valid phone number.'),

  body('roleName')
    .optional({ nullable: true })
    .trim()
    .isIn(VALID_ROLES)
    .withMessage(`Role must be one of: ${VALID_ROLES.join(', ')}.`),
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. LOGIN
// ─────────────────────────────────────────────────────────────────────────────

export const loginValidator = [
  emailField(),

  body('password')
    .trim()
    .notEmpty().withMessage('Password is required.'),
  // No complexity check on login — don't leak schema info
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. LOGOUT
// ─────────────────────────────────────────────────────────────────────────────

export const logoutValidator = [
  body('refreshToken')
    .optional({ nullable: true })
    .isString().withMessage('refreshToken must be a string.'),

  body('logoutAll')
    .optional({ nullable: true })
    .isBoolean({ strict: false }).withMessage('logoutAll must be a boolean.')
    .toBoolean(),
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. REFRESH TOKEN
// ─────────────────────────────────────────────────────────────────────────────

export const refreshTokenValidator = [
  body('refreshToken')
    .trim()
    .notEmpty().withMessage('refreshToken is required.')
    .isString().withMessage('refreshToken must be a string.'),
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. FORGOT PASSWORD
// ─────────────────────────────────────────────────────────────────────────────

export const forgotPasswordValidator = [
  emailField(),
];

// ─────────────────────────────────────────────────────────────────────────────
// 6. RESET PASSWORD
// ─────────────────────────────────────────────────────────────────────────────

export const resetPasswordValidator = [
  body('token')
    .trim()
    .notEmpty().withMessage('Reset token is required.')
    .isHexadecimal().withMessage('Invalid reset token format.')
    .isLength({ min: 64, max: 64 }).withMessage('Invalid reset token length.'),

  passwordField('newPassword'),

  body('confirmPassword')
    .trim()
    .notEmpty().withMessage('Password confirmation is required.')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match.');
      }
      return true;
    }),
];

// ─────────────────────────────────────────────────────────────────────────────
// 7. CHANGE PASSWORD
// ─────────────────────────────────────────────────────────────────────────────

export const changePasswordValidator = [
  body('currentPassword')
    .trim()
    .notEmpty().withMessage('Current password is required.'),

  passwordField('newPassword'),

  body('confirmPassword')
    .trim()
    .notEmpty().withMessage('Password confirmation is required.')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match.');
      }
      return true;
    }),

  body('newPassword').custom((value, { req }) => {
    if (value === req.body.currentPassword) {
      throw new Error('New password must differ from the current password.');
    }
    return true;
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// 8. UPDATE PROFILE
// ─────────────────────────────────────────────────────────────────────────────

export const updateProfileValidator = [
  body('firstName')
    .optional({ nullable: true })
    .trim()
    .notEmpty().withMessage('First name cannot be blank if provided.')
    .isLength({ min: 1, max: 100 }).withMessage('First name must be 1–100 characters.')
    .matches(/^[A-Za-z\s'-]+$/).withMessage('First name contains invalid characters.'),

  body('lastName')
    .optional({ nullable: true })
    .trim()
    .notEmpty().withMessage('Last name cannot be blank if provided.')
    .isLength({ min: 1, max: 100 }).withMessage('Last name must be 1–100 characters.')
    .matches(/^[A-Za-z\s'-]+$/).withMessage('Last name contains invalid characters.'),

  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Must be a valid phone number.'),

  body('avatarUrl')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isURL({ protocols: ['https'], require_protocol: true })
    .withMessage('avatarUrl must be a valid HTTPS URL.')
    .isLength({ max: 2048 }).withMessage('avatarUrl is too long.'),

  // Prevent field injection
  body('email').not().exists().withMessage('Email cannot be changed via this endpoint.'),
  body('role').not().exists().withMessage('Role cannot be changed via this endpoint.'),
  body('roleName').not().exists().withMessage('Role cannot be changed via this endpoint.'),
  body('password').not().exists().withMessage('Use /change-password to update your password.'),
];


// ─────────────────────────────────────────────────────────────────────────────
// 9. REGISTER CUSTOMER (PUBLIC)
// ─────────────────────────────────────────────────────────────────────────────

export const registerCustomerValidator = [
  emailField(),
  passwordField(),
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required.')
    .isLength({ min: 1, max: 100 }).withMessage('First name must be 1–100 characters.')
    .matches(/^[A-Za-z\s'-]+$/).withMessage('First name contains invalid characters.'),
  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required.')
    .isLength({ min: 1, max: 100 }).withMessage('Last name must be 1–100 characters.')
    .matches(/^[A-Za-z\s'-]+$/).withMessage('Last name contains invalid characters.'),
  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Must be a valid phone number.'),
];

// ─────────────────────────────────────────────────────────────────────────────
// 10. SUPER ADMIN OTP
// ─────────────────────────────────────────────────────────────────────────────

export const sendSuperAdminOtpValidator = [
  emailField(),
];

export const verifySuperAdminOtpValidator = [
  emailField(),
  body('otp')
    .trim()
    .notEmpty().withMessage('OTP is required.')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be exactly 6 digits.')
    .isNumeric().withMessage('OTP must contain only numbers.'),
];
