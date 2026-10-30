/**
 * userService.js — API client for User Management.
 */
import api from './api';

export const userService = {
  list: (params = {}) => api.get('/users', { params }).then(r => r.data),
  get: (id) => api.get(`/users/${id}`).then(r => r.data),
  create: (data) => api.post('/users', data).then(r => r.data),
  updateStatus: (id, isActive) => api.patch(`/users/${id}/status`, { isActive }).then(r => r.data),
  updateRole: (id, roleName) => api.patch(`/users/${id}/role`, { roleName }).then(r => r.data),
  delete: (id) => api.delete(`/users/${id}`).then(r => r.data),
};

export default userService;
