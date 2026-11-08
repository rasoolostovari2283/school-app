/**
 * Messaging, announcement, notification and counselling regression tests
 * (Phase 0 safety net).
 *
 *   F4 — cross-school exposure of the messaging directory and group messages
 *   F5 — cross-school announcement visibility
 *   A5 — cross-tenant, system-wide forged broadcast notifications
 *   A7 — cross-tenant discipline and counselling exposure
 */
const { test, expectFailure, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase, db } = require('../support/harness');
const { get, post } = require('../support/http');
const { loginAs } = require('../support/auth');
const { expectNoLeak } = require('../support/assertions');
const { USERS, MESSAGE_GROUPS } = require('../fixtures/twoSchools');

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

expectFailure('[F4] the messaging directory must not expose school-B users', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, '/api/v1/messages/directory', { token: teacher.accessToken });

  assert.equal(res.status, 200);
  expectNoLeak(
    res.body.data,
    [USERS.b.admin, USERS.b.teacher, USERS.b.student, USERS.b.parent],
    { finding: 'F4', label: 'messaging directory' },
  );
});

expectFailure('[F4] the group message history of another school must not be readable', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, `/api/v1/messages/groups/${MESSAGE_GROUPS.b}/messages`, {
    token: teacher.accessToken,
  });

  assert.equal(res.status, 403, `expected 403, got ${res.status}`);
  expectNoLeak(res.body, ['پیام محرمانه گروه مدرسه ب'], {
    finding: 'F4',
    label: 'group message history',
  });
});

expectFailure('[F4] the member list of another school group must not be readable', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, `/api/v1/messages/groups/${MESSAGE_GROUPS.b}/members`, {
    token: teacher.accessToken,
  });

  assert.equal(res.status, 403, `expected 403, got ${res.status}`);
});

expectFailure('[F5] the announcement feed of a school-A student must not contain school-B announcements', async () => {
  const student = await loginAs(baseUrl, 'a', 'student');
  const res = await get(baseUrl, '/api/v1/announcements', { token: student.accessToken });

  assert.equal(res.status, 200);
  const announcements = res.body.data.announcements || [];
  const titles = announcements.map((a) => a.title);
  assert.ok(
    !titles.includes('اطلاعیه مدرسه ب'),
    'a school-A student must not see the school-B announcement',
  );
});

expectFailure('[F5] the school directive feed must not contain school-B directives', async () => {
  const student = await loginAs(baseUrl, 'a', 'student');
  const res = await get(baseUrl, '/api/v1/school/directives', { token: student.accessToken });

  assert.equal(res.status, 200);
  expectNoLeak(res.body, ['اطلاعیه مدرسه ب'], {
    finding: 'F5',
    label: 'school directive feed',
  });
});

expectFailure('[A5] a broadcast must not reach the users of another school', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  const res = await post(baseUrl, '/api/v1/notifications/broadcast', {
    token: teacher.accessToken,
    body: {
      title: 'پیام مدیریت مدرسه الف',
      body: 'این پیام فقط برای مدرسه الف است.',
      target_audience: 'students',
    },
  });
  assert.equal(res.status, 201);

  const leaked = await db('notifications').where({ user_id: USERS.b.student }).first();
  assert.equal(
    leaked,
    undefined,
    'a school-B student must not receive a broadcast sent by a school-A teacher',
  );
});

expectFailure('[A5] a teacher must not be allowed to broadcast to the whole deployment', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  const res = await post(baseUrl, '/api/v1/notifications/broadcast', {
    token: teacher.accessToken,
    body: {
      title: 'پیام جعلی مدیریت',
      body: 'متن جعلی',
      target_audience: 'all',
    },
  });

  assert.equal(
    res.status,
    403,
    `broadcasting must be restricted to administrators, got ${res.status}`,
  );
});

expectFailure('[A7] counselling cases of another school must not be listed', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, '/api/v1/discipline/counseling', { token: teacher.accessToken });

  assert.equal(res.status, 200);
  const sessions = res.body.data.sessions || [];
  const studentIds = sessions.map((s) => s.student_id);
  assert.ok(
    !studentIds.includes(USERS.b.student),
    'a school-A teacher must not see the counselling cases of a school-B student',
  );
});

expectFailure('[A7] discipline records of another school must not be listed', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, '/api/v1/discipline', { token: teacher.accessToken });

  assert.equal(res.status, 200);
  const records = res.body.data.records || [];
  const studentIds = records.map((r) => r.student_id);
  assert.ok(
    !studentIds.includes(USERS.b.student),
    'a school-A teacher must not see the discipline records of a school-B student',
  );
});

expectFailure('[A7] a teacher must not create a counselling record for a student of another school', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  const res = await post(baseUrl, '/api/v1/discipline/counseling', {
    token: teacher.accessToken,
    body: {
      student_id: USERS.b.student,
      session_title: 'پرونده جعلی',
      session_date: '1403/08/01',
      student_concerns: 'متن جعلی',
      counselor_notes: 'متن جعلی',
      recommendations: 'متن جعلی',
    },
  });

  assert.equal(
    res.status,
    403,
    `creating a cross-tenant counselling record must be denied, got ${res.status}`,
  );
});
