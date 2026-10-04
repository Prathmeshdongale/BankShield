/**
 * notificationService2.js — Notification inbox business logic.
 *
 * Provides the user-facing inbox API:
 *   listNotificationsService   — paginated list for authenticated user
 *   getNotificationService     — single notification
 *   markReadService            — mark one as read
 *   markAllReadService         — mark all as read
 *   deleteNotificationService  — delete one
 *
 * Note: notification *creation* lives in fraudQueries.js (insertNotification)
 * and notificationService.js (sendFraudAlertNotification + Nodemailer).
 * This file handles the READ-side inbox API.
 */

import { logger }        from '../utils/logger.js';
import {
  listNotifications,
  findNotificationById,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  getUnreadCount,
} from '../db/queries/notificationQueries.js';

const mkErr = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });

export const listNotificationsService = async (userId, queryParams = {}) => {
  const limit      = Math.min(parseInt(queryParams.limit,  10) || 30, 100);
  const offset     = Math.max(parseInt(queryParams.offset, 10) || 0,  0);
  const unreadOnly = queryParams.unreadOnly === 'true' || queryParams.unreadOnly === true;
  const page       = Math.floor(offset / limit) + 1;

  const { rows, total, unread } = await listNotifications({
    userId,
    status    : queryParams.status  || null,
    channel   : queryParams.channel || null,
    unreadOnly,
    limit,
    offset,
  });

  return {
    data      : rows,
    unread,
    pagination: { total, limit, offset, page, pages: Math.ceil(total / limit) },
  };
};

export const getNotificationService = async (id, userId) => {
  const notif = await findNotificationById(id, userId);
  if (!notif) throw mkErr('NOTIFICATION_NOT_FOUND', 404);
  return notif;
};

export const markReadService = async (id, userId) => {
  const notif = await findNotificationById(id, userId);
  if (!notif) throw mkErr('NOTIFICATION_NOT_FOUND', 404);

  if (notif.status === 'read') return notif;  // already read — idempotent
  const updated = await markNotificationRead(id, userId);
  return updated ?? notif;
};

export const markAllReadService = async (userId) => {
  const count = await markAllNotificationsRead(userId);
  logger.info(`[notif] Marked ${count} notifications as read for user ${userId}`);
  return { updated: count };
};

export const deleteNotificationService = async (id, userId) => {
  const notif = await findNotificationById(id, userId);
  if (!notif) throw mkErr('NOTIFICATION_NOT_FOUND', 404);
  const deleted = await deleteNotification(id, userId);
  if (!deleted) throw mkErr('NOTIFICATION_NOT_FOUND', 404);
  return deleted;
};

export const getUnreadCountService = async (userId) => {
  const count = await getUnreadCount(userId);
  return { unread: count };
};
