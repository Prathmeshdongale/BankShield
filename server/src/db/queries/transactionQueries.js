/**
 * transactionQueries.js — Raw SQL for the transactions module.
 *
 * transactions table key columns (all exact schema names):
 *   id UUID PK, transaction_ref VARCHAR(40) UNIQUE NOT NULL,
 *   source_account_id UUID FK→accounts RESTRICT (nullable for deposits),
 *   destination_account_id UUID FK→accounts RESTRICT (nullable for withdrawals),
 *   card_id UUID FK→cards SET NULL,
 *   beneficiary_id UUID FK→beneficiaries SET NULL,
 *   amount NUMERIC(17,2) CHECK > 0,
 *   currency VARCHAR(3) DEFAULT 'INR',
 *   exchange_rate NUMERIC(12,6) DEFAULT 1.0,
 *   amount_in_base — GENERATED ALWAYS AS (amount * exchange_rate) STORED — never set manually,
 *   txn_type txn_type NOT NULL,       enum: credit|debit|transfer|deposit|withdrawal|payment|reversal|fee|interest
 *   status txn_status NOT NULL,       enum: pending|processing|completed|failed|flagged|blocked|reversed
 *   description TEXT,
 *   merchant_name VARCHAR(150),
 *   merchant_category VARCHAR(80),
 *   ip_address INET,
 *   device_fingerprint VARCHAR(255),
 *   location_city VARCHAR(100),
 *   location_country VARCHAR(80),
 *   channel VARCHAR(30) CHECK (web|mobile|atm|pos|branch|upi|neft|rtgs|imps|api),
 *   risk_score NUMERIC(6,4) DEFAULT 0,
 *   is_fraud BOOLEAN DEFAULT FALSE,
 *   flagged_at TIMESTAMPTZ,
 *   completed_at TIMESTAMPTZ,
 *   reversed_at TIMESTAMPTZ,
 *   reversal_txn_id UUID FK→transactions RESTRICT,
 *   metadata JSONB,
 *   created_at, updated_at  (NO deleted_at — immutable ledger)
 *
 * Idempotency: stored in transaction_idempotency_keys (runtime table, created on startup).
 *   If a request arrives with an idempotency_key that was already processed,
 *   the original transaction row is returned immediately without re-executing.
 */

import crypto               from 'crypto';
import { query as poolQuery } from '../connection.js';

const run = (client, text, params) =>
  client ? client.query(text, params) : poolQuery(text, params);

// ─────────────────────────────────────────────────────────────────────────────
// IDEMPOTENCY KEYS  (runtime table — created on startup)
// ─────────────────────────────────────────────────────────────────────────────

export const ensureIdempotencyTable = async (client = null) => {
  await run(client, `
    CREATE TABLE IF NOT EXISTS transaction_idempotency_keys (
      id             BIGSERIAL    PRIMARY KEY,
      idempotency_key VARCHAR(128) NOT NULL,
      account_id      UUID         NOT NULL,
      transaction_id  UUID         NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
      created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (idempotency_key, account_id)
    );
    CREATE INDEX IF NOT EXISTS idx_idem_key_account
      ON transaction_idempotency_keys(idempotency_key, account_id);
  `, []);
};

/**
 * Look up an existing idempotency record.
 * Returns { transaction_id } or null.
 */
export const findIdempotencyKey = async (idempotencyKey, accountId, client = null) => {
  const { rows } = await run(client, `
    SELECT transaction_id
    FROM   transaction_idempotency_keys
    WHERE  idempotency_key = $1 AND account_id = $2
    LIMIT  1;
  `, [idempotencyKey, accountId]);
  return rows[0] ?? null;
};

/** Register an idempotency key after a successful transaction. */
export const saveIdempotencyKey = async (idempotencyKey, accountId, transactionId, client = null) => {
  await run(client, `
    INSERT INTO transaction_idempotency_keys (idempotency_key, account_id, transaction_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (idempotency_key, account_id) DO NOTHING;
  `, [idempotencyKey, accountId, transactionId]);
};

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION REFERENCE — TXN-YYYYMMDD-XXXXXXXX (8-char random hex suffix)
// Uses randomBytes instead of a DB sequence so the ref is also generated
// inside a locked transaction without needing a separate sequence call.
// ─────────────────────────────────────────────────────────────────────────────

export const generateTransactionRef = () => {
  const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars
  return `TXN-${date}-${suffix}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT LOCKS (FOR UPDATE) — must be called inside a transaction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lock and return a single account row.
 * Always call both accounts with IDs in consistent order (lower UUID first)
 * to avoid deadlocks in concurrent transfers.
 */
export const lockAccount = async (accountId, client) => {
  const { rows } = await run(client, `
    SELECT id, balance, available_balance, status, currency
    FROM   accounts
    WHERE  id = $1
    FOR UPDATE;
  `, [accountId]);
  return rows[0] ?? null;
};

/**
 * Lock two accounts in a deterministic order (lower UUID string first)
 * to prevent deadlocks in concurrent peer-to-peer transfers.
 */
export const lockTwoAccounts = async (idA, idB, client) => {
  // Sort UUIDs lexicographically so all callers lock in the same order
  const [first, second] = idA < idB ? [idA, idB] : [idB, idA];
  const r1 = await lockAccount(first,  client);
  const r2 = await lockAccount(second, client);
  // Return in original caller order
  return idA < idB ? [r1, r2] : [r2, r1];
};

// ─────────────────────────────────────────────────────────────────────────────
// BALANCE UPDATES  (always inside a transaction)
// ─────────────────────────────────────────────────────────────────────────────

/** Credit an account — adds to both balance and available_balance. */
export const creditAccount = async (accountId, amount, client) => {
  await run(client, `
    UPDATE accounts
    SET    balance           = balance + $2,
           available_balance = available_balance + $2,
           updated_at        = NOW()
    WHERE  id = $1;
  `, [accountId, amount]);
};

/** Debit an account — subtracts from both balance and available_balance.
 *  Uses a conditional WHERE balance >= amount so the DB rejects over-drafts
 *  even under concurrent transactions where the app-level balance check
 *  passed before the competing transaction committed.
 *  Returns { id } if the update succeeded, null if balance was insufficient.
 */
export const debitAccount = async (accountId, amount, client) => {
  const { rows } = await run(client, `
    UPDATE accounts
    SET    balance           = balance - $2,
           available_balance = available_balance - $2,
           updated_at        = NOW()
    WHERE  id = $1
      AND  balance >= $2
    RETURNING id;
  `, [accountId, amount]);
  return rows[0] ?? null;   // null means balance was insufficient at commit time
};

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION INSERT
// amount_in_base is GENERATED ALWAYS AS — must NOT be in column list.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new transaction row.
 * @param {object} t  — all transaction fields
 * @param {PoolClient} client  — must be inside BEGIN/COMMIT block
 */
export const insertTransaction = async ({
  transactionRef,
  sourceAccountId      = null,
  destinationAccountId = null,
  cardId               = null,
  beneficiaryId        = null,
  amount,
  currency             = 'INR',
  exchangeRate         = 1.0,
  txnType,
  status               = 'pending',
  description          = null,
  merchantName         = null,
  merchantCategory     = null,
  ipAddress            = null,
  deviceFingerprint    = null,
  locationCity         = null,
  locationCountry      = null,
  latitude             = null,
  longitude            = null,
  channel              = null,
  riskScore            = 0.0,
  isFraud              = false,
  flaggedAt            = null,
  completedAt          = null,
  metadata             = null,
}, client) => {
  const { rows } = await run(client, `
    INSERT INTO transactions (
      transaction_ref,
      source_account_id, destination_account_id, card_id, beneficiary_id,
      amount, currency, exchange_rate, txn_type, status,
      description, merchant_name, merchant_category,
      ip_address, device_fingerprint, location_city, location_country,
      latitude, longitude, channel,
      risk_score, is_fraud, flagged_at, completed_at, metadata
    ) VALUES (
      $1,
      $2, $3, $4, $5,
      $6, $7, $8, $9::txn_type, $10::txn_status,
      $11, $12, $13,
      $14::inet, $15, $16, $17,
      $18, $19, $20,
      $21, $22, $23, $24, $25
    )
    RETURNING
      id, transaction_ref, source_account_id, destination_account_id,
      card_id, amount, currency, exchange_rate, amount_in_base,
      txn_type, status, description, merchant_name, channel,
      ip_address, location_city, location_country,
      risk_score, is_fraud, flagged_at, completed_at,
      metadata, created_at, updated_at;
  `, [
    transactionRef,
    sourceAccountId, destinationAccountId, cardId, beneficiaryId,
    amount, currency, exchangeRate, txnType, status,
    description, merchantName, merchantCategory,
    ipAddress, deviceFingerprint, locationCity, locationCountry,
    latitude, longitude, channel,
    riskScore, isFraud, flaggedAt, completedAt,
    metadata ? JSON.stringify(metadata) : null,
  ]);
  return rows[0];
};

/** Update a transaction's status and optional flag/complete timestamps. */
export const updateTransactionStatus = async (id, {
  status, riskScore, isFraud, flaggedAt, completedAt, reversalTxnId, reversedAt,
}, client = null) => {
  const sets   = ['status = $2::txn_status', 'updated_at = NOW()'];
  const values = [id, status];

  if (riskScore   !== undefined) { values.push(riskScore);    sets.push(`risk_score        = $${values.length}`); }
  if (isFraud     !== undefined) { values.push(isFraud);      sets.push(`is_fraud          = $${values.length}`); }
  if (flaggedAt   !== undefined) { values.push(flaggedAt);    sets.push(`flagged_at        = $${values.length}`); }
  if (completedAt !== undefined) { values.push(completedAt);  sets.push(`completed_at      = $${values.length}`); }
  if (reversalTxnId !== undefined) { values.push(reversalTxnId); sets.push(`reversal_txn_id = $${values.length}`); }
  if (reversedAt  !== undefined) { values.push(reversedAt);   sets.push(`reversed_at       = $${values.length}`); }

  const { rows } = await run(client, `
    UPDATE transactions
    SET    ${sets.join(', ')}
    WHERE  id = $1
    RETURNING *;
  `, values);
  return rows[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// CARD LIMIT CHECK  (read-only — before deducting balances)
// ─────────────────────────────────────────────────────────────────────────────

/** Channel → limit_type mapping for card transactions. */
const CHANNEL_LIMIT_MAP = {
  atm    : 'daily_atm',
  pos    : 'daily_pos',
  web    : 'daily_online',
  mobile : 'daily_online',
  upi    : 'daily_online',
  api    : 'daily_online',
};

/**
 * Check whether a card payment would exceed any active card limit.
 * Returns { allowed: bool, violated: string | null, limitAmount: number | null }.
 *
 * Checks:
 *   1. single_txn limit on every card payment
 *   2. channel-specific daily limit (daily_atm / daily_pos / daily_online)
 *   3. monthly limit — sum of all card txns in current calendar month
 */
export const checkCardLimits = async (cardId, amount, channel, txnDate, client = null) => {
  // Fetch all active limits for this card
  const { rows: limits } = await run(client, `
    SELECT limit_type, amount_limit
    FROM   card_limits
    WHERE  card_id   = $1
      AND  is_active = TRUE
      AND  effective_from <= $2::date
      AND  (effective_to IS NULL OR effective_to >= $2::date);
  `, [cardId, txnDate]);

  const limitMap = new Map(limits.map(l => [l.limit_type, parseFloat(l.amount_limit)]));

  // 1. Single-transaction limit
  const singleLimit = limitMap.get('single_txn');
  if (singleLimit !== undefined && parseFloat(amount) > singleLimit) {
    return { allowed: false, violated: 'single_txn', limitAmount: singleLimit };
  }

  // 2. Channel daily limit
  const limitType = CHANNEL_LIMIT_MAP[channel];
  if (limitType) {
    const dailyLimit = limitMap.get(limitType);
    if (dailyLimit !== undefined) {
      // Sum of completed/pending transactions on this card today via same channel type
      const { rows: sumRows } = await run(client, `
        SELECT COALESCE(SUM(amount), 0) AS daily_spent
        FROM   transactions
        WHERE  card_id = $1
          AND  txn_type IN ('payment','debit')
          AND  status   NOT IN ('failed','reversed','blocked')
          AND  channel  IN (
            SELECT unnest($2::text[])
          )
          AND  created_at >= $3::date
          AND  created_at < $3::date + INTERVAL '1 day';
      `, [
        cardId,
        Object.entries(CHANNEL_LIMIT_MAP)
          .filter(([, lt]) => lt === limitType)
          .map(([ch]) => ch),
        txnDate,
      ]);
      const dailySpent = parseFloat(sumRows[0].daily_spent);
      if (dailySpent + parseFloat(amount) > dailyLimit) {
        return { allowed: false, violated: limitType, limitAmount: dailyLimit };
      }
    }
  }

  // 3. Monthly limit
  const monthlyLimit = limitMap.get('monthly');
  if (monthlyLimit !== undefined) {
    const { rows: mRows } = await run(client, `
      SELECT COALESCE(SUM(amount), 0) AS monthly_spent
      FROM   transactions
      WHERE  card_id = $1
        AND  txn_type IN ('payment','debit')
        AND  status   NOT IN ('failed','reversed','blocked')
        AND  DATE_TRUNC('month', created_at) = DATE_TRUNC('month', $2::timestamptz);
    `, [cardId, txnDate]);
    const monthlySpent = parseFloat(mRows[0].monthly_spent);
    if (monthlySpent + parseFloat(amount) > monthlyLimit) {
      return { allowed: false, violated: 'monthly', limitAmount: monthlyLimit };
    }
  }

  return { allowed: true, violated: null, limitAmount: null };
};

// ─────────────────────────────────────────────────────────────────────────────
// READ — single transaction
// ─────────────────────────────────────────────────────────────────────────────

export const findTransactionById = async (id, client = null) => {
  const { rows } = await run(client, `
    SELECT
      t.*,
      sa.account_number AS source_account_number,
      da.account_number AS dest_account_number
    FROM  transactions t
    LEFT  JOIN accounts sa ON sa.id = t.source_account_id
    LEFT  JOIN accounts da ON da.id = t.destination_account_id
    WHERE t.id = $1
    LIMIT 1;
  `, [id]);
  return rows[0] ?? null;
};

export const findTransactionByRef = async (transactionRef, client = null) => {
  const { rows } = await run(client, `
    SELECT t.*,
           sa.account_number AS source_account_number,
           da.account_number AS dest_account_number
    FROM  transactions t
    LEFT  JOIN accounts sa ON sa.id = t.source_account_id
    LEFT  JOIN accounts da ON da.id = t.destination_account_id
    WHERE t.transaction_ref = $1
    LIMIT 1;
  `, [transactionRef]);
  return rows[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// READ — paginated list
// ─────────────────────────────────────────────────────────────────────────────

export const listTransactions = async ({
  accountId   = null,
  customerId  = null,
  status      = null,
  txnType     = null,
  channel     = null,
  isFraud     = null,
  dateFrom    = null,
  dateTo      = null,
  minAmount   = null,
  maxAmount   = null,
  limit       = 50,
  offset      = 0,
  sortDir     = 'DESC',
} = {}, client = null) => {
  const dir  = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const cond = [];
  const vals = [];

  if (accountId) {
    vals.push(accountId);
    cond.push(`(t.source_account_id = $${vals.length} OR t.destination_account_id = $${vals.length})`);
  }
  if (customerId) {
    vals.push(customerId);
    cond.push(`(sa.customer_id = $${vals.length} OR da.customer_id = $${vals.length})`);
  }
  if (status) {
    vals.push(status);
    cond.push(`t.status = $${vals.length}::txn_status`);
  }
  if (txnType) {
    vals.push(txnType);
    cond.push(`t.txn_type = $${vals.length}::txn_type`);
  }
  if (channel) {
    vals.push(channel);
    cond.push(`t.channel = $${vals.length}`);
  }
  if (isFraud !== null) {
    vals.push(isFraud);
    cond.push(`t.is_fraud = $${vals.length}`);
  }
  if (dateFrom) {
    vals.push(dateFrom);
    cond.push(`t.created_at >= $${vals.length}`);
  }
  if (dateTo) {
    vals.push(dateTo);
    cond.push(`t.created_at <= $${vals.length}`);
  }
  if (minAmount !== null) {
    vals.push(minAmount);
    cond.push(`t.amount >= $${vals.length}`);
  }
  if (maxAmount !== null) {
    vals.push(maxAmount);
    cond.push(`t.amount <= $${vals.length}`);
  }

  const joins = `
    LEFT JOIN accounts sa ON sa.id = t.source_account_id
    LEFT JOIN accounts da ON da.id = t.destination_account_id
  `;
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) FROM transactions t ${joins} ${where};`;
  const { rows: countRows } = await run(client, countSql, vals);
  const total = parseInt(countRows[0].count, 10);

  vals.push(limit, offset);
  const dataSql = `
    SELECT
      t.id, t.transaction_ref, t.txn_type, t.status,
      t.amount, t.currency, t.amount_in_base, t.exchange_rate,
      t.source_account_id, t.destination_account_id, t.card_id,
      t.description, t.merchant_name, t.merchant_category,
      t.channel, t.ip_address, t.location_city, t.location_country,
      t.risk_score, t.is_fraud, t.flagged_at,
      t.completed_at, t.reversed_at, t.reversal_txn_id,
      t.metadata, t.created_at, t.updated_at,
      sa.account_number AS source_account_number,
      da.account_number AS dest_account_number
    FROM  transactions t
    ${joins}
    ${where}
    ORDER BY t.created_at ${dir}
    LIMIT  $${vals.length - 1}
    OFFSET $${vals.length};
  `;
  const { rows } = await run(client, dataSql, vals);
  return { rows, total };
};
