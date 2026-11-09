const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post } = require('../support/http');
const { loginAs } = require('../support/auth');
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

test('smoke: a student reads their own tuition ledger', async () => {
  const student = await loginAs(baseUrl, 'a', 'student');
  const res = await get(baseUrl, '/api/v1/finance/ledger', { token: student.accessToken });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.student.id, USERS.a.student);
  assert.equal(res.body.data.ledger.id, LEDGERS.a);
  assert.ok(res.body.data.installments.length >= 1);
  assert.equal(res.body.data.installments[0].id, INSTALLMENTS.a);
});

test('smoke: a parent reads the ledger of their own child', async () => {
  const parent = await loginAs(baseUrl, 'a', 'parent');
  const res = await get(baseUrl, '/api/v1/finance/ledger', { token: parent.accessToken });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.student.id, USERS.a.student);
  assert.equal(res.body.data.ledger.id, LEDGERS.a);
});

test('smoke: a student submits a payment receipt for their own installment', async () => {
  const student = await loginAs(baseUrl, 'a', 'student');
  const res = await post(baseUrl, `/api/v1/finance/pay-installment/${INSTALLMENTS.a}`, {
    token: student.accessToken,
    body: { tracking_number: 'TRX-TEST-0001', bank_name: 'بانک تست' },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

test('smoke: a teacher reads the ledger of a student of their own school', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(
    baseUrl,
    `/api/v1/finance/ledger?student_id=${USERS.a.student}`,
    { token: teacher.accessToken },
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.data.student.id, USERS.a.student);
});
