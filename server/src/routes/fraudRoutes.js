/**
 * fraudRoutes.js — Fraud investigation module routes.
 *
 * RBAC matrix (from schema seeds — Section 4):
 *
 *   fraud:read_alerts    → super_admin, admin, compliance_officer,
 *                          fraud_analyst, branch_manager
 *   fraud:manage_alerts  → super_admin, admin, compliance_officer, fraud_analyst
 *   fraud:investigate    → super_admin, admin, compliance_officer, fraud_analyst
 *   fraud:add_notes      → super_admin, admin, compliance_officer, fraud_analyst
 *   fraud:view_ml        → super_admin, admin, compliance_officer, fraud_analyst
 *
 * Route map:
 *
 *   GET    /alerts                          fraud:read_alerts
 *   GET    /alerts/:id                      fraud:read_alerts
 *   PATCH  /alerts/:id/assign               fraud:manage_alerts
 *   PATCH  /alerts/:id/status               fraud:manage_alerts
 *   POST   /alerts/:id/freeze-account       fraud:manage_alerts
 *   GET    /alerts/:id/notes                fraud:read_alerts
 *   POST   /alerts/:id/notes                fraud:add_notes
 *
 *   GET    /investigations                  fraud:read_alerts
 *   GET    /investigations/:id              fraud:read_alerts
 *   POST   /alerts/:alertId/investigation   fraud:investigate
 *   PATCH  /investigations/:id              fraud:investigate
 *   GET    /investigations/:id/notes        fraud:read_alerts
 *   POST   /investigations/:id/notes        fraud:add_notes
 *
 *   DELETE /notes/:noteId                   fraud:add_notes (own notes; admin override)
 *
 *   GET    /ml-status                       fraud:view_ml
 */

import { Router }       from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { checkMlHealth } from '../services/mlClient.js';
import { success }       from '../utils/response.js';
import {
  validate,
  listAlertsValidator,
  alertIdValidator,
  assignAlertValidator,
  transitionAlertValidator,
  addNoteValidator,
  listInvestigationsValidator,
  investigationIdValidator,
  openInvestigationValidator,
  updateInvestigationValidator,
} from '../validators/fraudValidators.js';
import {
  listAlerts,
  getAlert,
  assignAlert,
  updateAlertStatus,
  freezeAccountForAlert,
  listAlertNotes,
  addAlertNote,
  listInvestigations,
  getInvestigation,
  openInvestigation,
  updateInvestigation,
  listInvestigationNotes,
  addInvestigationNote,
  deleteNote,
} from '../controllers/fraudController.js';

const router = Router();
router.use(authenticate);

// ── ML status ─────────────────────────────────────────────────────────────────
router.get('/ml-status', authorize('fraud:view_ml'), async (_req, res) => {
  const status = await checkMlHealth();
  return success(res, status, 'ML Service Health');
});

// ─────────────────────────────────────────────────────────────────────────────
// FRAUD ALERTS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/fraud/alerts — paginated list with filters */
router.get('/alerts',
  authorize('fraud:read_alerts'),
  ...listAlertsValidator, validate,
  listAlerts
);

/** GET /api/fraud/alerts/:id */
router.get('/alerts/:id',
  authorize('fraud:read_alerts'),
  ...alertIdValidator, validate,
  getAlert
);

/** PATCH /api/fraud/alerts/:id/assign — assign analyst, auto-transitions open→investigating */
router.patch('/alerts/:id/assign',
  authorize('fraud:manage_alerts'),
  ...assignAlertValidator, validate,
  assignAlert
);

/**
 * PATCH /api/fraud/alerts/:id/status
 * Body: { status: alert_status }
 * Status machine: open→investigating→escalated→confirmed_fraud|false_positive→resolved→closed
 */
router.patch('/alerts/:id/status',
  authorize('fraud:manage_alerts'),
  ...transitionAlertValidator, validate,
  updateAlertStatus
);

/**
 * POST /api/fraud/alerts/:id/freeze-account
 * Manually freeze the source account linked to a flagged transaction.
 */
router.post('/alerts/:id/freeze-account',
  authorize('fraud:manage_alerts'),
  ...alertIdValidator, validate,
  freezeAccountForAlert
);

/** GET /api/fraud/alerts/:id/notes */
router.get('/alerts/:id/notes',
  authorize('fraud:read_alerts'),
  ...alertIdValidator, validate,
  listAlertNotes
);

/** POST /api/fraud/alerts/:id/notes */
router.post('/alerts/:id/notes',
  authorize('fraud:add_notes'),
  ...alertIdValidator,
  ...addNoteValidator, validate,
  addAlertNote
);

// ─────────────────────────────────────────────────────────────────────────────
// FRAUD INVESTIGATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/fraud/investigations */
router.get('/investigations',
  authorize('fraud:read_alerts'),
  ...listInvestigationsValidator, validate,
  listInvestigations
);

/** GET /api/fraud/investigations/:id */
router.get('/investigations/:id',
  authorize('fraud:read_alerts'),
  ...investigationIdValidator, validate,
  getInvestigation
);

/**
 * POST /api/fraud/alerts/:alertId/investigation
 * Open a formal investigation for an alert (idempotent — returns existing if already open).
 * Body: { priority?, assignedTo? }
 */
router.post('/alerts/:alertId/investigation',
  authorize('fraud:investigate'),
  ...openInvestigationValidator, validate,
  openInvestigation
);

/**
 * PATCH /api/fraud/investigations/:id
 * Body: { status?, priority?, assignedTo?, outcome?, evidenceUrls? }
 * Closing as closed_fraud auto-transitions parent alert to confirmed_fraud + freezes account.
 */
router.patch('/investigations/:id',
  authorize('fraud:investigate'),
  ...updateInvestigationValidator, validate,
  updateInvestigation
);

/** GET /api/fraud/investigations/:id/notes */
router.get('/investigations/:id/notes',
  authorize('fraud:read_alerts'),
  ...investigationIdValidator, validate,
  listInvestigationNotes
);

/** POST /api/fraud/investigations/:id/notes */
router.post('/investigations/:id/notes',
  authorize('fraud:add_notes'),
  ...investigationIdValidator,
  ...addNoteValidator, validate,
  addInvestigationNote
);

// ─────────────────────────────────────────────────────────────────────────────
// NOTES — direct note operations
// ─────────────────────────────────────────────────────────────────────────────

/** DELETE /api/fraud/notes/:noteId — soft-delete a note */
router.delete('/notes/:noteId',
  authorize('fraud:add_notes'),
  deleteNote
);

export default router;
