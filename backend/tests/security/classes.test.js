/**
 * Class, roster and school-administration regression tests (Phase 0 safety net).
 *
 *   F1  — teachers access or modify classes belonging to other teachers
 *   A13 — cross-tenant deletion of teachers and students
 *   A14 — cross-tenant modification of arbitrary user records
 *   A26 — auto-enrolment side effects manufacture cross-tenant access
 */
const { test, expectFailure, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase, db } = require('../support/harness');
const { get, post, put, del } = require('../support/http');
const { loginAs } = require('../support/auth');
const { expectCrossTenantDenied } = require('../support/assertions');
const { CLASSES, USERS } = require('../fixtures/twoSchools');

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

test('[F1] a school-A teacher must not read a school-B class', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'F1',
    method: 'GET',
    path: `/api/v1/classes/${CLASSES.b}`,
    token: teacher.accessToken,
  });
});

test('[F1] a school-A teacher must not read the roster of a school-B class', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'F1',
    method: 'GET',
    path: `/api/v1/classes/${CLASSES.b}/roster`,
    token: teacher.accessToken,
  });
});

test('[F1] a school-A teacher must not rename a school-B class', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'F1',
    method: 'PUT',
    path: `/api/v1/classes/${CLASSES.b}`,
    token: teacher.accessToken,
    body: { name: 'renamed-by-attacker' },
  });
});

test('[F1] a school-A teacher must not overwrite the live settings of a school-B class', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'F1/F6',
    method: 'PUT',
    path: `/api/v1/classes/${CLASSES.b}/live-settings`,
    token: teacher.accessToken,
    body: {
      live_provider: 'bbb',
      bbb_server_url: 'https://attacker.example',
      bbb_secret: 'attacker-secret',
    },
  });
});

test('[A13] a school-A administrator must not delete a school-B teacher', async () => {
  const admin = await loginAs(baseUrl, 'a', 'admin');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'A13',
    method: 'DELETE',
    path: `/api/v1/school/teachers/${USERS.b.teacher}`,
    token: admin.accessToken,
  });
});

test('[A13] a school-A teacher must not delete a school-B student', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'A13',
    method: 'DELETE',
    path: `/api/v1/school/students/${USERS.b.student}`,
    token: teacher.accessToken,
  });
});

test('[A14] a school-A teacher must not rewrite the record of a school-B user', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  await expectCrossTenantDenied(baseUrl, {
    finding: 'A14',
    method: 'PUT',
    path: `/api/v1/classes/${CLASSES.a}/students/${USERS.b.student}`,
    token: teacher.accessToken,
    body: { display_name: 'rewritten-by-attacker', phone: '09120000000' },
  });
});

test('[A26] a student request must not auto-enrol the student in a foreign class', async () => {
  const student = await loginAs(baseUrl, 'a', 'student');

  await get(baseUrl, `/api/v1/classes/${CLASSES.b}`, { token: student.accessToken });

  const membership = await db('class_members')
    .where({ class_id: CLASSES.b, user_id: USERS.a.student })
    .first();

  assert.equal(
    membership,
    undefined,
    'requesting a foreign class must not create a class_members row',
  );
});

test('[A26] opening a gradebook must not auto-enrol every student of the deployment', async () => {
  const teacherB = await loginAs(baseUrl, 'b', 'teacher');
  const teacherA = await loginAs(baseUrl, 'a', 'teacher');

  // An empty class is the trigger for the gradebook auto-enrolment path.
  const created = await post(baseUrl, '/api/v1/classes', {
    token: teacherB.accessToken,
    body: { name: 'کلاس خالی', subject: 'شیمی', grade: 'پایه دهم' },
  });
  assert.equal(created.status, 201);
  const emptyClassId = created.body.data.class.id;

  await get(baseUrl, `/api/v1/gradebook/classes/${emptyClassId}`, { token: teacherA.accessToken });

  const members = await db('class_members').where({ class_id: emptyClassId }).select('user_id');
  assert.deepEqual(
    members.map((m) => m.user_id),
    [],
    'opening a gradebook must not enrol students in the class',
  );
});
