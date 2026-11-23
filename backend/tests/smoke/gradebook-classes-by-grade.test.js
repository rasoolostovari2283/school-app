const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post, put } = require('../support/http');
const db = require('../../src/config/database');
const {
  REPORT_CARD_STATUS_OPTIONS,
  getGradeSortOrder,
  sortClassesByGradeAscending,
  computeThreePartAverage,
  validateReportStatus,
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
  for (const tbl of ['student_report_entries', 'parents', 'students']) {
    try {
      await db(tbl).del();
    } catch (_e) {}
  }
});

// ═══════════════════════════════════════════════════════════════
// 1. PURE UNIT TESTS
// ═══════════════════════════════════════════════════════════════

test('unit: getGradeSortOrder and sortClassesByGradeAscending order classes strictly from smallest grade to largest grade', () => {
  assert.ok(getGradeSortOrder('پیش‌دبستانی ۱') < getGradeSortOrder('پیش‌دبستانی ۲'));
  assert.ok(getGradeSortOrder('پیش‌دبستانی ۲') < getGradeSortOrder('پایه اول'));
  assert.ok(getGradeSortOrder('پایه اول') < getGradeSortOrder('پایه ششم'));
  assert.ok(getGradeSortOrder('پایه ششم') < getGradeSortOrder('پایه دهم'));
  assert.ok(getGradeSortOrder('پایه دهم') < getGradeSortOrder('پایه دوازدهم'));

  const unsorted = [
    { id: 'c4', name: 'حسابان', grade: 'پایه دوازدهم' },
    { id: 'c1', name: 'فارسی', grade: 'پایه اول' },
    { id: 'c3', name: 'فیزیک', grade: 'پایه دهم' },
    { id: 'c0', name: 'آمادگی', grade: 'پیش‌دبستانی ۱' },
    { id: 'c2', name: 'علوم', grade: 'پایه ششم' },
  ];

  const sorted = sortClassesByGradeAscending(unsorted);
  assert.deepEqual(
    sorted.map((c) => c.grade),
    ['پیش‌دبستانی ۱', 'پایه اول', 'پایه ششم', 'پایه دهم', 'پایه دوازدهم']
  );
});

test('unit: computeThreePartAverage calculates exact rounded arithmetic average for full and partial scores', () => {
  assert.equal(
    computeThreePartAverage({ continuous_score: 18, midterm_score: 16.5, final_score: 19.5 }),
    18
  );
  assert.equal(
    computeThreePartAverage({ continuous_score: 17, midterm_score: null, final_score: 19 }),
    18
  );
  assert.equal(
    computeThreePartAverage({ continuous_score: 15.5, midterm_score: '', final_score: undefined }),
    15.5
  );
  assert.equal(
    computeThreePartAverage({ continuous_score: null, midterm_score: null, final_score: null }),
    null
  );
});

test('unit: validateReportStatus allows only the exact 6 official Persian options or empty', () => {
  assert.deepEqual(REPORT_CARD_STATUS_OPTIONS, [
    'قبول',
    'مردود',
    'خیلی خوب',
    'خوب',
    'قابل قبول',
    'نیازمند تلاش بیشتر',
  ]);

  for (const status of REPORT_CARD_STATUS_OPTIONS) {
    assert.deepEqual(validateReportStatus(status), { valid: true, value: status });
  }
  assert.deepEqual(validateReportStatus(''), { valid: true, value: null });
  assert.deepEqual(validateReportStatus(null), { valid: true, value: null });
  assert.equal(validateReportStatus('عالی غیرمجاز').valid, false);
});

// ═══════════════════════════════════════════════════════════════
// 2. END-TO-END HIERARCHICAL INTEGRATION TESTS
//    School -> Teacher -> Classes (Sorted by Grade) -> Students -> Parents
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

test('integration: Teacher grades classes sorted smallest-to-largest grade, auto-calculates average, sets status, and syncs to Student and Parent panels with strict RBAC', async () => {
  // 1. Register two isolated schools
  const schoolA = await registerSchool('دبیرستان هوشمند پایه‌ها الف', '09128111001');
  const schoolB = await registerSchool('دبیرستان هوشمند پایه‌ها ب', '09128111002');

  // 2. Register Teacher in School A
  const teacherRes = await post(baseUrl, '/api/v1/auth/register-teacher', {
    body: {
      full_name: 'استاد سمیرا رضایی',
      phone: '09128112001',
      school_id: schoolA.school.id,
      education_level: 'متوسطه دوم',
      majors: ['ریاضی'],
      taught_grades: ['پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'],
      password: 'Password123!',
    },
  });
  assert.equal(teacherRes.status, 201, JSON.stringify(teacherRes.body));
  const teacherToken = teacherRes.body.data.accessToken;

  // 3. Register Student 1 & Student 2 in School A, and Student B in School B
  const student1Res = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      display_name: 'آرش محمدی',
      phone: '09358113001',
      school_username: `@${schoolA.school.username}`,
      education_level: 'متوسطه دوم',
      major: 'ریاضی',
      grade: 'پایه دهم',
      password: 'Password123!',
    },
  });
  assert.equal(student1Res.status, 201, JSON.stringify(student1Res.body));
  const student1 = student1Res.body.data.user;
  const student1Token = student1Res.body.data.accessToken;

  const student2Res = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      display_name: 'نگار کریمی',
      phone: '09358113002',
      school_username: `@${schoolA.school.username}`,
      education_level: 'متوسطه دوم',
      major: 'ریاضی',
      grade: 'پایه دوازدهم',
      password: 'Password123!',
    },
  });
  assert.equal(student2Res.status, 201, JSON.stringify(student2Res.body));
  const student2 = student2Res.body.data.user;
  const student2Token = student2Res.body.data.accessToken;

  const studentBRes = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      display_name: 'سارا خارجی',
      phone: '09358113003',
      school_username: `@${schoolB.school.username}`,
      education_level: 'متوسطه دوم',
      major: 'تجربی',
      grade: 'پایه دهم',
      password: 'Password123!',
    },
  });
  assert.equal(studentBRes.status, 201, JSON.stringify(studentBRes.body));
  const studentB = studentBRes.body.data.user;

  // 4. Register Parent 1 linked to Student 1, and Parent 2 linked to Student 2 via register-parent
  const parent1Res = await post(baseUrl, '/api/v1/auth/register-parent', {
    body: {
      display_name: 'مهدی محمدی',
      phone: '09128114001',
      school_username: `@${schoolA.school.username}`,
      student_name: 'آرش محمدی',
      student_username: `@${student1.username}`,
      relation_type: 'father',
      relation: 'پدر',
      password: 'Password123!',
    },
  });
  assert.equal(parent1Res.status, 201, JSON.stringify(parent1Res.body));
  const parent1Token = parent1Res.body.data.accessToken;

  const parent2Res = await post(baseUrl, '/api/v1/auth/register-parent', {
    body: {
      display_name: 'زهرا کریمی',
      phone: '09128114002',
      school_username: `@${schoolA.school.username}`,
      student_name: 'نگار کریمی',
      student_username: `@${student2.username}`,
      relation_type: 'mother',
      relation: 'مادر',
      password: 'Password123!',
    },
  });
  assert.equal(parent2Res.status, 201, JSON.stringify(parent2Res.body));
  const parent2Token = parent2Res.body.data.accessToken;

  // 5. Teacher creates 3 classes in deliberately UNSORTED grade order (12th, 1st, 10th)
  const cls12Res = await post(baseUrl, '/api/v1/gradebook/classes-with-scores', {
    token: teacherToken,
    body: {
      name: 'حسابان دوازدهم الف',
      grade: 'پایه دوازدهم',
      subject: 'حسابان',
      entries: [{ student_id: student2.id, score: '' }],
    },
  });
  assert.equal(cls12Res.status, 201, JSON.stringify(cls12Res.body));
  const cls12Id = cls12Res.body.data.class.id;

  const cls1Res = await post(baseUrl, '/api/v1/gradebook/classes-with-scores', {
    token: teacherToken,
    body: {
      name: 'ریاضی اول دبستان',
      grade: 'پایه اول',
      subject: 'ریاضی',
      entries: [{ student_id: student1.id, score: '' }],
    },
  });
  assert.equal(cls1Res.status, 201, JSON.stringify(cls1Res.body));
  const cls1Id = cls1Res.body.data.class.id;

  const cls10Res = await post(baseUrl, '/api/v1/gradebook/classes-with-scores', {
    token: teacherToken,
    body: {
      name: 'فیزیک دهم ریاضی',
      grade: 'پایه دهم',
      subject: 'فیزیک',
      entries: [{ student_id: student1.id, score: '' }],
    },
  });
  assert.equal(cls10Res.status, 201, JSON.stringify(cls10Res.body));
  const cls10Id = cls10Res.body.data.class.id;

  // 6. Teacher calls GET /api/v1/gradebook/classes-by-grade -> strictly smallest to largest grade
  const byGradeRes = await get(baseUrl, '/api/v1/gradebook/classes-by-grade', {
    token: teacherToken,
  });
  assert.equal(byGradeRes.status, 200, JSON.stringify(byGradeRes.body));
  assert.deepEqual(
    byGradeRes.body.data.grade_groups.map((g) => g.grade),
    ['پایه اول', 'پایه دهم', 'پایه دوازدهم']
  );
  assert.deepEqual(byGradeRes.body.data.status_options, REPORT_CARD_STATUS_OPTIONS);

  // Verify hierarchical parent linkage surfaced on Student 1
  const cls1Obj = byGradeRes.body.data.grade_groups[0].classes[0];
  assert.equal(cls1Obj.id, cls1Id);
  assert.equal(cls1Obj.students[0].id, student1.id);
  assert.equal(cls1Obj.students[0].linked_parents.length, 1);
  assert.equal(cls1Obj.students[0].linked_parents[0].full_name, 'مهدی محمدی');

  // 7. Teacher saves 3-part scores (with Persian digits) + status 'خیلی خوب' for Student 1 in cls1
  const saveCls1Res = await put(baseUrl, '/api/v1/gradebook/report-entries', {
    token: teacherToken,
    body: {
      class_id: cls1Id,
      entries: [
        {
          student_id: student1.id,
          continuous_score: '۱۸',
          midterm_score: '16.5',
          final_score: '19.5',
          status: 'خیلی خوب',
        },
      ],
    },
  });
  assert.equal(saveCls1Res.status, 200, JSON.stringify(saveCls1Res.body));
  assert.equal(saveCls1Res.body.data.entries[0].average_score, 18);
  assert.equal(saveCls1Res.body.data.entries[0].status, 'خیلی خوب');

  // Also save a second class for Student 1 with status 'نیازمند تلاش بیشتر'
  const saveCls10Res = await put(baseUrl, '/api/v1/gradebook/report-entries', {
    token: teacherToken,
    body: {
      class_id: cls10Id,
      entries: [
        {
          student_id: student1.id,
          continuous_score: '11',
          midterm_score: '10',
          final_score: '9',
          status: 'نیازمند تلاش بیشتر',
        },
      ],
    },
  });
  assert.equal(saveCls10Res.status, 200, JSON.stringify(saveCls10Res.body));
  assert.equal(saveCls10Res.body.data.entries[0].average_score, 10);

  // Verify direct hierarchical DB persistence in `student_report_entries`
  const dbRow = await db('student_report_entries')
    .where({ class_id: cls1Id, student_id: student1.id })
    .first();
  assert.ok(dbRow, 'Row must exist in student_report_entries');
  assert.equal(dbRow.school_id, schoolA.school.id);
  assert.equal(Number(dbRow.continuous_score), 18);
  assert.equal(Number(dbRow.midterm_score), 16.5);
  assert.equal(Number(dbRow.final_score), 19.5);
  assert.equal(Number(dbRow.average_score), 18);
  assert.equal(dbRow.status, 'خیلی خوب');

  // 8. Student 1 fetches their own Report Card -> sees exact 3 scores, auto-avg, and exact teacher status
  const studentReportRes = await get(baseUrl, '/api/v1/gradebook/report-card', {
    token: student1Token,
  });
  assert.equal(studentReportRes.status, 200, JSON.stringify(studentReportRes.body));
  const studentCard1 = studentReportRes.body.data.reportCards.find((r) => r.class_id === cls1Id);
  assert.ok(studentCard1);
  assert.equal(studentCard1.continuous_score, 18);
  assert.equal(studentCard1.midterm_score, 16.5);
  assert.equal(studentCard1.final_score, 19.5);
  assert.equal(studentCard1.final_average, 18);
  assert.equal(studentCard1.status, 'خیلی خوب');
  assert.equal(studentReportRes.body.data.summary.passed_courses, 1);
  assert.equal(studentReportRes.body.data.summary.failed_courses, 1);

  // 9. Parent 1 fetches Report Card -> sees linked child (Student 1)'s exact scores, average, and status
  const parentReportRes = await get(baseUrl, '/api/v1/gradebook/report-card', {
    token: parent1Token,
  });
  assert.equal(parentReportRes.status, 200, JSON.stringify(parentReportRes.body));
  assert.equal(parentReportRes.body.data.student.id, student1.id);
  const parentCard1 = parentReportRes.body.data.reportCards.find((r) => r.class_id === cls1Id);
  assert.ok(parentCard1);
  assert.equal(parentCard1.continuous_score, 18);
  assert.equal(parentCard1.midterm_score, 16.5);
  assert.equal(parentCard1.final_score, 19.5);
  assert.equal(parentCard1.final_average, 18);
  assert.equal(parentCard1.status, 'خیلی خوب');

  const parentCard10 = parentReportRes.body.data.reportCards.find((r) => r.class_id === cls10Id);
  assert.ok(parentCard10);
  assert.equal(parentCard10.final_average, 10);
  assert.equal(parentCard10.status, 'نیازمند تلاش بیشتر');

  // 10. Strict Security & Validation Checks
  // 10a. Unrelated Parent 2 cannot view Student 1's report card -> 403
  const wrongParentRes = await get(baseUrl, `/api/v1/gradebook/report-card/${student1.id}`, {
    token: parent2Token,
  });
  assert.equal(wrongParentRes.status, 403);

  // 10b. Student 2 cannot view Student 1's report card -> 403
  const wrongStudentRes = await get(baseUrl, `/api/v1/gradebook/report-card/${student1.id}`, {
    token: student2Token,
  });
  assert.equal(wrongStudentRes.status, 403);

  // 10c. Invalid status rejected with 400
  const invalidStatusRes = await put(baseUrl, '/api/v1/gradebook/report-entries', {
    token: teacherToken,
    body: {
      class_id: cls12Id,
      entries: [
        {
          student_id: student2.id,
          continuous_score: 15,
          midterm_score: 15,
          final_score: 15,
          status: 'وضعیت غیرمجاز',
        },
      ],
    },
  });
  assert.equal(invalidStatusRes.status, 400);

  // 10d. Out-of-range score rejected with 400
  const invalidScoreRes = await put(baseUrl, '/api/v1/gradebook/report-entries', {
    token: teacherToken,
    body: {
      class_id: cls12Id,
      entries: [
        {
          student_id: student2.id,
          continuous_score: 25,
          status: 'قبول',
        },
      ],
    },
  });
  assert.equal(invalidScoreRes.status, 400);

  // 10e. Cross-school / non-enrolled student injection rejected with 403
  const crossSchoolRes = await put(baseUrl, '/api/v1/gradebook/report-entries', {
    token: teacherToken,
    body: {
      class_id: cls12Id,
      entries: [
        {
          student_id: studentB.id,
          continuous_score: 19,
          status: 'قبول',
        },
      ],
    },
  });
  assert.equal(crossSchoolRes.status, 403);
});
