/**
 * reportService.js — Report orchestration: request → generate → save → notify.
 *
 * Supported report types (report_type enum):
 *   transaction_summary  — Daily Transaction Report
 *   fraud_report         — Fraud Summary Report
 *   audit_report         — Analyst Performance Report
 *   customer_statement   — Customer Activity Report
 *   risk_report          — Monthly Risk Summary
 *   compliance_report    — alias for audit_report
 *
 * Supported formats: pdf | excel | csv  (default: pdf)
 *
 * Flow:
 *   requestReport()   → inserts row with status='queued', returns immediately
 *   generateReport()  → status=generating → fetch data → render → status=ready
 *                     → inserts file_uploads row → notifies requester
 *
 * RBAC (enforced at route level):
 *   reports:read    → all authenticated roles
 *   reports:create  → super_admin, admin, compliance_officer, fraud_analyst
 *   reports:export  → super_admin, admin, compliance_officer, fraud_analyst
 */

import path          from 'path';
import crypto        from 'crypto';
import { fileURLToPath } from 'url';
import { logger }    from '../utils/logger.js';
import { insertAuditLog }  from '../db/queries/authQueries.js';
import { insertNotification } from '../db/queries/fraudQueries.js';
import { findUserById }    from '../db/queries/investigationQueries.js';
import {
  createReport,
  updateReportStatus,
  findReportById,
  listReports          as dbListReports,
  softDeleteReport,
  insertFileUploadForReport,
  getDailyTransactionSummary,
  getFraudSummary,
  getAnalystPerformance,
  getCustomerActivity,
  getMonthlyRiskSummary,
  getSystemAuditTrail,
} from '../db/queries/reportQueries.js';
import { renderPDF, renderExcel, renderCSV } from './reportRenderService.js';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR  = path.resolve(__dirname, '../../uploads/reports');

const mkErr = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN SCHEMAS — defines headers and DB keys for each report type
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNS = {
  transaction_summary: [
    { header: 'Day',         key: 'day',          width: 2  },
    { header: 'Type',        key: 'txn_type',      width: 1.5},
    { header: 'Channel',     key: 'channel',       width: 1.5},
    { header: 'Status',      key: 'status',        width: 1.5},
    { header: 'Count',       key: 'txn_count',     width: 1  },
    { header: 'Total (₹)',   key: 'total_amount',  width: 2  },
    { header: 'Avg (₹)',     key: 'avg_amount',    width: 2  },
    { header: 'Max (₹)',     key: 'max_amount',    width: 2  },
    { header: 'Fraud Count', key: 'fraud_count',   width: 1  },
  ],
  fraud_report: [
    { header: 'Day',                key: 'day',                  width: 2 },
    { header: 'Severity',           key: 'severity',             width: 1.5},
    { header: 'Status',             key: 'status',               width: 1.5},
    { header: 'Alert Count',        key: 'alert_count',          width: 1 },
    { header: 'Avg Risk Score',     key: 'avg_risk_score',       width: 1.5},
    { header: 'Amount at Risk (₹)', key: 'total_amount_at_risk', width: 2 },
    { header: 'Confirmed',          key: 'confirmed_count',      width: 1 },
    { header: 'False Positive',     key: 'false_positive_count', width: 1 },
  ],
  audit_report: [
    { header: 'Timestamp',          key: 'created_at',   width: 2.5 },
    { header: 'Action',             key: 'action',       width: 2   },
    { header: 'Actor Email',        key: 'actor_email',  width: 2.5 },
    { header: 'Role',               key: 'actor_role',   width: 1.5 },
    { header: 'Entity Type',        key: 'entity_type',  width: 1.5 },
    { header: 'IP Address',         key: 'ip_address',   width: 1.5 },
    { header: 'Status',             key: 'status',       width: 1   },
  ],
  compliance_report: [
    { header: 'Analyst',            key: 'analyst_name',          width: 2 },
    { header: 'Email',              key: 'analyst_email',         width: 2.5},
    { header: 'Investigations',     key: 'investigations_total',  width: 1.5},
    { header: 'Closed',            key: 'investigations_closed', width: 1 },
    { header: 'Notes Added',        key: 'notes_added',          width: 1 },
    { header: 'Alerts Assigned',    key: 'alerts_assigned',      width: 1.5},
    { header: 'Confirmed Fraud',    key: 'confirmed_fraud',      width: 1.5},
    { header: 'False Positive',     key: 'false_positive',       width: 1 },
    { header: 'Avg Resolution (h)', key: 'avg_resolution_hours', width: 2 },
  ],
  customer_statement: [
    { header: 'Customer #',     key: 'customer_number',  width: 1.5},
    { header: 'Name',           key: 'customer_name',    width: 2  },
    { header: 'Email',          key: 'email',            width: 2.5},
    { header: 'Risk Rating',    key: 'risk_rating',      width: 1.5},
    { header: 'Txn Count',      key: 'txn_count',        width: 1  },
    { header: 'Total Volume',   key: 'total_amount',     width: 2  },
    { header: 'Largest Txn',    key: 'largest_txn',      width: 2  },
    { header: 'Fraud Count',    key: 'fraud_count',      width: 1  },
    { header: 'Countries',      key: 'countries_used',   width: 1  },
    { header: 'Max Risk Score', key: 'max_risk_score',   width: 1.5},
  ],
  risk_report: [
    { header: 'Month',              key: 'month',                   width: 1.5},
    { header: 'Total Txns',         key: 'total_transactions',      width: 1.5},
    { header: 'Volume (₹)',         key: 'total_volume',            width: 2  },
    { header: 'Fraud Txns',         key: 'fraud_transactions',      width: 1  },
    { header: 'Flagged',           key: 'flagged_transactions',    width: 1  },
    { header: 'Blocked',           key: 'blocked_transactions',    width: 1  },
    { header: 'Avg Risk Score',     key: 'avg_risk_score',          width: 1.5},
    { header: 'Total Alerts',       key: 'total_alerts',            width: 1  },
    { header: 'Critical Alerts',    key: 'critical_alerts',         width: 1.5},
    { header: 'Investigations',     key: 'investigations_opened',   width: 1.5},
    { header: 'Confirmed Fraud',    key: 'confirmed_fraud_cases',   width: 1.5},
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// DATA FETCHER — maps report type to query
// ─────────────────────────────────────────────────────────────────────────────

const fetchData = async (reportType, parameters) => {
  const { dateFrom, dateTo, customerId } = parameters ?? {};
  const from = dateFrom ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const to   = dateTo   ?? new Date().toISOString();

  switch (reportType) {
    case 'transaction_summary': return getDailyTransactionSummary({ dateFrom: from, dateTo: to });
    case 'fraud_report':        return getFraudSummary({ dateFrom: from, dateTo: to });
    case 'audit_report':        return getSystemAuditTrail({ dateFrom: from, dateTo: to });
    case 'compliance_report':   return getAnalystPerformance({ dateFrom: from, dateTo: to });
    case 'customer_statement':  return getCustomerActivity({ dateFrom: from, dateTo: to, customerId });
    case 'risk_report':         return getMonthlyRiskSummary({ dateFrom: from, dateTo: to });
    default:                    throw mkErr('UNKNOWN_REPORT_TYPE', 400);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY BUILDER — key metrics shown at top of PDF / Excel summary sheet
// ─────────────────────────────────────────────────────────────────────────────

const buildSummary = (reportType, rows) => {
  if (!rows.length) return { 'Total Rows': 0 };
  switch (reportType) {
    case 'transaction_summary': {
      const total = rows.reduce((s, r) => s + Number(r.txn_count ?? 0), 0);
      const vol   = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
      const fraud = rows.reduce((s, r) => s + Number(r.fraud_count ?? 0), 0);
      return { 'Total Transactions': total, 'Total Volume (₹)': vol.toFixed(2), 'Fraud Transactions': fraud };
    }
    case 'fraud_report': {
      const alerts = rows.reduce((s, r) => s + Number(r.alert_count ?? 0), 0);
      const conf   = rows.reduce((s, r) => s + Number(r.confirmed_count ?? 0), 0);
      const fp     = rows.reduce((s, r) => s + Number(r.false_positive_count ?? 0), 0);
      return { 'Total Alerts': alerts, 'Confirmed Fraud': conf, 'False Positives': fp };
    }
    case 'audit_report': {
      const total = rows.length;
      const successes = rows.filter(r => r.status === 'success').length;
      const uniqueActors = new Set(rows.map(r => r.actor_email)).size;
      return { 'Total Audit Events': total, 'Successful Operations': successes, 'Active Users': uniqueActors };
    }
    case 'compliance_report': {
      const analysts = rows.length;
      const closed   = rows.reduce((s, r) => s + Number(r.investigations_closed ?? 0), 0);
      return { 'Analysts': analysts, 'Total Closed Investigations': closed };
    }
    case 'customer_statement': {
      const customers = rows.length;
      const vol = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
      return { 'Customers': customers, 'Total Volume (₹)': vol.toFixed(2) };
    }
    case 'risk_report': {
      const vol  = rows.reduce((s, r) => s + Number(r.total_volume ?? 0), 0);
      const inv  = rows.reduce((s, r) => s + Number(r.investigations_opened ?? 0), 0);
      return { 'Total Volume (₹)': vol.toFixed(2), 'Total Investigations': inv };
    }
    default: return { 'Total Rows': rows.length };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export const listReportsService = async (queryParams, userId, userRole) => {
  const limit  = Math.min(parseInt(queryParams.limit,  10) || 20, 100);
  const offset = Math.max(parseInt(queryParams.offset, 10) || 0,  0);
  const page   = Math.floor(offset / limit) + 1;

  // Non-admin users only see their own reports
  const adminRoles  = new Set(['super_admin','admin','compliance_officer']);
  const requestedBy = adminRoles.has(userRole) && queryParams.requestedBy
    ? queryParams.requestedBy
    : adminRoles.has(userRole) ? null : userId;

  const { rows, total } = await dbListReports({
    reportType : queryParams.reportType  || null,
    status     : queryParams.status      || null,
    requestedBy,
    dateFrom   : queryParams.dateFrom    || null,
    dateTo     : queryParams.dateTo      || null,
    limit,
    offset,
  });
  return { data: rows, pagination: { total, limit, offset, page, pages: Math.ceil(total / limit) } };
};

export const getReportService = async (id) => {
  const report = await findReportById(id);
  if (!report) throw mkErr('REPORT_NOT_FOUND', 404);
  return report;
};

/**
 * Request a new report — inserts row with status='queued', then kicks off async generation.
 */
export const requestReportService = async ({
  reportType, format = 'pdf', parameters = null,
}, meta = {}) => {
  // Validate report type
  const VALID_TYPES = ['transaction_summary','fraud_report','audit_report',
                       'compliance_report','customer_statement','risk_report'];
  if (!VALID_TYPES.includes(reportType)) throw mkErr('UNKNOWN_REPORT_TYPE', 400);

  const VALID_FORMATS = ['pdf','excel','csv'];
  if (!VALID_FORMATS.includes(format)) throw mkErr('INVALID_FORMAT', 400);

  const titles = {
    transaction_summary : 'Daily Transaction Report',
    fraud_report        : 'Fraud Summary Report',
    audit_report        : 'Analyst Performance Report',
    compliance_report   : 'Compliance Report',
    customer_statement  : 'Customer Activity Report',
    risk_report         : 'Monthly Risk Summary',
  };

  const report = await createReport({
    reportType,
    title      : titles[reportType],
    requestedBy: meta.actorId,
    parameters : { ...parameters, format },
  });

  await insertAuditLog({
    userId: meta.actorId, action: 'REPORT_REQUESTED',
    entityType: 'report', entityId: report.id,
    newValue: { reportType, format }, ipAddress: meta.ipAddress, status: 'success',
  });

  logger.info(`[report] Queued: ${report.id} (${reportType} / ${format})`);

  // Fire-and-forget async generation
  generateReport(report.id, meta).catch(
    (e) => logger.error(`[report] Generation failed for ${report.id}: ${e.message}`)
  );

  return report;
};

/**
 * Generate the report file, save it, update status to ready.
 * Called asynchronously from requestReportService.
 */
export const generateReport = async (reportId, meta = {}) => {
  const report = await findReportById(reportId);
  if (!report) throw new Error(`Report ${reportId} not found`);

  const format     = report.parameters?.format ?? 'pdf';
  const parameters = report.parameters ?? {};

  // Mark generating
  await updateReportStatus(reportId, { status: 'generating', startedAt: new Date().toISOString() });

  let fileSize, filePath, storedName, mimeType, ext;

  try {
    // Fetch data
    const rows    = await fetchData(report.report_type, parameters);
    const columns = COLUMNS[report.report_type] ?? [];
    const summary = buildSummary(report.report_type, rows);
    const subtitle = parameters.dateFrom
      ? `Period: ${parameters.dateFrom?.slice(0,10)} → ${parameters.dateTo?.slice(0,10) ?? 'now'}`
      : `Generated: ${new Date().toISOString().slice(0,10)}`;

    // Generate unique filename
    storedName = `${report.id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    if (format === 'pdf') {
      ext = '.pdf'; mimeType = 'application/pdf';
      filePath  = path.join(REPORTS_DIR, storedName + ext);
      fileSize  = await renderPDF({ title: report.title, subtitle, columns, rows, filePath, summary });
    } else if (format === 'excel') {
      ext = '.xlsx'; mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filePath  = path.join(REPORTS_DIR, storedName + ext);
      fileSize  = await renderExcel({ title: report.title, subtitle, columns, rows, filePath, summary });
    } else {
      ext = '.csv'; mimeType = 'text/csv';
      filePath  = path.join(REPORTS_DIR, storedName + ext);
      fileSize  = await renderCSV({ columns, rows, filePath });
    }

    // Save file_uploads row
    const fu = await insertFileUploadForReport({
      uploaderId  : meta.actorId ?? report.requested_by,
      originalName: report.title.replace(/[^a-z0-9]/gi, '_') + ext,
      storedName  : storedName + ext,
      mimeType,
      fileSize,
      storagePath : filePath,
      reportId,
    });

    // Update report to ready
    await updateReportStatus(reportId, {
      status       : 'ready',
      fileUploadId : fu.id,
      completedAt  : new Date().toISOString(),
    });

    // In-app notification to requester
    await insertNotification({
      userId        : report.requested_by,
      title         : `Report Ready — ${report.title}`,
      body          : `Your ${report.report_type.replace(/_/g,' ')} report is ready to download (${rows.length} rows, ${(fileSize/1024).toFixed(1)} KB).`,
      channel       : 'in_app',
      relatedEntity : 'report',
      relatedId     : reportId,
      metadata      : { format, rowCount: rows.length, fileSize },
    }).catch(e => logger.warn(`[report] notification failed: ${e.message}`));

    logger.info(`[report] Ready: ${reportId} (${rows.length} rows, ${format}, ${(fileSize/1024).toFixed(1)} KB)`);
    return await findReportById(reportId);

  } catch (err) {
    await updateReportStatus(reportId, {
      status       : 'failed',
      errorMessage : err.message,
      completedAt  : new Date().toISOString(),
    });
    logger.error(`[report] Failed ${reportId}: ${err.message}`);
    throw err;
  }
};

export const deleteReportService = async (id, meta = {}) => {
  const report = await findReportById(id);
  if (!report) throw mkErr('REPORT_NOT_FOUND', 404);
  const deleted = await softDeleteReport(id);
  await insertAuditLog({
    userId: meta.actorId, action: 'REPORT_DELETED',
    entityType: 'report', entityId: id,
    ipAddress: meta.ipAddress, status: 'success',
  });
  return deleted;
};
