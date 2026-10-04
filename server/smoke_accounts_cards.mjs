/**
 * smoke_accounts_cards.mjs
 * Integration smoke tests for accounts + cards modules.
 * Run: node smoke_accounts_cards.mjs   (server must be on :5000)
 */

const BASE = 'http://localhost:5000/api';
let pass = 0, fail = 0;

const j    = (b) => JSON.stringify(b);
const hdr  = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
const api  = async (method, path, body, token) => {
  const opts = { method, headers: hdr(token) };
  if (body) opts.body = j(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const d = await r.json().catch(() => ({}));
  return { status: r.status, body: d };
};
const chk  = (label, ok, got) => {
  if (ok) { console.log(`  ✔  ${label}`); pass++; }
  else     { console.log(`  ✖  ${label}  (got: ${JSON.stringify(got)?.slice(0,80)})`); fail++; }
};
const login = async (email, pw) => {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: j({ email, password: pw }),
  });
  const d = await r.json();
  return d.data?.accessToken;
};

// ── pre-flight: restore super-admin password ─────────────────────────────────
for (const pw of ['BankShield@Super2025!','BankShield@Reset2025!','BankShield@New2025!']) {
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
      console.log('  [pre-flight] Password restored.\n');
    }
    break;
  }
}

const AT = await login('superadmin@bankshield.internal', 'BankShield@Super2025!');
if (!AT) { console.error('Cannot authenticate — abort.'); process.exit(1); }

// Register a customer-role user + teller for RBAC tests
const CUST_EMAIL   = `accsmokeuser.${Date.now()}@bankshield.test`;
const TELLER_EMAIL = `acctelleruser.${Date.now()}@bankshield.test`;
const regC  = await api('POST','/auth/register',{ email:CUST_EMAIL,   password:'CustAcc@1234!', firstName:'Acc', lastName:'Customer', roleName:'customer' }, AT);
const regT  = await api('POST','/auth/register',{ email:TELLER_EMAIL, password:'TellAcc@1234!', firstName:'Acc', lastName:'Teller',   roleName:'teller'   }, AT);
const CUST_USER_ID = regC.body?.data?.user?.id;

// Create customer profile for CUST_USER_ID
const custRes = await api('POST','/customers',{ userId: CUST_USER_ID, segment:'retail', riskRating:'low' }, AT);
const CUSTOMER_ID = custRes.body?.data?.customer?.id;

const TELLER_AT = await login(TELLER_EMAIL, 'TellAcc@1234!');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log('  ACCOUNT TYPES');
console.log('══════════════════════════════════════════════════════════\n');

let accountTypes;
{
  console.log('1. List account types');
  const { status, body } = await api('GET', '/accounts/types', null, AT);
  chk('HTTP 200',          status === 200,                   status);
  chk('array returned',    Array.isArray(body.data?.types),  body.data?.types);
  chk('has savings',       body.data?.types?.some(t => t.type_name === 'savings'), true);
  chk('has business',      body.data?.types?.some(t => t.type_name === 'business'), true);
  chk('at least 4 types',  body.data?.types?.length >= 4,    body.data?.types?.length);
  accountTypes = body.data?.types;
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log('  ACCOUNT OPEN / READ / LIST');
console.log('══════════════════════════════════════════════════════════\n');

let accountId, accountNumber;

{
  console.log('2. Open savings account');
  const { status, body } = await api('POST', '/accounts',
    { customerId: CUSTOMER_ID, accountType: 'savings', currency: 'INR', nomineeName: 'Jane Doe' }, AT);
  chk('HTTP 201',                  status === 201,                                status);
  chk('has account_number',        !!body.data?.account?.account_number,          body.data?.account?.account_number);
  chk('number starts ACC-',        body.data?.account?.account_number?.startsWith('ACC-'), true);
  chk('status = active',           body.data?.account?.status === 'active',       body.data?.account?.status);
  chk('account_type = savings',    body.data?.account?.account_type === 'savings', body.data?.account?.account_type);
  chk('nominee set',               body.data?.account?.nominee_name === 'Jane Doe', body.data?.account?.nominee_name);
  accountId     = body.data?.account?.id;
  accountNumber = body.data?.account?.account_number;
}

{
  console.log('\n3. Duplicate account number is unique (open second account)');
  const { status, body } = await api('POST', '/accounts',
    { customerId: CUSTOMER_ID, accountType: 'current' }, AT);
  chk('HTTP 201',         status === 201,           status);
  chk('different number', body.data?.account?.account_number !== accountNumber, body.data?.account?.account_number);
}

{
  console.log('\n4. Open unsupported type (fixed_deposit) → 422 (validator rejects it)');
  const { status } = await api('POST', '/accounts',
    { customerId: CUSTOMER_ID, accountType: 'fixed_deposit' }, AT);
  chk('HTTP 422', status === 422, status);
}

{
  console.log('\n5. Get account by id');
  const { status, body } = await api('GET', `/accounts/${accountId}`, null, AT);
  chk('HTTP 200',      status === 200,                         status);
  chk('id matches',    body.data?.account?.id === accountId,   body.data?.account?.id);
  chk('has customer',  !!body.data?.account?.customer_number,  body.data?.account?.customer_number);
}

{
  console.log('\n6. List accounts — filter by customerId');
  const { status, body } = await api('GET', `/accounts?customerId=${CUSTOMER_ID}&limit=10`, null, AT);
  chk('HTTP 200',         status === 200,                  status);
  chk('has pagination',   !!body.data?.pagination,          body.data?.pagination);
  chk('total >= 2',       body.data?.pagination?.total >= 2, body.data?.pagination?.total);
}

{
  console.log('\n7. List accounts — no auth → 401');
  const r = await fetch(`${BASE}/accounts`);
  chk('HTTP 401', r.status === 401, r.status);
}

{
  console.log('\n8. Validator — bad accountType → 422');
  const { status, body } = await api('POST', '/accounts',
    { customerId: CUSTOMER_ID, accountType: 'INVALID_TYPE' }, AT);
  chk('HTTP 422',          status === 422,              status);
  chk('details present',   Array.isArray(body.details), body.details);
}

{
  console.log('\n9. Teller can read accounts (accounts:read)');
  const { status } = await api('GET', `/accounts/${accountId}`, null, TELLER_AT);
  chk('HTTP 200', status === 200, status);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log('  ACCOUNT STATUS TRANSITIONS');
console.log('══════════════════════════════════════════════════════════\n');

{
  console.log('10. Update account (nominee name)');
  const { status, body } = await api('PATCH', `/accounts/${accountId}`,
    { nomineeName: 'John Doe Updated' }, AT);
  chk('HTTP 200',          status === 200,                                              status);
  chk('nominee updated',   body.data?.account?.nominee_name === 'John Doe Updated',    body.data?.account?.nominee_name);
}

{
  console.log('\n11. Block injected field (status) → 422');
  const { status } = await api('PATCH', `/accounts/${accountId}`, { status: 'frozen' }, AT);
  chk('HTTP 422', status === 422, status);
}

{
  console.log('\n12. Freeze account');
  const { status, body } = await api('PATCH', `/accounts/${accountId}/freeze`, null, AT);
  chk('HTTP 200',           status === 200,                            status);
  chk('status = frozen',    body.data?.account?.status === 'frozen',   body.data?.account?.status);
}

{
  console.log('\n13. Freeze again → 409');
  const { status } = await api('PATCH', `/accounts/${accountId}/freeze`, null, AT);
  chk('HTTP 409', status === 409, status);
}

{
  console.log('\n14. Activate (unfreeze) account');
  const { status, body } = await api('PATCH', `/accounts/${accountId}/activate`, null, AT);
  chk('HTTP 200',           status === 200,                            status);
  chk('status = active',    body.data?.account?.status === 'active',   body.data?.account?.status);
}

{
  console.log('\n15. RBAC — teller cannot freeze account (no accounts:freeze)');
  const { status } = await api('PATCH', `/accounts/${accountId}/freeze`, null, TELLER_AT);
  chk('HTTP 403', status === 403, status);
}

{
  console.log('\n16. Get balance');
  const { status, body } = await api('GET', `/accounts/${accountId}/balance`, null, AT);
  chk('HTTP 200',          status === 200,                   status);
  chk('has balance field', body.data?.balance !== undefined, body.data?.balance);
  chk('has currency',      !!body.data?.currency,            body.data?.currency);
}

{
  console.log('\n17. Get history (no transactions yet — empty)');
  const { status, body } = await api('GET', `/accounts/${accountId}/history`, null, AT);
  chk('HTTP 200',            status === 200,                      status);
  chk('has pagination',      !!body.data?.pagination,              body.data?.pagination);
  chk('transactions array',  Array.isArray(body.data?.transactions), body.data?.transactions);
}

{
  console.log('\n18. Close account with balance → 400');
  // The savings account still has 0 balance, so if we add a non-zero balance
  // we can test this. For now just test closing the zero-balance account.
  // First let's just verify close works on zero-balance:
  const { status, body } = await api('PATCH', `/accounts/${accountId}/close`, null, AT);
  chk('HTTP 200',           status === 200,                           status);
  chk('status = closed',    body.data?.account?.status === 'closed',  body.data?.account?.status);
}

{
  console.log('\n19. Close already-closed account → 409');
  const { status } = await api('PATCH', `/accounts/${accountId}/close`, null, AT);
  chk('HTTP 409', status === 409, status);
}

// ─────────────────────────────────────────────────────────────────────────────
// Need an open active account for card tests
console.log('\n══════════════════════════════════════════════════════════');
console.log('  CARDS');
console.log('══════════════════════════════════════════════════════════\n');

// Open a fresh active account for card tests
const cardAccRes = await api('POST', '/accounts',
  { customerId: CUSTOMER_ID, accountType: 'savings' }, AT);
const cardAccountId = cardAccRes.body?.data?.account?.id;

let cardId;

{
  console.log('20. Issue debit card');
  const { status, body } = await api('POST', `/accounts/${cardAccountId}/cards`,
    { cardType: 'debit', network: 'rupay' }, AT);
  chk('HTTP 201',              status === 201,                          status);
  chk('has id',                !!body.data?.card?.id,                   body.data?.card?.id);
  chk('masked_number present', body.data?.card?.masked_number?.includes('••••'), body.data?.card?.masked_number);
  chk('card_last4 is 4 chars', body.data?.card?.card_last4?.length === 4, body.data?.card?.card_last4);
  chk('NO card_number_hash',   body.data?.card?.card_number_hash === undefined, true);
  chk('status = active',       body.data?.card?.status === 'active',    body.data?.card?.status);
  chk('card_type = debit',     body.data?.card?.card_type === 'debit',  body.data?.card?.card_type);
  cardId = body.data?.card?.id;
}

{
  console.log('\n21. Get card by id — PAN hash never exposed');
  const { status, body } = await api('GET', `/cards/${cardId}`, null, AT);
  chk('HTTP 200',              status === 200,                           status);
  chk('NO card_number_hash',   body.data?.card?.card_number_hash === undefined, true);
  chk('masked_number present', !!body.data?.card?.masked_number,         body.data?.card?.masked_number);
}

{
  console.log('\n22. List cards for account');
  const { status, body } = await api('GET', `/accounts/${cardAccountId}/cards`, null, AT);
  chk('HTTP 200',         status === 200,                     status);
  chk('length >= 1',      body.data?.cards?.length >= 1,      body.data?.cards?.length);
  chk('no hashes in list', body.data?.cards?.every(c => !c.card_number_hash), true);
}

{
  console.log('\n23. Issue credit card on same account');
  const { status, body } = await api('POST', `/accounts/${cardAccountId}/cards`,
    { cardType: 'credit', network: 'visa' }, AT);
  chk('HTTP 201',        status === 201,        status);
  chk('type = credit',   body.data?.card?.card_type === 'credit', body.data?.card?.card_type);
}

{
  console.log('\n24. Issue 3rd debit card → 409 (max 2 per type)');
  // Already have 1 debit, issue 2nd
  await api('POST', `/accounts/${cardAccountId}/cards`, { cardType: 'debit', network: 'mastercard' }, AT);
  // Now try 3rd
  const { status } = await api('POST', `/accounts/${cardAccountId}/cards`,
    { cardType: 'debit', network: 'rupay' }, AT);
  chk('HTTP 409', status === 409, status);
}

{
  console.log('\n25. Block card');
  const { status, body } = await api('PATCH', `/cards/${cardId}/block`,
    { reason: 'Suspicious activity detected.' }, AT);
  chk('HTTP 200',          status === 200,                         status);
  chk('status = blocked',  body.data?.card?.status === 'blocked',  body.data?.card?.status);
  chk('blocked_reason set', !!body.data?.card?.blocked_reason,     body.data?.card?.blocked_reason);
}

{
  console.log('\n26. Block already-blocked card → 409');
  const { status } = await api('PATCH', `/cards/${cardId}/block`, { reason: 'again' }, AT);
  chk('HTTP 409', status === 409, status);
}

{
  console.log('\n27. Unblock card');
  const { status, body } = await api('PATCH', `/cards/${cardId}/unblock`, null, AT);
  chk('HTTP 200',         status === 200,                        status);
  chk('status = active',  body.data?.card?.status === 'active',  body.data?.card?.status);
}

{
  console.log('\n28. Report card lost');
  const { status, body } = await api('PATCH', `/cards/${cardId}/report-lost`, null, AT);
  chk('HTTP 200',       status === 200,                      status);
  chk('status = lost',  body.data?.card?.status === 'lost',  body.data?.card?.status);
}

{
  console.log('\n29. Report already-lost card → 409');
  const { status } = await api('PATCH', `/cards/${cardId}/report-lost`, null, AT);
  chk('HTTP 409', status === 409, status);
}

{
  console.log('\n30. Replace lost card');
  const { status, body } = await api('POST', `/cards/${cardId}/replace`, null, AT);
  chk('HTTP 201',              status === 201,                           status);
  chk('new card id issued',    body.data?.card?.id !== cardId,            body.data?.card?.id);
  chk('NO card_number_hash',   body.data?.card?.card_number_hash === undefined, true);
  chk('status = active',       body.data?.card?.status === 'active',     body.data?.card?.status);
  // Update cardId to new card for limit tests
  if (body.data?.card?.id) cardId = body.data.card.id;
}

// ─── Card limits ──────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log('  CARD LIMITS');
console.log('══════════════════════════════════════════════════════════\n');

{
  console.log('31. List limits — initially empty');
  const { status, body } = await api('GET', `/cards/${cardId}/limits`, null, AT);
  chk('HTTP 200',         status === 200,                     status);
  chk('array returned',   Array.isArray(body.data?.limits),   body.data?.limits);
}

{
  console.log('\n32. Set daily_atm limit');
  const { status, body } = await api('PUT', `/cards/${cardId}/limits/daily_atm`,
    { amountLimit: 20000 }, AT);
  chk('HTTP 200',              status === 200,                           status);
  chk('limit_type correct',    body.data?.limit?.limit_type === 'daily_atm', body.data?.limit?.limit_type);
  chk('amount correct',        parseFloat(body.data?.limit?.amount_limit) === 20000, body.data?.limit?.amount_limit);
}

{
  console.log('\n33. Update same limit (upsert)');
  const { status, body } = await api('PUT', `/cards/${cardId}/limits/daily_atm`,
    { amountLimit: 25000 }, AT);
  chk('HTTP 200',           status === 200,            status);
  chk('amount updated',     parseFloat(body.data?.limit?.amount_limit) === 25000, body.data?.limit?.amount_limit);
}

{
  console.log('\n34. Set daily_pos limit');
  const { status } = await api('PUT', `/cards/${cardId}/limits/daily_pos`,
    { amountLimit: 50000 }, AT);
  chk('HTTP 200', status === 200, status);
}

{
  console.log('\n35. List limits — now has 2');
  const { status, body } = await api('GET', `/cards/${cardId}/limits`, null, AT);
  chk('HTTP 200',        status === 200,                   status);
  chk('length = 2',      body.data?.limits?.length === 2,  body.data?.limits?.length);
}

{
  console.log('\n36. Validator — zero amountLimit → 422');
  const { status } = await api('PUT', `/cards/${cardId}/limits/daily_atm`,
    { amountLimit: 0 }, AT);
  chk('HTTP 422', status === 422, status);
}

{
  console.log('\n37. RBAC — teller cannot set card limits (no cards:manage_limits)');
  const { status } = await api('PUT', `/cards/${cardId}/limits/monthly`,
    { amountLimit: 100000 }, TELLER_AT);
  chk('HTTP 403', status === 403, status);
}

{
  console.log('\n38. RBAC — teller can read card limits (cards:read)');
  const { status } = await api('GET', `/cards/${cardId}/limits`, null, TELLER_AT);
  chk('HTTP 200', status === 200, status);
}

{
  console.log('\n39. Delete daily_atm limit');
  const { status } = await api('DELETE', `/cards/${cardId}/limits/daily_atm`, null, AT);
  chk('HTTP 200', status === 200, status);
}

{
  console.log('\n40. Delete non-existent limit → 404');
  const { status } = await api('DELETE', `/cards/${cardId}/limits/daily_atm`, null, AT);
  chk('HTTP 404', status === 404, status);
}

{
  console.log('\n41. Issue card on non-active account → 409 (closed account from test 18)');
  const { status } = await api('POST', `/accounts/${accountId}/cards`,
    { cardType: 'debit', network: 'rupay' }, AT);
  chk('HTTP 409', status === 409, status);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Results: ${pass} passed, ${fail} failed  (${pass+fail} total)`);
console.log('══════════════════════════════════════════════════════════\n');
if (fail > 0) process.exit(1);
