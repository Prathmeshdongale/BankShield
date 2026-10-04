/**
 * reportService.js — API calls for the reports module.
 * Mirrors server/src/routes/reportRoutes.js
 */
import api from './api';

export const reportService = {
  /** GET /reports — paginated list */
  list: (params = {}) =>
    api.get('/reports', { params }).then(r => r.data),

  /** GET /reports/:id — single report detail */
  get: (id) =>
    api.get(`/reports/${id}`).then(r => r.data),

  /** POST /reports — queue a new report for generation */
  request: (reportType, format, parameters = {}) =>
    api.post('/reports', { reportType, format, parameters }).then(r => r.data),

  /**
   * GET /reports/:id/download — returns a blob URL.
   * Uses a hidden <a> click pattern — caller receives the Axios response
   * and must handle the blob themselves (see ReportService.downloadBlob helper).
   */
  download: (id) =>
    api.get(`/reports/${id}/download`, { responseType: 'blob' }).then(r => r),

  /** DELETE /reports/:id */
  delete: (id) =>
    api.delete(`/reports/${id}`).then(r => r.data),
};

/**
 * Trigger a browser file download from a blob response.
 * @param {import('axios').AxiosResponse} response  axios response with blob data
 * @param {string} filename  suggested filename
 */
export function triggerDownload(response, filename) {
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default reportService;
