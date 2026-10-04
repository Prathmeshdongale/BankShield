/**
 * fraudController.js — HTTP handlers for the fraud investigation module.
 *
 * Error code → HTTP status:
 *   ALERT_NOT_FOUND                  404
 *   ANALYST_NOT_FOUND                404
 *   INVESTIGATION_NOT_FOUND          404
 *   NOTE_NOT_FOUND                   404
 *   ALERT_CLOSED                     409
 *   ACCOUNT_ALREADY_FROZEN_OR_NOT_FOUND 409
 *   INVALID_TRANSITION               422
 *   ALERT_ID_OR_INVESTIGATION_ID_REQUIRED 400
 *   NOTE_TEXT_REQUIRED               400
 */

import {
  listAlertsService,
  getAlertService,
  assignAlertService,
  transitionAlertService,
  listInvestigationsService,
  getInvestigationService,
  openInvestigationService,
  updateInvestigationService,
  listNotesService,
  addNoteService,
  deleteNoteService,
  freezeAccountForAlertService,
} from '../services/investigationService.js';
import { success, failure } from '../utils/response.js';
import { logger }           from '../utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
const getMeta = (req) => ({
  actorId  : req.user?.id   ?? null,
  ipAddress: req.ip          ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});

const STATUS_MAP = {
  ALERT_NOT_FOUND                       : 404,
  ANALYST_NOT_FOUND                     : 404,
  INVESTIGATION_NOT_FOUND               : 404,
  NOTE_NOT_FOUND                        : 404,
  ALERT_CLOSED                          : 409,
  ACCOUNT_ALREADY_FROZEN_OR_NOT_FOUND   : 409,
  ALERT_ID_OR_INVESTIGATION_ID_REQUIRED : 400,
  NOTE_TEXT_REQUIRED                    : 400,
};

const USER_MESSAGES = {
  ALERT_NOT_FOUND                       : 'Fraud alert not found.',
  ANALYST_NOT_FOUND                     : 'Analyst user not found.',
  INVESTIGATION_NOT_FOUND               : 'Fraud investigation not found.',
  NOTE_NOT_FOUND                        : 'Analyst note not found.',
  ALERT_CLOSED                          : 'This alert is already closed.',
  ACCOUNT_ALREADY_FROZEN_OR_NOT_FOUND   : 'Account is already frozen or could not be found.',
  ALERT_ID_OR_INVESTIGATION_ID_REQUIRED : 'Either alertId or investigationId is required.',
  NOTE_TEXT_REQUIRED                    : 'Note text cannot be blank.',
};

const handleErr = (err, res) => {
  const code = err.message;
  // INVALID_TRANSITION messages have extra info — keep the full message
  if (code?.startsWith('INVALID_TRANSITION')) {
    return failure(res, code.replace('INVALID_TRANSITION: ', ''), 422);
  }
  const status = err.statusCode ?? STATUS_MAP[code] ?? 500;
  const msg    = USER_MESSAGES[code] ?? 'An unexpected error occurred.';
  if (status >= 500) logger.error(`[FraudController] ${err.stack ?? err.message}`);
  return failure(res, msg, status);
};

// ─────────────────────────────────────────────────────────────────────────────
// ALERTS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/fraud/alerts */
export const listAlerts = async (req, res) => {
  try {
    const result = await listAlertsService(req.query);
    return success(res, result, 'Fraud alerts retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/fraud/alerts/:id */
export const getAlert = async (req, res) => {
  try {
    const alert = await getAlertService(req.params.id);
    return success(res, { alert }, 'Fraud alert retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** PATCH /api/fraud/alerts/:id/assign */
export const assignAlert = async (req, res) => {
  try {
    const { analystId } = req.body;
    const alert = await assignAlertService(req.params.id, analystId, getMeta(req));
    return success(res, { alert }, 'Alert assigned successfully.');
  } catch (err) { return handleErr(err, res); }
};

/** PATCH /api/fraud/alerts/:id/status */
export const updateAlertStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const alert = await transitionAlertService(req.params.id, status, getMeta(req));
    return success(res, { alert }, `Alert status updated to '${status}'.`);
  } catch (err) { return handleErr(err, res); }
};

/** POST /api/fraud/alerts/:id/freeze-account */
export const freezeAccountForAlert = async (req, res) => {
  try {
    const account = await freezeAccountForAlertService(req.params.id, getMeta(req));
    return success(res, { account }, 'Account frozen successfully.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/fraud/alerts/:id/notes */
export const listAlertNotes = async (req, res) => {
  try {
    const notes = await listNotesService({ alertId: req.params.id });
    return success(res, { notes }, 'Notes retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** POST /api/fraud/alerts/:id/notes */
export const addAlertNote = async (req, res) => {
  try {
    const { noteText, isInternal } = req.body;
    const note = await addNoteService(
      { alertId: req.params.id, noteText, isInternal },
      getMeta(req)
    );
    return success(res, { note }, 'Note added.', 201);
  } catch (err) { return handleErr(err, res); }
};

// ─────────────────────────────────────────────────────────────────────────────
// INVESTIGATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/fraud/investigations */
export const listInvestigations = async (req, res) => {
  try {
    const result = await listInvestigationsService(req.query);
    return success(res, result, 'Investigations retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/fraud/investigations/:id */
export const getInvestigation = async (req, res) => {
  try {
    const investigation = await getInvestigationService(req.params.id);
    return success(res, { investigation }, 'Investigation retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** POST /api/fraud/alerts/:alertId/investigation */
export const openInvestigation = async (req, res) => {
  try {
    const { priority, assignedTo } = req.body;
    const investigation = await openInvestigationService(
      { alertId: req.params.alertId, priority, assignedTo },
      getMeta(req)
    );
    return success(res, { investigation }, 'Investigation opened.', 201);
  } catch (err) { return handleErr(err, res); }
};

/** PATCH /api/fraud/investigations/:id */
export const updateInvestigation = async (req, res) => {
  try {
    const { status, priority, assignedTo, outcome, evidenceUrls } = req.body;
    const investigation = await updateInvestigationService(
      req.params.id,
      { status, priority, assignedTo, outcome, evidenceUrls },
      getMeta(req)
    );
    return success(res, { investigation }, 'Investigation updated.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/fraud/investigations/:id/notes */
export const listInvestigationNotes = async (req, res) => {
  try {
    const notes = await listNotesService({ investigationId: req.params.id });
    return success(res, { notes }, 'Notes retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** POST /api/fraud/investigations/:id/notes */
export const addInvestigationNote = async (req, res) => {
  try {
    const { noteText, isInternal } = req.body;
    const note = await addNoteService(
      { investigationId: req.params.id, noteText, isInternal },
      getMeta(req)
    );
    return success(res, { note }, 'Note added.', 201);
  } catch (err) { return handleErr(err, res); }
};

/** DELETE /api/fraud/notes/:noteId */
export const deleteNote = async (req, res) => {
  try {
    const result = await deleteNoteService(req.params.noteId, getMeta(req));
    return success(res, result, 'Note deleted.');
  } catch (err) { return handleErr(err, res); }
};

// Legacy alias kept so fraud engine doesn't break
export const updateAlertStatusLegacy = updateAlertStatus;
export default {
  listAlerts, getAlert, assignAlert, updateAlertStatus,
  freezeAccountForAlert, listAlertNotes, addAlertNote,
  listInvestigations, getInvestigation, openInvestigation, updateInvestigation,
  listInvestigationNotes, addInvestigationNote, deleteNote,
};
