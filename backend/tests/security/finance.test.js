/**
 * Finance regression tests (Phase 0 safety net).
 *
 *   F2  — IDOR in the finance ledger operations
 *   F7  — unauthorized tuition payment verification
 *   F12 — automatic creation of financial records on read
 */
const { test, expectFailure, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase, db } = require('../support/harness');
const { get, post } = require('../support/http');
const { loginAs } = require('../support/auth');
const { expectCrossTenantDenied } = require('../support/assertions');
const { LEDGERS, INSTALLMENTS, USERS } = require('../fixtures/twoSchools');

let baseUrl;

before(async () => {
  ({ baseUrl } = await setupHarness());
});

after(async () => {
  await teardownHarness();
});

beforeEach(async () => {
  await resetDatabase();
});

test('[F2] a school-A teacher must not read the tuition ledger of a school-B student', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'F2',
    method: 'GET',
    path: `/api/v1/finance/ledger?student_id=${USERS.b.student}`,
    token: teacher.accessToken,
  });
});

test('[F2] a school-A student must not read the tuition ledger of a school-B student', async () => {
  const student = await loginAs(baseUrl, 'a', 'student');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'F2',
    method: 'GET',
    path: `/api/v1/finance/ledger?student_id=${USERS.b.student}`,
    token: student.accessToken,
  });
});

test('[F2] a school-A teacher must not submit a receipt for a school-B installment', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'F2',
    method: 'POST',
    path: `/api/v1/finance/pay-installment/${INSTALLMENTS.b}`,
    token: teacher.accessToken,
    body: { tracking_number: 'TRX-ATTACKER', bank_name: 'bank' },
  });
});

test('[F7] a school-A teacher must not verify a school-B tuition installment', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'F7',
    method: 'POST',
    path: `/api/v1/finance/verify-installment/${INSTALLMENTS.b}`,
    token: teacher.accessToken,
  });
});

test('[F12] GET /finance/ledger must not create a tuition ledger', async () => {
  // Remove the ledger so the read hits the auto-creation branch.
  await db('tuition_installments').where({ ledger_id: LEDGERS.a }).del();
  await db('tuition_ledgers').where({ id: LEDGERS.a }).del();

  const student = await loginAs(baseUrl, 'a', 'student');
  await get(baseUrl, '/api/v1/finance/ledger', { token: student.accessToken });

  const ledgers = await db('tuition_ledgers').where({ student_id: USERS.a.student });
  assert.equal(
    ledgers.length,
    0,
    'reading a ledger must never create financial records',
  );
});

test('[F12] a ledger created by a read must not contain pre-verified installments', async () => {
  await db('tuition_installments').where({ ledger_id: LEDGERS.a }).del();
  await db('tuition_ledgers').where({ id: LEDGERS.a }).del();

  const student = await loginAs(baseUrl, 'a', 'student');
  await get(baseUrl, '/api/v1/finance/ledger', { token: student.accessToken });

  const ledger = await db('tuition_ledgers').where({ student_id: USERS.a.student }).first();
  const installments = ledger ? await db('tuition_installments').where({ ledger_id: ledger.id }) : [];
  const verified = installments.filter((i) => i.status === 'verified');
  assert.equal(
    verified.length,
    0,
    'a ledger created by a read must not contain pre-verified installments',
  );
});
