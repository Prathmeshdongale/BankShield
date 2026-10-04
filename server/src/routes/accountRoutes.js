/**
 * accountRoutes.js
 *
 * RBAC per schema seeds (Section 4):
 *
 *   Method  Path                         Permission(s)
 *   ──────  ─────────────────────────    ──────────────────────────────────────
 *   GET     /types                       accounts:read   (all authenticated)
 *   POST    /                            accounts:create (admin, branch_manager, teller)
 *   GET     /                            accounts:read
 *   GET     /:id                         accounts:read
 *   GET     /:id/balance                 accounts:read
 *   GET     /:id/history                 accounts:read  + transactions:read
 *   PATCH   /:id                         accounts:update (admin, branch_manager)
 *   PATCH   /:id/freeze                  accounts:freeze (admin, compliance, branch_manager)
 *   PATCH   /:id/activate                accounts:update (admin, branch_manager)
 *   PATCH   /:id/close                   accounts:close  (super_admin, admin)
 *
 * Card sub-routes live on accountRoutes so we can derive account context
 * for card issuance directly from the URL.
 *
 *   POST    /:accountId/cards            cards:read (issue checked in service)
 *   GET     /:accountId/cards            cards:read
 */

import { Router }       from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import {
  validate,
  openAccountValidator,
  updateAccountValidator,
  accountIdValidator,
  listAccountsValidator,
  historyValidator,
} from '../validators/accountValidators.js';
import {
  validate      as cardValidate,
  issueCardValidator,
  listCardsValidator,
} from '../validators/cardValidators.js';
import {
  listAccountTypes,
  openAccount,
  getAccount,
  listAccounts,
  updateAccount,
  freezeAccount,
  activateAccount,
  closeAccount,
  getBalance,
  getHistory,
} from '../controllers/accountController.js';
import {
  issueCard,
  listCards,
} from '../controllers/cardController.js';

const router = Router();
router.use(authenticate);

// ── Reference data ────────────────────────────────────────────────────────────
router.get('/types', authorize('accounts:read'), listAccountTypes);

// ── Account CRUD ──────────────────────────────────────────────────────────────

router.get(
  '/',
  authorize('accounts:read'),
  ...listAccountsValidator, validate,
  listAccounts
);

router.post(
  '/',
  authorize('accounts:create'),
  ...openAccountValidator, validate,
  openAccount
);

router.get(
  '/:id',
  authorize('accounts:read'),
  ...accountIdValidator, validate,
  getAccount
);

router.patch(
  '/:id',
  authorize('accounts:update'),
  ...updateAccountValidator, validate,
  updateAccount
);

// ── Status transitions ────────────────────────────────────────────────────────

router.patch(
  '/:id/freeze',
  authorize('accounts:freeze'),
  ...accountIdValidator, validate,
  freezeAccount
);

router.patch(
  '/:id/activate',
  authorize('accounts:update'),
  ...accountIdValidator, validate,
  activateAccount
);

router.patch(
  '/:id/close',
  authorize('accounts:close'),
  ...accountIdValidator, validate,
  closeAccount
);

// ── Balance + History ─────────────────────────────────────────────────────────

router.get(
  '/:id/balance',
  authorize('accounts:read'),
  ...accountIdValidator, validate,
  getBalance
);

router.get(
  '/:id/history',
  authorize('accounts:read', 'transactions:read'),
  ...historyValidator, validate,
  getHistory
);

// ── Card sub-routes (account-scoped) ─────────────────────────────────────────

router.post(
  '/:accountId/cards',
  authorize('cards:read'),     // guard lifted to service-layer; checked by issueCardService
  ...issueCardValidator, cardValidate,
  issueCard
);

router.get(
  '/:accountId/cards',
  authorize('cards:read'),
  ...listCardsValidator, cardValidate,
  listCards
);

export default router;
