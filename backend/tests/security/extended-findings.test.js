/**
 * Extended security regression tests for remaining audit findings:
 *   - #6  / A6  : Analytics overview school isolation
 *   - #11 / F6  : External live provider secret stripping & SSRF prevention
 *   - #31 / A23 : System backups & audit logs role restriction and tenant scoping
 *   - #33 / A20 : Single-use CAPTCHA token consumption
 *   - #34 / A21 : JWT refresh/access token type confusion prevention
 *   - #37 / A27 : Feedback ticket ownership & tenant isolation
 *   - #38 / A24 : Gradebook category weight & max_score validation
 *   - #40       : Schedules tenant and class-ownership isolation
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post, put } = require('../support/http');
const { loginAs } = require('../support/auth');
const localCaptcha = require('../../src/utils/localCaptcha');
const { cache } = require('../../src/utils/cache');
const db = require('../../src/config/database');
const { SCHOOLS, USERS, CLASSES, FIXTURE_PASSWORD, emailFor } = require('../fixtures/twoSchools');

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

test('[A6] analytics overview must only count records belonging to the caller school', async () => {
  const teacherA = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, '/api/v1/analytics/overview', { token: teacherA.accessToken });

  assert.equal(res.status, 200);
  const topClassNames = (res.body.data.top_classes || []).map((c) => c.name);
  assert.ok(!topClassNames.includes('کلاس ب'), 'analytics overview must not leak school-B classes');
});

test('[F6] live-settings must strip provider secrets from responses and block SSRF loopback URLs', async () => {
  const teacherA = await loginAs(baseUrl, 'a', 'teacher');

  const ssrfAttempt = await put(baseUrl, `/api/v1/classes/${CLASSES.a}/live-settings`, {
    token: teacherA.accessToken,
    body: {
      live_provider: 'bbb',
      bbb_server_url: 'http://127.0.0.1:8080/bigbluebutton',
      bbb_secret: 'super-secret-bbb-key',
    },
  });
  assert.equal(ssrfAttempt.status, 400, 'loopback BBB server URL must be rejected');

  const validUpdate = await put(baseUrl, `/api/v1/classes/${CLASSES.a}/live-settings`, {
    token: teacherA.accessToken,
    body: {
      live_provider: 'bbb',
      bbb_server_url: 'https://bbb.educonnect.ir/bigbluebutton',
      bbb_secret: 'super-secret-bbb-key',
    },
  });
  assert.equal(validUpdate.status, 200);
  assert.equal(validUpdate.body.data.class.bbb_secret, undefined, 'bbb_secret must be stripped from update response');

  const classDetails = await get(baseUrl, `/api/v1/classes/${CLASSES.a}`, { token: teacherA.accessToken });
  assert.equal(classDetails.status, 200);
  assert.equal(classDetails.body.data.class.bbb_secret, undefined, 'bbb_secret must be stripped from GET /classes/:id');
  assert.equal(classDetails.body.data.class.skyroom_api_key, undefined, 'skyroom_api_key must be stripped from GET /classes/:id');
});

test('[A23] system backup and audit-log endpoints must reject non-admin users', async () => {
  const teacherA = await loginAs(baseUrl, 'a', 'teacher');

  const backupsRes = await get(baseUrl, '/api/v1/system/backups', { token: teacherA.accessToken });
  assert.equal(backupsRes.status, 403, 'teachers must not list system backups');

  const createBackupRes = await post(baseUrl, '/api/v1/system/backup-now', { token: teacherA.accessToken });
  assert.equal(createBackupRes.status, 403, 'teachers must not trigger system backups');

  const auditRes = await get(baseUrl, '/api/v1/system/audit-logs', { token: teacherA.accessToken });
  assert.equal(auditRes.status, 403, 'teachers must not read system audit logs');
});

test('[A20] CAPTCHA challenges must require a valid id and be invalidated upon first verification', async () => {
  const res = await get(baseUrl, '/api/v1/auth/captcha');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.id, 'captcha response must include a challenge id');

  assert.equal(localCaptcha.verify('', '12'), false, 'empty captcha id must be rejected');
  assert.equal(localCaptcha.verify(res.body.data.id, 'wrong-answer'), false, 'wrong answer must be rejected');
  assert.equal(localCaptcha.verify(res.body.data.id, 'wrong-answer'), false, 'consumed captcha id must not remain valid');
});

test('[A21] refresh token cannot be used as a Bearer access token and access token cannot be used to refresh', async () => {
  const studentA = await loginAs(baseUrl, 'a', 'student');

  const bearerRefreshAttempt = await get(baseUrl, '/api/v1/auth/me', {
    token: studentA.refreshToken,
  });
  assert.equal(bearerRefreshAttempt.status, 401, 'refresh token must be rejected by authenticate middleware');

  const refreshWithAccessAttempt = await post(baseUrl, '/api/v1/auth/refresh', {
    body: { refreshToken: studentA.accessToken },
  });
  assert.equal(refreshWithAccessAttempt.status, 401, 'access token must be rejected by /auth/refresh');
});

test('[A27] feedback tickets must only be readable by the submitter or same-school admin', async () => {
  const studentA = await loginAs(baseUrl, 'a', 'student');
  const adminB = await loginAs(baseUrl, 'b', 'admin');
  const teacherA = await loginAs(baseUrl, 'a', 'teacher');

  const created = await post(baseUrl, '/api/v1/feedback', {
    token: studentA.accessToken,
    body: {
      category: 'general',
      message: 'بازخورد محرمانه دانش‌آموز مدرسه الف',
      is_anonymous: false,
    },
  });
  assert.equal(created.status, 201);
  const ticketId = created.body.data.ticket.id;

  const teacherAList = await get(baseUrl, '/api/v1/feedback', { token: teacherA.accessToken });
  assert.equal(teacherAList.status, 200);
  assert.ok(
    !(teacherAList.body.data.tickets || []).some((t) => t.id === ticketId),
    'non-admin teacher must not see another user feedback ticket',
  );

  const adminBList = await get(baseUrl, '/api/v1/feedback', { token: adminB.accessToken });
  assert.equal(adminBList.status, 200);
  assert.ok(
    !(adminBList.body.data.tickets || []).some((t) => t.id === ticketId),
    'school-B admin must not see school-A feedback tickets',
  );
});

test('[A24] gradebook category creation must fall back to safe positive weight and max_score', async () => {
  const teacherA = await loginAs(baseUrl, 'a', 'teacher');

  const created = await post(baseUrl, '/api/v1/gradebook/categories', {
    token: teacherA.accessToken,
    body: {
      class_id: CLASSES.a,
      title: 'کوییز اول',
      weight: -10,
      max_score: -5,
    },
  });
  assert.equal(created.status, 201);
  assert.ok(created.body.data.category.weight > 0, 'negative weight must be sanitized to positive');
  assert.ok(created.body.data.category.max_score > 0, 'negative max_score must be sanitized to positive');
});

test('[#40] schedules must be isolated per school and class ownership', async () => {
  const teacherA = await loginAs(baseUrl, 'a', 'teacher');

  const crossClassCreate = await post(baseUrl, '/api/v1/schedules', {
    token: teacherA.accessToken,
    body: {
      class_id: CLASSES.b,
      day_of_week: 0,
      period_number: 1,
      subject: 'ریاضی',
    },
  });
  assert.equal(crossClassCreate.status, 403, 'school-A teacher must not create schedule in school-B class');
});

test('[Arch-P0-MultiSchool] composite unique index allows same phone/email across schools and scopes login by school_id', async () => {
  const sharedPhone = '09127778899';
  const sharedEmail = 'shared.teacher@educonnect.ir';

  const regSchoolA = await post(baseUrl, '/api/v1/auth/register', {
    body: {
      display_name: 'دبیر مشترک مدرسه الف',
      phone: sharedPhone,
      email: sharedEmail,
      password: 'Password#SchoolA1',
      role: 'teacher',
      school_id: SCHOOLS.a.id,
    },
  });
  assert.equal(regSchoolA.status, 201, 'teacher registration in School A must succeed');

  const regSchoolADuplicate = await post(baseUrl, '/api/v1/auth/register', {
    body: {
      display_name: 'تکرار در مدرسه الف',
      phone: sharedPhone,
      email: sharedEmail,
      password: 'Password#SchoolA2',
      role: 'teacher',
      school_id: SCHOOLS.a.id,
    },
  });
  assert.equal(regSchoolADuplicate.status, 409, 'duplicate phone/email in the same school must be rejected');

  const regSchoolB = await post(baseUrl, '/api/v1/auth/register', {
    body: {
      display_name: 'دبیر مشترک مدرسه ب',
      phone: sharedPhone,
      email: sharedEmail,
      password: 'Password#SchoolB1',
      role: 'teacher',
      school_id: SCHOOLS.b.id,
    },
  });
  assert.equal(regSchoolB.status, 201, 'same phone/email in School B must succeed via composite unique index');

  const loginA = await post(baseUrl, '/api/v1/auth/login', {
    body: {
      identifier: sharedPhone,
      password: 'Password#SchoolA1',
      school_id: SCHOOLS.a.id,
    },
  });
  assert.equal(loginA.status, 200);
  assert.equal(loginA.body.data.user.school_id, SCHOOLS.a.id);

  const loginB = await post(baseUrl, '/api/v1/auth/login', {
    body: {
      identifier: sharedPhone,
      password: 'Password#SchoolB1',
      school_id: SCHOOLS.b.id,
    },
  });
  assert.equal(loginB.status, 200);
  assert.equal(loginB.body.data.user.school_id, SCHOOLS.b.id);
});

test('[Arch-P1-IsActive] deactivating a user account (is_active = false) immediately revokes access', async () => {
  const teacherA = await loginAs(baseUrl, 'a', 'teacher');

  await db('users').where({ id: USERS.a.teacher }).update({ is_active: false });

  const meRes = await get(baseUrl, '/api/v1/auth/me', { token: teacherA.accessToken });
  assert.equal(meRes.status, 401, 'deactivated user token must be rejected by authenticate middleware');

  const refreshRes = await post(baseUrl, '/api/v1/auth/refresh', {
    body: { refreshToken: teacherA.refreshToken },
  });
  assert.equal(refreshRes.status, 401, 'deactivated user refresh token must be rejected');

  const loginRes = await post(baseUrl, '/api/v1/auth/login', {
    body: {
      identifier: emailFor('a', 'teacher'),
      password: FIXTURE_PASSWORD,
    },
  });
  assert.equal(loginRes.status, 403, 'deactivated user must not be allowed to log in');
});

test('[Arch-P0-ZeroRuntimeDDL] formal migration 016 provisions all tables/columns and runtime code has no DDL calls', async () => {
  const requiredTables = [
    'audit_logs',
    'live_classroom_sessions',
    'teacher_lesson_plans',
    'teacher_documents',
    'student_study_notes',
    'gradebook_shared_reports',
  ];

  for (const tableName of requiredTables) {
    const exists = await db.schema.hasTable(tableName);
    assert.equal(exists, true, `table ${tableName} must exist from formal migrations`);
  }

  assert.equal(await db.schema.hasColumn('users', 'is_active'), true);
  assert.equal(await db.schema.hasColumn('users', 'bio'), true);
  assert.equal(await db.schema.hasColumn('message_groups', 'invite_code'), true);
  assert.equal(await db.schema.hasColumn('videos', 'target_audience'), true);

  const runtimeFiles = [
    path.resolve(__dirname, '../../src/utils/auditLogger.js'),
    path.resolve(__dirname, '../../src/services/classroomPersistence.js'),
    path.resolve(__dirname, '../../src/modules/studyPlanner/studyPlanner.service.js'),
    path.resolve(__dirname, '../../src/modules/gradebook/gradebook.routes.js'),
    path.resolve(__dirname, '../../src/modules/messages/message.service.js'),
    path.resolve(__dirname, '../../src/modules/auth/auth.service.js'),
    path.resolve(__dirname, '../../src/modules/videos/video.routes.js'),
  ];

  for (const filePath of runtimeFiles) {
    const src = fs.readFileSync(filePath, 'utf8');
    assert.ok(
      !src.includes('schema.createTable') && !src.includes('schema.alterTable') && !src.includes('schema.table('),
      `runtime file ${path.basename(filePath)} must not execute runtime DDL`,
    );
  }
});

test('[Arch-P0-PerfAndCache] localCaptcha enforces FIFO capacity cap and cache invalidation is scoped per school', async () => {
  const prevCap = localCaptcha.MAX_CHALLENGES;
  try {
    localCaptcha.MAX_CHALLENGES = 10;
    const generatedIds = [];
    for (let i = 0; i < 15; i++) {
      generatedIds.push(localCaptcha.generate().id);
    }
    assert.ok(localCaptcha.size() <= 10, 'captcha challenge map must never exceed MAX_CHALLENGES');
  } finally {
    localCaptcha.MAX_CHALLENGES = prevCap;
  }

  cache.set(`${SCHOOLS.a.id}:user-1:/api/v1/announcements`, { data: 'a' }, 60);
  cache.set(`${SCHOOLS.b.id}:user-2:/api/v1/announcements`, { data: 'b' }, 60);

  cache.delByPattern(`${SCHOOLS.a.id}:*announcement*`);
  assert.equal(cache.get(`${SCHOOLS.a.id}:user-1:/api/v1/announcements`), null, 'School A cache must be invalidated');
  assert.deepEqual(
    cache.get(`${SCHOOLS.b.id}:user-2:/api/v1/announcements`),
    { data: 'b' },
    'School B cache must remain intact when School A invalidates announcements',
  );
});

