/**
 * cardService.js — Business logic for cards + card_limits module.
 *
 * Endpoints:
 *   issueCard       POST   /api/accounts/:accountId/cards
 *   listCards       GET    /api/accounts/:accountId/cards
 *   getCard         GET    /api/cards/:id
 *   blockCard       PATCH  /api/cards/:id/block
 *   unblockCard     PATCH  /api/cards/:id/unblock
 *   markLostStolen  PATCH  /api/cards/:id/report-lost  |  /report-stolen
 *   replaceCard     POST   /api/cards/:id/replace
 *   listLimits      GET    /api/cards/:id/limits
 *   setLimit        PUT    /api/cards/:id/limits/:limitType
 *   deleteLimit     DELETE /api/cards/:id/limits/:limitType
 *
 * SECURITY:  Full PAN is never stored or returned.
 *   - card_number_hash (SHA-256) stored for uniqueness only
 *   - Only card_last4 + masked_number returned in API responses
 *   - safeCard() strips the hash before any return
 *
 * RBAC (enforced at route level):
 *   cards:read          → all roles
 *   cards:block         → super_admin, admin, compliance_officer, branch_manager, teller
 *   cards:manage_limits → super_admin, admin, branch_manager
 *
 * Audit log written on every write.
 */

import { logger }         from '../utils/logger.js';
import { getClient }      from '../db/connection.js';
import { insertAuditLog } from '../db/queries/authQueries.js';
import { findAccountById } from '../db/queries/accountQueries.js';
import { findCustomerByUserId } from '../db/queries/customerQueries.js';
import {
  findCardById,
  listCardsByAccount,
  listCardsByCustomer,
  issueCard           as dbIssueCard,
  blockCard           as dbBlockCard,
  unblockCard         as dbUnblockCard,
  replaceCard         as dbReplaceCard,
  markCardLostStolen  as dbMarkLostStolen,
  listCardLimits,
  upsertCardLimit,
  deleteCardLimit,
  deleteCard as dbDeleteCard,
} from '../db/queries/cardQueries.js';

// ─────────────────────────────────────────────────────────────────────────────
const mkErr = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });

const VALID_CARD_TYPES   = ['debit', 'credit', 'prepaid', 'virtual'];
const VALID_NETWORKS     = ['visa', 'mastercard', 'rupay', 'amex', 'other'];
const VALID_LIMIT_TYPES  = ['daily_atm','daily_pos','daily_online','single_txn','monthly','contactless'];
const BLOCKABLE_STATUSES = new Set(['active', 'inactive']);
const UNBLOCKABLE        = new Set(['blocked']);

// ─────────────────────────────────────────────────────────────────────────────
// 1. ISSUE CARD
// ─────────────────────────────────────────────────────────────────────────────

export const issueCardService = async ({ accountId, cardType = 'debit', network = 'rupay' }, meta = {}) => {
  const account = await findAccountById(accountId);
  if (!account) throw mkErr('ACCOUNT_NOT_FOUND', 404);
  if (account.status !== 'active') throw mkErr('ACCOUNT_NOT_ACTIVE', 409);

  if (!VALID_CARD_TYPES.includes(cardType)) throw mkErr('INVALID_CARD_TYPE', 400);
  if (!VALID_NETWORKS.includes(network))   throw mkErr('INVALID_NETWORK', 400);

  // Business rule: max 2 active cards per account per card_type
  const existing = await listCardsByAccount(accountId, false);
  const sameType = existing.filter(c => c.card_type === cardType);
  if (sameType.length >= 2) throw mkErr('MAX_CARDS_REACHED', 409);

  const card = await dbIssueCard({ accountId, customerId: account.customer_id, cardType, network });

  await insertAuditLog({
    userId: meta.actorId, action: 'CARD_ISSUED',
    entityType: 'card', entityId: card.id,
    newValue: { accountId, cardType, network, last4: card.card_last4, expiryYear: card.expiry_year },
    ipAddress: meta.ipAddress, userAgent: meta.userAgent, status: 'success',
  });

  logger.info(`Card issued: ****${card.card_last4} (${cardType}) on account ${account.account_number}`);
  return card;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. LIST CARDS FOR AN ACCOUNT
// ─────────────────────────────────────────────────────────────────────────────

export const listCardsService = async (accountId, includeInactive = false) => {
  const account = await findAccountById(accountId);
  if (!account) throw mkErr('ACCOUNT_NOT_FOUND', 404);
  return listCardsByAccount(accountId, includeInactive);
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET ONE CARD
// ─────────────────────────────────────────────────────────────────────────────

export const getCardService = async (id) => {
  const card = await findCardById(id);
  if (!card) throw mkErr('CARD_NOT_FOUND', 404);
  return card;
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. BLOCK CARD
// ─────────────────────────────────────────────────────────────────────────────

export const blockCardService = async (id, reason = null, meta = {}) => {
  const card = await findCardById(id);
  if (!card) throw mkErr('CARD_NOT_FOUND', 404);
  if (!BLOCKABLE_STATUSES.has(card.status)) throw mkErr('CARD_NOT_BLOCKABLE', 409);

  const updated = await dbBlockCard(id, reason);

  await insertAuditLog({
    userId: meta.actorId, action: 'CARD_BLOCKED',
    entityType: 'card', entityId: id,
    oldValue: { status: card.status },
    newValue: { status: 'blocked', reason },
    ipAddress: meta.ipAddress, userAgent: meta.userAgent, status: 'success',
  });

  logger.info(`Card blocked: ****${card.card_last4} — ${reason || 'no reason given'}`);
  return updated;
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. UNBLOCK CARD
// ─────────────────────────────────────────────────────────────────────────────

export const unblockCardService = async (id, meta = {}) => {
  const card = await findCardById(id);
  if (!card) throw mkErr('CARD_NOT_FOUND', 404);
  if (!UNBLOCKABLE.has(card.status)) throw mkErr('CARD_NOT_BLOCKED', 409);

  const updated = await dbUnblockCard(id);
  if (!updated) throw mkErr('CARD_UNBLOCK_FAILED', 500);

  await insertAuditLog({
    userId: meta.actorId, action: 'CARD_UNBLOCKED',
    entityType: 'card', entityId: id,
    oldValue: { status: 'blocked' },
    newValue: { status: 'active' },
    ipAddress: meta.ipAddress, userAgent: meta.userAgent, status: 'success',
  });

  logger.info(`Card unblocked: ****${card.card_last4}`);
  return updated;
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. REPORT LOST / STOLEN
// ─────────────────────────────────────────────────────────────────────────────

export const reportLostStolenService = async (id, status, meta = {}) => {
  if (!['lost', 'stolen'].includes(status)) throw mkErr('INVALID_STATUS', 400);

  const card = await findCardById(id);
  if (!card) throw mkErr('CARD_NOT_FOUND', 404);
  if (['lost', 'stolen'].includes(card.status)) throw mkErr('CARD_ALREADY_REPORTED', 409);

  const updated = await dbMarkLostStolen(id, status);

  await insertAuditLog({
    userId: meta.actorId, action: `CARD_REPORTED_${status.toUpperCase()}`,
    entityType: 'card', entityId: id,
    oldValue: { status: card.status },
    newValue: { status },
    ipAddress: meta.ipAddress, userAgent: meta.userAgent, status: 'success',
  });

  logger.info(`Card reported ${status}: ****${card.card_last4}`);
  return updated;
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. REPLACE CARD
// ─────────────────────────────────────────────────────────────────────────────

export const replaceCardService = async (id, meta = {}) => {
  const old = await findCardById(id);
  if (!old) throw mkErr('CARD_NOT_FOUND', 404);
  // Can only replace a card that is blocked, lost, or stolen
  const replaceableStatuses = new Set(['blocked', 'lost', 'stolen']);
  if (!replaceableStatuses.has(old.status)) throw mkErr('CARD_NOT_REPLACEABLE', 409);

  const client = await getClient();
  let newCard;
  try {
    await client.query('BEGIN');
    newCard = await dbReplaceCard(id, {
      accountId  : old.account_id,
      customerId : old.customer_id,
      cardType   : old.card_type,
      network    : old.network,
    }, client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await insertAuditLog({
    userId: meta.actorId, action: 'CARD_REPLACED',
    entityType: 'card', entityId: newCard.id,
    oldValue: { oldCardId: id, last4: old.card_last4 },
    newValue: { newCardId: newCard.id, last4: newCard.card_last4 },
    ipAddress: meta.ipAddress, userAgent: meta.userAgent, status: 'success',
  });

  logger.info(`Card replaced: old=****${old.card_last4} → new=****${newCard.card_last4}`);
  return newCard;
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. LIST LIMITS
// ─────────────────────────────────────────────────────────────────────────────

export const listLimitsService = async (cardId) => {
  const card = await findCardById(cardId);
  if (!card) throw mkErr('CARD_NOT_FOUND', 404);
  return listCardLimits(cardId);
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. SET / UPDATE A LIMIT
// ─────────────────────────────────────────────────────────────────────────────

export const setLimitService = async (cardId, limitType, { amountLimit, isActive = true, effectiveTo = null }, meta = {}) => {
  if (!VALID_LIMIT_TYPES.includes(limitType)) throw mkErr('INVALID_LIMIT_TYPE', 400);

  const card = await findCardById(cardId);
  if (!card) throw mkErr('CARD_NOT_FOUND', 404);
  if (card.status !== 'active') throw mkErr('CARD_NOT_ACTIVE', 409);

  const limit = await upsertCardLimit({ cardId, limitType, amountLimit, isActive, effectiveTo });

  await insertAuditLog({
    userId: meta.actorId, action: 'CARD_LIMIT_SET',
    entityType: 'card_limit', entityId: String(limit.id),
    newValue: { cardId, limitType, amountLimit, isActive },
    ipAddress: meta.ipAddress, userAgent: meta.userAgent, status: 'success',
  });

  logger.info(`Card limit set: card=****${card.card_last4} ${limitType}=${amountLimit}`);
  return limit;
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. DELETE A LIMIT
// ─────────────────────────────────────────────────────────────────────────────

export const deleteLimitService = async (cardId, limitType, meta = {}) => {
  if (!VALID_LIMIT_TYPES.includes(limitType)) throw mkErr('INVALID_LIMIT_TYPE', 400);

  const card = await findCardById(cardId);
  if (!card) throw mkErr('CARD_NOT_FOUND', 404);

  const deleted = await deleteCardLimit(cardId, limitType);
  if (!deleted) throw mkErr('LIMIT_NOT_FOUND', 404);

  await insertAuditLog({
    userId: meta.actorId, action: 'CARD_LIMIT_DELETED',
    entityType: 'card_limit', entityId: String(deleted.id),
    oldValue: { cardId, limitType },
    ipAddress: meta.ipAddress, userAgent: meta.userAgent, status: 'success',
  });

  logger.info(`Card limit deleted: card=****${card.card_last4} ${limitType}`);
  return deleted;
};

// ─────────────────────────────────────────────────────────────────────────────
// 11. DELETE / REMOVE CARD
// ─────────────────────────────────────────────────────────────────────────────

export const deleteCardService = async (id, meta = {}) => {
  const card = await findCardById(id);
  if (!card) throw mkErr('CARD_NOT_FOUND', 404);

  // If customer role, verify card belongs to customer
  if (meta.customerUserId) {
    const cust = await findCustomerByUserId(meta.customerUserId);
    if (!cust || card.customer_id !== cust.id) {
      throw mkErr('FORBIDDEN', 403);
    }
  }

  const updated = await dbDeleteCard(id, meta.reason || 'Card removed by user');
  if (!updated) throw mkErr('CARD_NOT_FOUND', 404);

  await insertAuditLog({
    userId: meta.actorId, action: 'CARD_REMOVED',
    entityType: 'card', entityId: id,
    oldValue: { status: card.status },
    newValue: { status: 'blocked', deleted_at: 'NOW()' },
    ipAddress: meta.ipAddress, userAgent: meta.userAgent, status: 'success',
  });

  logger.info(`Card removed: ****${card.card_last4}`);
  return updated;
};
