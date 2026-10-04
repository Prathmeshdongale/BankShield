/**
 * notificationController.js — HTTP handlers for notification inbox.
 */
import {
  listNotificationsService,
  getNotificationService,
  markReadService,
  markAllReadService,
  deleteNotificationService,
  getUnreadCountService,
} from '../services/notificationService2.js';
import { success, failure } from '../utils/response.js';
import { logger }           from '../utils/logger.js';

const handleErr = (err, res) => {
  const code = err.message;
  if (code === 'NOTIFICATION_NOT_FOUND') return failure(res, 'Notification not found.', 404);
  if ((err.statusCode ?? 500) >= 500) logger.error(`[NotifController] ${err.stack ?? err.message}`);
  return failure(res, 'An unexpected error occurred.', err.statusCode ?? 500);
};

/** GET /api/notifications */
export const listNotifications = async (req, res) => {
  try {
    const result = await listNotificationsService(req.user.id, req.query);
    return success(res, result, 'Notifications retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/notifications/unread-count */
export const getUnreadCount = async (req, res) => {
  try {
    const result = await getUnreadCountService(req.user.id);
    return success(res, result, 'Unread count retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/notifications/:id */
export const getNotification = async (req, res) => {
  try {
    const notif = await getNotificationService(req.params.id, req.user.id);
    return success(res, { notification: notif }, 'Notification retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** PATCH /api/notifications/:id/read */
export const markRead = async (req, res) => {
  try {
    const notif = await markReadService(req.params.id, req.user.id);
    return success(res, { notification: notif }, 'Marked as read.');
  } catch (err) { return handleErr(err, res); }
};

/** PATCH /api/notifications/read-all */
export const markAllRead = async (req, res) => {
  try {
    const result = await markAllReadService(req.user.id);
    return success(res, result, `${result.updated} notification(s) marked as read.`);
  } catch (err) { return handleErr(err, res); }
};

/** DELETE /api/notifications/:id */
export const deleteNotification = async (req, res) => {
  try {
    await deleteNotificationService(req.params.id, req.user.id);
    return success(res, null, 'Notification deleted.');
  } catch (err) { return handleErr(err, res); }
};

export default { listNotifications, getUnreadCount, getNotification, markRead, markAllRead, deleteNotification };
