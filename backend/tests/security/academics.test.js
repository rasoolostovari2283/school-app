/**
 * Academic regression tests: quizzes, transcripts, analytics, tickets and the
 * study planner (Phase 0 safety net).
 *
 *   A6  — system-wide analytics with no role gate and no tenant scope
 *   A8  — cross-tenant ticket injection
 *   A9  — study-planner cross-tenant disclosure and mass assignment
 *   A11 — cross-tenant quiz publication and answer-key disclosure
 *   A12 — transcript IDOR
 */
const { test, expectFailure, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post, put } = require('../support/http');
const { loginAs } = require('../support/auth');
const { expectNoLeak } = require('../support/assertions');
const { CLASSES, USERS, QUIZZES, TICKETS, STUDY_LOGS } = require('../fixtures/twoSchools');

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

expectFailure('[A6] a student must not read the deployment-wide analytics overview', async () => {
  const student = await loginAs(baseUrl, 'a', 'student');
  const res = await get(baseUrl, '/api/v1/analytics/overview', { token: student.accessToken });

  assert.equal(
    res.status,
    403,
    `analytics must be restricted to management roles, got ${res.status}`,
  );
});

expectFailure('[A6] the analytics overview must not contain school-B data', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, '/api/v1/analytics/overview', { token: teacher.accessToken });

  assert.equal(res.status, 200);
  expectNoLeak(res.body, [USERS.b.student, CLASSES.b], {
    finding: 'A6',
    label: 'analytics overview',
  });
});

expectFailure('[A11] a school-A teacher must not publish a school-B quiz', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  const res = await put(baseUrl, `/api/v1/classes/${CLASSES.b}/quizzes/${QUIZZES.b}/publish`, {
    token: teacher.accessToken,
  });

  assert.equal(
    res.status,
    403,
    `publishing a foreign quiz must be denied, got ${res.status}`,
  );
});

expectFailure('[A11] a school-A teacher must not read the answer key of a school-B quiz', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, `/api/v1/classes/${CLASSES.b}/quizzes/${QUIZZES.b}`, {
    token: teacher.accessToken,
  });

  assert.equal(res.status, 200);
  const serialized = JSON.stringify(res.body);
  assert.ok(
    !serialized.includes('correct_option'),
    'the answer key of a foreign quiz must not be disclosed',
  );
});

expectFailure('[A12] a student must not read the transcript of another student', async () => {
  const student = await loginAs(baseUrl, 'a', 'student');
  const res = await get(baseUrl, `/api/v1/courses/transcript?student_id=${USERS.b.student}`, {
    token: student.accessToken,
  });

  assert.equal(
    res.status,
    403,
    `reading a foreign transcript must be denied, got ${res.status}`,
  );
});

expectFailure('[A12] a parent must not read the transcript of an unrelated student', async () => {
  const parent = await loginAs(baseUrl, 'a', 'parent');
  const res = await get(baseUrl, `/api/v1/courses/transcript?student_id=${USERS.b.student}`, {
    token: parent.accessToken,
  });

  assert.equal(
    res.status,
    403,
    `reading a foreign transcript must be denied, got ${res.status}`,
  );
});

expectFailure('[A8] a teacher must not reply to a ticket that belongs to another school', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  const res = await post(baseUrl, `/api/v1/tickets/${TICKETS.b}/reply`, {
    token: teacher.accessToken,
    body: { message: 'پاسخ تزریق‌شده' },
  });

  assert.equal(
    res.status,
    403,
    `replying to a foreign ticket must be denied, got ${res.status}`,
  );
});

expectFailure('[A9] a teacher must not read the study diary of a student of another school', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  const res = await get(baseUrl, `/api/v1/study-planner/logs?student_id=${USERS.b.student}`, {
    token: teacher.accessToken,
  });

  assert.equal(res.status, 200);
  expectNoLeak(res.body, ['یادداشت خصوصی دانش‌آموز مدرسه ب'], {
    finding: 'A9',
    label: 'study planner log',
  });
});

expectFailure('[A9] a teacher must not write advisor feedback into a foreign study diary', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  const res = await post(baseUrl, `/api/v1/study-planner/logs/${STUDY_LOGS.b}/feedback`, {
    token: teacher.accessToken,
    body: { advisor_feedback: 'بازخورد تزریق‌شده' },
  });

  assert.equal(
    res.status,
    403,
    `writing advisor feedback into a foreign diary must be denied, got ${res.status}`,
  );
});
