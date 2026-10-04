/**
 * cardController.js — HTTP handlers for cards + card_limits module.
 *
 * Error code → HTTP status map:
 *   ACCOUNT_NOT_FOUND        404
 *   ACCOUNT_NOT_ACTIVE       409
 *   CARD_NOT_FOUND           404
 *   INVALID_CARD_TYPE        400
 *   INVALID_NETWORK          400
 *   MAX_CARDS_REACHED        409
 *   CARD_NOT_BLOCKABLE       409
 *   CARD_NOT_BLOCKED         409
 *   CARD_ALREADY_REPORTED    409
 *   CARD_NOT_REPLACEABLE     409
 *   CARD_NOT_ACTIVE          409
 *   INVALID_LIMIT_TYPE       400
 *   LIMIT_NOT_FOUND          404
 */

import {
  issueCardService,
  listCardsService,
  getCardService,
  blockCardService,
  unblockCardService,
  reportLostStolenService,
  replaceCardService,
  listLimitsService,
  setLimitService,
  deleteLimitService,
} from '../services/cardService.js';
import { success, failure } from '../utils/response.js';
import { logger }           from '../utils/logger.js';

const getMeta = (req) => ({
  actorId  : req.user?.id   ?? null,
  ipAddress: req.ip          ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});

const STATUS_MAP = {
  ACCOUNT_NOT_FOUND     : 404,
  ACCOUNT_NOT_ACTIVE    : 409,
  CARD_NOT_FOUND        : 404,
  INVALID_CARD_TYPE     : 400,
  INVALID_NETWORK       : 400,
  MAX_CARDS_REACHED     : 409,
  CARD_NOT_BLOCKABLE    : 409,
  CARD_NOT_BLOCKED      : 409,
  CARD_UNBLOCK_FAILED   : 500,
  CARD_ALREADY_REPORTED : 409,
  CARD_NOT_REPLACEABLE  : 409,
  CARD_NOT_ACTIVE       : 409,
  INVALID_LIMIT_TYPE    : 400,
  LIMIT_NOT_FOUND       : 404,
};

const USER_MESSAGES = {
  ACCOUNT_NOT_FOUND     : 'Account not found.',
  ACCOUNT_NOT_ACTIVE    : 'Account must be active to issue a card.',
  CARD_NOT_FOUND        : 'Card not found.',
  INVALID_CARD_TYPE     : 'Invalid card type.',
  INVALID_NETWORK       : 'Invalid card network.',
  MAX_CARDS_REACHED     : 'Maximum number of cards for this type on this account has been reached.',
  CARD_NOT_BLOCKABLE    : 'Card cannot be blocked (it may already be blocked, expired, lost, or stolen).',
  CARD_NOT_BLOCKED      : 'Card is not currently blocked.',
  CARD_UNBLOCK_FAILED   : 'Failed to unblock card.',
  CARD_ALREADY_REPORTED : 'Card has already been reported as lost or stolen.',
  CARD_NOT_REPLACEABLE  : 'Card can only be replaced if it is blocked, lost, or stolen.',
  CARD_NOT_ACTIVE       : 'Card is not active.',
  INVALID_LIMIT_TYPE    : 'Invalid limit type.',
  LIMIT_NOT_FOUND       : 'Card limit not found.',
};

const handleErr = (err, res) => {
  const code   = err.message;
  const status = err.statusCode ?? STATUS_MAP[code] ?? 500;
  const msg    = USER_MESSAGES[code] ?? 'An unexpected error occurred.';
  if (status >= 500) logger.error(`[CardController] ${err.stack ?? err.message}`);
  return failure(res, msg, status);
};

// POST /api/accounts/:accountId/cards
export const issueCard = async (req, res) => {
  try {
    const { cardType, network } = req.body;
    const card = await issueCardService(
      { accountId: req.params.accountId, cardType, network },
      getMeta(req)
    );
    return success(res, { card }, 'Card issued successfully.', 201);
  } catch (err) { return handleErr(err, res); }
};

// GET /api/accounts/:accountId/cards
export const listCards = async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const cards = await listCardsService(req.params.accountId, includeInactive);
    return success(res, { cards }, 'Cards retrieved.');
  } catch (err) { return handleErr(err, res); }
};

// GET /api/cards/:id
export const getCard = async (req, res) => {
  try {
    const card = await getCardService(req.params.id);
    return success(res, { card }, 'Card retrieved.');
  } catch (err) { return handleErr(err, res); }
};

// PATCH /api/cards/:id/block
export const blockCard = async (req, res) => {
  try {
    const card = await blockCardService(req.params.id, req.body.reason ?? null, getMeta(req));
    return success(res, { card }, 'Card blocked.');
  } catch (err) { return handleErr(err, res); }
};

// PATCH /api/cards/:id/unblock
export const unblockCard = async (req, res) => {
  try {
    const card = await unblockCardService(req.params.id, getMeta(req));
    return success(res, { card }, 'Card unblocked.');
  } catch (err) { return handleErr(err, res); }
};

// PATCH /api/cards/:id/report-lost
export const reportLost = async (req, res) => {
  try {
    const card = await reportLostStolenService(req.params.id, 'lost', getMeta(req));
    return success(res, { card }, 'Card reported as lost.');
  } catch (err) { return handleErr(err, res); }
};

// PATCH /api/cards/:id/report-stolen
export const reportStolen = async (req, res) => {
  try {
    const card = await reportLostStolenService(req.params.id, 'stolen', getMeta(req));
    return success(res, { card }, 'Card reported as stolen.');
  } catch (err) { return handleErr(err, res); }
};

// POST /api/cards/:id/replace
export const replaceCard = async (req, res) => {
  try {
    const card = await replaceCardService(req.params.id, getMeta(req));
    return success(res, { card }, 'Card replaced. New card issued.', 201);
  } catch (err) { return handleErr(err, res); }
};

// GET /api/cards/:id/limits
export const listLimits = async (req, res) => {
  try {
    const limits = await listLimitsService(req.params.id);
    return success(res, { limits }, 'Card limits retrieved.');
  } catch (err) { return handleErr(err, res); }
};

// PUT /api/cards/:id/limits/:limitType
export const setLimit = async (req, res) => {
  try {
    const { amountLimit, isActive, effectiveTo } = req.body;
    const limit = await setLimitService(
      req.params.id,
      req.params.limitType,
      { amountLimit, isActive, effectiveTo },
      getMeta(req)
    );
    return success(res, { limit }, 'Card limit set.');
  } catch (err) { return handleErr(err, res); }
};

// DELETE /api/cards/:id/limits/:limitType
export const deleteLimit = async (req, res) => {
  try {
    const result = await deleteLimitService(req.params.id, req.params.limitType, getMeta(req));
    return success(res, result, 'Card limit deleted.');
  } catch (err) { return handleErr(err, res); }
};

export default {
  issueCard, listCards, getCard, blockCard, unblockCard,
  reportLost, reportStolen, replaceCard, listLimits, setLimit, deleteLimit,
};
