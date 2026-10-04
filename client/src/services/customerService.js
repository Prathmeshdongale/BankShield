/**
 * customerService.js — API calls for the customers + KYC module.
 * Mirrors server/src/routes/customerRoutes.js
 */
import api from './api';

export const customerService = {
  // ── Customers ──────────────────────────────────────────────────────────────
  list: (params = {}) =>
    api.get('/customers', { params }).then(r => r.data),

  get: (id) =>
    api.get(`/customers/${id}`).then(r => r.data),

  create: (data) =>
    api.post('/customers', data).then(r => r.data),

  update: (id, data) =>
    api.patch(`/customers/${id}`, data).then(r => r.data),

  deactivate: (id) =>
    api.patch(`/customers/${id}/deactivate`).then(r => r.data),

  // ── KYC ────────────────────────────────────────────────────────────────────
  listKyc: (customerId) =>
    api.get(`/customers/${customerId}/kyc`).then(r => r.data),

  /**
   * Upload a KYC document.
   * file    — File object from <input type="file">
   * docType — string enum value
   */
  submitKyc: (customerId, file, docType, docNumber = '', expiryDate = '') => {
    const form = new FormData();
    form.append('document',   file);
    form.append('docType',    docType);
    if (docNumber)  form.append('docNumber',  docNumber);
    if (expiryDate) form.append('expiryDate', expiryDate);
    return api.post(`/customers/${customerId}/kyc`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },

  updateKycStatus: (customerId, kycId, status, rejectionReason = '') =>
    api.patch(`/customers/${customerId}/kyc/${kycId}`, {
      status,
      ...(rejectionReason ? { rejectionReason } : {}),
    }).then(r => r.data),
};

export default customerService;
