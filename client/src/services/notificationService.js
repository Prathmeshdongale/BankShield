/**
 * notificationService.js — API calls for the notifications module.
 * Mirrors server/src/routes/notificationRoutes.js
 *
 *   GET    /notifications              list own notifications
 *   GET    /notifications/unread-count count of unread
 *   PATCH  /notifications/read-all     mark all read
 *   GET    /notifications/:id          get one
 *   PATCH  /notifications/:id/read     mark one read
 *   DELETE /notifications/:id          delete one
 *
 * Note: notification :id is a BIGSERIAL integer, not a UUID.
 */
import api from './api';

export const notificationService = {
  /** GET /notifications — paginated list with optional filters */
  list: (params = {}) =>
    api.get('/notifications', { params }).then(r => r.data),

  /** GET /notifications/unread-count */
  unreadCount: () =>
    api.get('/notifications/unread-count').then(r => r.data),

  /** GET /notifications/:id */
  get: (id) =>
    api.get(`/notifications/${id}`).then(r => r.data),

  /** PATCH /notifications/:id/read */
  markRead: (id) =>
    api.patch(`/notifications/${id}/read`).then(r => r.data),

  /** PATCH /notifications/read-all */
  markAllRead: () =>
    api.patch('/notifications/read-all').then(r => r.data),

  /** DELETE /notifications/:id */
  delete: (id) =>
    api.delete(`/notifications/${id}`).then(r => r.data),
};

export default notificationService;
