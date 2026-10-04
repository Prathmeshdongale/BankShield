/**
 * notificationQueries.js — SQL for the notification inbox module.
 *
 * notifications columns:
 *   id BIGSERIAL PK, user_id UUID FK CASCADE,
 *   title VARCHAR(200), body TEXT,
 *   channel notification_channel DEFAULT 'in_app',
 *   status notification_status DEFAULT 'pending',
 *   related_entity VARCHAR(50), related_id UUID,
 *   sent_at, read_at, metadata JSONB,
 *   created_at, updated_at
 *
 * notification_channel enum: email | sms | push | in_app
 * notification_status  enum: pending | sent | delivered | failed | read
 */

import { query as poolQuery } from '../connection.js';

const run = (client, text, params) =>
  client ? client.query(text, params) : poolQuery(text, params);

/** Paginated notification list for a user. */
export const listNotifications = async ({
  userId,
  status    = null,
  channel   = null,
  unreadOnly = false,
  limit     = 30,
  offset    = 0,
} = {}, client = null) => {
  const cond = ['n.user_id = $1'];
  const vals = [userId];

  if (unreadOnly) {
    cond.push(`n.status NOT IN ('read')`);
  } else if (status) {
    vals.push(status);
    cond.push(`n.status = $${vals.length}::notification_status`);
  }
  if (channel) {
    vals.push(channel);
    cond.push(`n.channel = $${vals.length}::notification_channel`);
  }

  const where = `WHERE ${cond.join(' AND ')}`;

  const { rows: countRows } = await run(client,
    `SELECT COUNT(*) FROM notifications n ${where};`, vals);
  const total    = parseInt(countRows[0].count, 10);
  const unreadCt = await getUnreadCount(userId, client);

  vals.push(limit, offset);
  const { rows } = await run(client, `
    SELECT id, user_id, title, body, channel, status,
           related_entity, related_id, metadata,
           sent_at, read_at, created_at, updated_at
    FROM   notifications n
    ${where}
    ORDER  BY created_at DESC
    LIMIT  $${vals.length - 1}
    OFFSET $${vals.length};
  `, vals);
  return { rows, total, unread: unreadCt };
};

/** Count unread notifications for a user. */
export const getUnreadCount = async (userId, client = null) => {
  const { rows } = await run(client, `
    SELECT COUNT(*) AS cnt
    FROM   notifications
    WHERE  user_id = $1
      AND  status  NOT IN ('read', 'failed');
  `, [userId]);
  return parseInt(rows[0].cnt, 10);
};

/** Mark a single notification as read. */
export const markNotificationRead = async (id, userId, client = null) => {
  const { rows } = await run(client, `
    UPDATE notifications
    SET    status   = 'read',
           read_at  = NOW(),
           updated_at = NOW()
    WHERE  id      = $1
      AND  user_id = $2
      AND  status  != 'read'
    RETURNING id, status, read_at;
  `, [id, userId]);
  return rows[0] ?? null;
};

/** Mark ALL unread notifications as read for a user. */
export const markAllNotificationsRead = async (userId, client = null) => {
  const { rows } = await run(client, `
    UPDATE notifications
    SET    status   = 'read',
           read_at  = NOW(),
           updated_at = NOW()
    WHERE  user_id = $1
      AND  status  NOT IN ('read', 'failed')
    RETURNING id;
  `, [userId]);
  return rows.length; // count of updated rows
};

/** Soft-delete (hard delete is fine here — notifications are not audit items). */
export const deleteNotification = async (id, userId, client = null) => {
  const { rows } = await run(client, `
    DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id;
  `, [id, userId]);
  return rows[0] ?? null;
};

/** Get a single notification (guards user ownership). */
export const findNotificationById = async (id, userId, client = null) => {
  const { rows } = await run(client, `
    SELECT * FROM notifications WHERE id = $1 AND user_id = $2 LIMIT 1;
  `, [id, userId]);
  return rows[0] ?? null;
};
