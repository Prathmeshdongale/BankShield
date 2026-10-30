/**
 * customerController.js — HTTP handlers for customers + KYC module.
 */

import {
  createCustomerService,
  getCustomerService,
  listCustomersService,
  updateCustomerService,
  deactivateCustomerService,
  listKycService,
  submitKycDocumentService,
  updateKycStatusService,
} from '../services/customerService.js';
import { success, failure } from '../utils/response.js';
import { logger }           from '../utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const getMeta = (req) => ({
  actorId  : req.user?.id   ?? null,
  ipAddress: req.ip          ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});

const STATUS_MAP = {
  CUSTOMER_NOT_FOUND         : 404,
  CUSTOMER_ALREADY_EXISTS    : 409,
  CUSTOMER_ALREADY_DEACTIVATED: 409,
  USER_DETAILS_REQUIRED      : 422,
  KYC_NOT_FOUND              : 404,
  INVALID_KYC_STATUS         : 400,
  REJECTION_REASON_REQUIRED  : 400,
};

const USER_MESSAGES = {
  CUSTOMER_NOT_FOUND         : 'Customer not found.',
  CUSTOMER_ALREADY_EXISTS    : 'A customer profile already exists for this user.',
  CUSTOMER_ALREADY_DEACTIVATED: 'Customer is already deactivated.',
  USER_DETAILS_REQUIRED      : 'First name, last name, and email are required to create a new customer.',
  KYC_NOT_FOUND              : 'KYC document not found.',
  INVALID_KYC_STATUS         : 'Invalid KYC status.',
  REJECTION_REASON_REQUIRED  : 'A rejection reason is required when rejecting a document.',
};

const handleErr = (err, res) => {
  const code   = err.message;
  const status = err.statusCode ?? STATUS_MAP[code] ?? 500;
  const msg    = USER_MESSAGES[code] ?? 'An unexpected error occurred.';
  if (status >= 500) logger.error(`[CustomerController] ${err.stack ?? err.message}`);
  return failure(res, msg, status);
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/customers */
export const createCustomer = async (req, res) => {
  try {
    const {
      userId, firstName, lastName, email, phone, password,
      dateOfBirth, gender, nationality, occupation,
      annualIncome, riskRating, isPep, segment,
    } = req.body;
    const customer = await createCustomerService(
      { userId, firstName, lastName, email, phone, password,
        dateOfBirth, gender, nationality, occupation, annualIncome, riskRating, isPep, segment },
      getMeta(req)
    );
    return success(res, { customer }, 'Customer created successfully.', 201);
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/customers/:id */
export const getCustomer = async (req, res) => {
  try {
    const customer = await getCustomerService(req.params.id);
    return success(res, { customer }, 'Customer retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/customers */
export const listCustomers = async (req, res) => {
  try {
    const result = await listCustomersService(req.query);
    return success(res, result, 'Customers retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** PATCH /api/customers/:id */
export const updateCustomer = async (req, res) => {
  try {
    const { dateOfBirth, gender, nationality, occupation, annualIncome, riskRating, isPep, segment } = req.body;
    const customer = await updateCustomerService(
      req.params.id,
      { dateOfBirth, gender, nationality, occupation, annualIncome, riskRating, isPep, segment },
      getMeta(req)
    );
    return success(res, { customer }, 'Customer updated successfully.');
  } catch (err) { return handleErr(err, res); }
};

/** PATCH /api/customers/:id/deactivate */
export const deactivateCustomer = async (req, res) => {
  try {
    const result = await deactivateCustomerService(req.params.id, getMeta(req));
    return success(res, result, 'Customer deactivated.');
  } catch (err) { return handleErr(err, res); }
};

// ─────────────────────────────────────────────────────────────────────────────
// KYC HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/customers/:id/kyc */
export const listKyc = async (req, res) => {
  try {
    const docs = await listKycService(req.params.id);
    return success(res, { docs }, 'KYC documents retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/**
 * POST /api/customers/:id/kyc
 * Multer has already parsed req.file by the time this runs.
 */
export const submitKycDocument = async (req, res) => {
  try {
    const { docType, docNumber, expiryDate } = req.body;
    const result = await submitKycDocumentService(
      {
        customerId: req.params.id,
        docType,
        docNumber,
        expiryDate,
        file: req.file,
      },
      getMeta(req)
    );
    return success(res, result, 'KYC document submitted successfully.', 201);
  } catch (err) { return handleErr(err, res); }
};

/** PATCH /api/customers/:id/kyc/:kycId */
export const updateKycStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const updated = await updateKycStatusService(
      req.params.id,
      req.params.kycId,
      { status, rejectionReason },
      getMeta(req)
    );
    return success(res, { kyc: updated }, 'KYC status updated.');
  } catch (err) { return handleErr(err, res); }
};

export default {
  createCustomer, getCustomer, listCustomers, updateCustomer, deactivateCustomer,
  listKyc, submitKycDocument, updateKycStatus,
};
