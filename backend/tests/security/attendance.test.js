/**
 * Attendance regression tests (Phase 0 safety net).
 *
 *   A10 — cross-tenant attendance manipulation and PII disclosure
 */
const { test, expectFailure, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post, put } = require('../support/http');
const { loginAs } = require('../support/auth');
const { expectNoLeak } = require('../support/assertions');
const { CLASSES, USERS, phoneFor, emailFor } = require('../fixtures/twoSchools');

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

test('[A10] a parent must not receive the phone number and e-mail of a classmate', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const parent = await loginAs(baseUrl, 'a', 'parent');

  const created = await post(baseUrl, `/api/v1/classes/${CLASSES.a}/attendance/sessions`, {
    token: teacher.accessToken,
    body: { duration_minutes: 15 },
  });
  assert.equal(created.status, 201);
  const sessionId = created.body.data.session.id;

  const report = await get(
    baseUrl,
    `/api/v1/classes/${CLASSES.a}/attendance/sessions/${sessionId}/report`,
    { token: parent.accessToken },
  );

  assert.equal(report.status, 200);
  expectNoLeak(
    report.body,
    [phoneFor('a', 'student2'), emailFor('a', 'student2')],
    { finding: 'A10', label: 'attendance report for a parent' },
  );
});

test('[A10] a teacher of another school must not record attendance in a foreign class', async () => {
  const teacherA = await loginAs(baseUrl, 'a', 'teacher');
  const teacherB = await loginAs(baseUrl, 'b', 'teacher');

  const created = await post(baseUrl, `/api/v1/classes/${CLASSES.b}/attendance/sessions`, {
    token: teacherB.accessToken,
    body: { duration_minutes: 15 },
  });
  assert.equal(created.status, 201);
  const sessionId = created.body.data.session.id;

  const recorded = await post(
    baseUrl,
    `/api/v1/classes/${CLASSES.b}/attendance/sessions/${sessionId}/record`,
    {
      token: teacherA.accessToken,
      body: { student_id: USERS.b.student, status: 'absent' },
    },
  );

  assert.equal(
    recorded.status,
    403,
    `recording attendance in a foreign class must be denied, got ${recorded.status}`,
  );
});

test('[A10] a teacher of another school must not close a foreign attendance session', async () => {
  const teacherA = await loginAs(baseUrl, 'a', 'teacher');
  const teacherB = await loginAs(baseUrl, 'b', 'teacher');

  const created = await post(baseUrl, `/api/v1/classes/${CLASSES.b}/attendance/sessions`, {
    token: teacherB.accessToken,
    body: { duration_minutes: 15 },
  });
  const sessionId = created.body.data.session.id;

  const closed = await put(
    baseUrl,
    `/api/v1/classes/${CLASSES.b}/attendance/sessions/${sessionId}/close`,
    { token: teacherA.accessToken },
  );

  assert.equal(
    closed.status,
    403,
    `closing a foreign attendance session must be denied, got ${closed.status}`,
  );
});
