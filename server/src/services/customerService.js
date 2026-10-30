/**
 * customerService.js — Business logic for customers + KYC modules.
 *
 * Endpoints covered:
 *   createCustomer      → POST   /api/customers
 *   getCustomer         → GET    /api/customers/:id
 *   listCustomers       → GET    /api/customers
 *   updateCustomer      → PATCH  /api/customers/:id
 *   deactivateCustomer  → PATCH  /api/customers/:id/deactivate
 *
 *   listKyc             → GET    /api/customers/:id/kyc
 *   submitKycDocument   → POST   /api/customers/:id/kyc        (Multer handles upload)
 *   updateKycStatus     → PATCH  /api/customers/:id/kyc/:kycId
 *
 * RBAC (enforced at route level — permission codes):
 *   customers:read        → list, get, list KYC
 *   customers:create      → createCustomer
 *   customers:update      → updateCustomer, deactivateCustomer
 *   customers:kyc_verify  → updateKycStatus
 *
 * Audit log written on every write.
 */

import path          from 'path';
import { logger }    from '../utils/logger.js';
import { getClient } from '../db/connection.js';
import bcrypt from 'bcrypt';
import { insertAuditLog, findUserByEmail, findRoleByName, createUser } from '../db/queries/authQueries.js';
const SALT_ROUNDS = 12;
import {
  nextCustomerNumber,
  findCustomerById,
  findCustomerByUserId,
  listCustomers       as dbListCustomers,
  createCustomer      as dbCreateCustomer,
  updateCustomer      as dbUpdateCustomer,
  softDeleteCustomer,
  listKycByCustomer,
  findKycById,
  createKycRecord,
  updateKycStatus     as dbUpdateKycStatus,
  softDeleteKyc,
  insertFileUpload,
} from '../db/queries/customerQueries.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const mkErr = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

const VALID_KYC_STATUSES = ['submitted','verified','rejected','expired'];

// ─────────────────────────────────────────────────────────────────────────────
// 1. CREATE CUSTOMER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a customer profile linked to an existing user_id.
 * The user must exist and must not already have a customer record.
 */
export const createCustomerService = async (fields, meta = {}) => {
  let { userId } = fields;

  if (!userId) {
    if (!fields.email || !fields.firstName || !fields.lastName) {
      throw mkErr('USER_DETAILS_REQUIRED', 422);
    }

    const existingUser = await findUserByEmail(fields.email);
    if (existingUser) {
      const existingCust = await findCustomerByUserId(existingUser.id);
      if (existingCust) throw mkErr('CUSTOMER_ALREADY_EXISTS', 409);
      userId = existingUser.id;
    } else {
      const role = await findRoleByName('customer');
      if (!role) throw mkErr('ROLE_NOT_FOUND', 500);

      const password = fields.password || 'Customer@123!';
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const newUser = await createUser({
        email: fields.email,
        phone: fields.phone ?? null,
        passwordHash,
        firstName: fields.firstName,
        lastName: fields.lastName,
        roleId: role.id,
      });
      userId = newUser.id;
    }
  } else {
    // One customer profile per user
    const existing = await findCustomerByUserId(userId);
    if (existing) throw mkErr('CUSTOMER_ALREADY_EXISTS', 409);
  }

  // Generate unique customer number (uses DB sequence)
  const customerNumber = await nextCustomerNumber();

  const customer = await dbCreateCustomer({ ...fields, userId, customerNumber });

  await insertAuditLog({
    userId    : meta.actorId,
    action    : 'CUSTOMER_CREATED',
    entityType: 'customer',
    entityId  : customer.id,
    newValue  : { customerNumber, userId },
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  });

  logger.info(`Customer created: ${customerNumber} (user: ${userId})`);
  return customer;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET ONE
// ─────────────────────────────────────────────────────────────────────────────

export const getCustomerService = async (id) => {
  const customer = await findCustomerById(id);
  if (!customer) throw mkErr('CUSTOMER_NOT_FOUND', 404);
  return customer;
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. LIST  (paginated + filtered)
// ─────────────────────────────────────────────────────────────────────────────

export const listCustomersService = async (query = {}) => {
  const limit  = Math.min(parseInt(query.limit,  10) || 20, 100);
  const offset = Math.max(parseInt(query.offset, 10) || 0,  0);
  const page   = Math.floor(offset / limit) + 1;

  const isPep = query.isPep === undefined ? null
    : query.isPep === 'true' || query.isPep === true;
  const isActive = query.isActive === undefined ? null
    : query.isActive === 'true' || query.isActive === true;

  const { rows, total } = await dbListCustomers({
    search     : query.search      || null,
    segment    : query.segment     || null,
    riskRating : query.riskRating  || null,
    isPep,
    isActive,
    createdFrom: query.createdFrom || null,
    createdTo  : query.createdTo   || null,
    sortBy     : query.sortBy      || 'created_at',
    sortDir    : query.sortDir     || 'DESC',
    limit,
    offset,
  });

  return {
    data      : rows,
    pagination: { total, limit, offset, page, pages: Math.ceil(total / limit) },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export const updateCustomerService = async (id, fields, meta = {}) => {
  const existing = await findCustomerById(id);
  if (!existing) throw mkErr('CUSTOMER_NOT_FOUND', 404);

  const updated = await dbUpdateCustomer(id, fields);

  await insertAuditLog({
    userId    : meta.actorId,
    action    : 'CUSTOMER_UPDATED',
    entityType: 'customer',
    entityId  : id,
    oldValue  : {
      riskRating : existing.risk_rating,
      segment    : existing.segment,
      isPep      : existing.is_pep,
    },
    newValue  : fields,
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  });

  logger.info(`Customer updated: ${id}`);
  return updated;
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. DEACTIVATE  (soft-delete the customer row)
// ─────────────────────────────────────────────────────────────────────────────

export const deactivateCustomerService = async (id, meta = {}) => {
  const existing = await findCustomerById(id);
  if (!existing) throw mkErr('CUSTOMER_NOT_FOUND', 404);
  if (existing.deleted_at) throw mkErr('CUSTOMER_ALREADY_DEACTIVATED', 409);

  const deleted = await softDeleteCustomer(id);

  await insertAuditLog({
    userId    : meta.actorId,
    action    : 'CUSTOMER_DEACTIVATED',
    entityType: 'customer',
    entityId  : id,
    oldValue  : { customerNumber: existing.customer_number },
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  });

  logger.info(`Customer deactivated: ${id}`);
  return deleted;
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. LIST KYC DOCUMENTS
// ─────────────────────────────────────────────────────────────────────────────

export const listKycService = async (customerId) => {
  const customer = await findCustomerById(customerId);
  if (!customer) throw mkErr('CUSTOMER_NOT_FOUND', 404);

  const docs = await listKycByCustomer(customerId);
  return docs;
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. SUBMIT KYC DOCUMENT  (upload handled by Multer middleware upstream)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string}  opts.customerId
 * @param {string}  opts.docType        — one of the kyc_status enum values
 * @param {string}  [opts.docNumber]
 * @param {string}  [opts.expiryDate]
 * @param {object}  opts.file           — req.file from Multer
 * @param {object}  meta                — { actorId, ipAddress, userAgent }
 */
export const submitKycDocumentService = async (opts, meta = {}) => {
  const { customerId, docType, docNumber, expiryDate, file } = opts;

  const customer = await findCustomerById(customerId);
  if (!customer) throw mkErr('CUSTOMER_NOT_FOUND', 404);

  // Persist file metadata to file_uploads
  const storagePath = file.path;                    // disk path (or S3 key in production)
  const storedName  = file.filename;                // multer-generated unique name
  const mimeType    = file.mimetype;
  const fileSize    = file.size;
  const bucket      = process.env.UPLOAD_BUCKET || 'local';

  const client = await getClient();
  let kycRecord, fileRecord;

  try {
    await client.query('BEGIN');

    // 1. Persist file upload row
    fileRecord = await insertFileUpload({
      uploaderId   : meta.actorId,
      originalName : file.originalname,
      storedName,
      mimeType,
      fileSize,
      storagePath,
      bucket,
      relatedEntity: 'customer_kyc',
      relatedId    : customerId,
    }, client);

    // 2. Create KYC record linking to the uploaded file
    kycRecord = await createKycRecord({
      customerId,
      docType,
      docNumber : docNumber || null,
      docUrl    : fileRecord.storage_path,
      expiryDate: expiryDate || null,
    }, client);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await insertAuditLog({
    userId    : meta.actorId,
    action    : 'KYC_DOCUMENT_SUBMITTED',
    entityType: 'customer_kyc',
    entityId  : kycRecord.id,
    newValue  : { customerId, docType, docNumber, fileId: fileRecord.id },
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  });

  logger.info(`KYC document submitted: ${kycRecord.id} for customer ${customerId}`);
  return { kyc: kycRecord, file: fileRecord };
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. UPDATE KYC STATUS  (verify / reject / expire)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} customerId
 * @param {string} kycId
 * @param {object} fields   — { status, rejectionReason? }
 * @param {object} meta     — { actorId, ipAddress, userAgent }
 */
export const updateKycStatusService = async (customerId, kycId, fields, meta = {}) => {
  const customer = await findCustomerById(customerId);
  if (!customer) throw mkErr('CUSTOMER_NOT_FOUND', 404);

  const kyc = await findKycById(kycId);
  if (!kyc) throw mkErr('KYC_NOT_FOUND', 404);
  if (kyc.customer_id !== customerId) throw mkErr('KYC_NOT_FOUND', 404);  // scope check

  const { status, rejectionReason } = fields;

  if (!VALID_KYC_STATUSES.includes(status)) {
    throw mkErr('INVALID_KYC_STATUS', 400);
  }
  if (status === 'rejected' && !rejectionReason) {
    throw mkErr('REJECTION_REASON_REQUIRED', 400);
  }

  const updated = await dbUpdateKycStatus({
    id             : kycId,
    status,
    verifiedBy     : meta.actorId,
    rejectionReason: rejectionReason || null,
  });

  await insertAuditLog({
    userId    : meta.actorId,
    action    : `KYC_STATUS_${status.toUpperCase()}`,
    entityType: 'customer_kyc',
    entityId  : kycId,
    oldValue  : { status: kyc.status },
    newValue  : { status, rejectionReason },
    ipAddress : meta.ipAddress,
    userAgent : meta.userAgent,
    status    : 'success',
  });

  logger.info(`KYC ${kycId} status updated to ${status} by ${meta.actorId}`);
  return updated;
};
