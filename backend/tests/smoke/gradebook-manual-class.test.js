const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post } = require('../support/http');
const {
  parseScoreValue,
  rankStudentSuggestions,
  validateManualClassPayload,
} = require('../../src/utils/gradebookClassHelper');

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

// ═══════════════════════════════════════════════════════════════
// 1. PURE UNIT TESTS (gradebookClassHelper)
// ═══════════════════════════════════════════════════════════════

test('unit: parseScoreValue parses Persian/English decimals and rejects out-of-range values', () => {
  assert.deepEqual(parseScoreValue('۱۸.۵', 20), { valid: true, isEmpty: false, value: 18.5 });
  assert.deepEqual(parseScoreValue('19/25', 20), { valid: true, isEmpty: false, value: 19.25 });
  assert.deepEqual(parseScoreValue('', 20), { valid: true, isEmpty: true, value: null });
  assert.equal(parseScoreValue('21', 20).valid, false);
  assert.equal(parseScoreValue('-2', 20).valid, false);
  assert.equal(parseScoreValue('abc', 20).valid, false);
});

test('unit: rankStudentSuggestions ranks exact/prefix/word-start Persian and @username matches', () => {
  const pool = [
    { id: '1', display_name: 'رضا محمدی', username: 'reza_m', student_code: '1001' },
    { id: '2', display_name: 'کیانوش کریمی', username: 'kianoush_k', student_code: '1002' },
    { id: '3', display_name: 'سارا کیانی', username: 'sara_k', student_code: '1003' },
  ];

  const byPrefix = rankStudentSuggestions(pool, 'كيان');
  assert.equal(byPrefix.length, 2);
  assert.equal(byPrefix[0].id, '2'); // prefix match ranks before word-start match
  assert.equal(byPrefix[1].id, '3');

  const byHandle = rankStudentSuggestions(pool, '@reza_m');
  assert.equal(byHandle.length, 1);
  assert.equal(byHandle[0].id, '1');
});

test('unit: validateManualClassPayload requires DB student_id, validates scores, and deduplicates students', () => {
  const validRes = validateManualClassPayload({
    name: 'فیزیک دهم ریاضی',
    grade: 'پایه دهم',
    subject: 'فیزیک',
    category_title: 'آزمون میان‌ترم',
    entries: [
      { student_id: 'st-1', score: '۱۸.۵' },
      { student_id: 'st-1', score: '19' }, // duplicate ignored
      { student_id: 'st-2', score: '' },
    ],
  });
  assert.equal(validRes.valid, true);
  assert.equal(validRes.data.entries.length, 2);
  assert.equal(validRes.data.entries[0].score, 18.5);
  assert.equal(validRes.data.entries[1].score, null);

  // Rejects missing student_id (unlinked free-text student)
  const missingLink = validateManualClassPayload({
    name: 'کلاس تست',
    entries: [{ student_id: '', score: '18' }],
  });
  assert.equal(missingLink.valid, false);

  // Rejects out-of-range score
  const badScore = validateManualClassPayload({
    name: 'کلاس تست',
    entries: [{ student_id: 'st-1', score: '25' }],
  });
  assert.equal(badScore.valid, false);
});

// ═══════════════════════════════════════════════════════════════
// 2. INTEGRATION TESTS (Autocomplete + Manual Class Creation + Student Report Card)
// ═══════════════════════════════════════════════════════════════

async function registerSchool(name, mobile) {
  const res = await post(baseUrl, '/api/v1/auth/register-school', {
    body: {
      school_name: name,
      city: 'تهران',
      education_level: 'متوسطه دوم',
      majors: ['تجربی', 'ریاضی'],
      principal_name: `مدیر ${name}`,
      principal_phone: mobile,
      password: 'Password123!',
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

test('integration: Teacher searches school DB students, creates class with manual scores, and students see scores in their Report Cards', async () => {
  const schoolA = await registerSchool('دبیرستان کارنامه الف', '09128001001');
  const schoolB = await registerSchool('دبیرستان کارنامه ب', '09128001002');

  const teacherRes = await post(baseUrl, '/api/v1/auth/register-teacher', {
    body: {
      full_name: 'استاد نادری ریاضی',
      phone: '09128002001',
      school_id: schoolA.school.id,
      education_level: 'متوسطه دوم',
      majors: ['ریاضی'],
      taught_grades: ['پایه دهم'],
      password: 'Password123!',
    },
  });
  assert.equal(teacherRes.status, 201);
  const teacherToken = teacherRes.body.data.accessToken;

  const st1Res = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      full_name: 'کیانوش کریمی',
      phone: '09128003001',
      school_id: schoolA.school.id,
      education_level: 'متوسطه دوم',
      major: 'ریاضی',
      grade: 'پایه دهم',
      password: 'Password123!',
    },
  });
  assert.equal(st1Res.status, 201);
  const st1 = st1Res.body.data.user;
  const st1Token = st1Res.body.data.accessToken;

  const st2Res = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      full_name: 'مریم محمدی',
      phone: '09128003002',
      school_id: schoolA.school.id,
      education_level: 'متوسطه دوم',
      major: 'ریاضی',
      grade: 'پایه دهم',
      password: 'Password123!',
    },
  });
  assert.equal(st2Res.status, 201);
  const st2 = st2Res.body.data.user;
  const st2Token = st2Res.body.data.accessToken;

  const otherSchoolStRes = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      full_name: 'کیانوش مدرسه دیگر',
      phone: '09128003003',
      school_id: schoolB.school.id,
      education_level: 'متوسطه دوم',
      major: 'تجربی',
      grade: 'پایه دهم',
      password: 'Password123!',
    },
  });
  assert.equal(otherSchoolStRes.status, 201);
  const otherSchoolSt = otherSchoolStRes.body.data.user;

  // 1) Autocomplete search returns ONLY same-school matching student
  const searchRes = await get(baseUrl, '/api/v1/gradebook/students/search?q=%DA%A9%DB%8C%D8%A7%D9%86', {
    token: teacherToken,
  });
  assert.equal(searchRes.status, 200);
  const suggestions = searchRes.body.data.students;
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].id, st1.id);
  assert.equal(suggestions[0].display_name, 'کیانوش کریمی');

  // 2) Cross-school student injection is blocked (403)
  const crossRes = await post(baseUrl, '/api/v1/gradebook/classes-with-scores', {
    token: teacherToken,
    body: {
      name: 'کلاس غیرمجاز',
      grade: 'پایه دهم',
      subject: 'ریاضی',
      entries: [{ student_id: otherSchoolSt.id, score: '20' }],
    },
  });
  assert.equal(crossRes.status, 403);

  // 3) Teacher creates manual class + scores for Student 1 & Student 2
  const createRes = await post(baseUrl, '/api/v1/gradebook/classes-with-scores', {
    token: teacherToken,
    body: {
      name: 'ریاضی دهم — کلاس ۱۰۵',
      grade: 'پایه دهم',
      subject: 'ریاضیات',
      category_title: 'آزمون فصل اول',
      entries: [
        { student_id: st1.id, score: '۱۸.۵', teacher_comment: 'عالی' },
        { student_id: st2.id, score: '19.25', teacher_comment: 'بسیار خوب' },
      ],
    },
  });
  assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
  const createdClass = createRes.body.data.class;
  assert.equal(createRes.body.data.enrolled_count, 2);
  assert.equal(createRes.body.data.scores_saved, 2);

  // 4) Class appears in teacher's DB class list & gradebook matrix
  const classesRes = await get(baseUrl, '/api/v1/classes', { token: teacherToken });
  assert.equal(classesRes.status, 200);
  assert.ok(
    classesRes.body.data.classes.some(
      (c) => c.id === createdClass.id && c.name === createdClass.name && c.students_count === 2
    ),
    `Expected ${createdClass.id} in ${JSON.stringify(classesRes.body)}`
  );

  const gbRes = await get(baseUrl, `/api/v1/gradebook/classes/${createdClass.id}`, { token: teacherToken });
  assert.equal(gbRes.status, 200);
  const st1Row = gbRes.body.data.students.find((s) => s.id === st1.id);
  const st2Row = gbRes.body.data.students.find((s) => s.id === st2.id);
  assert.equal(st1Row.weightedAverage, 18.5);
  assert.equal(st2Row.weightedAverage, 19.25);

  // 5) Student 1 logs into their panel & sees exact score in their Report Card
  const st1Report = await get(baseUrl, '/api/v1/gradebook/report-card', { token: st1Token });
  assert.equal(st1Report.status, 200);
  assert.equal(st1Report.body.data.summary.school_name, 'دبیرستان کارنامه الف');
  const mathCard = st1Report.body.data.reportCards.find((r) => r.class_id === createdClass.id);
  assert.ok(mathCard, 'Student 1 report card must include the manually created class');
  assert.equal(mathCard.final_average, 18.5);
  assert.equal(mathCard.breakdowns[0].title, 'آزمون فصل اول');
  assert.equal(mathCard.breakdowns[0].score, 18.5);

  // 6) Student 1 cannot read Student 2's report card (403)
  const forbiddenReport = await get(baseUrl, `/api/v1/gradebook/report-card/${st2.id}`, { token: st1Token });
  assert.equal(forbiddenReport.status, 403);

  // 7) Student 2 sees their own score (19.25)
  const st2Report = await get(baseUrl, '/api/v1/gradebook/report-card', { token: st2Token });
  assert.equal(st2Report.status, 200);
  const st2Card = st2Report.body.data.reportCards.find((r) => r.class_id === createdClass.id);
  assert.equal(st2Card.final_average, 19.25);
});
