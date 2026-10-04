/**
 * smoke_test.mjs  — Quick integration smoke test for the auth module.
 * Run:  node smoke_test.mjs
 * Requires the server to be listening on localhost:5000.
 */

const BASE = 'http://localhost:5000/api/auth';
let pass = 0, fail = 0;

const post = (path, body, headers = {}) =>
  fetch(`${BASE}${path}`, {
    method : 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body   : JSON.stringify(body),
  });

const get  = (path, headers = {}) =>
  fetch(`${BASE}${path}`, { headers });

const patch = (path, body, headers = {}) =>
  fetch(`${BASE}${path}`, {
    method : 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body   : JSON.stringify(body),
  });

const check = (label, condition, got) => {
  if (condition) { console.log(`  ✔  ${label}`); pass++; }
  else           { console.log(`  ✖  ${label}  (got: ${JSON.stringify(got)})`); fail++; }
};

console.log('\n══════════════════════════════════════════');
console.log('  BankShield Auth Smoke Tests');
console.log('══════════════════════════════════════════\n');

// ── PRE-FLIGHT: ensure super-admin password is at known state ────────────────
// Try the default password first; if that fails, try the reset password and
// change it back. This makes the suite idempotent across re-runs.
{
  const tryDefault = await post('/login', {
    email: 'superadmin@bankshield.internal', password: 'BankShield@Super2025!',
  });
  if (tryDefault.status !== 200) {
    // Password was left in "reset" state — restore it
    const tryReset = await post('/login', {
      email: 'superadmin@bankshield.internal', password: 'BankShield@Reset2025!',
    });
    if (tryReset.status === 200) {
      const tok = (await tryReset.json()).data?.accessToken;
      await post('/change-password', {
        currentPassword: 'BankShield@Reset2025!',
        newPassword    : 'BankShield@Super2025!',
        confirmPassword: 'BankShield@Super2025!',
      }, { Authorization: `Bearer ${tok}` });
      console.log('  [pre-flight] Restored super-admin password to default.\n');
    } else {
      console.error('  [pre-flight] Cannot authenticate super-admin — aborting.');
      process.exit(1);
    }
  }
}

// ── 1. Login — bad password ──────────────────────────────────────────────────
{
  console.log('1. Login — wrong credentials');
  const res  = await post('/login', { email: 'nobody@test.com', password: 'Wrong1234!' });
  const body = await res.json();
  check('HTTP 401',          res.status === 401,        res.status);
  check('success: false',    body.success === false,     body.success);
  check('generic message',   body.error === 'Invalid email or password.', body.error);
}

// ── 2. Login — validator (missing password) ──────────────────────────────────
{
  console.log('\n2. Login — missing password field (validator)');
  const res  = await post('/login', { email: 'x@y.com' });
  const body = await res.json();
  check('HTTP 422', res.status === 422, res.status);
  check('has details array', Array.isArray(body.details), body.details);
}

// ── 3. Login — super-admin success ───────────────────────────────────────────
let accessToken, refreshToken;
{
  console.log('\n3. Login — super-admin success');
  const res  = await post('/login', {
    email   : 'superadmin@bankshield.internal',
    password: 'BankShield@Super2025!',
  });
  const body = await res.json();
  check('HTTP 200',                  res.status === 200,                res.status);
  check('success: true',             body.success === true,             body.success);
  check('has accessToken',           typeof body.data?.accessToken === 'string', typeof body.data?.accessToken);
  check('has refreshToken',          typeof body.data?.refreshToken === 'string', typeof body.data?.refreshToken);
  check('role = super_admin',        body.data?.user?.role === 'super_admin', body.data?.user?.role);
  check('permissions is array',      Array.isArray(body.data?.user?.permissions), body.data?.user?.permissions);
  check('34 permissions',            body.data?.user?.permissions?.length === 34, body.data?.user?.permissions?.length);
  accessToken  = body.data?.accessToken;
  refreshToken = body.data?.refreshToken;
}

// ── 4. GET /me — authenticated ───────────────────────────────────────────────
{
  console.log('\n4. GET /me — authenticated profile');
  const res  = await get('/me', { Authorization: `Bearer ${accessToken}` });
  const body = await res.json();
  check('HTTP 200',            res.status === 200, res.status);
  check('has email field',     typeof body.data?.email === 'string', body.data?.email);
  check('has permissions',     Array.isArray(body.data?.permissions), body.data?.permissions);
}

// ── 5. GET /me — no token ────────────────────────────────────────────────────
{
  console.log('\n5. GET /me — no token (expect 401)');
  const res  = await get('/me');
  check('HTTP 401', res.status === 401, res.status);
}

// ── 6. GET /me — malformed token ─────────────────────────────────────────────
{
  console.log('\n6. GET /me — bad token (expect 401)');
  const res  = await get('/me', { Authorization: 'Bearer this.is.garbage' });
  check('HTTP 401', res.status === 401, res.status);
}

// ── 7. RBAC — teller token tries to access fraud:manage_alerts ───────────────
// We don't have a teller user yet, so test role denial by calling a protected
// fraud route without the right permission using the super-admin token
// on a hypothetical endpoint that requires a permission super-admin DOES have.
// For role-denial: hit /api/fraud/alerts without auth.
{
  console.log('\n7. Fraud alerts — no auth (expect 401)');
  const res = await fetch('http://localhost:5000/api/fraud/alerts');
  check('HTTP 401', res.status === 401, res.status);
}

// ── 8. Register — unauthenticated (expect 401) ───────────────────────────────
{
  console.log('\n8. Register — no auth token (expect 401)');
  const res  = await post('/register', {
    email    : 'newuser@test.com',
    password : 'Test@1234!',
    firstName: 'Test',
    lastName : 'User',
  });
  check('HTTP 401', res.status === 401, res.status);
}

// ── 9. Register — as super-admin ─────────────────────────────────────────────
let registeredEmail;
{
  console.log('\n9. Register — as super-admin (admin-only endpoint)');
  registeredEmail = `teller.${Date.now()}@bankshield.test`;
  const res  = await post('/register', {
    email    : registeredEmail,
    password : 'Teller@1234!',
    firstName: 'Test',
    lastName : 'Teller',
    roleName : 'teller',
  }, { Authorization: `Bearer ${accessToken}` });
  const body = await res.json();
  check('HTTP 201',          res.status === 201,            res.status);
  check('role = teller',     body.data?.user?.role === 'teller', body.data?.user?.role);
}

// ── 10. Login as newly registered teller ─────────────────────────────────────
let tellerToken;
{
  console.log('\n10. Login as newly registered teller');
  const res  = await post('/login', { email: registeredEmail, password: 'Teller@1234!' });
  const body = await res.json();
  check('HTTP 200', res.status === 200, res.status);
  tellerToken = body.data?.accessToken;
  const perms = body.data?.user?.permissions ?? [];
  check('teller has transactions:read',   perms.includes('transactions:read'), perms.length);
  check('teller lacks fraud:investigate', !perms.includes('fraud:investigate'), true);
}

// ── 11. Role denial — teller tries fraud:manage_alerts ───────────────────────
{
  console.log('\n11. RBAC denial — teller tries PATCH /api/fraud/alerts/:id');
  const res = await fetch('http://localhost:5000/api/fraud/alerts/00000000-0000-0000-0000-000000000000', {
    method : 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tellerToken}` },
    body   : JSON.stringify({ status: 'resolved' }),
  });
  check('HTTP 403 (Forbidden)', res.status === 403, res.status);
}

// ── 12. Refresh token rotation ────────────────────────────────────────────────
let newAccessToken;
{
  console.log('\n12. Refresh token rotation');
  const res  = await post('/refresh', { refreshToken });
  const body = await res.json();
  check('HTTP 200',                  res.status === 200,                     res.status);
  check('new accessToken different', body.data?.accessToken !== accessToken,  !!body.data?.accessToken);
  check('new refreshToken present',  typeof body.data?.refreshToken === 'string', typeof body.data?.refreshToken);
  newAccessToken = body.data?.accessToken;
}

// ── 13. Old refresh token is now revoked (rotation) ──────────────────────────
{
  console.log('\n13. Old refresh token revoked after rotation');
  const res  = await post('/refresh', { refreshToken });
  check('HTTP 401 (revoked)', res.status === 401, res.status);
}

// ── 14. Forgot password ───────────────────────────────────────────────────────
let resetToken;
{
  console.log('\n14. Forgot password');
  const res  = await post('/forgot-password', { email: 'superadmin@bankshield.internal' });
  const body = await res.json();
  check('HTTP 200',          res.status === 200,           res.status);
  check('success: true',     body.success === true,        body.success);
  // In dev NODE_ENV the token is returned in the response
  check('resetToken present (dev)', typeof body.data?.resetToken === 'string', typeof body.data?.resetToken);
  resetToken = body.data?.resetToken;
}

// ── 15. Reset password ────────────────────────────────────────────────────────
{
  console.log('\n15. Reset password with valid token');
  const res  = await post('/reset-password', {
    token          : resetToken,
    newPassword    : 'BankShield@Reset2025!',
    confirmPassword: 'BankShield@Reset2025!',
  });
  check('HTTP 200', res.status === 200, res.status);
}

// ── 16. Login with new password ───────────────────────────────────────────────
{
  console.log('\n16. Login with new (reset) password');
  const res  = await post('/login', {
    email   : 'superadmin@bankshield.internal',
    password: 'BankShield@Reset2025!',
  });
  check('HTTP 200', res.status === 200, res.status);
  newAccessToken = (await res.json()).data?.accessToken;
}

// ── 17. Change password ───────────────────────────────────────────────────────
{
  console.log('\n17. Change password (authenticated)');
  const res  = await post('/change-password', {
    currentPassword: 'BankShield@Reset2025!',
    newPassword    : 'BankShield@Super2025!',
    confirmPassword: 'BankShield@Super2025!',
  }, { Authorization: `Bearer ${newAccessToken}` });
  check('HTTP 200', res.status === 200, res.status);
}

// ── 18. Update profile ────────────────────────────────────────────────────────
{
  console.log('\n18. Update profile (PATCH /me)');
  // Re-login to get fresh token after password change
  const loginRes  = await post('/login', { email: 'superadmin@bankshield.internal', password: 'BankShield@Super2025!' });
  const freshToken = (await loginRes.json()).data?.accessToken;
  const res  = await patch('/me', { firstName: 'Super', lastName: 'Admin' }, { Authorization: `Bearer ${freshToken}` });
  check('HTTP 200', res.status === 200, res.status);
}

// ── 19. Logout ────────────────────────────────────────────────────────────────
{
  console.log('\n19. Logout (current session)');
  const loginRes  = await post('/login', { email: 'superadmin@bankshield.internal', password: 'BankShield@Super2025!' });
  const body = await loginRes.json();
  const res  = await post('/logout', { refreshToken: body.data?.refreshToken }, { Authorization: `Bearer ${body.data?.accessToken}` });
  check('HTTP 200', res.status === 200, res.status);
}

// ── 20. Validator — bad email + weak password ─────────────────────────────────
{
  console.log('\n20. Validator — bad email + weak password on register');
  const loginRes = await post('/login', { email: 'superadmin@bankshield.internal', password: 'BankShield@Super2025!' });
  const tok = (await loginRes.json()).data?.accessToken;
  const res = await post('/register', {
    email    : 'not-an-email',
    password : 'weak',
    firstName: 'X',
    lastName : 'Y',
  }, { Authorization: `Bearer ${tok}` });
  const b = await res.json();
  check('HTTP 422',              res.status === 422, res.status);
  check('multiple field errors', b.details?.length >= 2, b.details?.length);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log(`  Results: ${pass} passed, ${fail} failed`);
console.log('══════════════════════════════════════════\n');
if (fail > 0) process.exit(1);
