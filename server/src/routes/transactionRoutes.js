import { Router }       from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import {
  validate,
  transferValidator,
  cardPaymentValidator,
  upiPaymentValidator,
  getTransactionValidator,
  listTransactionsValidator,
} from '../validators/transactionValidators.js';
import {
  transfer,
  cardPayment,
  upiPayment,
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

// ── WRITE — transfer, card-payment, UPI only ─────────────────────────────────

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

export default router;
