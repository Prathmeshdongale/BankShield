/**
 * investigationService.js — Fraud investigation business logic.
 *
 * ── Status state machine ──────────────────────────────────────────────────────
 *
 * ALERT status transitions (alert_status enum):
 *   open → investigating     (assign analyst)
 *   investigating → escalated
 *   investigating / escalated → confirmed_fraud   (freeze account)
 *   investigating / escalated → false_positive     (reopen transaction if blocked)
 *   confirmed_fraud / false_positive → resolved
 *   resolved → closed
 *
 * INVESTIGATION status transitions (investigation_status enum):
 *   open → in_progress       (analyst begins work)
 *   in_progress → pending_review
 *   pending_review → closed_fraud / closed_no_fraud
 *
 * ── RBAC summary ──────────────────────────────────────────────────────────────
 *   fraud:read_alerts    → super_admin, admin, compliance_officer,
 *                          fraud_analyst, branch_manager
 *   fraud:manage_alerts  → super_admin, admin, compliance_officer, fraud_analyst
 *   fraud:investigate    → super_admin, admin, compliance_officer, fraud_analyst
 *   fraud:add_notes      → super_admin, admin, compliance_officer, fraud_analyst
 *   fraud:view_ml        → super_admin, admin, compliance_officer, fraud_analyst
 *   (enforced at route level — permission codes from seeds.js)
 */

import { logger }           from '../utils/logger.js';
import { insertAuditLog }   from '../db/queries/authQueries.js';
import { insertNotification } from '../db/queries/fraudQueries.js';
import { setAccountStatus } from '../db/queries/accountQueries.js';
import {
  findAlertById,
  listAlerts                as dbListAlerts,
  updateAlertStatus         as dbUpdateAlertStatus,
  assignAlert               as dbAssignAlert,
  findInvestigationById,
  findInvestigationByAlertId,
  listInvestigations        as dbListInvestigations,
  createInvestigation       as dbCreateInvestigation,
  updateInvestigation       as dbUpdateInvestigation,
  listNotes                 as dbListNotes,
  createNote                as dbCreateNote,
  softDeleteNote,
  generateCaseNumber,
  freezeAccountByTransactionId,
  getUserByAlertId,
  findUserById,
} from '../db/queries/investigationQueries.js';

// ─────────────────────────────────────────────────────────────────────────────
const mkErr = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });

const getMeta = (req) => ({
  actorId  : req?.user?.id   ?? null,
  ipAddress: req?.ip         ?? null,
  userAgent: req?.headers?.['user-agent'] ?? null,
});

// ── Alert status transition table ────────────────────────────────────────────
const ALERT_TRANSITIONS = {
  open              : ['investigating', 'escalated'],
  investigating     : ['escalated', 'confirmed_fraud', 'false_positive'],
  escalated         : ['confirmed_fraud', 'false_positive', 'investigating'],
  confirmed_fraud   : ['resolved'],
  false_positive    : ['resolved'],
  resolved          : ['closed'],
  closed            : [],  // terminal
};

// ── Investigation status transition table ────────────────────────────────────
const INV_TRANSITIONS = {
  open          : ['in_progress'],
  in_progress   : ['pending_review'],
  pending_review: ['closed_fraud', 'closed_no_fraud'],
  closed_fraud  : [],
  closed_no_fraud: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// ALERTS
// ─────────────────────────────────────────────────────────────────────────────

export const listAlertsService = async (queryParams = {}) => {
  const limit    = Math.min(parseInt(queryParams.limit,  10) || 50, 200);
  const offset   = Math.max(parseInt(queryParams.offset, 10) || 0,  0);
  const page     = Math.floor(offset / limit) + 1;
  const isAssigned =
    queryParams.isAssigned === undefined ? null
    : queryParams.isAssigned === 'true' || queryParams.isAssigned === true;

  const { rows, total } = await dbListAlerts({
    status    : queryParams.status     || null,
    severity  : queryParams.severity   || null,
    assignedTo: queryParams.assignedTo || null,
    isAssigned,
    dateFrom  : queryParams.dateFrom   || null,
    dateTo    : queryParams.dateTo     || null,
    userId    : queryParams.userId     || null,
    branchId  : queryParams.branchId   || null,
    sortDir   : queryParams.sortDir    || 'DESC',
    limit,
    offset,
  });

  return {
    data      : rows,
    pagination: { total, limit, offset, page, pages: Math.ceil(total / limit) },
  };
};

export const getAlertService = async (id) => {
  const alert = await findAlertById(id);
  if (!alert) throw mkErr('ALERT_NOT_FOUND', 404);
  return alert;
};

/**
 * Assign an alert to a specific analyst.
 * Transitions status open → investigating automatically.
 * Sends an in-app notification to the analyst.
 */
export const assignAlertService = async (id, analystId, meta = {}) => {
  const alert = await findAlertById(id);
  if (!alert) throw mkErr('ALERT_NOT_FOUND', 404);
  if (alert.status === 'closed') throw mkErr('ALERT_CLOSED', 409);

  const analyst = await findUserById(analystId);
  if (!analyst) throw mkErr('ANALYST_NOT_FOUND', 404);

  const updated = await dbAssignAlert(id, analystId);

  // Notify analyst of assignment
  await insertNotification({
    userId        : analystId,
    title         : `Fraud Alert Assigned — ${alert.severity?.toUpperCase()}`,
    body          : `You have been assigned a ${alert.severity} fraud alert for transaction ${alert.transaction_ref}. Risk score: ${Math.round(parseFloat(alert.risk_score) * 100)}/100.`,
    channel       : 'in_app',
    relatedEntity : 'fraud_alert',
    relatedId     : id,
    metadata      : { alertId: id, severity: alert.severity, riskScore: alert.risk_score },
  }).catch(e => logger.warn(`[inv] assignment notification failed: ${e.message}`));

  await insertAuditLog({
    userId: meta.actorId, action: 'ALERT_ASSIGNED',
    entityType: 'fraud_alert', entityId: id,
    oldValue: { assigned_to: alert.assigned_to },
    newValue: { assigned_to: analystId, analyst: `${analyst.first_name} ${analyst.last_name}` },
    ipAddress: meta.ipAddress, userAgent: meta.userAgent, status: 'success',
  });

  logger.info(`[inv] Alert ${id} assigned to analyst ${analyst.email}`);
  return updated;
};

/**
 * Transition an alert to a new status.
 *
 * Side effects by target status:
 *   confirmed_fraud  → freeze source account, create investigation if not exists
 *   false_positive   → log resolution, no account action
 *   resolved / closed → stamp resolved_at
 */
export const transitionAlertService = async (id, newStatus, meta = {}) => {
  const alert = await findAlertById(id);
  if (!alert) throw mkErr('ALERT_NOT_FOUND', 404);

  const allowed = ALERT_TRANSITIONS[alert.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw mkErr(
      `INVALID_TRANSITION: ${alert.status} → ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`,
      422
    );
  }

  const now = new Date().toISOString();
  const updates = {
    status        : newStatus,
    resolvedAt    : ['confirmed_fraud','false_positive'].includes(newStatus) ? now : undefined,
    firstReviewedAt:
      !alert.first_reviewed_at && newStatus !== 'open' ? now : undefined,
  };

  const updated = await dbUpdateAlertStatus(id, updates);

  // ── Confirmed fraud: freeze source account ────────────────────────────────
  if (newStatus === 'confirmed_fraud') {
    const frozenAcct = await freezeAccountByTransactionId(alert.transaction_id)
      .catch(e => { logger.warn(`[inv] account freeze failed: ${e.message}`); return null; });

    if (frozenAcct) {
      logger.info(`[inv] Account ${frozenAcct.account_number} frozen — confirmed fraud`);
      await insertAuditLog({
        userId: meta.actorId, action: 'ACCOUNT_FROZEN_FRAUD',
        entityType: 'account', entityId: frozenAcct.id,
        newValue: { reason: `Fraud alert ${id} confirmed` },
        ipAddress: meta.ipAddress, status: 'success',
      });

      // Notify account holder
      const holder = await getUserByAlertId(id).catch(() => null);
      if (holder) {
        await insertNotification({
          userId        : holder.id,
          title         : 'Your Account Has Been Frozen',
          body          : 'Your account has been frozen due to confirmed fraudulent activity. Contact support immediately.',
          channel       : 'in_app',
          relatedEntity : 'fraud_alert',
          relatedId     : id,
        }).catch(() => {});
      }
    }
  }

  await insertAuditLog({
    userId: meta.actorId, action: `ALERT_STATUS_${newStatus.toUpperCase()}`,
    entityType: 'fraud_alert', entityId: id,
    oldValue: { status: alert.status },
    newValue: { status: newStatus },
    ipAddress: meta.ipAddress, userAgent: meta.userAgent, status: 'success',
  });

  logger.info(`[inv] Alert ${id} transitioned: ${alert.status} → ${newStatus}`);
  return updated;
};

// ─────────────────────────────────────────────────────────────────────────────
// INVESTIGATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const listInvestigationsService = async (queryParams = {}) => {
  const limit  = Math.min(parseInt(queryParams.limit,  10) || 50, 200);
  const offset = Math.max(parseInt(queryParams.offset, 10) || 0,  0);
  const page   = Math.floor(offset / limit) + 1;

  const { rows, total } = await dbListInvestigations({
    status    : queryParams.status     || null,
    priority  : queryParams.priority   || null,
    assignedTo: queryParams.assignedTo || null,
    sortDir   : queryParams.sortDir    || 'DESC',
    limit,
    offset,
  });

  return {
    data      : rows,
    pagination: { total, limit, offset, page, pages: Math.ceil(total / limit) },
  };
};

export const getInvestigationService = async (id) => {
  const inv = await findInvestigationById(id);
  if (!inv) throw mkErr('INVESTIGATION_NOT_FOUND', 404);
  return inv;
};

/**
 * Open a formal investigation for an alert.
 * One investigation per alert — returns existing if already open.
 */
export const openInvestigationService = async ({
  alertId, priority = 'medium', assignedTo = null,
}, meta = {}) => {
  const alert = await findAlertById(alertId);
  if (!alert) throw mkErr('ALERT_NOT_FOUND', 404);
  if (alert.status === 'closed') throw mkErr('ALERT_CLOSED', 409);

  // Idempotent — return existing investigation if already opened
  const existing = await findInvestigationByAlertId(alertId);
  if (existing) return existing;

  const caseNumber = generateCaseNumber();
  const inv = await dbCreateInvestigation({
    alertId,
    caseNumber,
    priority,
    openedBy  : meta.actorId,
    assignedTo: assignedTo ?? null,
  });

  // Advance alert to investigating if still open
  if (alert.status === 'open') {
    await dbUpdateAlertStatus(alertId, {
      status: 'investigating',
      firstReviewedAt: new Date().toISOString(),
    });
  }

  await insertAuditLog({
    userId: meta.actorId, action: 'INVESTIGATION_OPENED',
    entityType: 'fraud_investigation', entityId: inv.id,
    newValue: { caseNumber, alertId, priority, assignedTo },
    ipAddress: meta.ipAddress, status: 'success',
  });

  logger.info(`[inv] Investigation opened: case=${caseNumber} alert=${alertId}`);
  return inv;
};

/**
 * Transition an investigation to a new status.
 * Closing as closed_fraud also transitions the parent alert to confirmed_fraud.
 */
export const updateInvestigationService = async (id, fields, meta = {}) => {
  const inv = await findInvestigationById(id);
  if (!inv) throw mkErr('INVESTIGATION_NOT_FOUND', 404);

  const { status: newStatus, priority, assignedTo, outcome, evidenceUrls } = fields;

  if (newStatus) {
    const allowed = INV_TRANSITIONS[inv.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw mkErr(
        `INVALID_TRANSITION: ${inv.status} → ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`,
        422
      );
    }
  }

  const isClosing = newStatus === 'closed_fraud' || newStatus === 'closed_no_fraud';
  const updated   = await dbUpdateInvestigation(id, {
    status    : newStatus,
    priority,
    assignedTo,
    outcome,
    evidenceUrls,
    closedAt  : isClosing ? new Date().toISOString() : undefined,
  });

  // Sync alert status
  if (newStatus === 'closed_fraud') {
    await transitionAlertService(inv.alert_id, 'confirmed_fraud', meta)
      .catch(e => logger.warn(`[inv] alert sync after close_fraud: ${e.message}`));
  } else if (newStatus === 'closed_no_fraud') {
    // Only transition if alert is still in-flight
    const alert = await findAlertById(inv.alert_id);
    if (alert && !['resolved','closed','false_positive'].includes(alert.status)) {
      await transitionAlertService(inv.alert_id, 'false_positive', meta)
        .catch(e => logger.warn(`[inv] alert sync after close_no_fraud: ${e.message}`));
    }
  }

  await insertAuditLog({
    userId: meta.actorId, action: `INVESTIGATION_${(newStatus ?? 'UPDATED').toUpperCase()}`,
    entityType: 'fraud_investigation', entityId: id,
    oldValue: { status: inv.status, priority: inv.priority, assigned_to: inv.assigned_to },
    newValue: fields,
    ipAddress: meta.ipAddress, status: 'success',
  });

  logger.info(`[inv] Investigation ${inv.case_number} updated${newStatus ? ` → ${newStatus}` : ''}`);
  return updated;
};

// ─────────────────────────────────────────────────────────────────────────────
// ANALYST NOTES
// ─────────────────────────────────────────────────────────────────────────────

export const listNotesService = async ({ alertId, investigationId }) => {
  if (!alertId && !investigationId) throw mkErr('ALERT_ID_OR_INVESTIGATION_ID_REQUIRED', 400);
  return dbListNotes({ alertId, investigationId });
};

export const addNoteService = async ({
  alertId = null, investigationId = null,
  noteText, isInternal = true,
}, meta = {}) => {
  if (!alertId && !investigationId) throw mkErr('ALERT_ID_OR_INVESTIGATION_ID_REQUIRED', 400);
  if (!noteText?.trim()) throw mkErr('NOTE_TEXT_REQUIRED', 400);

  // Validate parent exists
  if (alertId) {
    const alert = await findAlertById(alertId);
    if (!alert) throw mkErr('ALERT_NOT_FOUND', 404);
  }
  if (investigationId) {
    const inv = await findInvestigationById(investigationId);
    if (!inv) throw mkErr('INVESTIGATION_NOT_FOUND', 404);
  }

  const note = await dbCreateNote({
    alertId,
    investigationId,
    authorId   : meta.actorId,
    noteText   : noteText.trim(),
    isInternal,
  });

  await insertAuditLog({
    userId: meta.actorId, action: 'ANALYST_NOTE_ADDED',
    entityType: 'analyst_note', entityId: String(note.id),
    newValue: { alertId, investigationId, isInternal },
    ipAddress: meta.ipAddress, status: 'success',
  });

  return note;
};

export const deleteNoteService = async (noteId, meta = {}) => {
  const deleted = await softDeleteNote(noteId);
  if (!deleted) throw mkErr('NOTE_NOT_FOUND', 404);

  await insertAuditLog({
    userId: meta.actorId, action: 'ANALYST_NOTE_DELETED',
    entityType: 'analyst_note', entityId: String(noteId),
    ipAddress: meta.ipAddress, status: 'success',
  });

  return deleted;
};

// ─────────────────────────────────────────────────────────────────────────────
// FREEZE ACCOUNT  (standalone — for manual analyst action outside of auto-freeze)
// ─────────────────────────────────────────────────────────────────────────────

export const freezeAccountForAlertService = async (alertId, meta = {}) => {
  const alert = await findAlertById(alertId);
  if (!alert) throw mkErr('ALERT_NOT_FOUND', 404);

  const frozenAcct = await freezeAccountByTransactionId(alert.transaction_id);
  if (!frozenAcct) {
    throw mkErr('ACCOUNT_ALREADY_FROZEN_OR_NOT_FOUND', 409);
  }

  await insertAuditLog({
    userId: meta.actorId, action: 'ACCOUNT_FROZEN_MANUAL',
    entityType: 'account', entityId: frozenAcct.id,
    newValue: { alertId, reason: 'Manual freeze by analyst' },
    ipAddress: meta.ipAddress, status: 'success',
  });

  logger.info(`[inv] Manual freeze: account ${frozenAcct.account_number} for alert ${alertId}`);
  return frozenAcct;
};
