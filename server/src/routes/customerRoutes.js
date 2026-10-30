/**
 * customerRoutes.js
 *
 * RBAC applied per Section 4 of PROJECT_CONTEXT.md:
 *
 *   Method  Path                                Permission(s) required
 *   ──────  ────────────────────────────────    ─────────────────────────────
 *   POST    /api/customers                      customers:create
 *   GET     /api/customers                      customers:read
 *   GET     /api/customers/:id                  customers:read
 *   PATCH   /api/customers/:id                  customers:update
 *   PATCH   /api/customers/:id/deactivate       customers:update
 *
 *   GET     /api/customers/:id/kyc              customers:read
 *   POST    /api/customers/:id/kyc              customers:create  (+ Multer upload)
 *   PATCH   /api/customers/:id/kyc/:kycId       customers:kyc_verify
 *
 * Role matrix from seeds:
 *   customers:read       → super_admin, admin, compliance_officer, fraud_analyst,
 *                          branch_manager, teller
 *   customers:create     → super_admin, admin, branch_manager, teller
 *   customers:update     → super_admin, admin, compliance_officer, branch_manager
 *   customers:kyc_verify → super_admin, admin, compliance_officer, branch_manager
 */

import { Router }    from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { restrictBankingFromSuperAdmin } from '../middleware/bankingRestriction.js';
import { kycUpload, requireFile }  from '../middleware/upload.js';
import {
  validate,
  createCustomerValidator,
  updateCustomerValidator,
  customerIdValidator,
  listCustomersValidator,
  submitKycValidator,
  updateKycStatusValidator,
} from '../validators/customerValidators.js';
import {
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
  deactivateCustomer,
  listKyc,
  submitKycDocument,
  updateKycStatus,
} from '../controllers/customerController.js';

const router = Router();

// All customer routes require authentication
router.use(authenticate);
router.use(restrictBankingFromSuperAdmin);

// ── Customer CRUD ─────────────────────────────────────────────────────────────

/** GET /api/customers  — paginated search */
router.get(
  '/',
  authorize('customers:read'),
  ...listCustomersValidator,
  validate,
  listCustomers
);

/** GET /api/customers/:id */
router.get(
  '/:id',
  authorize('customers:read'),
  ...customerIdValidator,
  validate,
  getCustomer
);

/** POST /api/customers */
router.post(
  '/',
  authorize('customers:create'),
  ...createCustomerValidator,
  validate,
  createCustomer
);

/** PATCH /api/customers/:id */
router.patch(
  '/:id',
  authorize('customers:update'),
  ...updateCustomerValidator,
  validate,
  updateCustomer
);

/** PATCH /api/customers/:id/deactivate */
router.patch(
  '/:id/deactivate',
  authorize('customers:update'),
  ...customerIdValidator,
  validate,
  deactivateCustomer
);

// ── KYC ──────────────────────────────────────────────────────────────────────

/** GET /api/customers/:id/kyc */
router.get(
  '/:id/kyc',
  authorize('customers:read'),
  ...customerIdValidator,
  validate,
  listKyc
);

/**
 * POST /api/customers/:id/kyc
 * Multer runs first (kycUpload), then requireFile guard,
 * then validators, then handler.
 *
 * Request: multipart/form-data
 *   document   (file)   — JPEG/PNG/WEBP/PDF, max 5 MB
 *   docType    (string) — required
 *   docNumber  (string) — optional
 *   expiryDate (string) — optional ISO date
 */
router.post(
  '/:id/kyc',
  authorize('customers:create'),
  kycUpload,
  requireFile,
  ...submitKycValidator,
  validate,
  submitKycDocument
);

/**
 * PATCH /api/customers/:id/kyc/:kycId
 * Verify or reject a submitted KYC document.
 * Body: { status: 'verified'|'rejected'|'expired', rejectionReason?: string }
 */
router.patch(
  '/:id/kyc/:kycId',
  authorize('customers:kyc_verify'),
  ...updateKycStatusValidator,
  validate,
  updateKycStatus
);

export default router;
