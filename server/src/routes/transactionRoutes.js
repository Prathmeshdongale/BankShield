/**
 * transactionRoutes.js
 *
 * RBAC:
 *   transactions:read    → all roles
 *   transactions:create  → super_admin, admin, branch_manager, teller, customer
 *   transactions:reverse → super_admin, admin
 *
 *   Method  Path                      Permission(s)
 *   ──────  ────────────────────────  ──────────────────────────
 *   GET     /                         transactions:read
 *   GET     /:idOrRef                 transactions:read
 *   POST    /deposit                  transactions:create
 *   POST    /withdraw                 transactions:create
 *   POST    /withdrawal               transactions:create
 *   POST    /transfer                 transactions:create
 *   POST    /card-payment             transactions:create
 *   POST    /upi                      transactions:create
 *   POST    /atm                      transactions:create
 *   POST    /online                   transactions:create
 *   POST    /:id/reverse              transactions:reverse
 */

import { Router }       from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import {
  validate,
  depositValidator,
  withdrawValidator,
  transferValidator,
  cardPaymentValidator,
  upiPaymentValidator,
  atmWithdrawalValidator,
  onlinePaymentValidator,
  reverseTransactionValidator,
  getTransactionValidator,
  listTransactionsValidator,
} from '../validators/transactionValidators.js';
import {
  deposit,
  withdraw,
  withdrawal,
  transfer,
  cardPayment,
  upiPayment,
  atmWithdrawal,
  onlinePayment,
  reverseTransaction,
  getTransaction,
  listTransactions,
} from '../controllers/transactionController.js';

const router = Router();
router.use(authenticate);

// ── READ ─────────────────────────────────────────────────────────────────────

router.get(
  '/',
  authorize('transactions:read'),
  ...listTransactionsValidator, validate,
  listTransactions
);

router.get(
  '/:idOrRef',
  authorize('transactions:read'),
  ...getTransactionValidator, validate,
  getTransaction
);

// ── WRITE — operations ───────────────────────────────────────────────────────

/** Deposit (credit to account via branch/NEFT/RTGS) */
router.post(
  '/deposit',
  authorize('transactions:create'),
  ...depositValidator, validate,
  deposit
);

/** Cash withdrawal (branch or ATM) */
router.post(
  '/withdraw',
  authorize('transactions:create'),
  ...withdrawValidator, validate,
  withdraw
);

/** Cash withdrawal alias */
router.post(
  '/withdrawal',
  authorize('transactions:create'),
  ...withdrawValidator, validate,
  withdrawal
);

/** Fund transfer (web/mobile/UPI/NEFT/RTGS/IMPS) */
router.post(
  '/transfer',
  authorize('transactions:create'),
  ...transferValidator, validate,
  transfer
);

/** Card payment (POS) */
router.post(
  '/card-payment',
  authorize('transactions:create'),
  ...cardPaymentValidator, validate,
  cardPayment
);

/** UPI payment simulation */
router.post(
  '/upi',
  authorize('transactions:create'),
  ...upiPaymentValidator, validate,
  upiPayment
);

/** ATM withdrawal simulation */
router.post(
  '/atm',
  authorize('transactions:create'),
  ...atmWithdrawalValidator, validate,
  atmWithdrawal
);

/** Online payment simulation (web/mobile) */
router.post(
  '/online',
  authorize('transactions:create'),
  ...onlinePaymentValidator, validate,
  onlinePayment
);

/** Compensating reversal transaction (admin only) */
router.post(
  '/:id/reverse',
  authorize('transactions:reverse'),
  ...reverseTransactionValidator, validate,
  reverseTransaction
);

export default router;
