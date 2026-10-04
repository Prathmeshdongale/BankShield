/**
 * reportQueries.js — Raw SQL for reports + file_uploads tables.
 *
 * reports columns:
 *   id UUID PK, report_type report_type NOT NULL,
 *   title VARCHAR(255), requested_by UUID FK→users RESTRICT,
 *   parameters JSONB, status report_status DEFAULT 'queued',
 *   file_upload_id UUID FK→file_uploads SET NULL,
 *   error_message TEXT, started_at, completed_at, expires_at,
 *   deleted_at, created_at, updated_at
 *
 * report_type enum: transaction_summary | fraud_report | audit_report |
 *                   compliance_report | customer_statement | risk_report
 * report_status enum: queued | generating | ready | failed | expired
 *
 * file_uploads columns:
 *   id UUID PK, uploader_id UUID FK→users RESTRICT,
 *   original_name VARCHAR(255), stored_name VARCHAR(255) UNIQUE,
 *   mime_type VARCHAR(100), file_size BIGINT,
 *   storage_path TEXT, bucket VARCHAR(100),
 *   related_entity VARCHAR(50), related_id TEXT,
 *   is_public BOOLEAN, deleted_at, created_at, updated_at
 */

import { query as poolQuery } from '../connection.js';

const run = (client, text, params) =>
  client ? client.query(text, params) : poolQuery(text, params);

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────────────────────────────────────────

const REPORT_SELECT = `
  SELECT
    r.id, r.report_type, r.title, r.requested_by,
    r.parameters, r.status, r.file_upload_id,
    r.error_message, r.started_at, r.completed_at, r.expires_at,
    r.created_at, r.updated_at,
    u.first_name AS requester_first_name,
    u.last_name  AS requester_last_name,
    u.email      AS requester_email,
    fu.storage_path, fu.original_name AS file_name,
    fu.mime_type,    fu.file_size
  FROM  reports r
  JOIN  users u ON u.id = r.requested_by
  LEFT  JOIN file_uploads fu ON fu.id = r.file_upload_id
`;

export const findReportById = async (id, client = null) => {
  const { rows } = await run(client,
    `${REPORT_SELECT} WHERE r.id = $1 AND r.deleted_at IS NULL LIMIT 1;`, [id]);
  return rows[0] ?? null;
};

export const listReports = async ({
  reportType = null,
  status     = null,
  requestedBy = null,
  dateFrom   = null,
  dateTo     = null,
  limit      = 20,
  offset     = 0,
  sortDir    = 'DESC',
} = {}, client = null) => {
  const dir  = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const cond = ['r.deleted_at IS NULL'];
  const vals = [];

  if (reportType)  { vals.push(reportType);  cond.push(`r.report_type  = $${vals.length}::report_type`); }
  if (status)      { vals.push(status);      cond.push(`r.status       = $${vals.length}::report_status`); }
  if (requestedBy) { vals.push(requestedBy); cond.push(`r.requested_by = $${vals.length}`); }
  if (dateFrom)    { vals.push(dateFrom);    cond.push(`r.created_at  >= $${vals.length}`); }
  if (dateTo)      { vals.push(dateTo);      cond.push(`r.created_at  <= $${vals.length}`); }

  const where = `WHERE ${cond.join(' AND ')}`;
  const { rows: countRows } = await run(client,
    `SELECT COUNT(*) FROM reports r ${where};`, vals);
  const total = parseInt(countRows[0].count, 10);

  vals.push(limit, offset);
  const { rows } = await run(client, `
    ${REPORT_SELECT}
    ${where}
    ORDER BY r.created_at ${dir}
    LIMIT  $${vals.length - 1}
    OFFSET $${vals.length};
  `, vals);
  return { rows, total };
};

export const createReport = async ({
  reportType, title, requestedBy, parameters = null,
}, client = null) => {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
  const { rows } = await run(client, `
    INSERT INTO reports (report_type, title, requested_by, parameters, status, expires_at)
    VALUES ($1::report_type, $2, $3, $4, 'queued', $5)
    RETURNING *;
  `, [reportType, title, requestedBy, parameters ? JSON.stringify(parameters) : null, expiresAt]);
  return rows[0];
};

export const updateReportStatus = async (id, {
  status, fileUploadId = undefined, errorMessage = undefined,
  startedAt = undefined, completedAt = undefined,
}, client = null) => {
  const sets   = [`status = $2::report_status`, `updated_at = NOW()`];
  const values = [id, status];

  if (fileUploadId  !== undefined) { values.push(fileUploadId);  sets.push(`file_upload_id = $${values.length}`); }
  if (errorMessage  !== undefined) { values.push(errorMessage);  sets.push(`error_message  = $${values.length}`); }
  if (startedAt     !== undefined) { values.push(startedAt);     sets.push(`started_at     = $${values.length}`); }
  if (completedAt   !== undefined) { values.push(completedAt);   sets.push(`completed_at   = $${values.length}`); }

  const { rows } = await run(client, `
    UPDATE reports SET ${sets.join(', ')} WHERE id = $1 RETURNING *;
  `, values);
  return rows[0] ?? null;
};

export const softDeleteReport = async (id, client = null) => {
  const { rows } = await run(client, `
    UPDATE reports SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL RETURNING id;
  `, [id]);
  return rows[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// FILE UPLOADS (for report output files)
// ─────────────────────────────────────────────────────────────────────────────

export const insertFileUploadForReport = async ({
  uploaderId, originalName, storedName, mimeType,
  fileSize, storagePath, reportId,
}, client = null) => {
  const { rows } = await run(client, `
    INSERT INTO file_uploads
      (uploader_id, original_name, stored_name, mime_type, file_size,
       storage_path, bucket, related_entity, related_id, is_public)
    VALUES ($1, $2, $3, $4, $5, $6, 'local', 'report', $7, FALSE)
    RETURNING *;
  `, [uploaderId, originalName, storedName, mimeType, fileSize, storagePath, reportId]);
  return rows[0];
};

// ─────────────────────────────────────────────────────────────────────────────
// REPORT DATA QUERIES — raw aggregations used by reportDataService.js
// ─────────────────────────────────────────────────────────────────────────────

/** Daily transaction summary — totals by type + channel for a date range. */
export const getDailyTransactionSummary = async ({ dateFrom, dateTo }, client = null) => {
  const { rows } = await run(client, `
    SELECT
      DATE_TRUNC('day', created_at)  AS day,
      txn_type,
      channel,
      status,
      COUNT(*)                        AS txn_count,
      COALESCE(SUM(amount),  0)       AS total_amount,
      COALESCE(AVG(amount),  0)       AS avg_amount,
      COALESCE(MAX(amount),  0)       AS max_amount,
      COALESCE(MIN(amount),  0)       AS min_amount,
      SUM(CASE WHEN is_fraud THEN 1 ELSE 0 END) AS fraud_count
    FROM   transactions
    WHERE  created_at >= $1 AND created_at <= $2
    GROUP  BY 1, 2, 3, 4
    ORDER  BY 1 DESC, txn_count DESC;
  `, [dateFrom, dateTo]);
  return rows;
};

/** Fraud summary — alerts + predictions aggregated over a date range. */
export const getFraudSummary = async ({ dateFrom, dateTo }, client = null) => {
  const { rows } = await run(client, `
    SELECT
      DATE_TRUNC('day', fa.created_at) AS day,
      fa.severity,
      fa.status,
      COUNT(fa.id)                      AS alert_count,
      COALESCE(AVG(fa.risk_score), 0)   AS avg_risk_score,
      COALESCE(SUM(t.amount), 0)        AS total_amount_at_risk,
      SUM(CASE WHEN fa.status = 'confirmed_fraud' THEN 1 ELSE 0 END) AS confirmed_count,
      SUM(CASE WHEN fa.status = 'false_positive'  THEN 1 ELSE 0 END) AS false_positive_count
    FROM   fraud_alerts fa
    JOIN   transactions t ON t.id = fa.transaction_id
    WHERE  fa.created_at >= $1 AND fa.created_at <= $2
      AND  fa.deleted_at IS NULL
    GROUP  BY 1, 2, 3
    ORDER  BY 1 DESC, alert_count DESC;
  `, [dateFrom, dateTo]);
  return rows;
};

/** Analyst performance — notes + investigations + resolutions per analyst. */
export const getAnalystPerformance = async ({ dateFrom, dateTo }, client = null) => {
  const { rows } = await run(client, `
    SELECT
      u.id              AS analyst_id,
      u.first_name || ' ' || u.last_name AS analyst_name,
      u.email           AS analyst_email,
      COUNT(DISTINCT fi.id)                       AS investigations_total,
      COUNT(DISTINCT CASE WHEN fi.status IN ('closed_fraud','closed_no_fraud') THEN fi.id END) AS investigations_closed,
      COUNT(DISTINCT an.id)                       AS notes_added,
      COUNT(DISTINCT fa.id)                       AS alerts_assigned,
      COUNT(DISTINCT CASE WHEN fa.status = 'confirmed_fraud'  THEN fa.id END) AS confirmed_fraud,
      COUNT(DISTINCT CASE WHEN fa.status = 'false_positive'   THEN fa.id END) AS false_positive,
      COALESCE(AVG(
        EXTRACT(EPOCH FROM (fi.closed_at - fi.opened_at)) / 3600
      ), 0)             AS avg_resolution_hours
    FROM  users u
    JOIN  roles r ON r.id = u.role_id
    LEFT  JOIN fraud_investigations fi ON fi.assigned_to = u.id
                 AND fi.created_at >= $1 AND fi.created_at <= $2
    LEFT  JOIN analyst_notes an ON an.author_id = u.id
                 AND an.created_at >= $1 AND an.created_at <= $2
    LEFT  JOIN fraud_alerts fa ON fa.assigned_to = u.id
                 AND fa.created_at >= $1 AND fa.created_at <= $2
    WHERE r.name IN ('fraud_analyst','compliance_officer')
      AND u.deleted_at IS NULL
    GROUP  BY u.id, u.first_name, u.last_name, u.email
    ORDER  BY investigations_closed DESC;
  `, [dateFrom, dateTo]);
  return rows;
};

/** Customer activity — per-customer transaction summary. */
export const getCustomerActivity = async ({ dateFrom, dateTo, customerId = null }, client = null) => {
  const cond = ['t.created_at >= $1', 't.created_at <= $2'];
  const vals = [dateFrom, dateTo];
  if (customerId) { vals.push(customerId); cond.push(`c.id = $${vals.length}`); }

  const { rows } = await run(client, `
    SELECT
      c.id              AS customer_id,
      c.customer_number,
      u.first_name || ' ' || u.last_name AS customer_name,
      u.email,
      c.risk_rating,
      COUNT(t.id)                         AS txn_count,
      COALESCE(SUM(t.amount), 0)          AS total_amount,
      COALESCE(MAX(t.amount), 0)          AS largest_txn,
      SUM(CASE WHEN t.is_fraud THEN 1 ELSE 0 END) AS fraud_count,
      COUNT(DISTINCT t.channel)           AS channels_used,
      COUNT(DISTINCT t.location_country)  AS countries_used,
      MAX(t.risk_score)                   AS max_risk_score
    FROM   customers c
    JOIN   users     u  ON u.id = c.user_id
    JOIN   accounts  a  ON a.customer_id = c.id
    JOIN   transactions t ON (t.source_account_id = a.id OR t.destination_account_id = a.id)
    WHERE  ${cond.join(' AND ')}
      AND  c.deleted_at IS NULL
    GROUP  BY c.id, c.customer_number, u.first_name, u.last_name, u.email, c.risk_rating
    ORDER  BY total_amount DESC
    LIMIT  500;
  `, vals);
  return rows;
};

/** Monthly risk summary — risk scores, flagged transactions, alert distribution. */
export const getMonthlyRiskSummary = async ({ dateFrom, dateTo }, client = null) => {
  const { rows } = await run(client, `
    SELECT
      DATE_TRUNC('month', t.created_at)   AS month,
      COUNT(t.id)                          AS total_transactions,
      SUM(t.amount)                        AS total_volume,
      COUNT(CASE WHEN t.is_fraud   THEN 1 END) AS fraud_transactions,
      COUNT(CASE WHEN t.status = 'flagged'  THEN 1 END) AS flagged_transactions,
      COUNT(CASE WHEN t.status = 'blocked'  THEN 1 END) AS blocked_transactions,
      COALESCE(AVG(CASE WHEN t.risk_score > 0 THEN t.risk_score END), 0) AS avg_risk_score,
      COALESCE(MAX(t.risk_score), 0)       AS max_risk_score,
      COUNT(DISTINCT fa.id)                AS total_alerts,
      COUNT(DISTINCT CASE WHEN fa.severity = 'critical' THEN fa.id END) AS critical_alerts,
      COUNT(DISTINCT CASE WHEN fa.severity = 'high'     THEN fa.id END) AS high_alerts,
      COUNT(DISTINCT fi.id)                AS investigations_opened,
      COUNT(DISTINCT CASE WHEN fi.status = 'closed_fraud' THEN fi.id END) AS confirmed_fraud_cases
    FROM   transactions t
    LEFT   JOIN fraud_alerts       fa ON fa.transaction_id = t.id AND fa.deleted_at IS NULL
    LEFT   JOIN fraud_investigations fi ON fi.alert_id = fa.id    AND fi.deleted_at IS NULL
    WHERE  t.created_at >= $1 AND t.created_at <= $2
    GROUP  BY 1
    ORDER  BY 1 DESC;
  `, [dateFrom, dateTo]);
  return rows;
};
