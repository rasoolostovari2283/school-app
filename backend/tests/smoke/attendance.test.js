const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post, put } = require('../support/http');
const { loginAs } = require('../support/auth');
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

test('smoke: a teacher opens an attendance session for their class', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await post(baseUrl, `/api/v1/classes/${CLASSES.a}/attendance/sessions`, {
    token: teacher.accessToken,
    body: { duration_minutes: 15 },
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.data.session.class_id, CLASSES.a);
  assert.equal(res.body.data.session.status, 'active');
});

test('smoke: an enrolled student checks in and the teacher reads the report', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const student = await loginAs(baseUrl, 'a', 'student');

  const created = await post(baseUrl, `/api/v1/classes/${CLASSES.a}/attendance/sessions`, {
    token: teacher.accessToken,
    body: { duration_minutes: 15 },
  });
  const sessionId = created.body.data.session.id;

  const checkIn = await post(
    baseUrl,
    `/api/v1/classes/${CLASSES.a}/attendance/sessions/${sessionId}/check-in`,
    { token: student.accessToken },
  );
  assert.equal(checkIn.status, 200);
  assert.equal(checkIn.body.data.record.student_id, USERS.a.student);
  assert.equal(checkIn.body.data.record.status, 'present');

  const report = await get(
    baseUrl,
    `/api/v1/classes/${CLASSES.a}/attendance/sessions/${sessionId}/report`,
    { token: teacher.accessToken },
  );
  assert.equal(report.status, 200);
  assert.ok(Array.isArray(report.body.data.students));
  assert.ok(report.body.data.students.some((s) => s.student_id === USERS.a.student));
});

test('smoke: a teacher records a student status manually', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  const created = await post(baseUrl, `/api/v1/classes/${CLASSES.a}/attendance/sessions`, {
    token: teacher.accessToken,
    body: { duration_minutes: 15 },
  });
  const sessionId = created.body.data.session.id;

  const recorded = await post(
    baseUrl,
    `/api/v1/classes/${CLASSES.a}/attendance/sessions/${sessionId}/record`,
    {
      token: teacher.accessToken,
      body: { student_id: USERS.a.student, status: 'late' },
    },
  );
  assert.equal(recorded.status, 200);
  assert.equal(recorded.body.data.record.status, 'late');
});

test('smoke: a teacher closes an attendance session', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  const created = await post(baseUrl, `/api/v1/classes/${CLASSES.a}/attendance/sessions`, {
    token: teacher.accessToken,
    body: { duration_minutes: 15 },
  });
  const sessionId = created.body.data.session.id;

  const closed = await put(
    baseUrl,
    `/api/v1/classes/${CLASSES.a}/attendance/sessions/${sessionId}/close`,
    { token: teacher.accessToken },
  );
  assert.equal(closed.status, 200);
  assert.equal(closed.body.data.session.status, 'closed');
});

test('smoke: a student sees the attendance history of their class', async () => {
  const student = await loginAs(baseUrl, 'a', 'student');
  const res = await get(baseUrl, `/api/v1/classes/${CLASSES.a}/attendance/history`, {
    token: student.accessToken,
  });

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.sessions));
});
