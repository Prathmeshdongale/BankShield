/**
 * authService.js — Auth API calls.
 * All business logic lives in AuthContext; this file is pure HTTP.
 */

import api from './api';

export const authService = {
  login: (credentials) =>
    api.post('/auth/login', credentials).then(r => r.data),

  logout: (refreshToken, logoutAll = false) =>
    api.post('/auth/logout', { refreshToken, logoutAll }).then(r => r.data),

  refresh: (refreshToken) =>
    api.post('/auth/refresh', { refreshToken }).then(r => r.data),

  forgotPassword: (email) =>
    api.post('/auth/forgot-password', { email }).then(r => r.data),

  resetPassword: (token, newPassword, confirmPassword) =>
    api.post('/auth/reset-password', { token, newPassword, confirmPassword }).then(r => r.data),

  changePassword: (currentPassword, newPassword, confirmPassword) =>
    api.post('/auth/change-password', { currentPassword, newPassword, confirmPassword }).then(r => r.data),

  getProfile: () =>
    api.get('/auth/me').then(r => r.data),

  updateProfile: (fields) =>
    api.patch('/auth/me', fields).then(r => r.data),
};

export default authService;
