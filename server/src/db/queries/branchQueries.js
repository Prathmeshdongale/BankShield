/**
 * branchQueries.js — Raw SQL for the branches module.
 *
 * branches table columns:
 *   id UUID PK, code VARCHAR(20) UNIQUE, name VARCHAR(150),
 *   address TEXT, city VARCHAR(100), state VARCHAR(100),
 *   country VARCHAR(80) DEFAULT 'India', phone VARCHAR(20),
 *   email VARCHAR(255), manager_id UUID → users,
 *   is_active BOOLEAN, deleted_at TIMESTAMPTZ,
 *   created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
 */

import { query as poolQuery } from '../connection.js';

const run = (client, text, params) =>
  client ? client.query(text, params) : poolQuery(text, params);

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

/** Full branch row with manager name joined. */
export const findBranchById = async (id, client = null) => {
  const { rows } = await run(client, `
    SELECT
      b.*,
      u.first_name || ' ' || u.last_name AS manager_name,
      u.email                             AS manager_email
    FROM  branches b
    LEFT  JOIN users u ON u.id = b.manager_id AND u.deleted_at IS NULL
    WHERE b.id = $1
      AND b.deleted_at IS NULL
    LIMIT 1;
  `, [id]);
  return rows[0] ?? null;
};

export const findBranchByCode = async (code, client = null) => {
  const { rows } = await run(client, `
    SELECT id, code FROM branches WHERE code = $1 AND deleted_at IS NULL LIMIT 1;
  `, [code]);
  return rows[0] ?? null;
};

/**
 * Paginated branch list with optional filters.
 * @param {object} opts
 * @param {string}  [opts.search]    — matches code, name, city
 * @param {boolean} [opts.isActive]  — filter by is_active
 * @param {string}  [opts.city]
 * @param {string}  [opts.country]
 * @param {number}  [opts.limit=20]
 * @param {number}  [opts.offset=0]
 * @param {string}  [opts.sortBy='created_at']
 * @param {string}  [opts.sortDir='DESC']
 */
export const listBranches = async ({
  search   = null,
  isActive = null,
  city     = null,
  country  = null,
  limit    = 20,
  offset   = 0,
  sortBy   = 'created_at',
  sortDir  = 'DESC',
} = {}, client = null) => {
  // Whitelist sortBy to prevent SQL injection
  const ALLOWED_SORT = ['created_at', 'name', 'code', 'city', 'country'];
  const col = ALLOWED_SORT.includes(sortBy) ? sortBy : 'created_at';
  const dir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const conditions = ['b.deleted_at IS NULL'];
  const values = [];

  if (search) {
    values.push(`%${search}%`);
    conditions.push(
      `(b.code ILIKE $${values.length} OR b.name ILIKE $${values.length} OR b.city ILIKE $${values.length})`
    );
  }
  if (isActive !== null) {
    values.push(isActive);
    conditions.push(`b.is_active = $${values.length}`);
  }
  if (city) {
    values.push(`%${city}%`);
    conditions.push(`b.city ILIKE $${values.length}`);
  }
  if (country) {
    values.push(`%${country}%`);
    conditions.push(`b.country ILIKE $${values.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  // Total count
  const countSql = `SELECT COUNT(*) FROM branches b ${where};`;
  const { rows: countRows } = await run(client, countSql, values);
  const total = parseInt(countRows[0].count, 10);

  // Data page
  values.push(limit, offset);
  const dataSql = `
    SELECT
      b.id, b.code, b.name, b.address, b.city, b.state, b.country,
      b.phone, b.email, b.manager_id, b.is_active,
      b.created_at, b.updated_at,
      u.first_name || ' ' || u.last_name AS manager_name
    FROM  branches b
    LEFT  JOIN users u ON u.id = b.manager_id AND u.deleted_at IS NULL
    ${where}
    ORDER BY b.${col} ${dir}
    LIMIT  $${values.length - 1}
    OFFSET $${values.length};
  `;
  const { rows } = await run(client, dataSql, values);
  return { rows, total };
};

// ─────────────────────────────────────────────────────────────────────────────
// WRITE
// ─────────────────────────────────────────────────────────────────────────────

export const createBranch = async ({
  code, name, address = null, city = null, state = null,
  country = 'India', phone = null, email = null, managerId = null,
}, client = null) => {
  const { rows } = await run(client, `
    INSERT INTO branches
      (code, name, address, city, state, country, phone, email, manager_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *;
  `, [code, name, address, city, state, country, phone, email, managerId]);
  return rows[0];
};

/**
 * Partial update — only sets the fields that are not undefined.
 */
export const updateBranch = async (id, fields, client = null) => {
  const ALLOWED = ['code','name','address','city','state','country','phone','email','manager_id','is_active'];
  const colMap  = { managerId: 'manager_id', isActive: 'is_active' };

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
    UPDATE branches
    SET    ${sets.join(', ')}
    WHERE  id = $1 AND deleted_at IS NULL
    RETURNING *;
  `, values);
  return rows[0] ?? null;
};

/** Soft-delete a branch. */
export const softDeleteBranch = async (id, client = null) => {
  const { rows } = await run(client, `
    UPDATE branches
    SET    deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
    WHERE  id = $1 AND deleted_at IS NULL
    RETURNING id, code, name;
  `, [id]);
  return rows[0] ?? null;
};
