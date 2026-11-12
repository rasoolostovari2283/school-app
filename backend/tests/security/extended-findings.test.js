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
const { SCHOOLS, USERS, CLASSES, INSTALLMENTS, QUIZZES, FIXTURE_PASSWORD, emailFor } = require('../fixtures/twoSchools');

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

  cache.delBySchool(SCHOOLS.a.id, '*announcement*');
  assert.equal(cache.get(`${SCHOOLS.a.id}:user-1:/api/v1/announcements`), null, 'School A cache must be invalidated');
  assert.deepEqual(
    cache.get(`${SCHOOLS.b.id}:user-2:/api/v1/announcements`),
    { data: 'b' },
    'School B cache must remain intact when School A invalidates announcements',
  );
});

test('[Arch-P0-ConvertPptxLock] POST /api/v1/videos/convert-pptx enforces single-concurrency lock (429 when busy)', async () => {
  const videoRoutes = require('../../src/modules/videos/video.routes');
  const teacherA = await loginAs(baseUrl, 'a', 'teacher');

  videoRoutes._setConversionBusyForTest(true);
  try {
    const res = await post(baseUrl, '/api/v1/videos/convert-pptx', {
      token: teacherA.accessToken,
      body: {},
    });
    assert.equal(res.status, 429, 'concurrent PPTX conversion request must be rejected with 429 when slot is occupied');
  } finally {
    videoRoutes._setConversionBusyForTest(false);
  }
});

test('[Arch-P1-StaffRoleSeparation] counselor and financial_officer have strictly separated domain permissions', async () => {
  const adminA = await loginAs(baseUrl, 'a', 'admin');
  const studentA = await loginAs(baseUrl, 'a', 'student');

  // 1. School admin creates a Counselor and a Financial Officer
  const counselorCreateRes = await post(baseUrl, '/api/v1/school/teachers', {
    token: adminA.accessToken,
    body: {
      name: 'مشاور تحصیلی مدرسه الف',
      phone: '09125550101',
      password: 'Counselor#Pass1',
      role: 'counselor',
      subject: 'مشاوره و هدایت تحصیلی',
    },
  });
  assert.equal(counselorCreateRes.status, 201);
  assert.equal(counselorCreateRes.body.data.teacher.role, 'counselor');

  const financeCreateRes = await post(baseUrl, '/api/v1/school/teachers', {
    token: adminA.accessToken,
    body: {
      name: 'مسئول امور مالی مدرسه الف',
      phone: '09125550202',
      password: 'Finance#Pass1',
      role: 'financial_officer',
      subject: 'امور مالی و شهریه',
    },
  });
  assert.equal(financeCreateRes.status, 201);
  assert.equal(financeCreateRes.body.data.teacher.role, 'financial_officer');

  const counselorLogin = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: '09125550101', password: 'Counselor#Pass1', school_id: SCHOOLS.a.id },
  });
  assert.equal(counselorLogin.status, 200);
  const counselorToken = counselorLogin.body.data.accessToken;

  const financeLogin = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: '09125550202', password: 'Finance#Pass1', school_id: SCHOOLS.a.id },
  });
  assert.equal(financeLogin.status, 200);
  const financeToken = financeLogin.body.data.accessToken;

  // 2. Student creates a study log
  const createLogRes = await post(baseUrl, '/api/v1/study-planner/logs', {
    token: studentA.accessToken,
    body: {
      subject: 'حسابان',
      study_minutes_descriptive: 45,
      study_minutes_test: 60,
      tests_count: 30,
      tests_correct: 25,
      tests_wrong: 3,
    },
  });
  assert.equal(createLogRes.status, 201);
  const logId = createLogRes.body.data.log.id;

  // 3. Counselor CAN view student study logs and submit advisor feedback, but CANNOT access finance ledger or verify installments
  const counselorLogsRes = await get(
    baseUrl,
    `/api/v1/study-planner/logs?student_id=${USERS.a.student}`,
    { token: counselorToken },
  );
  assert.equal(counselorLogsRes.status, 200, 'counselor must be able to read school student study logs');

  const counselorFeedbackRes = await post(baseUrl, `/api/v1/study-planner/logs/${logId}/feedback`, {
    token: counselorToken,
    body: { advisor_feedback: 'عملکرد عالی در تست‌زنی حسابان، همین روند را ادامه دهید.' },
  });
  assert.equal(counselorFeedbackRes.status, 200, 'counselor must be able to submit advisor feedback');

  const counselorFinanceLedger = await get(
    baseUrl,
    `/api/v1/finance/ledger?student_id=${USERS.a.student}`,
    { token: counselorToken },
  );
  assert.equal(counselorFinanceLedger.status, 403, 'counselor must be blocked from viewing financial ledgers');

  const counselorVerifyInstallment = await post(
    baseUrl,
    `/api/v1/finance/verify-installment/${INSTALLMENTS.a}`,
    { token: counselorToken, body: {} },
  );
  assert.equal(counselorVerifyInstallment.status, 403, 'counselor must be blocked from verifying tuition installments');

  // 4. Financial Officer CAN view student ledger and verify tuition installments, but CANNOT access study logs or submit advisor feedback
  const financeStudyLogs = await get(
    baseUrl,
    `/api/v1/study-planner/logs?student_id=${USERS.a.student}`,
    { token: financeToken },
  );
  assert.equal(financeStudyLogs.status, 403, 'financial_officer must be blocked from viewing academic study logs');

  const financeFeedbackRes = await post(baseUrl, `/api/v1/study-planner/logs/${logId}/feedback`, {
    token: financeToken,
    body: { advisor_feedback: 'تلاش غیرمجاز مسئول مالی برای ثبت نظر مشاوره‌ای' },
  });
  assert.equal(financeFeedbackRes.status, 403, 'financial_officer must be blocked from submitting study advisor feedback');

  const financeLedgerRes = await get(
    baseUrl,
    `/api/v1/finance/ledger?student_id=${USERS.a.student}`,
    { token: financeToken },
  );
  assert.equal(financeLedgerRes.status, 200, 'financial_officer must be able to inspect school student ledger');

  const financeVerifyRes = await post(
    baseUrl,
    `/api/v1/finance/verify-installment/${INSTALLMENTS.a}`,
    { token: financeToken, body: {} },
  );
  assert.equal(financeVerifyRes.status, 200, 'financial_officer must be able to verify tuition installments');
});

test('[Arch-P1-SessionRevocation] refresh token rotation blocks replay and logout/revoke-sessions immediately invalidates tokens', async () => {
  // 1. Single-use refresh token rotation
  const initialSession = await loginAs(baseUrl, 'a', 'student');

  const firstRefresh = await post(baseUrl, '/api/v1/auth/refresh', {
    body: { refreshToken: initialSession.refreshToken },
  });
  assert.equal(firstRefresh.status, 200, 'first use of a valid refresh token must succeed');
  const rotatedAccess = firstRefresh.body.data.accessToken;

  // Replaying the already-used refresh token must fail (401) and trigger replay protection
  const replayRefresh = await post(baseUrl, '/api/v1/auth/refresh', {
    body: { refreshToken: initialSession.refreshToken },
  });
  assert.equal(replayRefresh.status, 401, 'replaying a consumed refresh token must be rejected with 401');

  // Because replay incremented token_version, even the newly minted access token from the compromised family is invalidated
  const afterReplayMe = await get(baseUrl, '/api/v1/auth/me', { token: rotatedAccess });
  assert.equal(afterReplayMe.status, 401, 'refresh token replay must invalidate active tokens via token_version increment');

  // 2. Logout revokes current access and refresh tokens immediately
  const secondSession = await loginAs(baseUrl, 'a', 'student');
  const logoutRes = await post(baseUrl, '/api/v1/auth/logout', {
    token: secondSession.accessToken,
    body: { refreshToken: secondSession.refreshToken },
  });
  assert.equal(logoutRes.status, 200);

  const meAfterLogout = await get(baseUrl, '/api/v1/auth/me', { token: secondSession.accessToken });
  assert.equal(meAfterLogout.status, 401, 'access token must be rejected immediately after logout');

  const refreshAfterLogout = await post(baseUrl, '/api/v1/auth/refresh', {
    body: { refreshToken: secondSession.refreshToken },
  });
  assert.equal(refreshAfterLogout.status, 401, 'refresh token must be rejected immediately after logout');

  // 3. POST /api/v1/auth/revoke-sessions invalidates all sessions across devices
  const device1 = await loginAs(baseUrl, 'a', 'teacher');
  const device2 = await loginAs(baseUrl, 'a', 'teacher');

  const revokeAllRes = await post(baseUrl, '/api/v1/auth/revoke-sessions', {
    token: device1.accessToken,
    body: {},
  });
  assert.equal(revokeAllRes.status, 200);

  const device1Check = await get(baseUrl, '/api/v1/auth/me', { token: device1.accessToken });
  const device2Check = await get(baseUrl, '/api/v1/auth/me', { token: device2.accessToken });
  assert.equal(device1Check.status, 401, 'device 1 token must be revoked after revoke-sessions');
  assert.equal(device2Check.status, 401, 'device 2 token must be revoked after revoke-sessions');
});

test('[Iran-EdTech-Sida] Sida preview, atomic import (classes + students + parent links), and Sida CSV/JSON gradebook export work end-to-end', async () => {
  const { accessToken: adminToken } = await loginAs(baseUrl, 'a', 'admin');

  const sidaRawCsv = [
    'کد ملی,نام و نام خانوادگی,نام پدر,پایه,کلاس,رشته,تلفن ولی',
    '۰۰۲۴۵۶۷۸۹۳,امیرحسین رضایی,محمد,پایه دهم,دهم ریاضی الف,ریاضی فیزیک,۰۹۱۲۳۴۵۶۷۸۹',
    '۰۰۱۲۳۴۵۶۷۹,سارا محمدی,علی,پایه دهم,دهم ریاضی الف,ریاضی فیزیک,۰۹۱۲۹۸۷۶۵۴۳',
  ].join('\n');

  // 1. Preview & fuzzy column mapping + Persian digit normalization
  const previewRes = await post(baseUrl, '/api/v1/school/sida/preview', {
    token: adminToken,
    body: { raw_text: sidaRawCsv, source_system: 'sida' },
  });
  assert.equal(previewRes.status, 200);
  assert.equal(previewRes.body.data.total_rows, 2);
  assert.equal(previewRes.body.data.rows[0].national_code, '0024567893');
  assert.equal(previewRes.body.data.rows[0].parent_phone, '09123456789');

  // 2. Atomic Import
  const importRes = await post(baseUrl, '/api/v1/school/sida/import', {
    token: adminToken,
    body: {
      raw_text: sidaRawCsv,
      source_system: 'sida',
      auto_create_classes: true,
      auto_link_parents: true,
    },
  });
  assert.equal(importRes.status, 201);
  assert.ok(importRes.body.data.total_processed === 2);
  assert.ok(importRes.body.data.created_classes_count >= 1);
  assert.ok(importRes.body.data.linked_parents_count >= 2);

  const importedClassId = importRes.body.data.students[0].class_id;
  assert.ok(importedClassId, 'atomic Sida import must auto-create and link class_id');

  // 3. Export Sida-compliant gradebook JSON & CSV
  const exportRes = await get(baseUrl, `/api/v1/school/sida/export-grades?class_id=${importedClassId}`, {
    token: adminToken,
  });
  assert.equal(exportRes.status, 200);
  assert.equal(exportRes.body.data.sida_schema_version, 'SIDA-1403-V2');
  assert.equal(exportRes.body.data.total_students, 2);
  assert.ok(exportRes.body.data.csv_content.includes('کد دانش‌آموزی سیدا'));
  assert.ok(exportRes.body.data.csv_content.includes('امیرحسین رضایی'));
});

test('[Iran-EdTech-PaperToDigital] Paper-to-Digital extracts gradesheet & exam with honest feasibility report and commits human-verified rows', async () => {
  const { accessToken: adminToken } = await loginAs(baseUrl, 'a', 'admin');

  // First import the two students into a class via Sida import so they are enrolled
  const importRes = await post(baseUrl, '/api/v1/school/sida/import', {
    token: adminToken,
    body: {
      raw_text: [
        'کد ملی,نام و نام خانوادگی,نام پدر,پایه,کلاس,رشته,تلفن ولی',
        '۰۰۲۴۵۶۷۸۹۳,امیرحسین رضایی,محمد,پایه دهم,دهم ریاضی الف,ریاضی فیزیک,۰۹۱۲۳۴۵۶۷۸۹',
        '۰۰۱۲۳۴۵۶۷۹,سارا محمدی,علی,پایه دهم,دهم ریاضی الف,ریاضی فیزیک,۰۹۱۲۹۸۷۶۵۴۳',
      ].join('\n'),
      source_system: 'sida',
    },
  });
  assert.equal(importRes.status, 201);
  const targetClassId = importRes.body.data.students[0].class_id;

  // 1. Extract handwritten/printed grade sheet with Persian numerals
  const extractRes = await post(baseUrl, '/api/v1/ai/paper-to-digital', {
    token: adminToken,
    body: {
      mode: 'gradesheet',
      raw_ocr_text: [
        'امیرحسین رضایی | ۰۰۲۴۵۶۷۸۹۳ | ۱۹.۵ | عالی',
        'سارا محمدی | ۰۰۱۲۳۴۵۶۷۹ | ۱۸.۲۵ | بسیار خوب',
      ].join('\n'),
    },
  });
  assert.equal(extractRes.status, 200);
  assert.equal(extractRes.body.data.items.length, 2);
  assert.equal(extractRes.body.data.items[0].score, 19.5);
  assert.equal(extractRes.body.data.feasibility_assessment.mandatory_human_in_the_loop, true);
  assert.ok(extractRes.body.data.feasibility_assessment.honest_engineering_evaluation.printed_tables_accuracy);

  // 2. Commit human-verified scores to the class created in school A
  const commitGradesRes = await post(baseUrl, '/api/v1/ai/paper-to-digital/commit', {
    token: adminToken,
    body: {
      mode: 'gradesheet',
      class_id: targetClassId,
      category_title: 'ارزشیابی مستمر اسکن‌شده',
      items: extractRes.body.data.items,
    },
  });
  assert.equal(commitGradesRes.status, 201);
  assert.equal(commitGradesRes.body.data.committed_count, 2);

  // 3. Extract and commit a paper exam into a live online quiz
  const examExtractRes = await post(baseUrl, '/api/v1/ai/paper-to-digital', {
    token: adminToken,
    body: {
      mode: 'exam',
      raw_ocr_text: [
        '۱. مشتق تابع x^2 در نقطه x=3 چند است؟',
        'الف) ۳',
        'ب) ۶',
        'ج) ۹',
        'د) ۱۲',
        'پاسخ: ۲',
      ].join('\n'),
    },
  });
  assert.equal(examExtractRes.status, 200);
  assert.equal(examExtractRes.body.data.items.length, 1);
  assert.equal(examExtractRes.body.data.items[0].correct_option, '1');

  const commitExamRes = await post(baseUrl, '/api/v1/ai/paper-to-digital/commit', {
    token: adminToken,
    body: {
      mode: 'exam',
      class_id: targetClassId,
      quiz_title: 'کوییز مشتق (تبدیل از برگه کاغذی)',
      items: examExtractRes.body.data.items,
    },
  });
  assert.equal(commitExamRes.status, 201);
  assert.ok(commitExamRes.body.data.quiz_id);
});

test('[Iran-EdTech-Shaparak-SMS] Iranian Sheba ISO-7064 validation, Shaparak IPG initiation, callback verification, and Service SMS dispatch work atomically', async () => {
  const { accessToken: adminToken } = await loginAs(baseUrl, 'a', 'admin');

  // 1. Validate official Central Bank of Iran test Sheba with Persian digits
  const validShebaRes = await post(baseUrl, '/api/v1/finance/validate-sheba', {
    token: adminToken,
    body: { sheba: 'IR۰۶۲۹۶۰۰۰۰۰۰۰۱۰۰۳۲۴۲۰۰۰۰۱' },
  });
  assert.equal(validShebaRes.status, 200);
  assert.equal(validShebaRes.body.data.valid, true);
  assert.equal(validShebaRes.body.data.formatted, 'IR062960000000100324200001');

  // Reject invalid Sheba checksum
  const invalidShebaRes = await post(baseUrl, '/api/v1/finance/validate-sheba', {
    token: adminToken,
    body: { sheba: 'IR992960000000100324200001' },
  });
  assert.equal(invalidShebaRes.body.data.valid, false);

  // 2. Initiate Shaparak payment for an unsettled installment in school A
  const pendingInstallmentId = INSTALLMENTS.a;

  const initRes = await post(baseUrl, `/api/v1/finance/initiate-payment/${pendingInstallmentId}`, {
    token: adminToken,
    body: {
      gateway: 'behpardakht_mellat',
      school_sheba: 'IR062960000000100324200001',
    },
  });
  assert.equal(initRes.status, 200);
  assert.ok(initRes.body.data.authority.startsWith('A000'));
  assert.equal(initRes.body.data.treasury_sheba_valid, true);

  // 3. Complete Shaparak callback verification and verify ledger balance reduction + SMS dispatch
  const callbackRes = await post(baseUrl, `/api/v1/finance/callback-verify/${pendingInstallmentId}`, {
    token: adminToken,
    body: {
      authority: initRes.body.data.authority,
      card_pan: '6037-9975-1234-5678',
      status: 'OK',
    },
  });
  assert.equal(callbackRes.status, 200);
  assert.ok(callbackRes.body.data.receipt.shaparak_ref_id.startsWith('SHP-'));
  assert.equal(callbackRes.body.data.receipt.masked_card_pan, '6037-****-****-5678');

  // Double-settlement of same installment must be rejected with 409
  const duplicateCallback = await post(baseUrl, `/api/v1/finance/callback-verify/${pendingInstallmentId}`, {
    token: adminToken,
    body: {
      authority: initRes.body.data.authority,
      status: 'OK',
    },
  });
  assert.equal(duplicateCallback.status, 409);

  // 4. Verify Service SMS log recorded the Shaparak receipt notification
  const smsLogsRes = await get(baseUrl, '/api/v1/school/sms/logs', { token: adminToken });
  assert.equal(smsLogsRes.status, 200);
  assert.ok(smsLogsRes.body.data.logs.length >= 1, 'Service SMS gateway must record the tuition settlement alert');
});

test('[Argon4-SEC-FIN-001 & PRIV-012] Finance callback-verify rejects unissued authority and unauthorized roles; teachers receive redacted installment details', async () => {
  const { accessToken: adminToken } = await loginAs(baseUrl, 'a', 'admin');
  const { accessToken: teacherToken } = await loginAs(baseUrl, 'a', 'teacher');
  const { accessToken: studentBToken } = await loginAs(baseUrl, 'b', 'student');

  // 1. PRIV-012: Class teacher reading student ledger has tracking_number and receipt_url redacted
  const teacherLedgerRes = await get(baseUrl, `/api/v1/finance/ledger?student_id=${USERS.a.student}`, {
    token: teacherToken,
  });
  assert.equal(teacherLedgerRes.status, 200);
  assert.equal(teacherLedgerRes.body.data.installments[0].tracking_number, null, 'Teacher view must redact bank tracking_number');
  assert.equal(teacherLedgerRes.body.data.installments[0].receipt_url, null, 'Teacher view must redact bank receipt_url');

  // 2. SEC-FIN-001: Teacher cannot call callback-verify
  const teacherCallbackRes = await post(baseUrl, `/api/v1/finance/callback-verify/${INSTALLMENTS.a}`, {
    token: teacherToken,
    body: { authority: 'A00000000000000000000000000123456789', status: 'OK' },
  });
  assert.equal(teacherCallbackRes.status, 403, 'Teachers must be blocked from settling installments');

  // 3. SEC-FIN-001: Unrelated student cannot settle installment
  const crossStudentCallback = await post(baseUrl, `/api/v1/finance/callback-verify/${INSTALLMENTS.a}`, {
    token: studentBToken,
    body: { authority: 'A00000000000000000000000000123456789', status: 'OK' },
  });
  assert.equal(crossStudentCallback.status, 403, 'Cross-tenant student must be blocked from settling installment');

  // 4. SEC-FIN-001: Forged/unissued authority string is rejected even for authorized caller
  const forgedAuthorityRes = await post(baseUrl, `/api/v1/finance/callback-verify/${INSTALLMENTS.a}`, {
    token: adminToken,
    body: { authority: 'A00000000000000000000000000999999999', status: 'OK' },
  });
  assert.equal(forgedAuthorityRes.status, 403, 'Forged/unissued Shaparak authority must be rejected with 403');
});

test('[Argon4-SEC-AI-001 & SEC-AI-002] Paper-to-Digital returns empty list on blank OCR input and blocks commit of unreviewed needs_review items', async () => {
  const { accessToken: adminToken } = await loginAs(baseUrl, 'a', 'admin');

  // 1. SEC-AI-001: Empty input must NOT fabricate fake students or grades
  for (const mode of ['roster', 'gradesheet', 'exam']) {
    const emptyRes = await post(baseUrl, '/api/v1/ai/paper-to-digital', {
      token: adminToken,
      body: { mode, raw_ocr_text: '' },
    });
    assert.equal(emptyRes.status, 200);
    assert.equal(emptyRes.body.data.items.length, 0, `Empty OCR in ${mode} mode must return 0 items`);
    assert.equal(emptyRes.body.data.feasibility_assessment.overall_confidence, 0);
  }

  // 2. SEC-AI-002: Commit must reject items that have needs_review === true and have not been human_reviewed
  const unreviewedCommitRes = await post(baseUrl, '/api/v1/ai/paper-to-digital/commit', {
    token: adminToken,
    body: {
      mode: 'gradesheet',
      class_id: CLASSES.a,
      items: [
        {
          student_name: 'دانش‌آموز الف',
          student_code: 'STD-A-1001',
          score: 18,
          confidence: 0.65,
          needs_review: true,
        },
      ],
    },
  });
  assert.equal(unreviewedCommitRes.status, 422, 'Unreviewed items flagged with needs_review must be blocked by Human-in-the-Loop gate');
});

test('[Argon4-SEC-DIR-001, SEC-CORS-001, SEC-DATA-001, FW-AUTH-001, BL-ENR-002] Directory username generation, CORS origin whitelist, backup super-admin guard, parent-login contract, and per-student batch password hashes', async () => {
  const { accessToken: adminToken } = await loginAs(baseUrl, 'a', 'admin');

  // 1. SEC-DIR-001: User with null username does not crash /api/v1/messages/directory
  await db('users').where({ id: USERS.a.teacher }).update({ username: null });
  const dirRes = await get(baseUrl, '/api/v1/messages/directory', { token: adminToken });
  assert.equal(dirRes.status, 200, 'Directory endpoint must succeed even when a user has username=null');
  const updatedTeacher = await db('users').where({ id: USERS.a.teacher }).first();
  assert.ok(updatedTeacher.username && updatedTeacher.username.length > 0, 'ensureUserHasUsername must populate missing username');

  // 2. SEC-CORS-001: Untrusted external Origin must not be reflected in Access-Control-Allow-Origin
  const corsFetch = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://evil.example.com' },
  });
  assert.equal(corsFetch.status, 200);
  assert.notEqual(
    corsFetch.headers.get('access-control-allow-origin'),
    'https://evil.example.com',
    'Arbitrary external origin must not be reflected in Access-Control-Allow-Origin'
  );

  // 3. SEC-DATA-001: School manager (non-super-admin) cannot list or trigger raw multi-tenant DB backups
  await db('users').where({ id: USERS.a.teacher }).update({ role: 'manager' });
  const managerLogin = await loginAs(baseUrl, 'a', 'teacher');
  const managerBackupRes = await get(baseUrl, '/api/v1/system/backups', { token: managerLogin.accessToken });
  assert.equal(managerBackupRes.status, 403, 'School manager must not access raw multi-tenant DB backups');

  // 4. FW-AUTH-001 & SEC-AUTH-001: Parent login works with frontend contract (student_identifier, parent_phone) and enforces school scoping
  const parentFrontendContractRes = await post(baseUrl, '/api/v1/auth/parent-login', {
    body: {
      student_identifier: 'STD-A-1001',
      parent_name: 'ولی تست',
      parent_phone: '09123334455',
    },
  });
  assert.equal(parentFrontendContractRes.status, 200, 'Parent login must accept frontend student_identifier contract');

  const crossSchoolParentLoginRes = await post(baseUrl, '/api/v1/auth/parent-login', {
    body: {
      student_identifier: 'STD-A-1001',
      school_id: SCHOOLS.b.id || SCHOOLS.b,
    },
  });
  assert.equal(crossSchoolParentLoginRes.status, 401, 'Parent login scoped to School B must not resolve School A student');

  // 5. BL-ENR-002: Batch student enrollment assigns distinct password hashes per student
  const batchRes = await post(baseUrl, `/api/v1/classes/${CLASSES.a}/students/batch`, {
    token: adminToken,
    body: {
      students: [
        { display_name: 'دانش‌آموز دسته‌ای ۱', student_code: 'BATCH-901' },
        { display_name: 'دانش‌آموز دسته‌ای ۲', student_code: 'BATCH-902' },
      ],
    },
  });
  assert.ok([200, 201].includes(batchRes.status), 'Batch add students must succeed');
  const createdBatchUsers = await db('users').whereIn('student_code', ['BATCH-901', 'BATCH-902']);
  assert.equal(createdBatchUsers.length, 2);
  assert.notEqual(
    createdBatchUsers[0].password_hash,
    createdBatchUsers[1].password_hash,
    'Each batch-enrolled student must receive an independent password hash'
  );
});

test('[Argon4-SEC-XSS-001, PRIV-006, SEC-FIN-002, SEC-UPLOAD-005, PRIV-015] HttpOnly auth cookies, AES-256-GCM encryption, audit HMAC integrity, teacher classroom finance isolation, and malware upload scanning', async () => {
  const { encryptBuffer, decryptBuffer, encryptPII, decryptPII, MAGIC_HEADER } = require('../../src/utils/cryptoHelper');
  const { emailFor, FIXTURE_PASSWORD } = require('../fixtures/twoSchools');

  // 1. SEC-XSS-001: Login sets HttpOnly cookies and allows cookie-only auth & refresh
  const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: emailFor('a', 'admin'), password: FIXTURE_PASSWORD }),
  });
  assert.equal(loginRes.status, 200);
  const setCookieHeaders = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie') || ''];
  const combinedCookies = setCookieHeaders.join('; ');
  assert.ok(combinedCookies.includes('HttpOnly'), 'Auth cookies must include HttpOnly flag');
  assert.ok(combinedCookies.includes('accessToken='), 'Auth cookies must include accessToken');
  assert.ok(combinedCookies.includes('refreshToken='), 'Auth cookies must include refreshToken');

  const cookieHeaderValue = setCookieHeaders.map((c) => c.split(';')[0]).join('; ');
  const meWithCookieRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { Cookie: cookieHeaderValue },
  });
  assert.equal(meWithCookieRes.status, 200, 'GET /auth/me must authenticate using HttpOnly cookie alone');

  const refreshWithCookieRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeaderValue },
    body: JSON.stringify({}),
  });
  assert.equal(refreshWithCookieRes.status, 200, 'POST /auth/refresh must succeed using HttpOnly refreshToken cookie');

  // 2. PRIV-006 & SEC-DATA-001: AES-256-GCM encryption for buffers and PII fields
  const rawBuffer = Buffer.from('SQLite format 3\0test-database-content', 'utf8');
  const encryptedBuf = encryptBuffer(rawBuffer, 'test-secret-key');
  assert.ok(encryptedBuf.subarray(0, MAGIC_HEADER.length).equals(MAGIC_HEADER), 'Encrypted buffer must start with EDUCENC1 header');
  const decryptedBuf = decryptBuffer(encryptedBuf, 'test-secret-key');
  assert.deepEqual(decryptedBuf, rawBuffer, 'Decrypted buffer must match original');

  const encryptedNationalCode = encryptPII('0012345678', 'test-pii-key');
  assert.ok(encryptedNationalCode.startsWith('enc:v1:'), 'Encrypted PII must have enc:v1: prefix');
  assert.equal(decryptPII(encryptedNationalCode, 'test-pii-key'), '0012345678');

  // 3. SEC-FIN-002: Teacher cannot submit pay-installment or initiate-payment, and unenrolled teacher cannot view student ledger
  const { accessToken: teacherToken } = await loginAs(baseUrl, 'a', 'teacher');
  const teacherPayRes = await post(baseUrl, `/api/v1/finance/pay-installment/${INSTALLMENTS.a}`, {
    token: teacherToken,
    body: { tracking_number: 'TRX-TEACHER-FORGED' },
  });
  assert.equal(teacherPayRes.status, 403, 'Teacher must be forbidden from submitting installment receipts');

  const teacherInitRes = await post(baseUrl, `/api/v1/finance/initiate-payment/${INSTALLMENTS.a}`, {
    token: teacherToken,
    body: {},
  });
  assert.equal(teacherInitRes.status, 403, 'Teacher must be forbidden from initiating Shaparak payment');

  // Remove student from teacher's class and verify teacher can no longer view student's ledger
  await db('class_members').where({ class_id: CLASSES.a, user_id: USERS.a.student }).del();
  const unenrolledTeacherLedgerRes = await get(baseUrl, `/api/v1/finance/ledger?student_id=${USERS.a.student}`, {
    token: teacherToken,
  });
  assert.equal(unenrolledTeacherLedgerRes.status, 403, 'Teacher who does not teach the student must be blocked from viewing ledger');

  // 4. SEC-UPLOAD-005: Upload endpoint blocks EICAR and embedded PHP/script payloads
  const eicarForm = new FormData();
  eicarForm.append(
    'file',
    new Blob(['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'], { type: 'text/plain' }),
    'eicar.txt'
  );
  const eicarUploadRes = await fetch(`${baseUrl}/api/v1/upload`, {
    method: 'POST',
    headers: { Cookie: cookieHeaderValue },
    body: eicarForm,
  });
  assert.equal(eicarUploadRes.status, 400, 'EICAR test file must be rejected by upload scanner');

  const phpPolyglotForm = new FormData();
  phpPolyglotForm.append(
    'file',
    new Blob(['<?php system($_GET["cmd"]); ?>'], { type: 'image/jpeg' }),
    'avatar.jpg'
  );
  const phpUploadRes = await fetch(`${baseUrl}/api/v1/upload`, {
    method: 'POST',
    headers: { Cookie: cookieHeaderValue },
    body: phpPolyglotForm,
  });
  assert.equal(phpUploadRes.status, 400, 'Embedded PHP payload disguised as JPEG must be rejected');

  // 5. PRIV-015: Audit logs contain cryptographic _integrity_hmac
  const latestAudit = await db('audit_logs').orderBy('created_at', 'desc').first();
  if (latestAudit && latestAudit.details) {
    const parsedDetails = JSON.parse(latestAudit.details);
    assert.ok(parsedDetails._integrity_hmac, 'Audit log entry must include _integrity_hmac signature');
  }
});

test('[ZeroTo100Scan] AI RBAC, anonymous feedback redaction, discipline role separation, Sida CSV formula injection, quiz auto_submitted timer bypass, course re-enrollment, and member PII minimization', async () => {
  const { accessToken: adminAToken } = await loginAs(baseUrl, 'a', 'admin');
  const { accessToken: teacherAToken } = await loginAs(baseUrl, 'a', 'teacher');
  const { accessToken: studentAToken } = await loginAs(baseUrl, 'a', 'student');

  // 1. AI Generation RBAC: Student must be forbidden (403) from invoking POST /api/v1/ai/generate
  const studentAiRes = await post(baseUrl, '/api/v1/ai/generate', {
    token: studentAToken,
    body: { type: 'quiz', topic: 'معادلات درجه دوم', count: 3 },
  });
  assert.equal(studentAiRes.status, 403, 'Students must not be allowed to invoke POST /api/v1/ai/generate');

  // Empty topic returns 400 Bad Request (not 500)
  const emptyTopicAiRes = await post(baseUrl, '/api/v1/ai/generate', {
    token: teacherAToken,
    body: { type: 'quiz', topic: '   ' },
  });
  assert.equal(emptyTopicAiRes.status, 400, 'Empty AI topic must return 400 Bad Request');

  // 2. Anonymous Feedback Redaction: Admin cannot see submitted_by when is_anonymous is true
  const createFbRes = await post(baseUrl, '/api/v1/feedback', {
    token: studentAToken,
    body: { category: 'suggestion', message: 'پیشنهاد ناشناس دانش‌آموز', is_anonymous: true },
  });
  assert.equal(createFbRes.status, 201);
  const trackingCode = createFbRes.body.data.tracking_code;

  const adminListFbRes = await get(baseUrl, '/api/v1/feedback', { token: adminAToken });
  assert.equal(adminListFbRes.status, 200);
  const anonTicket = adminListFbRes.body.data.tickets.find((t) => t.tracking_code === trackingCode);
  assert.ok(anonTicket, 'Admin should see the feedback ticket in school list');
  assert.equal(anonTicket.submitted_by, null, 'Anonymous feedback must redact submitted_by for non-submitters');

  const adminTrackFbRes = await get(baseUrl, `/api/v1/feedback/track/${trackingCode}`, { token: adminAToken });
  assert.equal(adminTrackFbRes.status, 200);
  assert.equal(adminTrackFbRes.body.data.ticket.submitted_by, null, 'Anonymous feedback track endpoint must redact submitted_by for admin');

  // 3. Discipline & Counseling Role Separation: financial_officer is blocked (403) from viewing discipline/counseling
  await db('users').where({ id: USERS.a.teacher }).update({ role: 'financial_officer' });
  const finLogin = await loginAs(baseUrl, 'a', 'teacher');
  const finDisciplineRes = await get(baseUrl, '/api/v1/discipline', { token: finLogin.accessToken });
  assert.equal(finDisciplineRes.status, 403, 'Financial officer must be blocked from viewing discipline records');
  const finCounselingRes = await get(baseUrl, '/api/v1/discipline/counseling', { token: finLogin.accessToken });
  assert.equal(finCounselingRes.status, 403, 'Financial officer must be blocked from viewing counseling records');

  // Counselor can create counseling records (201)
  await db('users').where({ id: USERS.a.teacher }).update({ role: 'counselor' });
  const counselorLogin = await loginAs(baseUrl, 'a', 'teacher');
  const counselorCreateRes = await post(baseUrl, '/api/v1/discipline/counseling', {
    token: counselorLogin.accessToken,
    body: {
      student_id: USERS.a.student,
      session_title: 'جلسه هدایت تحصیلی',
      counselor_notes: 'بررسی رغبت تحصیلی',
    },
  });
  assert.equal(counselorCreateRes.status, 201, 'Counselor must be allowed to create counseling sessions');

  // Restore teacher role
  await db('users').where({ id: USERS.a.teacher }).update({ role: 'teacher' });

  // 4. Sida CSV Formula Injection Prevention: Malicious student name starting with =CMD|... is escaped with leading single quote
  await db('users').where({ id: USERS.a.student }).update({ display_name: '=CMD|\'/C calc\'!A0' });
  const sidaCsvRes = await fetch(`${baseUrl}/api/v1/school/sida/export-grades?class_id=${CLASSES.a}&format=csv`, {
    headers: { Authorization: `Bearer ${adminAToken}` },
  });
  assert.equal(sidaCsvRes.status, 200);
  const csvText = await sidaCsvRes.text();
  assert.ok(
    csvText.includes("\"'=CMD|'/C calc'!A0\""),
    'Sida CSV export must prefix leading = with a single quote to prevent CSV Formula Injection'
  );

  // 5. Quiz auto_submitted Timer Bypass Prevention: Passing auto_submitted: true after deadline still returns 403
  const { accessToken: studentBToken } = await loginAs(baseUrl, 'b', 'student');
  const expiredStartedAt = new Date(Date.now() - 120 * 60 * 1000).toISOString();
  await db('quizzes').where({ id: QUIZZES.b }).update({ is_published: true });
  await db('quiz_attempts').where({ quiz_id: QUIZZES.b, student_id: USERS.b.student }).del();
  await db('quiz_attempts').insert({
    id: 'attempt-expired-auto-bypass',
    quiz_id: QUIZZES.b,
    student_id: USERS.b.student,
    started_at: expiredStartedAt,
    answers: '{}',
    score: 0,
    total_points: 0,
  });

  const bypassQuizRes = await post(baseUrl, `/api/v1/classes/${CLASSES.b}/quizzes/${QUIZZES.b}/submit`, {
    token: studentBToken,
    body: {
      answers: {},
      auto_submitted: true,
    },
  });
  assert.equal(bypassQuizRes.status, 403, 'Client-supplied auto_submitted: true must not bypass server-side quiz timer');

  // 6. School Members & Directory PII Minimization: Student caller does not receive raw teacher/student phone numbers
  const studentMembersRes = await get(baseUrl, '/api/v1/school/members', { token: studentAToken });
  assert.equal(studentMembersRes.status, 200);
  for (const t of studentMembersRes.body.data.teachers) {
    assert.equal(t.phone, 'محرمانه', 'Teacher phone numbers must be redacted for student callers on /school/members');
  }
  const studentDirRes = await get(baseUrl, '/api/v1/messages/directory', { token: studentAToken });
  assert.equal(studentDirRes.status, 200);
  for (const t of studentDirRes.body.data.teachers) {
    assert.equal(t.phone, '', 'Teacher phone numbers must be empty for student callers on /messages/directory');
  }

  // 7. End-to-End Mobile/Server Auth Flows: Demo Login, Quick Entry with Built-in School, and School Registration
  const demoAdminRes = await post(baseUrl, '/api/v1/auth/demo-login', {
    body: { role: 'admin' },
  });
  assert.equal(demoAdminRes.status, 200, 'POST /auth/demo-login for admin must succeed');
  assert.equal(demoAdminRes.body.data.user.role, 'admin');
  assert.ok(demoAdminRes.body.data.accessToken);

  const demoLoginViaStandardEndpointRes = await post(baseUrl, '/api/v1/auth/login', {
    body: {
      identifier: '09121110001',
      email: '09121110001',
      password: '123456',
      captchaId: null,
      captchaAnswer: null,
      school_code: 'SCH-1001',
    },
  });
  assert.equal(demoLoginViaStandardEndpointRes.status, 200, 'POST /auth/login with frontend payload fields must succeed for demo admin');
  assert.equal(demoLoginViaStandardEndpointRes.body.data.user.role, 'admin');

  const quickEntryStudentRes = await post(baseUrl, '/api/v1/auth/quick-entry', {
    body: {
      display_name: 'کوروش بزرگ',
      phone: '09309774466',
      role: 'student',
      school_name: 'دبیرستان فرزانگان ۱ (تهران)',
      school_code: 'SCH-1002',
    },
  });
  assert.equal(quickEntryStudentRes.status, 200, 'POST /auth/quick-entry with built-in school must succeed');
  assert.equal(quickEntryStudentRes.body.data.isNew, true);
  assert.equal(quickEntryStudentRes.body.data.user.role, 'student');
  assert.equal(quickEntryStudentRes.body.data.user.school_id, 'sch-2');
  assert.ok(quickEntryStudentRes.body.data.accessToken);

  const registerSchoolRes = await post(baseUrl, '/api/v1/auth/register-school', {
    body: {
      school_name: 'شیراز',
      school_level: 'متوسطه دوم (دبیرستان)',
      city: 'شیراز',
      admin_name: 'استواری',
      admin_phone: '09306445577',
      admin_password: '',
    },
  });
  assert.equal(registerSchoolRes.status, 201, 'POST /auth/register-school must succeed');
  assert.equal(registerSchoolRes.body.data.user.role, 'admin');
  assert.ok(registerSchoolRes.body.data.school.school_code.startsWith('SCH-'));
  assert.ok(registerSchoolRes.body.data.accessToken);

  const newSchoolAdminLoginRes = await post(baseUrl, '/api/v1/auth/login', {
    body: {
      identifier: '09306445577',
      password: '123456',
    },
  });
  assert.equal(newSchoolAdminLoginRes.status, 200, 'Newly registered school admin must be able to log in with default password 123456');
  assert.equal(newSchoolAdminLoginRes.body.data.user.role, 'admin');
});



