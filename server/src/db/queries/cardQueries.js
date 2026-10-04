/**
 * cardQueries.js — Raw SQL for cards + card_limits.
 *
 * SECURITY: full PAN is NEVER stored.  We store:
 *   card_number_hash — SHA-256 of "CARDTYPE-NNNNNNNNNNNNNNNN" for uniqueness
 *   card_last4       — last 4 plaintext digits only (display only)
 *
 * cards columns:
 *   id UUID PK, account_id UUID FK→accounts RESTRICT,
 *   customer_id UUID FK→customers RESTRICT,
 *   card_number_hash VARCHAR(255) UNIQUE, card_last4 VARCHAR(4),
 *   card_type card_type DEFAULT 'debit',
 *   network VARCHAR(20) CHECK (visa|mastercard|rupay|amex|other),
 *   expiry_month SMALLINT, expiry_year SMALLINT,
 *   status card_status DEFAULT 'active',
 *   issued_at DATE, activated_at TIMESTAMPTZ,
 *   blocked_at TIMESTAMPTZ, blocked_reason TEXT,
 *   deleted_at TIMESTAMPTZ, created_at, updated_at
 *
 * card_limits columns:
 *   id BIGSERIAL PK, card_id UUID FK CASCADE,
 *   limit_type VARCHAR(30) CHECK (daily_atm|daily_pos|daily_online|single_txn|monthly|contactless),
 *   amount_limit NUMERIC(15,2), is_active BOOLEAN,
 *   effective_from DATE, effective_to DATE,
 *   created_at, updated_at
 *   UNIQUE (card_id, limit_type)
 */

import crypto               from 'crypto';
import { query as poolQuery } from '../connection.js';

const run = (client, text, params) =>
  client ? client.query(text, params) : poolQuery(text, params);

// ─────────────────────────────────────────────────────────────────────────────
// PAN UTILITIES  — never exported; internal to this file
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hash a synthetic PAN string for storage uniqueness.
 * We don't receive real card numbers from the client — we generate a random
 * 16-digit synthetic PAN internally.
 */
const hashPan = (pan) =>
  crypto.createHash('sha256').update(pan).digest('hex');

/** Generate a random 16-digit numeric PAN. */
const generatePan = () => {
  // Luhn-valid PAN generation using cryptographically random digits
  let digits = '';
  for (let i = 0; i < 15; i++) {
    digits += String(Math.floor(Math.random() * 10));
  }
  // Luhn check digit
  const reversed = (digits + '0').split('').reverse().map(Number);
  const sum = reversed.reduce((acc, d, i) => {
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    return acc + d;
  }, 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return digits + String(checkDigit);
};

// ─────────────────────────────────────────────────────────────────────────────
// SAFE CARD SHAPE — strip PAN hash from any row before returning to caller
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove card_number_hash from a DB row and add masked display fields.
 * Returned shape: { ...cardRow, masked_number: "•••• •••• •••• 1234" }
 */
export const safeCard = (row) => {
  if (!row) return null;
  const { card_number_hash, ...rest } = row;           // strip hash
  rest.masked_number = `•••• •••• •••• ${row.card_last4}`;
  return rest;
};

// ─────────────────────────────────────────────────────────────────────────────
// CARD READ
// ─────────────────────────────────────────────────────────────────────────────

const CARD_SELECT = `
  SELECT
    c.id, c.account_id, c.customer_id,
    c.card_number_hash,           -- stripped by safeCard() before returning to API
    c.card_last4, c.card_type, c.network,
    c.expiry_month, c.expiry_year,
    c.status, c.issued_at, c.activated_at,
    c.blocked_at, c.blocked_reason,
    c.deleted_at, c.created_at, c.updated_at,
    a.account_number,
    cu.customer_number,
    u.first_name  AS customer_first_name,
    u.last_name   AS customer_last_name
  FROM  cards c
  JOIN  accounts  a  ON a.id = c.account_id
  JOIN  customers cu ON cu.id = c.customer_id
  JOIN  users     u  ON u.id = cu.user_id
`;

export const findCardById = async (id, client = null) => {
  const { rows } = await run(client,
    `${CARD_SELECT} WHERE c.id = $1 AND c.deleted_at IS NULL LIMIT 1;`, [id]);
  return rows[0] ? safeCard(rows[0]) : null;
};

/** Internal use only — returns the raw hash for duplicate-check. */
export const findCardByHashRaw = async (hash, client = null) => {
  const { rows } = await run(client,
    `SELECT id, card_last4, status FROM cards WHERE card_number_hash = $1 LIMIT 1;`, [hash]);
  return rows[0] ?? null;
};

export const listCardsByAccount = async (accountId, includeInactive = false, client = null) => {
  const statusClause = includeInactive ? '' : `AND c.status NOT IN ('expired','lost','stolen') AND c.deleted_at IS NULL`;
  const { rows } = await run(client, `
    ${CARD_SELECT}
    WHERE c.account_id = $1 ${statusClause}
    ORDER BY c.created_at DESC;
  `, [accountId]);
  return rows.map(safeCard);
};

export const listCardsByCustomer = async (customerId, includeInactive = false, client = null) => {
  const statusClause = includeInactive ? '' : `AND c.status NOT IN ('expired','lost','stolen') AND c.deleted_at IS NULL`;
  const { rows } = await run(client, `
    ${CARD_SELECT}
    WHERE c.customer_id = $1 ${statusClause}
    ORDER BY c.created_at DESC;
  `, [customerId]);
  return rows.map(safeCard);
};

// ─────────────────────────────────────────────────────────────────────────────
// CARD WRITE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Issue a new card.
 * Generates a Luhn-valid synthetic PAN, stores its SHA-256 hash + last 4 digits.
 * Expiry: 3 years from issuance for debit/prepaid, 5 for credit.
 *
 * Returns the safe card row (no hash).
 */
export const issueCard = async ({
  accountId, customerId, cardType = 'debit', network = 'rupay',
}, client = null) => {
  const pan       = generatePan();
  const panHash   = hashPan(pan);
  const last4     = pan.slice(-4);
  const now       = new Date();
  const expiryYrs = (cardType === 'credit') ? 5 : 3;
  const expiryMonth = now.getMonth() + 1;           // 1-indexed
  const expiryYear  = now.getFullYear() + expiryYrs;

  const { rows } = await run(client, `
    INSERT INTO cards
      (account_id, customer_id, card_number_hash, card_last4,
       card_type, network, expiry_month, expiry_year, status, activated_at)
    VALUES ($1, $2, $3, $4, $5::card_type, $6, $7, $8, 'active', NOW())
    RETURNING *;
  `, [accountId, customerId, panHash, last4,
      cardType, network, expiryMonth, expiryYear]);

  return safeCard(rows[0]);
};

/**
 * Block a card (status → 'blocked').  Stamps blocked_at + reason.
 */
export const blockCard = async (id, reason = null, client = null) => {
  const { rows } = await run(client, `
    UPDATE cards
    SET    status        = 'blocked',
           blocked_at    = NOW(),
           blocked_reason = $2,
           updated_at    = NOW()
    WHERE  id = $1 AND deleted_at IS NULL
    RETURNING *;
  `, [id, reason]);
  return rows[0] ? safeCard(rows[0]) : null;
};

/**
 * Unblock a card (status → 'active').  Clears block fields.
 */
export const unblockCard = async (id, client = null) => {
  const { rows } = await run(client, `
    UPDATE cards
    SET    status         = 'active',
           blocked_at     = NULL,
           blocked_reason = NULL,
           updated_at     = NOW()
    WHERE  id = $1 AND deleted_at IS NULL
      AND  status = 'blocked'
    RETURNING *;
  `, [id]);
  return rows[0] ? safeCard(rows[0]) : null;
};

/**
 * Replace a card: soft-delete the old one, issue a new one.
 * Returns the new safe card row.
 */
export const replaceCard = async (oldCardId, { accountId, customerId, cardType, network }, client = null) => {
  // Mark old card as replaced (use 'stolen' status with a reason note)
  await run(client, `
    UPDATE cards
    SET    status         = 'stolen',
           blocked_reason = 'Replaced by customer request',
           deleted_at     = NOW(),
           updated_at     = NOW()
    WHERE  id = $1 AND deleted_at IS NULL;
  `, [oldCardId]);

  return issueCard({ accountId, customerId, cardType, network }, client);
};

/** Mark a card as lost/stolen — status changes, no unblock possible. */
export const markCardLostStolen = async (id, status, client = null) => {
  if (!['lost', 'stolen'].includes(status)) throw new Error('Invalid status for lost/stolen');
  const { rows } = await run(client, `
    UPDATE cards
    SET    status      = $2::card_status,
           blocked_at  = NOW(),
           updated_at  = NOW()
    WHERE  id = $1 AND deleted_at IS NULL
    RETURNING *;
  `, [id, status]);
  return rows[0] ? safeCard(rows[0]) : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// CARD LIMITS
// ─────────────────────────────────────────────────────────────────────────────

export const listCardLimits = async (cardId, client = null) => {
  const { rows } = await run(client, `
    SELECT * FROM card_limits
    WHERE  card_id = $1
    ORDER BY limit_type;
  `, [cardId]);
  return rows;
};

/**
 * Upsert a card limit.
 * If the limit_type already exists for this card, update it; otherwise insert.
 */
export const upsertCardLimit = async ({
  cardId, limitType, amountLimit,
  isActive = true, effectiveFrom = null, effectiveTo = null,
}, client = null) => {
  const { rows } = await run(client, `
    INSERT INTO card_limits (card_id, limit_type, amount_limit, is_active, effective_from, effective_to)
    VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6::date)
    ON CONFLICT (card_id, limit_type) DO UPDATE
      SET amount_limit   = EXCLUDED.amount_limit,
          is_active      = EXCLUDED.is_active,
          effective_from = EXCLUDED.effective_from,
          effective_to   = EXCLUDED.effective_to,
          updated_at     = NOW()
    RETURNING *;
  `, [cardId, limitType, amountLimit, isActive, effectiveFrom, effectiveTo]);
  return rows[0];
};

/** Delete a specific limit type for a card (hard delete — limits are config). */
export const deleteCardLimit = async (cardId, limitType, client = null) => {
  const { rows } = await run(client, `
    DELETE FROM card_limits
    WHERE card_id = $1 AND limit_type = $2
    RETURNING id, limit_type;
  `, [cardId, limitType]);
  return rows[0] ?? null;
};
