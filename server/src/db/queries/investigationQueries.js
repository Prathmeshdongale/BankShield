/**
 * investigationQueries.js — Raw SQL for fraud_alerts, fraud_investigations,
 * analyst_notes, and account freeze operations.
 *
 * ── Schema reference ─────────────────────────────────────────────────────────
 *
 * alert_status enum:
 *   open → investigating → escalated → confirmed_fraud / false_positive → resolved → closed
 *
 * investigation_status enum:
 *   open → in_progress → pending_review → closed_fraud / closed_no_fraud
 *
 * fraud_alerts columns:
 *   id UUID PK, transaction_id UUID FK RESTRICT,
 *   prediction_id BIGINT FK SET NULL,
 *   risk_score NUMERIC(6,4), severity alert_severity, status alert_status,
 *   trigger_reasons JSONB, assigned_to UUID FK users SET NULL,
 *   assigned_at, first_reviewed_at, resolved_at, auto_resolved BOOLEAN,
 *   deleted_at, created_at, updated_at
 *
 * fraud_investigations columns:
 *   id UUID PK, alert_id UUID FK RESTRICT,
 *   case_number VARCHAR(40) UNIQUE, status investigation_status,
 *   priority VARCHAR(10) CHECK(low|medium|high|critical),
 *   opened_by UUID FK RESTRICT, assigned_to UUID FK SET NULL,
 *   opened_at, closed_at, outcome TEXT, evidence_urls JSONB,
 *   deleted_at, created_at, updated_at
 *
 * analyst_notes columns:
 *   id BIGSERIAL PK,
 *   investigation_id UUID FK CASCADE (nullable),
 *   alert_id UUID FK CASCADE (nullable),
 *   CHECK(investigation_id IS NOT NULL OR alert_id IS NOT NULL),
 *   author_id UUID FK RESTRICT, note_text TEXT,
 *   is_internal BOOLEAN DEFAULT TRUE,
 *   deleted_at, created_at, updated_at
 */

import crypto               from 'crypto';
import { query as poolQuery } from '../connection.js';

const run = (client, text, params) =>
  client ? client.query(text, params) : poolQuery(text, params);

// ─────────────────────────────────────────────────────────────────────────────
// FRAUD ALERTS — reads
// ─────────────────────────────────────────────────────────────────────────────

const ALERT_SELECT = `
  SELECT
    fa.id, fa.transaction_id, fa.prediction_id,
    fa.risk_score, fa.severity, fa.status,
    fa.trigger_reasons, fa.assigned_to,
    fa.assigned_at, fa.first_reviewed_at, fa.resolved_at,
    fa.auto_resolved, fa.created_at, fa.updated_at,
    -- joined transaction
    t.transaction_ref, t.txn_type, t.amount, t.currency,
    t.channel, t.source_account_id, t.destination_account_id,
    t.ip_address, t.location_city, t.location_country,
    t.is_fraud AS txn_is_fraud, t.completed_at,
    -- source account number
    sa.account_number AS source_account_number,
    -- assigned analyst
    u.first_name  AS analyst_first_name,
    u.last_name   AS analyst_last_name,
    u.email       AS analyst_email,
    -- ML prediction explanation (SHAP values + risk level)
    fp.explanation AS prediction_explanation,
    fp.model_version AS prediction_model_version,
    fp.inference_ms  AS prediction_inference_ms
  FROM  fraud_alerts fa
  JOIN  transactions t  ON t.id  = fa.transaction_id
  LEFT  JOIN accounts sa ON sa.id = t.source_account_id
  LEFT  JOIN users    u  ON u.id  = fa.assigned_to
  LEFT  JOIN fraud_predictions fp ON fp.id = fa.prediction_id
`;

export const findAlertById = async (id, client = null) => {
  const { rows } = await run(client,
    `${ALERT_SELECT} WHERE fa.id = $1 AND fa.deleted_at IS NULL LIMIT 1;`, [id]);
  return rows[0] ?? null;
};

/**
 * Paginated alert list with filters.
 * Filters: status, severity, assignedTo, isFraud, dateFrom, dateTo, limit, offset
 */
export const listAlerts = async ({
  status     = null,
  severity   = null,
  assignedTo = null,
  isAssigned = null,   // true = has assignee, false = unassigned
  dateFrom   = null,
  dateTo     = null,
  limit      = 50,
  offset     = 0,
  sortDir    = 'DESC',
} = {}, client = null) => {
  const dir  = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const cond = ['fa.deleted_at IS NULL'];
  const vals = [];

  if (status)   { vals.push(status);   cond.push(`fa.status   = $${vals.length}::alert_status`); }
  if (severity) { vals.push(severity); cond.push(`fa.severity = $${vals.length}::alert_severity`); }
  if (assignedTo) { vals.push(assignedTo); cond.push(`fa.assigned_to = $${vals.length}`); }
  if (isAssigned === true)  cond.push('fa.assigned_to IS NOT NULL');
  if (isAssigned === false) cond.push('fa.assigned_to IS NULL');
  if (dateFrom) { vals.push(dateFrom); cond.push(`fa.created_at >= $${vals.length}`); }
  if (dateTo)   { vals.push(dateTo);   cond.push(`fa.created_at <= $${vals.length}`); }

  const where = `WHERE ${cond.join(' AND ')}`;

  const countSql = `
    SELECT COUNT(*) FROM fraud_alerts fa
    JOIN  transactions t ON t.id = fa.transaction_id
    ${where};
  `;
  const { rows: countRows } = await run(client, countSql, vals);
  const total = parseInt(countRows[0].count, 10);

  vals.push(limit, offset);
  const dataSql = `
    ${ALERT_SELECT}
    ${where}
    ORDER BY fa.created_at ${dir}
    LIMIT  $${vals.length - 1}
    OFFSET $${vals.length};
  `;
  const { rows } = await run(client, dataSql, vals);
  return { rows, total };
};

// ─────────────────────────────────────────────────────────────────────────────
// FRAUD ALERTS — writes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update alert status with full audit fields.
 * Allowed transitions enforced in the service layer.
 */
export const updateAlertStatus = async (id, {
  status, assignedTo, resolvedAt, firstReviewedAt,
}, client = null) => {
  const sets   = [`status = $2::alert_status`, 'updated_at = NOW()'];
  const values = [id, status];

  if (assignedTo     !== undefined) { values.push(assignedTo);     sets.push(`assigned_to       = $${values.length}`); }
  if (resolvedAt     !== undefined) { values.push(resolvedAt);     sets.push(`resolved_at        = $${values.length}`); }
  if (firstReviewedAt !== undefined){ values.push(firstReviewedAt);sets.push(`first_reviewed_at  = $${values.length}`); }

  const { rows } = await run(client, `
    UPDATE fraud_alerts SET ${sets.join(', ')}
    WHERE  id = $1 AND deleted_at IS NULL
    RETURNING *;
  `, values);
  return rows[0] ?? null;
};

/** Assign alert to an analyst. Stamps assigned_at. */
export const assignAlert = async (id, analystId, client = null) => {
  const { rows } = await run(client, `
    UPDATE fraud_alerts
    SET    assigned_to  = $2,
           assigned_at  = NOW(),
           status       = CASE WHEN status = 'open' THEN 'investigating'::alert_status ELSE status END,
           updated_at   = NOW()
    WHERE  id = $1 AND deleted_at IS NULL
    RETURNING *;
  `, [id, analystId]);
  return rows[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// FRAUD INVESTIGATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a unique case number: CASE-YYYYMMDD-XXXXXXXX */
export const generateCaseNumber = () => {
  const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `CASE-${date}-${suffix}`;
};

const INVESTIGATION_SELECT = `
  SELECT
    fi.id, fi.alert_id, fi.case_number, fi.status, fi.priority,
    fi.opened_by, fi.assigned_to, fi.opened_at, fi.closed_at,
    fi.outcome, fi.evidence_urls, fi.deleted_at,
    fi.created_at, fi.updated_at,
    -- opener
    uo.first_name  AS opener_first_name,
    uo.last_name   AS opener_last_name,
    -- assignee
    ua.first_name  AS assignee_first_name,
    ua.last_name   AS assignee_last_name,
    ua.email       AS assignee_email
  FROM  fraud_investigations fi
  JOIN  users uo ON uo.id = fi.opened_by
  LEFT  JOIN users ua ON ua.id = fi.assigned_to
`;

export const findInvestigationById = async (id, client = null) => {
  const { rows } = await run(client,
    `${INVESTIGATION_SELECT} WHERE fi.id = $1 AND fi.deleted_at IS NULL LIMIT 1;`, [id]);
  return rows[0] ?? null;
};

export const findInvestigationByAlertId = async (alertId, client = null) => {
  const { rows } = await run(client,
    `${INVESTIGATION_SELECT} WHERE fi.alert_id = $1 AND fi.deleted_at IS NULL LIMIT 1;`, [alertId]);
  return rows[0] ?? null;
};

export const listInvestigations = async ({
  status     = null,
  priority   = null,
  assignedTo = null,
  limit      = 50,
  offset     = 0,
  sortDir    = 'DESC',
} = {}, client = null) => {
  const dir  = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const cond = ['fi.deleted_at IS NULL'];
  const vals = [];

  if (status)    { vals.push(status);    cond.push(`fi.status      = $${vals.length}::investigation_status`); }
  if (priority)  { vals.push(priority);  cond.push(`fi.priority    = $${vals.length}`); }
  if (assignedTo){ vals.push(assignedTo);cond.push(`fi.assigned_to = $${vals.length}`); }

  const where = `WHERE ${cond.join(' AND ')}`;

  const { rows: countRows } = await run(client,
    `SELECT COUNT(*) FROM fraud_investigations fi ${where};`, vals);
  const total = parseInt(countRows[0].count, 10);

  vals.push(limit, offset);
  const { rows } = await run(client, `
    ${INVESTIGATION_SELECT}
    ${where}
    ORDER BY fi.created_at ${dir}
    LIMIT  $${vals.length - 1}
    OFFSET $${vals.length};
  `, vals);
  return { rows, total };
};

export const createInvestigation = async ({
  alertId, caseNumber, priority = 'medium', openedBy, assignedTo = null,
}, client = null) => {
  const { rows } = await run(client, `
    INSERT INTO fraud_investigations
      (alert_id, case_number, status, priority, opened_by, assigned_to)
    VALUES ($1, $2, 'open', $3, $4, $5)
    RETURNING *;
  `, [alertId, caseNumber, priority, openedBy, assignedTo ?? null]);
  return rows[0];
};

export const updateInvestigation = async (id, fields, client = null) => {
  const ALLOWED = ['status','priority','assigned_to','closed_at','outcome','evidence_urls'];
  const colMap  = { assignedTo: 'assigned_to', closedAt: 'closed_at', evidenceUrls: 'evidence_urls' };

  const sets   = [];
  const values = [id];
  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined) continue;
    const col = colMap[key] ?? key;
    if (!ALLOWED.includes(col)) continue;
    values.push(col === 'evidence_urls' ? JSON.stringify(val) : val);
    const cast = col === 'status' ? `$${values.length}::investigation_status` : `$${values.length}`;
    sets.push(`${col} = ${cast}`);
  }
  if (sets.length === 0) return null;
  sets.push('updated_at = NOW()');

  const { rows } = await run(client, `
    UPDATE fraud_investigations SET ${sets.join(', ')}
    WHERE  id = $1 AND deleted_at IS NULL
    RETURNING *;
  `, values);
  return rows[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// ANALYST NOTES
// ─────────────────────────────────────────────────────────────────────────────

export const listNotes = async ({ alertId = null, investigationId = null } = {}, client = null) => {
  const cond = ['an.deleted_at IS NULL'];
  const vals = [];
  if (alertId)        { vals.push(alertId);         cond.push(`an.alert_id        = $${vals.length}`); }
  if (investigationId){ vals.push(investigationId); cond.push(`an.investigation_id = $${vals.length}`); }

  const { rows } = await run(client, `
    SELECT
      an.id, an.investigation_id, an.alert_id,
      an.author_id, an.note_text, an.is_internal,
      an.created_at, an.updated_at,
      u.first_name AS author_first_name,
      u.last_name  AS author_last_name,
      u.email      AS author_email
    FROM  analyst_notes an
    JOIN  users u ON u.id = an.author_id
    WHERE ${cond.join(' AND ')}
    ORDER BY an.created_at ASC;
  `, vals);
  return rows;
};

export const createNote = async ({
  alertId = null, investigationId = null,
  authorId, noteText, isInternal = true,
}, client = null) => {
  const { rows } = await run(client, `
    INSERT INTO analyst_notes
      (alert_id, investigation_id, author_id, note_text, is_internal)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `, [alertId, investigationId, authorId, noteText, isInternal]);
  return rows[0];
};

export const softDeleteNote = async (id, client = null) => {
  const { rows } = await run(client, `
    UPDATE analyst_notes SET deleted_at = NOW(), updated_at = NOW()
    WHERE  id = $1 AND deleted_at IS NULL
    RETURNING id;
  `, [id]);
  return rows[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT FREEZE (used when alert is confirmed fraud)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Freeze the source account linked to a transaction.
 * Returns the account row or null if not found.
 */
export const freezeAccountByTransactionId = async (transactionId, client = null) => {
  const { rows } = await run(client, `
    UPDATE accounts a
    SET    status     = 'frozen',
           updated_at = NOW()
    FROM   transactions t
    WHERE  t.id = $1
      AND  a.id = t.source_account_id
      AND  a.status = 'active'
      AND  a.deleted_at IS NULL
    RETURNING a.id, a.account_number, a.status, a.customer_id;
  `, [transactionId]);
  return rows[0] ?? null;
};

/** Lookup the user associated with a fraud alert (via transaction → source account). */
export const getUserByAlertId = async (alertId, client = null) => {
  const { rows } = await run(client, `
    SELECT u.id, u.email, u.first_name, u.last_name
    FROM   fraud_alerts fa
    JOIN   transactions t  ON t.id  = fa.transaction_id
    JOIN   accounts     a  ON a.id  = t.source_account_id
    JOIN   customers    c  ON c.id  = a.customer_id
    JOIN   users        u  ON u.id  = c.user_id
    WHERE  fa.id = $1 AND u.deleted_at IS NULL
    LIMIT  1;
  `, [alertId]);
  return rows[0] ?? null;
};

/** Get analyst user for notification. */
export const findUserById = async (id, client = null) => {
  const { rows } = await run(client,
    `SELECT id, email, first_name, last_name FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1;`,
    [id]);
  return rows[0] ?? null;
};
