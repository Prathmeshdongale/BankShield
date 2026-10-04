/**
 * notificationRoutes.js — Notification inbox (all authenticated users).
 *
 *   GET    /                  list own notifications
 *   GET    /unread-count       count of unread
 *   PATCH  /read-all           mark all read
 *   GET    /:id                get one
 *   PATCH  /:id/read           mark one read
 *   DELETE /:id                delete one
 */
import { Router }       from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  validate,
  listNotificationsValidator,
  notificationIdValidator,
} from '../validators/reportValidators.js';
import {
  listNotifications,
  getUnreadCount,
  getNotification,
  markRead,
  markAllRead,
  deleteNotification,
} from '../controllers/notificationController.js';

const router = Router();
router.use(authenticate);   // all notification routes require login; no extra RBAC needed

router.get(   '/',              ...listNotificationsValidator, validate, listNotifications);
router.get(   '/unread-count',  getUnreadCount);
router.patch( '/read-all',      markAllRead);
router.get(   '/:id',           ...notificationIdValidator, validate, getNotification);
router.patch( '/:id/read',      ...notificationIdValidator, validate, markRead);
router.delete('/:id',           ...notificationIdValidator, validate, deleteNotification);

export default router;
