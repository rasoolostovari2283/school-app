/**
 * Gradebook regression tests (Phase 0 safety net).
 *
 *   F3 — missing ownership checks in the gradebook operations
 */
const { test, expectFailure, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post } = require('../support/http');
const { loginAs } = require('../support/auth');
const { expectCrossTenantDenied } = require('../support/assertions');
const { CLASSES, GRADEBOOK_CATEGORIES, USERS } = require('../fixtures/twoSchools');

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

expectFailure('[F3] a school-A student must not read the gradebook of a school-B class', async () => {
  const student = await loginAs(baseUrl, 'a', 'student');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'F3',
    method: 'GET',
    path: `/api/v1/gradebook/classes/${CLASSES.b}`,
    token: student.accessToken,
  });
});

expectFailure('[F3] a school-A teacher must not read the gradebook of a school-B class', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'F3',
    method: 'GET',
    path: `/api/v1/gradebook/classes/${CLASSES.b}`,
    token: teacher.accessToken,
  });
});

expectFailure('[F3] a school-A teacher must not write a score into a school-B category', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'F3',
    method: 'POST',
    path: '/api/v1/gradebook/scores',
    token: teacher.accessToken,
    body: {
      category_id: GRADEBOOK_CATEGORIES.b,
      student_id: USERS.b.student,
      score: 20,
    },
  });
});

expectFailure('[F3] a school-A teacher must not delete a school-B evaluation category', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'F3',
    method: 'DELETE',
    path: `/api/v1/gradebook/categories/${GRADEBOOK_CATEGORIES.b}`,
    token: teacher.accessToken,
  });
});

expectFailure('[F3] a school-A teacher must not read the report card of a school-B student', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'F3',
    method: 'GET',
    path: `/api/v1/gradebook/report-card/${USERS.b.student}`,
    token: teacher.accessToken,
  });
});

test('[F3] the gradebook of a school-A class is readable by the school-A teacher', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, `/api/v1/gradebook/classes/${CLASSES.a}`, {
    token: teacher.accessToken,
  });

  assert.equal(res.status, 200);
});
