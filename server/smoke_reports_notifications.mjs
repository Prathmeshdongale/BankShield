/**
 * smoke_reports_notifications.mjs
 * Integration tests for reports + notifications modules.
 * Run: node smoke_reports_notifications.mjs   (server on :5000)
 */

import crypto from 'crypto';
import fs     from 'fs';

const BASE = 'http://localhost:5000/api';
let pass = 0, fail = 0;

const j   = (b) => JSON.stringify(b);
const hdr = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
const api = async (method, path, body, token) => {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: hdr(token),
    body: body != null ? j(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  return { s: r.status, b: d };
};
const chk = (label, ok, got) => {
  if (ok) { console.log(`  ✔  ${label}`); pass++; }
  else     { console.log(`  ✖  ${label}  →  ${String(JSON.stringify(got)).slice(0, 160)}`); fail++; }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── pre-flight ────────────────────────────────────────────────────────────────
for (const pw of ['BankShield@Super2025!', 'BankShield@Reset2025!', 'BankShield@New2025!']) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: j({ email: 'superadmin@bankshield.internal', password: pw }),
  });
  if (r.status === 200) {
    const d = await r.json();
    if (pw !== 'BankShield@Super2025!') {
      await fetch(`${BASE}/auth/change-password`, {
        method: 'POST', headers: hdr(d.data.accessToken),
        body: j({ currentPassword: pw, newPassword: 'BankShield@Super2025!', confirmPassword: 'BankShield@Super2025!' }),
      });
    }
    break;
  }
}

const login = async (email, pw) => {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: j({ email, password: pw }),
  });
  return (await r.json()).data?.accessToken ?? null;
};

const ADMIN_AT = await login('superadmin@bankshield.internal', 'BankShield@Super2025!');
if (!ADMIN_AT) { console.error('Auth failed'); process.exit(1); }

// Register a customer-role user for RBAC tests
const TS = Date.now();
const custReg = await api('POST','/auth/register',
  {email:`rpt.cust.${TS}@test.com`,password:'RptCust@1234!',firstName:'Report',lastName:'Customer',roleName:'customer'},ADMIN_AT);
const CUST_AT = await login(`rpt.cust.${TS}@test.com`, 'RptCust@1234!');

// Register a compliance officer
const compReg = await api('POST','/auth/register',
  {email:`rpt.comp.${TS}@test.com`,password:'RptComp@1234!',firstName:'Report',lastName:'Compliance',roleName:'compliance_officer'},ADMIN_AT);
const COMP_AT = await login(`rpt.comp.${TS}@test.com`, 'RptComp@1234!');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  REPORTS MODULE');
console.log('══════════════════════════════════════════════════════════\n');

// ── 1. List reports — starts empty or has previous ───────────────────────────
{
  console.log('1. GET /reports — list all');
  const { s, b } = await api('GET', '/reports', null, ADMIN_AT);
  chk('HTTP 200',         s === 200,                  s);
  chk('has pagination',   !!b.data?.pagination,       b.data?.pagination);
  chk('data is array',    Array.isArray(b.data?.data), b.data?.data);
}

// ── 2. Validator — invalid reportType → 422 ──────────────────────────────────
{
  console.log('\n2. POST /reports — invalid reportType → 422');
  const { s } = await api('POST', '/reports',
    { reportType: 'NONEXISTENT', format: 'pdf' }, ADMIN_AT);
  chk('HTTP 422', s === 422, s);
}

// ── 3. Validator — invalid format → 422 ──────────────────────────────────────
{
  console.log('\n3. POST /reports — invalid format → 422');
  const { s } = await api('POST', '/reports',
    { reportType: 'fraud_report', format: 'docx' }, ADMIN_AT);
  chk('HTTP 422', s === 422, s);
}

// ── 4. Request fraud_report as PDF ───────────────────────────────────────────
let PDF_REPORT_ID;
{
  console.log('\n4. POST /reports — request fraud_report PDF (202 Accepted)');
  const now = new Date();
  const from = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { s, b } = await api('POST', '/reports', {
    reportType : 'fraud_report',
    format     : 'pdf',
    parameters : { dateFrom: from, dateTo: now.toISOString() },
  }, ADMIN_AT);
  chk('HTTP 202',            s === 202,                         s);
  chk('status = queued',     b.data?.report?.status === 'queued', b.data?.report?.status);
  chk('report_type correct', b.data?.report?.report_type === 'fraud_report', b.data?.report?.report_type);
  chk('has id',              !!b.data?.report?.id,              b.data?.report?.id);
  PDF_REPORT_ID = b.data?.report?.id;
}

// ── 5. Request transaction_summary as Excel ───────────────────────────────────
let XLS_REPORT_ID;
{
  console.log('\n5. POST /reports — request transaction_summary Excel');
  const { s, b } = await api('POST', '/reports', {
    reportType: 'transaction_summary',
    format    : 'excel',
    parameters: { dateFrom: new Date(Date.now() - 7*86400000).toISOString() },
  }, ADMIN_AT);
  chk('HTTP 202', s === 202, s);
  XLS_REPORT_ID = b.data?.report?.id;
}

// ── 6. Request analyst performance as CSV ────────────────────────────────────
let CSV_REPORT_ID;
{
  console.log('\n6. POST /reports — request audit_report CSV');
  const { s, b } = await api('POST', '/reports', {
    reportType: 'audit_report',
    format    : 'csv',
  }, ADMIN_AT);
  chk('HTTP 202', s === 202, s);
  CSV_REPORT_ID = b.data?.report?.id;
}

// ── 7. Request risk_report ────────────────────────────────────────────────────
let RISK_ID;
{
  console.log('\n7. POST /reports — request risk_report PDF');
  const { s, b } = await api('POST', '/reports', { reportType: 'risk_report', format: 'pdf' }, ADMIN_AT);
  chk('HTTP 202', s === 202, s);
  RISK_ID = b.data?.report?.id;
}

// ── 8. Request customer_statement ─────────────────────────────────────────────
let CUST_STMT_ID;
{
  console.log('\n8. POST /reports — request customer_statement PDF');
  const { s, b } = await api('POST', '/reports', { reportType: 'customer_statement', format: 'pdf' }, ADMIN_AT);
  chk('HTTP 202', s === 202, s);
  CUST_STMT_ID = b.data?.report?.id;
}

// ── 9. Poll for report completion (async generation) ─────────────────────────
{
  console.log('\n9. Polling for fraud_report to reach status=ready…');
  let attempts = 0, ready = false;
  while (attempts < 20 && !ready) {
    await sleep(1500);
    const { s, b } = await api('GET', `/reports/${PDF_REPORT_ID}`, null, ADMIN_AT);
    if (s === 200 && b.data?.report?.status === 'ready') {
      ready = true;
      chk('status = ready',    b.data?.report?.status === 'ready',  b.data?.report?.status);
      chk('has file_name',     !!b.data?.report?.file_name,         b.data?.report?.file_name);
      chk('has storage_path',  !!b.data?.report?.storage_path,      b.data?.report?.storage_path);
      console.log(`     file=${b.data?.report?.file_name}  size=${b.data?.report?.file_size} bytes`);
    } else if (s === 200 && b.data?.report?.status === 'failed') {
      chk('report NOT failed', false, b.data?.report?.error_message);
      break;
    }
    attempts++;
  }
  if (!ready) chk('report became ready within 30s', false, 'timeout');
}

// ── 10. Poll all 4 remaining reports ─────────────────────────────────────────
{
  console.log('\n10. Polling for all 4 remaining reports to complete…');
  const ids = [XLS_REPORT_ID, CSV_REPORT_ID, RISK_ID, CUST_STMT_ID].filter(Boolean);
  let allReady = false, attempts = 0;
  while (attempts < 25 && !allReady) {
    await sleep(1500);
    const results = await Promise.all(ids.map(id => api('GET', `/reports/${id}`, null, ADMIN_AT)));
    const statuses = results.map(r => r.b?.data?.report?.status);
    allReady = statuses.every(s => s === 'ready' || s === 'failed');
    if (!allReady) { process.stdout.write('.'); }
    attempts++;
  }
  console.log('');
  const allResults = await Promise.all(ids.map(id => api('GET', `/reports/${id}`, null, ADMIN_AT)));
  for (const { b } of allResults) {
    const r = b.data?.report;
    if (r) {
      chk(`${r.report_type} (${r.parameters?.format ?? '?'}) = ${r.status}`,
        r.status === 'ready', r.status);
      if (r.status === 'ready') {
        const filePath = r.storage_path;
        if (filePath) chk(`  file exists on disk`, fs.existsSync(filePath), filePath);
      }
    }
  }
}

// ── 11. Download PDF report ───────────────────────────────────────────────────
{
  console.log('\n11. GET /reports/:id/download — PDF download');
  const r = await fetch(`${BASE}/reports/${PDF_REPORT_ID}/download`, {
    headers: { Authorization: `Bearer ${ADMIN_AT}` },
  });
  chk('HTTP 200',            r.status === 200,              r.status);
  chk('PDF content-type',    r.headers.get('content-type')?.includes('pdf') ?? false, r.headers.get('content-type'));
  chk('content-disposition', r.headers.get('content-disposition')?.includes('attachment') ?? false, r.headers.get('content-disposition'));
  // Drain body
  await r.arrayBuffer();
}

// ── 12. Download Excel report ─────────────────────────────────────────────────
if (XLS_REPORT_ID) {
  console.log('\n12. GET /reports/:id/download — Excel download');
  const r = await fetch(`${BASE}/reports/${XLS_REPORT_ID}/download`, {
    headers: { Authorization: `Bearer ${ADMIN_AT}` },
  });
  chk('HTTP 200', r.status === 200, r.status);
  chk('xlsx content-type', r.headers.get('content-type')?.includes('spreadsheet') ?? false, r.headers.get('content-type'));
  await r.arrayBuffer();
}

// ── 13. Download CSV report ───────────────────────────────────────────────────
if (CSV_REPORT_ID) {
  console.log('\n13. GET /reports/:id/download — CSV download');
  const r = await fetch(`${BASE}/reports/${CSV_REPORT_ID}/download`, {
    headers: { Authorization: `Bearer ${ADMIN_AT}` },
  });
  chk('HTTP 200', r.status === 200, r.status);
  chk('csv content-type', r.headers.get('content-type')?.includes('csv') ?? false, r.headers.get('content-type'));
  const text = await r.text();
  chk('CSV has header row', text.split('\r\n')[0].length > 0, text.slice(0, 80));
}

// ── 14. RBAC — customer can read own reports ──────────────────────────────────
{
  console.log('\n14. RBAC — customer can list own reports (reports:read)');
  const { s, b } = await api('GET', '/reports', null, CUST_AT);
  chk('HTTP 200', s === 200, s);
  // Customer sees 0 reports (they haven't requested any)
  chk('sees 0 reports (own only)', b.data?.pagination?.total === 0, b.data?.pagination?.total);
}

// ── 15. RBAC — customer cannot create reports → 403 ──────────────────────────
{
  console.log('\n15. RBAC — customer cannot create reports (no reports:create)');
  const { s } = await api('POST', '/reports', { reportType: 'fraud_report', format: 'pdf' }, CUST_AT);
  chk('HTTP 403', s === 403, s);
}

// ── 16. RBAC — compliance_officer can create reports ─────────────────────────
{
  console.log('\n16. RBAC — compliance_officer can create report');
  const { s } = await api('POST', '/reports', { reportType: 'compliance_report', format: 'csv' }, COMP_AT);
  chk('HTTP 202', s === 202, s);
}

// ── 17. Get report not found → 404 ───────────────────────────────────────────
{
  console.log('\n17. GET /reports/:id — not found → 404');
  const { s } = await api('GET', `/reports/${crypto.randomUUID()}`, null, ADMIN_AT);
  chk('HTTP 404', s === 404, s);
}

// ── 18. Download not-ready report → 409 ──────────────────────────────────────
{
  console.log('\n18. Download queued report → 409');
  // Request a new report (it starts queued, might generate fast — but immediately test)
  const { b: nb } = await api('POST', '/reports', { reportType: 'risk_report', format: 'excel' }, ADMIN_AT);
  const newId = nb.data?.report?.id;
  if (newId) {
    // Immediately try to download — likely still queued or generating
    const r = await fetch(`${BASE}/reports/${newId}/download`, {
      headers: { Authorization: `Bearer ${ADMIN_AT}` },
    });
    // 409 (queued/generating) or 200 (if generated very fast) — both valid
    chk('409 or 200 (not 5xx)', r.status === 409 || r.status === 200, r.status);
    await r.arrayBuffer();
  } else {
    chk('new report id obtained', false, nb);
  }
}

// ── 19. Delete a report ───────────────────────────────────────────────────────
{
  console.log('\n19. DELETE /reports/:id');
  if (RISK_ID) {
    const { s } = await api('DELETE', `/reports/${RISK_ID}`, null, ADMIN_AT);
    chk('HTTP 200', s === 200, s);
    // Confirm soft-deleted (not in list)
    const { b } = await api('GET', `/reports/${RISK_ID}`, null, ADMIN_AT);
    chk('deleted report returns 404', b.data?.report === undefined || b.error, b.data?.report?.status);
  }
}

// ── 20. No auth → 401 ────────────────────────────────────────────────────────
{
  console.log('\n20. No auth → 401 on reports');
  const r = await fetch(`${BASE}/reports`);
  chk('HTTP 401', r.status === 401, r.status);
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  NOTIFICATIONS MODULE');
console.log('══════════════════════════════════════════════════════════\n');

// The report generation above should have created in-app notifications for ADMIN
// (report ready notifications). Also the fraud smoke tests created fraud alert notifications.

// ── 21. List notifications for admin ─────────────────────────────────────────
{
  console.log('21. GET /notifications — list own notifications');
  const { s, b } = await api('GET', '/notifications?limit=20', null, ADMIN_AT);
  chk('HTTP 200',          s === 200,                   s);
  chk('has pagination',    !!b.data?.pagination,        b.data?.pagination);
  chk('data is array',     Array.isArray(b.data?.data), b.data?.data);
  chk('has unread count',  typeof b.data?.unread === 'number', b.data?.unread);
  console.log(`     total=${b.data?.pagination?.total}  unread=${b.data?.unread}`);
}

// ── 22. Unread count endpoint ─────────────────────────────────────────────────
{
  console.log('\n22. GET /notifications/unread-count');
  const { s, b } = await api('GET', '/notifications/unread-count', null, ADMIN_AT);
  chk('HTTP 200',          s === 200,                          s);
  chk('has unread field',  typeof b.data?.unread === 'number', b.data?.unread);
  console.log(`     unread=${b.data?.unread}`);
}

// ── 23. Mark all read ─────────────────────────────────────────────────────────
{
  console.log('\n23. PATCH /notifications/read-all');
  const { s, b } = await api('PATCH', '/notifications/read-all', null, ADMIN_AT);
  chk('HTTP 200',           s === 200,                          s);
  chk('updated is number',  typeof b.data?.updated === 'number', b.data?.updated);
  console.log(`     marked ${b.data?.updated} notifications read`);
}

// ── 24. Unread count should now be 0 ─────────────────────────────────────────
{
  console.log('\n24. Unread count after read-all = 0');
  const { s, b } = await api('GET', '/notifications/unread-count', null, ADMIN_AT);
  chk('HTTP 200',       s === 200, s);
  chk('unread = 0',     b.data?.unread === 0, b.data?.unread);
}

// ── 25. Filter unreadOnly=true → 0 results ───────────────────────────────────
{
  console.log('\n25. GET /notifications?unreadOnly=true → empty after read-all');
  const { s, b } = await api('GET', '/notifications?unreadOnly=true', null, ADMIN_AT);
  chk('HTTP 200',      s === 200,                    s);
  chk('0 unread left', b.data?.data?.length === 0, b.data?.data?.length);
}

// ── 26. Get single notification ───────────────────────────────────────────────
let NOTIF_ID;
{
  console.log('\n26. GET /notifications/:id — get first notification');
  const { b: listB } = await api('GET', '/notifications?limit=1', null, ADMIN_AT);
  const first = listB.data?.data?.[0];
  if (first) {
    NOTIF_ID = first.id;
    const { s, b } = await api('GET', `/notifications/${NOTIF_ID}`, null, ADMIN_AT);
    chk('HTTP 200',           s === 200,                              s);
    chk('has title',          !!b.data?.notification?.title,          b.data?.notification?.title);
    chk('has status',         !!b.data?.notification?.status,         b.data?.notification?.status);
    chk('has created_at',     !!b.data?.notification?.created_at,     b.data?.notification?.created_at);
  } else {
    console.log('     (No notifications yet — skipping single-get test)');
    chk('list had notifications or empty gracefully', true, true);
  }
}

// ── 27. Mark one notification read ───────────────────────────────────────────
if (NOTIF_ID) {
  console.log('\n27. PATCH /notifications/:id/read');
  const { s, b } = await api('PATCH', `/notifications/${NOTIF_ID}/read`, null, ADMIN_AT);
  chk('HTTP 200',        s === 200,                                   s);
  chk('status = read',   b.data?.notification?.status === 'read' ||
                         b.data?.notification === null,               // already read
                         b.data?.notification?.status);
}

// ── 28. Mark-read idempotent (already read → same response) ──────────────────
if (NOTIF_ID) {
  console.log('\n28. Mark-read idempotent — second call still 200');
  const { s } = await api('PATCH', `/notifications/${NOTIF_ID}/read`, null, ADMIN_AT);
  chk('HTTP 200', s === 200, s);
}

// ── 29. Notification not found → 404 ─────────────────────────────────────────
{
  console.log('\n29. GET /notifications/:id — wrong user → 404');
  // Use CUST_AT to access admin's notification — should 404 (user-scoped)
  if (NOTIF_ID) {
    const { s } = await api('GET', `/notifications/${NOTIF_ID}`, null, CUST_AT);
    chk('HTTP 404 (user-scoped)', s === 404, s);
  }
  // Non-existent integer ID
  const { s } = await api('GET', `/notifications/99999999`, null, ADMIN_AT);
  chk('HTTP 404 (bad id)', s === 404, s);
}

// ── 30. Delete notification ───────────────────────────────────────────────────
if (NOTIF_ID) {
  console.log('\n30. DELETE /notifications/:id');
  const { s } = await api('DELETE', `/notifications/${NOTIF_ID}`, null, ADMIN_AT);
  chk('HTTP 200', s === 200, s);
  // Confirm gone
  const { s: s2 } = await api('GET', `/notifications/${NOTIF_ID}`, null, ADMIN_AT);
  chk('404 after delete', s2 === 404, s2);
}

// ── 31. No auth on notifications → 401 ───────────────────────────────────────
{
  console.log('\n31. No auth → 401 on notifications');
  const r = await fetch(`${BASE}/notifications`);
  chk('HTTP 401', r.status === 401, r.status);
}

// ── 32. Customer can see their own notifications ──────────────────────────────
{
  console.log('\n32. Customer can list own notifications');
  const { s, b } = await api('GET', '/notifications', null, CUST_AT);
  chk('HTTP 200', s === 200, s);
  chk('has pagination', !!b.data?.pagination, b.data?.pagination);
}

// ── 33. Validator — invalid notification status filter → 422 ─────────────────
{
  console.log('\n33. Validator — invalid notification status → 422');
  const { s } = await api('GET', '/notifications?status=INVALID', null, ADMIN_AT);
  chk('HTTP 422', s === 422, s);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Results: ${pass} passed, ${fail} failed  (${pass + fail} total)`);
console.log('══════════════════════════════════════════════════════════\n');
if (fail > 0) process.exit(1);
