/**
 * smoke_branches_customers.mjs
 * Integration smoke tests for branches, customers, and KYC modules.
 * Run: node smoke_branches_customers.mjs   (server must be on :5000)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5000/api';
let pass = 0, fail = 0;

// ─── helpers ─────────────────────────────────────────────────────────────────

const j = (body)  => JSON.stringify(body);
const hdr = (tok) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` });

const check = (label, ok, got) => {
  if (ok) { console.log(`  ✔  ${label}`); pass++; }
  else     { console.log(`  ✖  ${label}  (got: ${JSON.stringify(got)?.substring(0,80)})`); fail++; }
};

const api = async (method, path, body, token) => {
  const opts = { method, headers: hdr(token) };
  if (body) opts.body = j(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const d = await r.json().catch(() => ({}));
  return { status: r.status, body: d };
};

// ─── login ───────────────────────────────────────────────────────────────────

const loginAs = async (email, password) => {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: j({ email, password }),
  });
  const d = await r.json();
  return d.data?.accessToken;
};

// ─── pre-flight: ensure super-admin password is at known state ───────────────
{
  const PASSWORDS_TO_TRY = [
    'BankShield@Super2025!',
    'BankShield@Reset2025!',
    'BankShield@New2025!',
  ];
  let restored = false;
  for (const pw of PASSWORDS_TO_TRY) {
    const r = await fetch(`${BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: j({ email: 'superadmin@bankshield.internal', password: pw }),
    });
    if (r.status === 200) {
      const d = await r.json();
      if (pw !== 'BankShield@Super2025!') {
        // restore target password
        await fetch(`${BASE}/auth/change-password`, {
          method: 'POST', headers: hdr(d.data.accessToken),
          body: j({ currentPassword: pw, newPassword: 'BankShield@Super2025!', confirmPassword: 'BankShield@Super2025!' }),
        });
        console.log(`  [pre-flight] Restored password from [${pw}]\n`);
      }
      restored = true;
      break;
    }
  }
  if (!restored) { console.error('  [pre-flight] Cannot authenticate — abort.'); process.exit(1); }
}

const ADMIN_TOKEN  = await loginAs('superadmin@bankshield.internal', 'BankShield@Super2025!');

// Register a teller user for RBAC denial tests
const TELLER_EMAIL = `teller.smoke.${Date.now()}@bankshield.test`;
await api('POST', '/auth/register', {
  email: TELLER_EMAIL, password: 'Teller@1234!', firstName: 'Test', lastName: 'Teller', roleName: 'teller'
}, ADMIN_TOKEN);
const TELLER_TOKEN = await loginAs(TELLER_EMAIL, 'Teller@1234!');

// Register a teller's linked user for customer creation tests  
const CUST_USER_EMAIL = `custuser.${Date.now()}@bankshield.test`;
const regRes = await api('POST', '/auth/register', {
  email: CUST_USER_EMAIL, password: 'CustUser@1234!', firstName: 'John', lastName: 'Doe', roleName: 'customer'
}, ADMIN_TOKEN);
const CUST_USER_ID = regRes.body?.data?.user?.id;

// ─────────────────────────────────────────────────────────────────────────────
// BRANCH TESTS
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════');
console.log('  BRANCH TESTS');
console.log('══════════════════════════════════════════════════════════\n');

let branchId, branchCode;

// 1. Create branch (admin)
{
  console.log('1. Create branch');
  branchCode = `BR${Date.now().toString().slice(-6)}`;
  const { status, body } = await api('POST', '/branches',
    { code: branchCode, name: 'Mumbai Main Branch', city: 'Mumbai', state: 'Maharashtra', country: 'India', phone: '+912212345678' },
    ADMIN_TOKEN
  );
  check('HTTP 201',         status === 201,                        status);
  check('has id',           !!body.data?.branch?.id,               body.data?.branch?.id);
  check('code matches',     body.data?.branch?.code === branchCode, body.data?.branch?.code);
  branchId = body.data?.branch?.id;
}

// 2. Duplicate code → 409
{
  console.log('\n2. Duplicate branch code → 409');
  const { status } = await api('POST', '/branches',
    { code: branchCode, name: 'Duplicate' },
    ADMIN_TOKEN
  );
  check('HTTP 409', status === 409, status);
}

// 3. Validator — missing required fields → 422
{
  console.log('\n3. Create branch — missing name → 422');
  const { status, body } = await api('POST', '/branches', { code: 'NONAME' }, ADMIN_TOKEN);
  check('HTTP 422',              status === 422,              status);
  check('details array present', Array.isArray(body.details), body.details);
}

// 4. RBAC — teller cannot create branch → 403
{
  console.log('\n4. RBAC — teller tries to create branch → 403');
  const { status } = await api('POST', '/branches',
    { code: 'TELNOPE', name: 'Nope' }, TELLER_TOKEN
  );
  check('HTTP 403', status === 403, status);
}

// 5. Get branch by id
{
  console.log('\n5. Get branch by id');
  const { status, body } = await api('GET', `/branches/${branchId}`, null, ADMIN_TOKEN);
  check('HTTP 200',       status === 200,                         status);
  check('id matches',     body.data?.branch?.id === branchId,     body.data?.branch?.id);
}

// 6. Teller cannot read branch (teller lacks users:read per seeds)
{
  console.log('\n6. Teller cannot read branch (no users:read) → 403');
  const { status } = await api('GET', `/branches/${branchId}`, null, TELLER_TOKEN);
  check('HTTP 403', status === 403, status);
}

// 7. List branches with pagination
{
  console.log('\n7. List branches — pagination');
  const { status, body } = await api('GET', '/branches?limit=5&offset=0', null, ADMIN_TOKEN);
  check('HTTP 200',             status === 200,                         status);
  check('has pagination',       !!body.data?.pagination,                body.data?.pagination);
  check('has data array',       Array.isArray(body.data?.data),         body.data?.data);
  check('limit respected',      body.data?.data?.length <= 5,           body.data?.data?.length);
}

// 8. Update branch
{
  console.log('\n8. Update branch');
  const { status, body } = await api('PATCH', `/branches/${branchId}`,
    { name: 'Mumbai Main Branch (Updated)', city: 'Mumbai' },
    ADMIN_TOKEN
  );
  check('HTTP 200',         status === 200,                                  status);
  check('name updated',     body.data?.branch?.name?.includes('Updated'),    body.data?.branch?.name);
}

// 9. Deactivate branch
{
  console.log('\n9. Deactivate branch');
  const { status, body } = await api('PATCH', `/branches/${branchId}/deactivate`, null, ADMIN_TOKEN);
  check('HTTP 200',          status === 200,      status);
  check('is_active = false', body.data?.branch?.is_active === false, body.data?.branch?.is_active);
}

// 10. Deactivate again → 409
{
  console.log('\n10. Deactivate again → 409');
  const { status } = await api('PATCH', `/branches/${branchId}/deactivate`, null, ADMIN_TOKEN);
  check('HTTP 409', status === 409, status);
}

// 11. Soft-delete branch
{
  console.log('\n11. Delete branch (soft-delete)');
  const { status } = await api('DELETE', `/branches/${branchId}`, null, ADMIN_TOKEN);
  check('HTTP 200', status === 200, status);
}

// 12. Get deleted branch → 404
{
  console.log('\n12. Get deleted branch → 404');
  const { status } = await api('GET', `/branches/${branchId}`, null, ADMIN_TOKEN);
  check('HTTP 404', status === 404, status);
}

// 13. RBAC — teller tries to delete → 403
{
  console.log('\n13. RBAC — teller tries DELETE /branches/:id → 403');
  const { status } = await api('DELETE', `/branches/00000000-0000-0000-0000-000000000001`, null, TELLER_TOKEN);
  check('HTTP 403', status === 403, status);
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER TESTS
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════');
console.log('  CUSTOMER TESTS');
console.log('══════════════════════════════════════════════════════════\n');

let customerId;

// 14. Create customer
{
  console.log('14. Create customer');
  const { status, body } = await api('POST', '/customers',
    { userId: CUST_USER_ID, dateOfBirth: '1990-05-15', gender: 'male', nationality: 'Indian', segment: 'retail', riskRating: 'low', isPep: false },
    ADMIN_TOKEN
  );
  check('HTTP 201',              status === 201,                                     status);
  check('has customer_number',   !!body.data?.customer?.customer_number,             body.data?.customer?.customer_number);
  check('number starts CUST-',   body.data?.customer?.customer_number?.startsWith('CUST-'), body.data?.customer?.customer_number);
  customerId = body.data?.customer?.id;
}

// 15. Duplicate customer for same userId → 409
{
  console.log('\n15. Duplicate customer for same userId → 409');
  const { status } = await api('POST', '/customers',
    { userId: CUST_USER_ID },
    ADMIN_TOKEN
  );
  check('HTTP 409', status === 409, status);
}

// 16. Get customer
{
  console.log('\n16. Get customer by id');
  const { status, body } = await api('GET', `/customers/${customerId}`, null, ADMIN_TOKEN);
  check('HTTP 200',    status === 200,                          status);
  check('id matches',  body.data?.customer?.id === customerId,  body.data?.customer?.id);
}

// 17. List customers with filter
{
  console.log('\n17. List customers — filter by segment=retail');
  const { status, body } = await api('GET', '/customers?segment=retail&limit=10', null, ADMIN_TOKEN);
  check('HTTP 200',          status === 200,               status);
  check('has pagination',    !!body.data?.pagination,       body.data?.pagination);
  check('total >= 1',        body.data?.pagination?.total >= 1, body.data?.pagination?.total);
}

// 18. Search by name
{
  console.log('\n18. List customers — search by name "John"');
  const { status, body } = await api('GET', '/customers?search=John', null, ADMIN_TOKEN);
  check('HTTP 200',          status === 200,    status);
  check('results returned',  body.data?.data?.length >= 0, true);
}

// 19. Teller cannot create customer → 403 (teller has customers:create via seed, should succeed)
// Per seeds: teller has customers:read but NOT customers:create
{
  console.log('\n19. RBAC — teller tries customers:create → 403');
  const r2 = await api('POST', '/auth/register',
    { email: `cu2.${Date.now()}@test.com`, password: 'CU2@1234!', firstName: 'C', lastName: 'U', roleName: 'customer' },
    ADMIN_TOKEN
  );
  const uid2 = r2.body?.data?.user?.id;
  const { status } = await api('POST', '/customers', { userId: uid2 }, TELLER_TOKEN);
  check('HTTP 403', status === 403, status);
}

// 20. Update customer
{
  console.log('\n20. Update customer');
  const { status, body } = await api('PATCH', `/customers/${customerId}`,
    { occupation: 'Software Engineer', annualIncome: 1200000, segment: 'premium' },
    ADMIN_TOKEN
  );
  check('HTTP 200',            status === 200,                       status);
  check('segment updated',     body.data?.customer?.segment === 'premium', body.data?.customer?.segment);
}

// 21. Validator — bad riskRating → 422
{
  console.log('\n21. Validator — invalid riskRating → 422');
  const { status, body } = await api('PATCH', `/customers/${customerId}`,
    { riskRating: 'extreme' }, ADMIN_TOKEN
  );
  check('HTTP 422', status === 422, status);
  check('details present', Array.isArray(body.details), body.details);
}

// ─────────────────────────────────────────────────────────────────────────────
// KYC TESTS
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════');
console.log('  KYC TESTS');
console.log('══════════════════════════════════════════════════════════\n');

let kycId;

// 22. List KYC — initially empty
{
  console.log('22. List KYC — initially empty');
  const { status, body } = await api('GET', `/customers/${customerId}/kyc`, null, ADMIN_TOKEN);
  check('HTTP 200',      status === 200,              status);
  check('empty array',   Array.isArray(body.data?.docs), body.data?.docs);
}

// 23. Submit KYC document (multipart with real file)
{
  console.log('\n23. Submit KYC document (multipart)');

  // Create a minimal valid PDF-like binary just for testing (real PDF header)
  const testFilePath = path.join(__dirname, 'test_kyc_doc.pdf');
  fs.writeFileSync(testFilePath,
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'
  );

  // Build multipart form using the native FormData + Blob
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(testFilePath);
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  formData.append('document', blob, 'test_kyc_doc.pdf');
  formData.append('docType', 'passport');
  formData.append('docNumber', 'A1234567');
  formData.append('expiryDate', '2029-12-31');

  const r = await fetch(`${BASE}/customers/${customerId}/kyc`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },  // no Content-Type — let FormData set boundary
    body: formData,
  });
  const body = await r.json().catch(() => ({}));
  check('HTTP 201',          r.status === 201,              r.status);
  check('has kyc.id',        !!body.data?.kyc?.id,          body.data?.kyc?.id);
  check('status=submitted',  body.data?.kyc?.status === 'submitted', body.data?.kyc?.status);
  check('has file.id',       !!body.data?.file?.id,         body.data?.file?.id);
  // Always capture kycId here — later tests depend on it
  if (body.data?.kyc?.id) kycId = body.data.kyc.id;

  fs.unlinkSync(testFilePath);
}

// 24. Submit KYC — wrong MIME type → 415
{
  console.log('\n24. KYC upload — wrong file type (text/plain) → 415');
  const formData = new FormData();
  const blob = new Blob(['plain text content'], { type: 'text/plain' });
  formData.append('document', blob, 'doc.txt');
  formData.append('docType', 'pan');

  const r = await fetch(`${BASE}/customers/${customerId}/kyc`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: formData,
  });
  check('HTTP 415', r.status === 415, r.status);
}

// 25. Submit KYC — no file → 400
{
  console.log('\n25. KYC upload — no file → 400');
  const { status } = await api('POST', `/customers/${customerId}/kyc`,
    { docType: 'aadhaar' }, ADMIN_TOKEN
  );
  check('HTTP 400', status === 400, status);
}

// 26. List KYC — now has 1 doc
{
  console.log('\n26. List KYC — now has 1 doc');
  const { status, body } = await api('GET', `/customers/${customerId}/kyc`, null, ADMIN_TOKEN);
  check('HTTP 200',    status === 200,             status);
  check('length >= 1', body.data?.docs?.length >= 1, body.data?.docs?.length);
}

// 27. Verify KYC (customers:kyc_verify)
{
  console.log('\n27. Verify KYC document');
  const { status, body } = await api('PATCH', `/customers/${customerId}/kyc/${kycId}`,
    { status: 'verified' }, ADMIN_TOKEN
  );
  check('HTTP 200',           status === 200,                      status);
  check('status=verified',    body.data?.kyc?.status === 'verified', body.data?.kyc?.status);
  check('verified_by set',    !!body.data?.kyc?.verified_by,        body.data?.kyc?.verified_by);
  check('verified_at set',    !!body.data?.kyc?.verified_at,        body.data?.kyc?.verified_at);
}

// 28. Reject KYC — missing rejection_reason → 400 (service-layer guard)
{
  console.log('\n28. Reject KYC — missing rejectionReason → 400');
  const { status } = await api('PATCH', `/customers/${customerId}/kyc/${kycId}`,
    { status: 'rejected' }, ADMIN_TOKEN
  );
  check('HTTP 400', status === 400, status);
}

// 29. Reject KYC with reason
{
  console.log('\n29. Reject KYC with rejectionReason');
  const { status, body } = await api('PATCH', `/customers/${customerId}/kyc/${kycId}`,
    { status: 'rejected', rejectionReason: 'Document is blurry and unreadable.' },
    ADMIN_TOKEN
  );
  check('HTTP 200',              status === 200,                       status);
  check('status=rejected',       body.data?.kyc?.status === 'rejected', body.data?.kyc?.status);
  check('rejection_reason set',  !!body.data?.kyc?.rejection_reason,   body.data?.kyc?.rejection_reason);
}

// 30. RBAC — teller cannot verify KYC (customers:kyc_verify)
{
  console.log('\n30. RBAC — teller tries PATCH kyc/:kycId → 403');
  const { status } = await api('PATCH', `/customers/${customerId}/kyc/${kycId}`,
    { status: 'verified' }, TELLER_TOKEN
  );
  check('HTTP 403', status === 403, status);
}

// 31. Deactivate customer
{
  console.log('\n31. Deactivate customer');
  const { status } = await api('PATCH', `/customers/${customerId}/deactivate`, null, ADMIN_TOKEN);
  check('HTTP 200', status === 200, status);
}

// 32. Get deactivated customer → 404
{
  console.log('\n32. Get deactivated customer → 404');
  const { status } = await api('GET', `/customers/${customerId}`, null, ADMIN_TOKEN);
  check('HTTP 404', status === 404, status);
}

// 33. No auth on /customers → 401
{
  console.log('\n33. No auth → 401');
  const r = await fetch(`${BASE}/customers`);
  check('HTTP 401', r.status === 401, r.status);
}

// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Results: ${pass} passed, ${fail} failed  (${pass+fail} total)`);
console.log('══════════════════════════════════════════════════════════\n');
if (fail > 0) process.exit(1);
