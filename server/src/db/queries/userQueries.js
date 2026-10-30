/**
 * userQueries.js — Raw SQL queries for User Management.
 */

import { query as poolQuery } from '../connection.js';

const run = (client, text, params) =>
  client ? client.query(text, params) : poolQuery(text, params);

export const listUsers = async ({ role = null, isActive = null, search = null, limit = 50, offset = 0 }, client = null) => {
  const where = ['u.deleted_at IS NULL'];
  const params = [];

  if (role && role !== 'all') {
    params.push(role);
    where.push(`r.name = $${params.length}::role_name`);
  }
  if (isActive !== null) {
    params.push(isActive);
    where.push(`u.is_active = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`(
      LOWER(u.first_name || ' ' || u.last_name) LIKE $${params.length}
      OR LOWER(u.email) LIKE $${params.length}
    )`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countSql = `
    SELECT COUNT(*) AS total
    FROM users u
    JOIN roles r ON u.role_id = r.id
    ${whereClause}
  `;
  const countRes = await run(client, countSql, params);
  const total = parseInt(countRes.rows[0].total, 10);

  const dataParams = [...params];
  dataParams.push(limit);
  const limitIdx = dataParams.length;
  dataParams.push(offset);
  const offsetIdx = dataParams.length;

  const dataSql = `
    SELECT
      u.id, u.email, u.phone, u.first_name, u.last_name,
      u.is_active, u.is_verified, u.last_login_at,
      u.branch_id, u.created_at, u.updated_at,
      r.id AS role_id, r.name AS role_name, r.display_name AS role_display_name,
      b.name AS branch_name
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN branches b ON u.branch_id = b.id
    ${whereClause}
    ORDER BY u.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;
  const { rows } = await run(client, dataSql, dataParams);

  return { rows, total };
};

export const findUserWithRole = async (id, client = null) => {
  const sql = `
    SELECT
      u.id, u.email, u.phone, u.first_name, u.last_name,
      u.is_active, u.is_verified, u.last_login_at,
      u.branch_id, u.created_at, u.updated_at,
      r.id AS role_id, r.name AS role_name, r.display_name AS role_display_name,
      b.name AS branch_name
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN branches b ON u.branch_id = b.id
    WHERE u.id = $1 AND u.deleted_at IS NULL
    LIMIT 1
  `;
  const { rows } = await run(client, sql, [id]);
  return rows[0] ?? null;
};

export const updateUserStatus = async (id, isActive, client = null) => {
  const sql = `
    UPDATE users
    SET is_active = $2, updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, is_active, updated_at;
  `;
  const { rows } = await run(client, sql, [id, isActive]);
  return rows[0] ?? null;
};

export const updateUserRole = async (id, roleId, client = null) => {
  const sql = `
    UPDATE users
    SET role_id = $2, updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, role_id, updated_at;
  `;
  const { rows } = await run(client, sql, [id, roleId]);
  return rows[0] ?? null;
};

export const softDeleteUser = async (id, client = null) => {
  const sql = `
    UPDATE users
    SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id;
  `;
  const { rows } = await run(client, sql, [id]);
  return rows[0] ?? null;
};
