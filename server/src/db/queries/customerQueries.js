/**
 * customerQueries.js — Raw SQL for customers + customer_kyc + file_uploads.
 *
 * customers columns:
 *   id UUID PK, user_id UUID UNIQUE FK→users, customer_number VARCHAR(20) UNIQUE,
 *   date_of_birth DATE, gender VARCHAR(10), nationality VARCHAR(80),
 *   occupation VARCHAR(150), annual_income NUMERIC(15,2), risk_rating VARCHAR(10),
 *   is_pep BOOLEAN, segment VARCHAR(50), deleted_at, created_at, updated_at
 *
 * customer_kyc columns:
 *   id UUID PK, customer_id UUID FK, doc_type VARCHAR(60), doc_number VARCHAR(100),
 *   doc_url TEXT, expiry_date DATE, status kyc_status, verified_by UUID FK→users,
 *   verified_at TIMESTAMPTZ, rejection_reason TEXT, deleted_at, created_at, updated_at
 *
 * file_uploads columns:
 *   id UUID PK, uploader_id UUID FK→users, original_name, stored_name (UNIQUE),
 *   mime_type, file_size BIGINT, storage_path TEXT, bucket VARCHAR(100),
 *   related_entity VARCHAR(50), related_id TEXT, is_public BOOLEAN,
 *   deleted_at, created_at, updated_at
 */

import { query as poolQuery } from '../connection.js';

const run = (client, text, params) =>
  client ? client.query(text, params) : poolQuery(text, params);

// ─────────────────────────────────────────────────────────────────────────────
// SEQUENCE HELPER — generate customer_number
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a unique customer number: CUST-YYYYMMDD-NNNNNN
 * Uses a DB sequence to guarantee uniqueness under concurrent inserts.
 */
export const ensureCustomerSeq = async (client = null) => {
  await run(client, `
    CREATE SEQUENCE IF NOT EXISTS customer_number_seq START 100000 INCREMENT 1;
  `, []);
};

export const nextCustomerNumber = async (client = null) => {
  await ensureCustomerSeq(client);
  const { rows } = await run(client, `SELECT nextval('customer_number_seq') AS n;`, []);
  const n    = rows[0].n;
  const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
  return `CUST-${date}-${String(n).padStart(6,'0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER READ
// ─────────────────────────────────────────────────────────────────────────────

/** Full customer profile with joined user fields. */
export const findCustomerById = async (id, client = null) => {
  const { rows } = await run(client, `
    SELECT
      c.*,
      u.email, u.phone AS user_phone,
      u.first_name, u.last_name,
      u.is_active AS user_is_active,
      u.created_at AS user_created_at
    FROM  customers c
    JOIN  users u ON u.id = c.user_id
    WHERE c.id = $1
      AND c.deleted_at IS NULL
    LIMIT 1;
  `, [id]);
  return rows[0] ?? null;
};

export const findCustomerByUserId = async (userId, client = null) => {
  const { rows } = await run(client, `
    SELECT c.*, u.email, u.first_name, u.last_name
    FROM  customers c
    JOIN  users u ON u.id = c.user_id
    WHERE c.user_id = $1 AND c.deleted_at IS NULL
    LIMIT 1;
  `, [userId]);
  return rows[0] ?? null;
};

export const findCustomerByNumber = async (customerNumber, client = null) => {
  const { rows } = await run(client, `
    SELECT id FROM customers WHERE customer_number = $1 AND deleted_at IS NULL LIMIT 1;
  `, [customerNumber]);
  return rows[0] ?? null;
};

/**
 * Paginated customer search.
 * Filters: search (name/email/number), segment, riskRating, isPep, isActive,
 *          createdFrom, createdTo, sortBy, sortDir.
 */
export const listCustomers = async ({
  search      = null,
  segment     = null,
  riskRating  = null,
  isPep       = null,
  isActive    = null,
  createdFrom = null,
  createdTo   = null,
  limit       = 20,
  offset      = 0,
  sortBy      = 'created_at',
  sortDir     = 'DESC',
} = {}, client = null) => {
  const ALLOWED_SORT = ['created_at','customer_number','last_name','risk_rating','segment'];
  const col = ALLOWED_SORT.includes(sortBy) ? sortBy : 'created_at';
  const dir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const conditions = ['c.deleted_at IS NULL'];
  const values = [];

  if (search) {
    values.push(`%${search}%`);
    conditions.push(
      `(u.first_name ILIKE $${values.length} OR u.last_name ILIKE $${values.length}` +
      ` OR u.email ILIKE $${values.length} OR c.customer_number ILIKE $${values.length})`
    );
  }
  if (segment) {
    values.push(segment);
    conditions.push(`c.segment = $${values.length}`);
  }
  if (riskRating) {
    values.push(riskRating);
    conditions.push(`c.risk_rating = $${values.length}`);
  }
  if (isPep !== null) {
    values.push(isPep);
    conditions.push(`c.is_pep = $${values.length}`);
  }
  if (isActive !== null) {
    values.push(isActive);
    conditions.push(`u.is_active = $${values.length}`);
  }
  if (createdFrom) {
    values.push(createdFrom);
    conditions.push(`c.created_at >= $${values.length}`);
  }
  if (createdTo) {
    values.push(createdTo);
    conditions.push(`c.created_at <= $${values.length}`);
  }

  const joins = 'JOIN users u ON u.id = c.user_id';
  const where = `WHERE ${conditions.join(' AND ')}`;

  const countSql = `SELECT COUNT(*) FROM customers c ${joins} ${where};`;
  const { rows: countRows } = await run(client, countSql, values);
  const total = parseInt(countRows[0].count, 10);

  values.push(limit, offset);
  const dataSql = `
    SELECT
      c.id, c.customer_number, c.user_id,
      u.first_name, u.last_name, u.email, u.phone AS user_phone,
      c.date_of_birth, c.gender, c.nationality, c.occupation,
      c.annual_income, c.risk_rating, c.is_pep, c.segment,
      u.is_active, c.created_at, c.updated_at
    FROM  customers c
    ${joins}
    ${where}
    ORDER BY c.${col} ${dir}
    LIMIT  $${values.length - 1}
    OFFSET $${values.length};
  `;
  const { rows } = await run(client, dataSql, values);
  return { rows, total };
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER WRITE
// ─────────────────────────────────────────────────────────────────────────────

export const createCustomer = async ({
  userId, customerNumber,
  dateOfBirth = null, gender = null, nationality = null,
  occupation = null, annualIncome = null,
  riskRating = 'low', isPep = false, segment = 'retail',
}, client = null) => {
  const { rows } = await run(client, `
    INSERT INTO customers
      (user_id, customer_number, date_of_birth, gender, nationality,
       occupation, annual_income, risk_rating, is_pep, segment)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *;
  `, [userId, customerNumber, dateOfBirth, gender, nationality,
      occupation, annualIncome, riskRating, isPep, segment]);
  return rows[0];
};

/** Partial update — only columns in ALLOWED list. */
export const updateCustomer = async (id, fields, client = null) => {
  const ALLOWED = [
    'date_of_birth','gender','nationality','occupation',
    'annual_income','risk_rating','is_pep','segment',
  ];
  const colMap = {
    dateOfBirth: 'date_of_birth', annualIncome: 'annual_income',
    riskRating: 'risk_rating', isPep: 'is_pep',
  };

  const sets   = [];
  const values = [id];

  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined) continue;
    const col = colMap[key] ?? key;
    if (!ALLOWED.includes(col)) continue;
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  }
  if (sets.length === 0) return null;
  sets.push('updated_at = NOW()');

  const { rows } = await run(client, `
    UPDATE customers
    SET    ${sets.join(', ')}
    WHERE  id = $1 AND deleted_at IS NULL
    RETURNING *;
  `, values);
  return rows[0] ?? null;
};

/** Soft-delete a customer (does NOT touch the linked user row). */
export const softDeleteCustomer = async (id, client = null) => {
  const { rows } = await run(client, `
    UPDATE customers
    SET    deleted_at = NOW(), updated_at = NOW()
    WHERE  id = $1 AND deleted_at IS NULL
    RETURNING id, customer_number;
  `, [id]);
  return rows[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// KYC READ
// ─────────────────────────────────────────────────────────────────────────────

export const listKycByCustomer = async (customerId, client = null) => {
  const { rows } = await run(client, `
    SELECT
      k.*,
      u.first_name || ' ' || u.last_name AS verified_by_name
    FROM  customer_kyc k
    LEFT  JOIN users u ON u.id = k.verified_by
    WHERE k.customer_id = $1
      AND k.deleted_at IS NULL
    ORDER BY k.created_at DESC;
  `, [customerId]);
  return rows;
};

export const findKycById = async (id, client = null) => {
  const { rows } = await run(client, `
    SELECT k.*, u.first_name || ' ' || u.last_name AS verified_by_name
    FROM   customer_kyc k
    LEFT   JOIN users u ON u.id = k.verified_by
    WHERE  k.id = $1 AND k.deleted_at IS NULL
    LIMIT  1;
  `, [id]);
  return rows[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// KYC WRITE
// ─────────────────────────────────────────────────────────────────────────────

export const createKycRecord = async ({
  customerId, docType, docNumber = null,
  docUrl = null, expiryDate = null,
}, client = null) => {
  const { rows } = await run(client, `
    INSERT INTO customer_kyc
      (customer_id, doc_type, doc_number, doc_url, expiry_date, status)
    VALUES ($1, $2, $3, $4, $5, 'submitted')
    RETURNING *;
  `, [customerId, docType, docNumber, docUrl, expiryDate]);
  return rows[0];
};

/**
 * Update KYC status (verify / reject).
 * For rejection, rejection_reason must be provided.
 */
export const updateKycStatus = async ({
  id, status, verifiedBy = null, rejectionReason = null,
}, client = null) => {
  const { rows } = await run(client, `
    UPDATE customer_kyc
    SET    status           = $2::kyc_status,
           verified_by      = $3,
           verified_at      = CASE WHEN $2::text = 'verified' THEN NOW() ELSE NULL END,
           rejection_reason = $4,
           updated_at       = NOW()
    WHERE  id = $1 AND deleted_at IS NULL
    RETURNING *;
  `, [id, status, verifiedBy, rejectionReason]);
  return rows[0] ?? null;
};

/** Soft-delete a KYC document (compliance teams may need to retract). */
export const softDeleteKyc = async (id, client = null) => {
  const { rows } = await run(client, `
    UPDATE customer_kyc
    SET    deleted_at = NOW(), updated_at = NOW()
    WHERE  id = $1 AND deleted_at IS NULL
    RETURNING id, doc_type, status;
  `, [id]);
  return rows[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// FILE UPLOADS
// ─────────────────────────────────────────────────────────────────────────────

export const insertFileUpload = async ({
  uploaderId, originalName, storedName, mimeType,
  fileSize, storagePath, bucket = null,
  relatedEntity = null, relatedId = null, isPublic = false,
}, client = null) => {
  const { rows } = await run(client, `
    INSERT INTO file_uploads
      (uploader_id, original_name, stored_name, mime_type, file_size,
       storage_path, bucket, related_entity, related_id, is_public)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *;
  `, [uploaderId, originalName, storedName, mimeType, fileSize,
      storagePath, bucket, relatedEntity, relatedId, isPublic]);
  return rows[0];
};

export const findFileUpload = async (id, client = null) => {
  const { rows } = await run(client, `
    SELECT * FROM file_uploads WHERE id = $1 AND deleted_at IS NULL LIMIT 1;
  `, [id]);
  return rows[0] ?? null;
};
