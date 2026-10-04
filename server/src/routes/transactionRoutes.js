/**
 * transactionRoutes.js
 *
 * RBAC (Section 4):
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
 *   POST    /transfer                 transactions:create
 *   POST    /card-payment             transactions:create
 *   POST    /upi                      transactions:create
 *   POST    /atm                      transactions:create
 *   POST    /online                   transactions:create
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
  getTransactionValidator,
  listTransactionsValidator,
} from '../validators/transactionValidators.js';
import {
  deposit,
  withdraw,
  transfer,
  cardPayment,
  upiPayment,
  atmWithdrawal,
  onlinePayment,
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

// ── WRITE — each transaction type has its own endpoint ───────────────────────

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

/** ATM withdrawal simulation (card + daily_atm limit enforced) */
router.post(
  '/atm',
  authorize('transactions:create'),
  ...atmWithdrawalValidator, validate,
  atmWithdrawal
);

/** Online payment simulation (web/mobile, daily_online limit enforced) */
router.post(
  '/online',
  authorize('transactions:create'),
  ...onlinePaymentValidator, validate,
  onlinePayment
);

export default router;
