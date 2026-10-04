/**
 * branchService.js — API calls for the branches module.
 * Mirrors server/src/routes/branchRoutes.js
 *
 *   GET    /branches              list (all authenticated)
 *   GET    /branches/:id          get one
 *   POST   /branches              create (admin+)
 *   PATCH  /branches/:id          update (admin+)
 *   PATCH  /branches/:id/deactivate  (admin+)
 *   DELETE /branches/:id          (super_admin, admin)
 */
import api from './api';

export const branchService = {
  list: (params = {}) =>
    api.get('/branches', { params }).then(r => r.data),

  get: (id) =>
    api.get(`/branches/${id}`).then(r => r.data),

  create: (data) =>
    api.post('/branches', data).then(r => r.data),

  update: (id, data) =>
    api.patch(`/branches/${id}`, data).then(r => r.data),

  deactivate: (id) =>
    api.patch(`/branches/${id}/deactivate`).then(r => r.data),

  delete: (id) =>
    api.delete(`/branches/${id}`).then(r => r.data),
};

export default branchService;
