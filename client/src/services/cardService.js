/**
 * cardService.js — API calls for card-level operations.
 */
import api from './api';

export const cardService = {
  get       : (id)         => api.get(`/cards/${id}`).then(r => r.data),
  block     : (id, reason) => api.patch(`/cards/${id}/block`,  { reason }).then(r => r.data),
  unblock   : (id)         => api.patch(`/cards/${id}/unblock`).then(r => r.data),
  reportLost  : (id)       => api.patch(`/cards/${id}/report-lost`).then(r => r.data),
  reportStolen: (id)       => api.patch(`/cards/${id}/report-stolen`).then(r => r.data),
  replace   : (id)         => api.post(`/cards/${id}/replace`).then(r => r.data),

  // Limits
  listLimits : (id)                    => api.get(`/cards/${id}/limits`).then(r => r.data),
  setLimit   : (id, limitType, data)   => api.put(`/cards/${id}/limits/${limitType}`, data).then(r => r.data),
  deleteLimit: (id, limitType)         => api.delete(`/cards/${id}/limits/${limitType}`).then(r => r.data),
};

export default cardService;
