/**
 * reportController.js — HTTP handlers for reports + download.
 */
import fs from 'fs';
import path from 'path';
import {
  listReportsService,
  getReportService,
  requestReportService,
  deleteReportService,
} from '../services/reportService.js';
import { success, failure } from '../utils/response.js';
import { logger }           from '../utils/logger.js';

const getMeta = (req) => ({
  actorId  : req.user?.id   ?? null,
  ipAddress: req.ip          ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});

const STATUS_MAP = {
  REPORT_NOT_FOUND   : 404,
  UNKNOWN_REPORT_TYPE: 400,
  INVALID_FORMAT     : 400,
  REPORT_NOT_READY   : 409,
  REPORT_FILE_MISSING: 404,
};

const USER_MESSAGES = {
  REPORT_NOT_FOUND   : 'Report not found.',
  UNKNOWN_REPORT_TYPE: 'Unknown report type.',
  INVALID_FORMAT     : 'Format must be pdf, excel, or csv.',
  REPORT_NOT_READY   : 'Report is not ready for download yet.',
  REPORT_FILE_MISSING: 'Report file not found on server.',
};

const handleErr = (err, res) => {
  const code   = err.message;
  const status = err.statusCode ?? STATUS_MAP[code] ?? 500;
  const msg    = USER_MESSAGES[code] ?? 'An unexpected error occurred.';
  if (status >= 500) logger.error(`[ReportController] ${err.stack ?? err.message}`);
  return failure(res, msg, status);
};

/** GET /api/reports */
export const listReports = async (req, res) => {
  try {
    const result = await listReportsService(req.query, req.user.id, req.user.role);
    return success(res, result, 'Reports retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** GET /api/reports/:id */
export const getReport = async (req, res) => {
  try {
    const report = await getReportService(req.params.id);
    return success(res, { report }, 'Report retrieved.');
  } catch (err) { return handleErr(err, res); }
};

/** POST /api/reports */
export const requestReport = async (req, res) => {
  try {
    const { reportType, format, parameters } = req.body;
    const report = await requestReportService(
      { reportType, format, parameters },
      getMeta(req)
    );
    return success(res, { report }, 'Report queued for generation.', 202);
  } catch (err) { return handleErr(err, res); }
};

/**
 * GET /api/reports/:id/download
 * Streams the file directly. Content-Disposition: attachment forces download.
 */
export const downloadReport = async (req, res) => {
  try {
    const report = await getReportService(req.params.id);

    if (report.status !== 'ready') {
      return failure(res, USER_MESSAGES.REPORT_NOT_READY, 409, { status: report.status });
    }
    if (!report.storage_path) {
      return failure(res, USER_MESSAGES.REPORT_FILE_MISSING, 404);
    }

    const filePath = report.storage_path;
    if (!fs.existsSync(filePath)) {
      return failure(res, USER_MESSAGES.REPORT_FILE_MISSING, 404);
    }

    const ext      = path.extname(filePath);
    const safeName = (report.title ?? 'report').replace(/[^a-z0-9_-]/gi, '_') + ext;

    res.setHeader('Content-Type', report.mime_type ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Length', String(report.file_size ?? fs.statSync(filePath).size));

    const stream = fs.createReadStream(filePath);
    stream.on('error', (e) => {
      logger.error(`[report] stream error ${filePath}: ${e.message}`);
      if (!res.headersSent) failure(res, 'File read error.', 500);
    });
    stream.pipe(res);
  } catch (err) { return handleErr(err, res); }
};

/** DELETE /api/reports/:id */
export const deleteReport = async (req, res) => {
  try {
    await deleteReportService(req.params.id, getMeta(req));
    return success(res, null, 'Report deleted.');
  } catch (err) { return handleErr(err, res); }
};

export default { listReports, getReport, requestReport, downloadReport, deleteReport };
