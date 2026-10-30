import { Router }          from 'express';
import authRoutes            from './authRoutes.js';
import transactionRoutes     from './transactionRoutes.js';
import fraudRoutes           from './fraudRoutes.js';
import branchRoutes          from './branchRoutes.js';
import customerRoutes        from './customerRoutes.js';
import accountRoutes         from './accountRoutes.js';
import cardRoutes            from './cardRoutes.js';
import reportRoutes          from './reportRoutes.js';
import notificationRoutes    from './notificationRoutes.js';
import dashboardRoutes       from './dashboardRoutes.js';
import userRoutes           from './userRoutes.js';

const router = Router();

router.use('/auth',          authRoutes);
router.use('/users',         userRoutes);
router.use('/transactions',  transactionRoutes);
router.use('/fraud',         fraudRoutes);
router.use('/branches',      branchRoutes);
router.use('/customers',     customerRoutes);
router.use('/accounts',      accountRoutes);
router.use('/cards',         cardRoutes);
router.use('/reports',       reportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/dashboard',     dashboardRoutes);

export default router;
