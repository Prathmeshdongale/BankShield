/**
 * userRoutes.js — User management endpoints.
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import {
  listUsers,
  getUser,
  createUserHandler,
  updateUserStatusHandler,
  updateUserRoleHandler,
  deleteUserHandler,
} from '../controllers/userController.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize('users:read'), listUsers);
router.get('/:id', authorize('users:read'), getUser);
router.post('/', authorize('users:manage_roles'), createUserHandler);
router.patch('/:id/status', authorize('users:manage_roles'), updateUserStatusHandler);
router.patch('/:id/role', authorize('users:manage_roles'), updateUserRoleHandler);
router.delete('/:id', authorize('users:manage_roles'), deleteUserHandler);

export default router;
