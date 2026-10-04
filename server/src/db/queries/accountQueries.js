/**
 * accountQueries.js — Raw SQL for accounts + account_types modules.
 *
 * accounts columns:
 *   id UUID PK, account_number VARCHAR(34) UNIQUE,
 *   customer_id UUID FK→customers RESTRICT, branch_id UUID FK→branches SET NULL,
 *   account_type_id INT FK→account_types RESTRICT,
 *   currency VARCHAR(3) DEFAULT 'INR',
 *   balance NUMERIC(17,2), available_balance NUMERIC(17,2),
 *   status VARCHAR(20) CHECK (pending|active|dormant|frozen|closed),
 *   opened_at DATE, closed_at DATE, nominee_name VARCHAR(150),
 *   joint_holder_id UUID FK→customers SET NULL,
 *   deleted_at TIMESTAMPTZ, created_at, updated_at
 *
 * account_types columns:
 *   id SERIAL PK, type_name account_type_name UNIQUE,
 *   description TEXT, min_balance NUMERIC(15,2),
 *   interest_rate NUMERIC(6,4), max_daily_limit NUMERIC(15,2),
 *   is_active BOOLEAN, created_at, updated_at
 */

import { query as poolQuery } from '../connection.js';

const run = (client, text, params) =>
  client ? client.query(text, params) : poolQuery(text, params);

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT NUMBER SEQUENCE
// Format: ACC-YYYYMMDD-NNNNNNNN  (8-digit zero-padded sequence)
// Uses a DB sequence so concurrent inserts never collide.
// ─────────────────────────────────────────────────────────────────────────────

export const ensureAccountSeq = async (client = null) => {
  await run(client, `
    CREATE SEQUENCE IF NOT EXISTS account_number_seq
      START 10000000 INCREMENT 1 NO CYCLE;
  `, []);
};

export const nextAccountNumber = async (client = null) => {
  await ensureAccountSeq(client);
  const { rows } = await run(client, `SELECT nextval('account_number_seq') AS n;`, []);
  const n    = String(rows[0].n).padStart(8, '0');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `ACC-${date}-${n}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT TYPES — reference table (seeded)
// ─────────────────────────────────────────────────────────────────────────────

export const listAccountTypes = async (client = null) => {
  const { rows } = await run(client,
    `SELECT * FROM account_types WHERE is_active = TRUE ORDER BY type_name;`, []);
  return rows;
};

export const findAccountTypeByName = async (typeName, client = null) => {
  const { rows } = await run(client,
    `SELECT * FROM account_types WHERE type_name = $1::account_type_name AND is_active = TRUE LIMIT 1;`,
    [typeName]);
  return rows[0] ?? null;
};

export const findAccountTypeById = async (id, client = null) => {
  const { rows } = await run(client,
    `SELECT * FROM account_types WHERE id = $1 LIMIT 1;`, [id]);
  return rows[0] ?? null;
};

/** Upsert an account_type row — idempotent, used by the init seeder. */
export const upsertAccountType = async ({
  typeName, description, minBalance = 0, interestRate = 0, maxDailyLimit = null,
}, client = null) => {
  const { rows } = await run(client, `
    INSERT INTO account_types (type_name, description, min_balance, interest_rate, max_daily_limit)
    VALUES ($1::account_type_name, $2, $3, $4, $5)
    ON CONFLICT (type_name) DO UPDATE
      SET description     = EXCLUDED.description,
          min_balance     = EXCLUDED.min_balance,
          interest_rate   = EXCLUDED.interest_rate,
          max_daily_limit = EXCLUDED.max_daily_limit,
          updated_at      = NOW()
    RETURNING *;
  `, [typeName, description, minBalance, interestRate, maxDailyLimit]);
  return rows[0];
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT READ
// ─────────────────────────────────────────────────────────────────────────────

const ACCOUNT_SELECT = `
  SELECT
    a.id, a.account_number, a.customer_id, a.branch_id, a.account_type_id,
    a.currency, a.balance, a.available_balance, a.status,
    a.opened_at, a.closed_at, a.nominee_name, a.joint_holder_id,
    a.deleted_at, a.created_at, a.updated_at,
    at.type_name   AS account_type,
    at.description AS account_type_description,
    at.interest_rate,
    at.min_balance AS min_required_balance,
    at.max_daily_limit,
    c.customer_number,
    u.first_name   AS customer_first_name,
    u.last_name    AS customer_last_name,
    u.email        AS customer_email,
    b.code         AS branch_code,
    b.name         AS branch_name
  FROM  accounts a
  JOIN  account_types at ON at.id = a.account_type_id
  JOIN  customers     c  ON c.id = a.customer_id
  JOIN  users         u  ON u.id = c.user_id
  LEFT  JOIN branches b  ON b.id = a.branch_id
`;

export const findAccountById = async (id, client = null) => {
  const { rows } = await run(client,
    `${ACCOUNT_SELECT} WHERE a.id = $1 AND a.deleted_at IS NULL LIMIT 1;`, [id]);
  return rows[0] ?? null;
};

export const findAccountByNumber = async (accountNumber, client = null) => {
  const { rows } = await run(client,
    `${ACCOUNT_SELECT} WHERE a.account_number = $1 AND a.deleted_at IS NULL LIMIT 1;`,
    [accountNumber]);
  return rows[0] ?? null;
};

/** Lock a single account row FOR UPDATE — use inside a transaction. */
export const lockAccountById = async (id, client) => {
  const { rows } = await run(client,
    `SELECT id, balance, available_balance, status FROM accounts WHERE id = $1 FOR UPDATE;`, [id]);
  return rows[0] ?? null;
};

/**
 * Paginated account list.
 * Filters: customerId, status, accountType, branchId, search (account_number),
 *          createdFrom, createdTo, sortBy, sortDir
 */
export const listAccounts = async ({
  customerId   = null,
  status       = null,
  accountType  = null,
  branchId     = null,
  search       = null,
  createdFrom  = null,
  createdTo    = null,
  limit        = 20,
  offset       = 0,
  sortBy       = 'created_at',
  sortDir      = 'DESC',
} = {}, client = null) => {
  const ALLOWED_SORT = ['created_at', 'account_number', 'balance', 'opened_at'];
  const col = ALLOWED_SORT.includes(sortBy) ? sortBy : 'created_at';
  const dir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const conditions = ['a.deleted_at IS NULL'];
  const values = [];

  if (customerId) {
    values.push(customerId);
    conditions.push(`a.customer_id = $${values.length}`);
  }
  if (status) {
    values.push(status);
    conditions.push(`a.status = $${values.length}`);
  }
  if (accountType) {
    values.push(accountType);
    conditions.push(`at.type_name = $${values.length}::account_type_name`);
  }
  if (branchId) {
    values.push(branchId);
    conditions.push(`a.branch_id = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`a.account_number ILIKE $${values.length}`);
  }
  if (createdFrom) {
    values.push(createdFrom);
    conditions.push(`a.created_at >= $${values.length}`);
  }
  if (createdTo) {
    values.push(createdTo);
    conditions.push(`a.created_at <= $${values.length}`);
  }

  const joins = `
    JOIN  account_types at ON at.id = a.account_type_id
    JOIN  customers     c  ON c.id = a.customer_id
    JOIN  users         u  ON u.id = c.user_id
    LEFT  JOIN branches b  ON b.id = a.branch_id
  `;
  const where = `WHERE ${conditions.join(' AND ')}`;

  const countSql = `SELECT COUNT(*) FROM accounts a ${joins} ${where};`;
  const { rows: countRows } = await run(client, countSql, values);
  const total = parseInt(countRows[0].count, 10);

  values.push(limit, offset);
  const dataSql = `
    SELECT
      a.id, a.account_number, a.customer_id, a.branch_id, a.account_type_id,
      a.currency, a.balance, a.available_balance, a.status,
      a.opened_at, a.closed_at, a.nominee_name,
      a.created_at, a.updated_at,
      at.type_name AS account_type,
      c.customer_number,
      u.first_name AS customer_first_name,
      u.last_name  AS customer_last_name,
      b.code       AS branch_code
    FROM  accounts a
    ${joins}
    ${where}
    ORDER BY a.${col} ${dir}
    LIMIT  $${values.length - 1}
    OFFSET $${values.length};
  `;
  const { rows } = await run(client, dataSql, values);
  return { rows, total };
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT WRITE
// ─────────────────────────────────────────────────────────────────────────────

export const createAccount = async ({
  accountNumber, customerId, branchId = null, accountTypeId,
  currency = 'INR', nomineeName = null, jointHolderId = null,
}, client = null) => {
  const { rows } = await run(client, `
    INSERT INTO accounts
      (account_number, customer_id, branch_id, account_type_id,
       currency, nominee_name, joint_holder_id, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
    RETURNING *;
  `, [accountNumber, customerId, branchId, accountTypeId,
      currency, nomineeName, jointHolderId]);
  return rows[0];
};

/** Generic partial update — whitelisted fields only. */
export const updateAccount = async (id, fields, client = null) => {
  const ALLOWED = [
    'branch_id', 'nominee_name', 'joint_holder_id', 'currency',
    'status', 'closed_at',
  ];
  const colMap = {
    branchId: 'branch_id', nomineeName: 'nominee_name',
    jointHolderId: 'joint_holder_id', closedAt: 'closed_at',
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
    UPDATE accounts
    SET    ${sets.join(', ')}
    WHERE  id = $1 AND deleted_at IS NULL
    RETURNING *;
  `, values);
  return rows[0] ?? null;
};

/** Change account status atomically — used by freeze/activate/close. */
export const setAccountStatus = async (id, status, closedAt = null, client = null) => {
  const { rows } = await run(client, `
    UPDATE accounts
    SET    status     = $2,
           closed_at  = $3,
           updated_at = NOW()
    WHERE  id = $1 AND deleted_at IS NULL
    RETURNING id, account_number, status, balance, available_balance, closed_at, updated_at;
  `, [id, status, closedAt]);
  return rows[0] ?? null;
};

/** Soft-delete an account (sets deleted_at). */
export const softDeleteAccount = async (id, client = null) => {
  const { rows } = await run(client, `
    UPDATE accounts
    SET    deleted_at = NOW(), status = 'closed',
           closed_at  = CURRENT_DATE, updated_at = NOW()
    WHERE  id = $1 AND deleted_at IS NULL
    RETURNING id, account_number, status;
  `, [id]);
  return rows[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// BALANCE / HISTORY  (read-only, no writes to transactions here)
// ─────────────────────────────────────────────────────────────────────────────

export const getAccountBalance = async (id, client = null) => {
  const { rows } = await run(client, `
    SELECT id, account_number, balance, available_balance,
           currency, status, updated_at
    FROM   accounts
    WHERE  id = $1 AND deleted_at IS NULL
    LIMIT  1;
  `, [id]);
  return rows[0] ?? null;
};

/**
 * Paginated transaction history for an account.
 * Returns ledger rows from the transactions table.
 */
export const getAccountHistory = async ({
  accountId, limit = 30, offset = 0,
  status = null, txnType = null,
  dateFrom = null, dateTo = null,
} = {}, client = null) => {
  const conditions = [
    `(t.source_account_id = $1 OR t.destination_account_id = $1)`,
  ];
  const values = [accountId];

  if (status) {
    values.push(status);
    conditions.push(`t.status = $${values.length}`);
  }
  if (txnType) {
    values.push(txnType);
    conditions.push(`t.txn_type = $${values.length}::txn_type`);
  }
  if (dateFrom) {
    values.push(dateFrom);
    conditions.push(`t.created_at >= $${values.length}`);
  }
  if (dateTo) {
    values.push(dateTo);
    conditions.push(`t.created_at <= $${values.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countSql = `SELECT COUNT(*) FROM transactions t ${where};`;
  const { rows: countRows } = await run(client, countSql, values);
  const total = parseInt(countRows[0].count, 10);

  values.push(limit, offset);
  const dataSql = `
    SELECT
      t.id, t.transaction_ref, t.txn_type, t.status,
      t.amount, t.currency, t.description,
      t.source_account_id, t.destination_account_id,
      t.risk_score, t.is_fraud, t.channel,
      t.created_at,
      CASE WHEN t.source_account_id = $1 THEN 'debit' ELSE 'credit' END AS direction
    FROM  transactions t
    ${where}
    ORDER BY t.created_at DESC
    LIMIT  $${values.length - 1}
    OFFSET $${values.length};
  `;
  const { rows } = await run(client, dataSql, values);
  return { rows, total };
};
