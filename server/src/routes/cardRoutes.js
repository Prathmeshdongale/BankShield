/**
 * cardRoutes.js  — Card-level operations (not scoped to an account URL)
 *
 *   Method  Path                          Permission(s)
 *   ──────  ────────────────────────────  ──────────────────────────────────────
 *   GET     /:id                          cards:read
 *   PATCH   /:id/block                    cards:block
 *   PATCH   /:id/unblock                  cards:block
 *   PATCH   /:id/report-lost              cards:block
 *   PATCH   /:id/report-stolen            cards:block
 *   POST    /:id/replace                  cards:block   (staff-initiated replacement)
 *   GET     /:id/limits                   cards:read
 *   PUT     /:id/limits/:limitType        cards:manage_limits
 *   DELETE  /:id/limits/:limitType        cards:manage_limits
 */

import { Router }       from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { restrictBankingFromSuperAdmin } from '../middleware/bankingRestriction.js';
import {
  validate,
  cardIdValidator,
  blockCardValidator,
  setLimitValidator,
  deleteLimitValidator,
} from '../validators/cardValidators.js';
import {
  getCard,
  blockCard,
  unblockCard,
  reportLost,
  reportStolen,
  replaceCard,
  listLimits,
  setLimit,
  deleteLimit,
  deleteCard,
} from '../controllers/cardController.js';

const router = Router();
router.use(authenticate);
router.use(restrictBankingFromSuperAdmin);

// GET /api/cards/:id
router.get('/:id',
  authorize('cards:read'),
  ...cardIdValidator, validate,
  getCard
);

// PATCH /api/cards/:id/block
router.patch('/:id/block',
  authorize('cards:block'),
  ...blockCardValidator, validate,
  blockCard
);

// PATCH /api/cards/:id/unblock
router.patch('/:id/unblock',
  authorize('cards:block'),
  ...cardIdValidator, validate,
  unblockCard
);

// PATCH /api/cards/:id/report-lost
router.patch('/:id/report-lost',
  authorize('cards:block'),
  ...cardIdValidator, validate,
  reportLost
);

// PATCH /api/cards/:id/report-stolen
router.patch('/:id/report-stolen',
  authorize('cards:block'),
  ...cardIdValidator, validate,
  reportStolen
);

// POST /api/cards/:id/replace
router.post('/:id/replace',
  authorize('cards:block'),
  ...cardIdValidator, validate,
  replaceCard
);

// GET /api/cards/:id/limits
router.get('/:id/limits',
  authorize('cards:read'),
  ...cardIdValidator, validate,
  listLimits
);

// PUT /api/cards/:id/limits/:limitType
router.put('/:id/limits/:limitType',
  authorize('cards:manage_limits'),
  ...setLimitValidator, validate,
  setLimit
);

// DELETE /api/cards/:id/limits/:limitType
router.delete('/:id/limits/:limitType',
  authorize('cards:manage_limits'),
  ...deleteLimitValidator, validate,
  deleteLimit
);

// DELETE /api/cards/:id
router.delete('/:id',
  authorize('cards:read'),
  ...cardIdValidator, validate,
  deleteCard
);

export default router;
