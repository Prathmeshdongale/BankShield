/**
 * smoke_transactions.mjs — Integration tests for the transaction module.
 *
 * Tests covered:
 *   1–2   pre-flight / setup
 *   3–7   deposit
 *   8–11  withdrawal
 *   12–16 fund transfer (+ concurrency)
 *   17–19 card payment (POS) + card limits
 *   20–21 UPI simulation
 *   22–23 ATM withdrawal simulation
 *   24–25 online payment simulation
 *   26–28 idempotency
 *   29–32 validation / error cases
 *   33–35 list + get transactions
 *   36–38 RBAC
 *   39–41 concurrency: two simultaneous withdrawals from same account
 */

const BASE = 'http://localhost:5000/api';
let pass = 0, fail = 0;

const j   = (b) => JSON.stringify(b);
const hdr = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
const api = async (method, path, body, token) => {
  const opts = { method, headers: hdr(token) };
  if (body) opts.body = j(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const d = await r.json().catch(() => ({}));
  return { status: r.status, body: d };
};
const chk = (label, ok, got) => {
  if (ok) { console.log(`  ✔  ${label}`); pass++; }
  else     { console.log(`  ✖  ${label}  →  ${JSON.stringify(got)?.slice(0, 100)}`); fail++; }
};
const login = async (email, pw) => {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: j({ email, password: pw }),
  });
  return (await r.json()).data?.accessToken ?? null;
};
const uuid = () => crypto.randomUUID();

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
const AT = await login('superadmin@bankshield.internal', 'BankShield@Super2025!');
if (!AT) { console.error('Cannot authenticate — abort.'); process.exit(1); }

// ── setup: register users + customers + accounts + card ───────────────────────
const TS = Date.now();

// Register 2 customer-role users
const u1Res = await api('POST','/auth/register',{ email:`txn.u1.${TS}@test.com`, password:'TxnU1@1234!', firstName:'Alice', lastName:'Smith', roleName:'customer' }, AT);
const u2Res = await api('POST','/auth/register',{ email:`txn.u2.${TS}@test.com`, password:'TxnU2@1234!', firstName:'Bob',   lastName:'Jones', roleName:'customer' }, AT);
const U1_ID = u1Res.body?.data?.user?.id;
const U2_ID = u2Res.body?.data?.user?.id;

// Register a teller for RBAC tests
const tellerRes = await api('POST','/auth/register',{ email:`txn.teller.${TS}@test.com`, password:'TxnTl@1234!', firstName:'Tom', lastName:'Teller', roleName:'teller' }, AT);
const TELLER_AT = await login(`txn.teller.${TS}@test.com`, 'TxnTl@1234!');

// Create customer profiles
const c1Res = await api('POST','/customers',{ userId: U1_ID, segment:'retail' }, AT);
const c2Res = await api('POST','/customers',{ userId: U2_ID, segment:'retail' }, AT);
const C1_ID = c1Res.body?.data?.customer?.id;
const C2_ID = c2Res.body?.data?.customer?.id;

// Open accounts
const acc1Res = await api('POST','/accounts',{ customerId: C1_ID, accountType:'savings' }, AT);
const acc2Res = await api('POST','/accounts',{ customerId: C2_ID, accountType:'savings' }, AT);
const ACC1 = acc1Res.body?.data?.account?.id;
const ACC2 = acc2Res.body?.data?.account?.id;

// Issue a debit card on ACC1
const cardRes = await api('POST',`/accounts/${ACC1}/cards`,{ cardType:'debit', network:'rupay' }, AT);
const CARD_ID = cardRes.body?.data?.card?.id;

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  DEPOSIT');
console.log('══════════════════════════════════════════════════════════\n');

{
  console.log('1. Deposit ₹10,000 into ACC1');
  const { status, body } = await api('POST', '/transactions/deposit',
    { accountId: ACC1, amount: 10000, channel: 'branch', description: 'Initial deposit' }, AT);
  chk('HTTP 201',                      status === 201,                                      status);
  chk('txn_type = deposit',            body.data?.transaction?.txn_type === 'deposit',      body.data?.transaction?.txn_type);
  chk('status = completed',            body.data?.transaction?.status   === 'completed',    body.data?.transaction?.status);
  chk('has transaction_ref (TXN-...)', body.data?.transaction?.transaction_ref?.startsWith('TXN-'), body.data?.transaction?.transaction_ref);
  chk('duplicate = false',             body.data?.duplicate === false,                      body.data?.duplicate);
}

{
  console.log('\n2. Deposit ₹5,000 into ACC2');
  const { status, body } = await api('POST', '/transactions/deposit',
    { accountId: ACC2, amount: 5000, channel: 'neft' }, AT);
  chk('HTTP 201', status === 201, status);
  chk('channel = neft', body.data?.transaction?.channel === 'neft', body.data?.transaction?.channel);
}

{
  console.log('\n3. Deposit — validator rejects amount = 0 → 422');
  const { status } = await api('POST', '/transactions/deposit',
    { accountId: ACC1, amount: 0 }, AT);
  chk('HTTP 422', status === 422, status);
}

{
  console.log('\n4. Deposit — invalid channel → 422');
  const { status } = await api('POST', '/transactions/deposit',
    { accountId: ACC1, amount: 100, channel: 'upi' }, AT);
  chk('HTTP 422', status === 422, status);
}

{
  console.log('\n5. Verify ACC1 balance = 10,000 after deposit');
  const { status, body } = await api('GET', `/accounts/${ACC1}/balance`, null, AT);
  chk('HTTP 200', status === 200, status);
  chk('balance = 10000', parseFloat(body.data?.balance) === 10000, body.data?.balance);
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  WITHDRAWAL');
console.log('══════════════════════════════════════════════════════════\n');

{
  console.log('6. Withdraw ₹2,000 from ACC1');
  const { status, body } = await api('POST', '/transactions/withdraw',
    { accountId: ACC1, amount: 2000, channel: 'branch', description: 'ATM cash' }, AT);
  chk('HTTP 201',              status === 201,                                        status);
  chk('txn_type = withdrawal', body.data?.transaction?.txn_type === 'withdrawal',    body.data?.transaction?.txn_type);
  chk('status = completed',    body.data?.transaction?.status   === 'completed',     body.data?.transaction?.status);
}

{
  console.log('\n7. Verify ACC1 balance = 8,000 after withdrawal');
  const { status, body } = await api('GET', `/accounts/${ACC1}/balance`, null, AT);
  chk('balance = 8000', parseFloat(body.data?.balance) === 8000, body.data?.balance);
}

{
  console.log('\n8. Withdraw more than balance → 422 INSUFFICIENT_FUNDS');
  const { status, body } = await api('POST', '/transactions/withdraw',
    { accountId: ACC1, amount: 99999, channel: 'branch' }, AT);
  chk('HTTP 422',                  status === 422,                                        status);
  chk('INSUFFICIENT_FUNDS error',  body.error === 'Insufficient funds in the source account.', body.error);
}

{
  console.log('\n9. Withdraw from frozen account → 409');
  // Freeze ACC2 first
  await api('PATCH', `/accounts/${ACC2}/freeze`, null, AT);
  const { status, body } = await api('POST', '/transactions/withdraw',
    { accountId: ACC2, amount: 100, channel: 'branch' }, AT);
  chk('HTTP 409',                        status === 409,                                     status);
  chk('SOURCE_ACCOUNT_NOT_ACTIVE error', body.error === 'Source account is not active.',     body.error);
  // Unfreeze for later tests
  await api('PATCH', `/accounts/${ACC2}/activate`, null, AT);
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  FUND TRANSFER');
console.log('══════════════════════════════════════════════════════════\n');

{
  console.log('10. Transfer ₹3,000 ACC1 → ACC2');
  const { status, body } = await api('POST', '/transactions/transfer',
    { sourceAccountId: ACC1, destinationAccountId: ACC2, amount: 3000, channel: 'web', description: 'Test transfer' }, AT);
  chk('HTTP 201',                 status === 201,                                    status);
  chk('txn_type = transfer',      body.data?.transaction?.txn_type === 'transfer',   body.data?.transaction?.txn_type);
  chk('status = completed',       body.data?.transaction?.status   === 'completed',  body.data?.transaction?.status);
  chk('channel = web',            body.data?.transaction?.channel  === 'web',        body.data?.transaction?.channel);
}

{
  console.log('\n11. Verify ACC1 = 5,000 and ACC2 = 8,000 after transfer');
  const b1 = await api('GET', `/accounts/${ACC1}/balance`, null, AT);
  const b2 = await api('GET', `/accounts/${ACC2}/balance`, null, AT);
  chk('ACC1 balance = 5000', parseFloat(b1.body.data?.balance) === 5000, b1.body.data?.balance);
  chk('ACC2 balance = 8000', parseFloat(b2.body.data?.balance) === 8000, b2.body.data?.balance);
}

{
  console.log('\n12. Self-transfer → 400');
  const { status, body } = await api('POST', '/transactions/transfer',
    { sourceAccountId: ACC1, destinationAccountId: ACC1, amount: 100, channel: 'web' }, AT);
  chk('HTTP 422 or 400', status === 422 || status === 400, status);
}

{
  console.log('\n13. Transfer insufficient funds → 422');
  const { status } = await api('POST', '/transactions/transfer',
    { sourceAccountId: ACC1, destinationAccountId: ACC2, amount: 99999, channel: 'web' }, AT);
  chk('HTTP 422', status === 422, status);
}

{
  console.log('\n14. Transfer via UPI channel');
  const { status, body } = await api('POST', '/transactions/transfer',
    { sourceAccountId: ACC2, destinationAccountId: ACC1, amount: 1000, channel: 'upi' }, AT);
  chk('HTTP 201',          status === 201,                                  status);
  chk('channel = upi',     body.data?.transaction?.channel === 'upi',      body.data?.transaction?.channel);
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  CARD PAYMENT + LIMITS');
console.log('══════════════════════════════════════════════════════════\n');

// Set a single_txn limit of ₹500 on the card
await api('PUT', `/cards/${CARD_ID}/limits/single_txn`, { amountLimit: 500 }, AT);

{
  console.log('15. Card POS payment ₹200 (within single_txn limit)');
  const { status, body } = await api('POST', '/transactions/card-payment',
    { accountId: ACC1, cardId: CARD_ID, amount: 200, channel: 'pos', merchantName: 'Cafe Mocha' }, AT);
  chk('HTTP 201',             status === 201,                                  status);
  chk('txn_type = payment',   body.data?.transaction?.txn_type === 'payment', body.data?.transaction?.txn_type);
  chk('channel = pos',        body.data?.transaction?.channel  === 'pos',     body.data?.transaction?.channel);
}

{
  console.log('\n16. Card payment ₹1,000 — exceeds single_txn limit of ₹500 → 422');
  const { status, body } = await api('POST', '/transactions/card-payment',
    { accountId: ACC1, cardId: CARD_ID, amount: 1000, channel: 'pos' }, AT);
  chk('HTTP 422',                  status === 422,                        status);
  chk('CARD_LIMIT_EXCEEDED error', body.error?.includes('limit'),         body.error);
  chk('limitType = single_txn',    body.details?.limitType === 'single_txn', body.details?.limitType);
}

// Remove the limit so further tests can proceed
await api('DELETE', `/cards/${CARD_ID}/limits/single_txn`, null, AT);

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  UPI PAYMENT SIMULATION');
console.log('══════════════════════════════════════════════════════════\n');

{
  console.log('17. UPI payment ACC1 → ACC2');
  const { status, body } = await api('POST', '/transactions/upi',
    { sourceAccountId: ACC1, destinationAccountId: ACC2, amount: 500, upiVpa: 'bob@upi' }, AT);
  chk('HTTP 201',           status === 201,                                   status);
  chk('channel = upi',      body.data?.transaction?.channel === 'upi',        body.data?.transaction?.channel);
  chk('txn_type = transfer',body.data?.transaction?.txn_type === 'transfer',  body.data?.transaction?.txn_type);
}

{
  console.log('\n18. UPI payment insufficient funds → 422');
  const { status } = await api('POST', '/transactions/upi',
    { sourceAccountId: ACC1, destinationAccountId: ACC2, amount: 99999 }, AT);
  chk('HTTP 422', status === 422, status);
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  ATM WITHDRAWAL SIMULATION');
console.log('══════════════════════════════════════════════════════════\n');

{
  console.log('19. ATM withdrawal with card');
  const { status, body } = await api('POST', '/transactions/atm',
    { accountId: ACC1, cardId: CARD_ID, amount: 300, locationCity: 'Mumbai' }, AT);
  chk('HTTP 201',          status === 201,                                      status);
  chk('channel = atm',     body.data?.transaction?.channel === 'atm',           body.data?.transaction?.channel);
  chk('txn_type = withdrawal', body.data?.transaction?.txn_type === 'withdrawal', body.data?.transaction?.txn_type);
}

{
  console.log('\n20. ATM — daily_atm limit enforcement');
  // Set a low daily_atm limit
  await api('PUT', `/cards/${CARD_ID}/limits/daily_atm`, { amountLimit: 100 }, AT);
  const { status, body } = await api('POST', '/transactions/atm',
    { accountId: ACC1, cardId: CARD_ID, amount: 200, locationCity: 'Delhi' }, AT);
  chk('HTTP 422 (atm limit exceeded)', status === 422, status);
  chk('CARD_LIMIT_EXCEEDED',           body.error?.includes('limit'), body.error);
  // Clean up
  await api('DELETE', `/cards/${CARD_ID}/limits/daily_atm`, null, AT);
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  ONLINE PAYMENT SIMULATION');
console.log('══════════════════════════════════════════════════════════\n');

{
  console.log('21. Online payment (web channel)');
  const { status, body } = await api('POST', '/transactions/online',
    { accountId: ACC1, cardId: CARD_ID, amount: 499, channel: 'web',
      merchantName: 'Amazon IN', merchantCategory: 'e-commerce' }, AT);
  chk('HTTP 201',            status === 201,                                  status);
  chk('channel = web',       body.data?.transaction?.channel === 'web',       body.data?.transaction?.channel);
  chk('merchant_name set',   body.data?.transaction?.merchant_name === 'Amazon IN', body.data?.transaction?.merchant_name);
}

{
  console.log('\n22. Online payment — invalid channel (atm) → 422');
  const { status } = await api('POST', '/transactions/online',
    { accountId: ACC1, cardId: CARD_ID, amount: 100, channel: 'atm' }, AT);
  chk('HTTP 422', status === 422, status);
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  IDEMPOTENCY');
console.log('══════════════════════════════════════════════════════════\n');

const IDEM_KEY = uuid();
let originalTxnId;

{
  console.log('23. First deposit with idempotency key');
  const { status, body } = await api('POST', '/transactions/deposit',
    { accountId: ACC1, amount: 100, channel: 'api', idempotencyKey: IDEM_KEY }, AT);
  chk('HTTP 201',          status === 201,          status);
  chk('duplicate = false', body.data?.duplicate === false, body.data?.duplicate);
  originalTxnId = body.data?.transaction?.id;
}

{
  console.log('\n24. Duplicate deposit with same idempotency key → same txn returned');
  const { status, body } = await api('POST', '/transactions/deposit',
    { accountId: ACC1, amount: 100, channel: 'api', idempotencyKey: IDEM_KEY }, AT);
  chk('HTTP 200 (idempotent replay)', status === 200,                          status);
  chk('duplicate = true',             body.data?.duplicate === true,            body.data?.duplicate);
  chk('same transaction id',          body.data?.transaction?.id === originalTxnId, body.data?.transaction?.id);
}

{
  console.log('\n25. Balance unchanged after duplicate deposit');
  // Deposit ₹100 happened only once despite two requests
  const before = await api('GET', `/accounts/${ACC1}/balance`, null, AT);
  await api('POST', '/transactions/deposit',
    { accountId: ACC1, amount: 100, channel: 'api', idempotencyKey: IDEM_KEY }, AT);
  const after = await api('GET', `/accounts/${ACC1}/balance`, null, AT);
  chk('Balance unchanged after replay',
    parseFloat(before.body.data?.balance) === parseFloat(after.body.data?.balance),
    { before: before.body.data?.balance, after: after.body.data?.balance }
  );
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  VALIDATION / ERROR CASES');
console.log('══════════════════════════════════════════════════════════\n');

{
  console.log('26. Deposit — missing accountId → 422');
  const { status } = await api('POST', '/transactions/deposit', { amount: 100 }, AT);
  chk('HTTP 422', status === 422, status);
}

{
  console.log('\n27. Transfer — missing destinationAccountId → 422');
  const { status } = await api('POST', '/transactions/transfer',
    { sourceAccountId: ACC1, amount: 100 }, AT);
  chk('HTTP 422', status === 422, status);
}

{
  console.log('\n28. Card payment — card not found → 404');
  const { status, body } = await api('POST', '/transactions/card-payment',
    { accountId: ACC1, cardId: uuid(), amount: 50, channel: 'pos' }, AT);
  chk('HTTP 404', status === 404, status);
}

{
  console.log('\n29. No auth → 401');
  const r = await fetch(`${BASE}/transactions`, { method: 'GET' });
  chk('HTTP 401', r.status === 401, r.status);
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  LIST + GET TRANSACTIONS');
console.log('══════════════════════════════════════════════════════════\n');

{
  console.log('30. List transactions for ACC1');
  const { status, body } = await api('GET', `/transactions?accountId=${ACC1}&limit=20`, null, AT);
  chk('HTTP 200',          status === 200,                    status);
  chk('has pagination',    !!body.data?.pagination,            body.data?.pagination);
  chk('total >= 5',        body.data?.pagination?.total >= 5,  body.data?.pagination?.total);
  chk('data is array',     Array.isArray(body.data?.data),     body.data?.data);
}

{
  console.log('\n31. List transactions — filter by status=completed');
  const { status, body } = await api('GET', `/transactions?accountId=${ACC1}&status=completed`, null, AT);
  chk('HTTP 200', status === 200, status);
  chk('all completed', body.data?.data?.every(t => t.status === 'completed'), true);
}

{
  console.log('\n32. List transactions — filter by txnType=deposit');
  const { status, body } = await api('GET', `/transactions?accountId=${ACC1}&txnType=deposit`, null, AT);
  chk('HTTP 200',              status === 200,  status);
  chk('only deposit txns',     body.data?.data?.every(t => t.txn_type === 'deposit'), true);
}

let sampleTxnRef;
{
  console.log('\n33. Get transaction by id');
  const listRes = await api('GET', `/transactions?accountId=${ACC1}&limit=1`, null, AT);
  const txnId   = listRes.body?.data?.data?.[0]?.id;
  sampleTxnRef  = listRes.body?.data?.data?.[0]?.transaction_ref;
  if (txnId) {
    const { status, body } = await api('GET', `/transactions/${txnId}`, null, AT);
    chk('HTTP 200',     status === 200,                        status);
    chk('id matches',   body.data?.transaction?.id === txnId,  body.data?.transaction?.id);
  } else {
    chk('HTTP 200 (no txns yet)', false, 'no txns');
  }
}

{
  console.log('\n34. Get transaction by ref (TXN-YYYYMMDD-XXXXXXXX)');
  if (sampleTxnRef) {
    const { status, body } = await api('GET', `/transactions/${sampleTxnRef}`, null, AT);
    chk('HTTP 200',          status === 200,                                  status);
    chk('ref matches',       body.data?.transaction?.transaction_ref === sampleTxnRef, body.data?.transaction?.transaction_ref);
  } else {
    chk('HTTP 200 (no ref)', false, 'no ref');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  RBAC');
console.log('══════════════════════════════════════════════════════════\n');

{
  console.log('35. Teller can read transactions (transactions:read)');
  const { status } = await api('GET', `/transactions?accountId=${ACC1}`, null, TELLER_AT);
  chk('HTTP 200', status === 200, status);
}

{
  console.log('\n36. Teller can create a deposit (transactions:create)');
  const { status } = await api('POST', '/transactions/deposit',
    { accountId: ACC1, amount: 50, channel: 'branch' }, TELLER_AT);
  chk('HTTP 201', status === 201, status);
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  CONCURRENCY — two simultaneous withdrawals');
console.log('══════════════════════════════════════════════════════════\n');

// First top-up ACC1 with a known amount so we have a predictable starting point
await api('POST', '/transactions/deposit', { accountId: ACC1, amount: 1000, channel: 'api' }, AT);

// Zero out balance by withdrawing everything first, then deposit exactly ₹500
// so two concurrent ₹400 withdrawals can't both succeed
{
  const balNow = parseFloat((await api('GET', `/accounts/${ACC1}/balance`, null, AT)).body.data?.balance);
  if (balNow > 0) {
    await api('POST', '/transactions/withdraw', { accountId: ACC1, amount: balNow, channel: 'branch' }, AT);
  }
}
await api('POST', '/transactions/deposit', { accountId: ACC1, amount: 500, channel: 'api' }, AT);
const balBefore = (await api('GET', `/accounts/${ACC1}/balance`, null, AT)).body.data?.balance;

{
  console.log(`37. ACC1 balance before concurrent withdrawals: ₹${balBefore}`);
  chk('balance > 0', parseFloat(balBefore) > 0, balBefore);
}

{
  console.log('\n38. Fire two concurrent withdrawals of ₹400 each (only one can succeed — balance = ₹500)');
  const [r1, r2] = await Promise.all([
    api('POST', '/transactions/withdraw',
      { accountId: ACC1, amount: 400, channel: 'branch', idempotencyKey: uuid() }, AT),
    api('POST', '/transactions/withdraw',
      { accountId: ACC1, amount: 400, channel: 'branch', idempotencyKey: uuid() }, AT),
  ]);

  const statuses = [r1.status, r2.status].sort();
  console.log(`  → statuses: ${r1.status}, ${r2.status}`);
  chk(
    'Exactly one 201 and one 422 (INSUFFICIENT_FUNDS)',
    statuses[0] === 201 && statuses[1] === 422,
    statuses
  );
}

{
  console.log('\n39. ACC1 balance after concurrent test — must be consistent (debited exactly once = ₹400)');
  const balAfter = (await api('GET', `/accounts/${ACC1}/balance`, null, AT)).body.data?.balance;
  const diff = parseFloat(balBefore) - parseFloat(balAfter);
  console.log(`  → before: ₹${balBefore}  after: ₹${balAfter}  diff: ₹${diff}`);
  chk(
    'Balance debited exactly once (₹400)',
    Math.abs(diff - 400) < 0.01,
    `diff = ${diff}`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Results: ${pass} passed, ${fail} failed  (${pass + fail} total)`);
console.log('══════════════════════════════════════════════════════════\n');
if (fail > 0) process.exit(1);
