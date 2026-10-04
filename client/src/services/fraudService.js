/**
 * fraudService.js — API calls for fraud alerts + investigations + notes.
 */
import api from './api';

export const fraudService = {
  // ── Alerts ──────────────────────────────────────────────────────────────────
  listAlerts  : (params = {}) => api.get('/fraud/alerts', { params }).then(r => r.data),
  getAlert    : (id)          => api.get(`/fraud/alerts/${id}`).then(r => r.data),
  assignAlert : (id, analystId) =>
    api.patch(`/fraud/alerts/${id}/assign`, { analystId }).then(r => r.data),
  transitionAlert: (id, status) =>
    api.patch(`/fraud/alerts/${id}/status`, { status }).then(r => r.data),
  freezeAccount: (id) =>
    api.post(`/fraud/alerts/${id}/freeze-account`).then(r => r.data),

  // ── Alert notes ─────────────────────────────────────────────────────────────
  listAlertNotes: (id) =>
    api.get(`/fraud/alerts/${id}/notes`).then(r => r.data),
  addAlertNote  : (id, noteText, isInternal = true) =>
    api.post(`/fraud/alerts/${id}/notes`, { noteText, isInternal }).then(r => r.data),

  // ── Investigations ──────────────────────────────────────────────────────────
  listInvestigations: (params = {}) =>
    api.get('/fraud/investigations', { params }).then(r => r.data),
  getInvestigation  : (id) =>
    api.get(`/fraud/investigations/${id}`).then(r => r.data),
  openInvestigation : (alertId, data) =>
    api.post(`/fraud/alerts/${alertId}/investigation`, data).then(r => r.data),
  updateInvestigation: (id, data) =>
    api.patch(`/fraud/investigations/${id}`, data).then(r => r.data),

  // ── Investigation notes ─────────────────────────────────────────────────────
  listInvestigationNotes: (id) =>
    api.get(`/fraud/investigations/${id}/notes`).then(r => r.data),
  addInvestigationNote  : (id, noteText, isInternal = true) =>
    api.post(`/fraud/investigations/${id}/notes`, { noteText, isInternal }).then(r => r.data),

  // ── Delete note ─────────────────────────────────────────────────────────────
  deleteNote: (noteId) =>
    api.delete(`/fraud/notes/${noteId}`).then(r => r.data),

  // ── ML status ───────────────────────────────────────────────────────────────
  mlStatus: () => api.get('/fraud/ml-status').then(r => r.data),
};

export default fraudService;
