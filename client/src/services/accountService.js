/**
 * accountService.js — API calls for accounts + account types.
 */
import api from './api';

export const accountService = {
  // ── Account types (reference) ──────────────────────────────────────────────
  listTypes: ()    => api.get('/accounts/types').then(r => r.data),

  // ── Accounts ───────────────────────────────────────────────────────────────
  list  : (params = {}) => api.get('/accounts', { params }).then(r => r.data),
  get   : (id)          => api.get(`/accounts/${id}`).then(r => r.data),
  open  : (data)        => api.post('/accounts', data).then(r => r.data),
  update: (id, data)    => api.patch(`/accounts/${id}`, data).then(r => r.data),

  freeze  : (id)  => api.patch(`/accounts/${id}/freeze`).then(r => r.data),
  activate: (id)  => api.patch(`/accounts/${id}/activate`).then(r => r.data),
  close   : (id)  => api.patch(`/accounts/${id}/close`).then(r => r.data),

  getBalance: (id) => api.get(`/accounts/${id}/balance`).then(r => r.data),

  getHistory: (id, params = {}) =>
    api.get(`/accounts/${id}/history`, { params }).then(r => r.data),

  // ── Cards (account-scoped) ──────────────────────────────────────────────────
  listCards: (accountId, params = {}) =>
    api.get(`/accounts/${accountId}/cards`, { params }).then(r => r.data),

  issueCard: (accountId, data) =>
    api.post(`/accounts/${accountId}/cards`, data).then(r => r.data),
};

export default accountService;
