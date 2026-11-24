const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post, put } = require('../support/http');
const db = require('../../src/config/database');
const { computeClassGradeStats } = require('../../src/utils/gradebookClassHelper');

let baseUrl;

before(async () => {
  ({ baseUrl } = await setupHarness());
});

after(async () => {
  await teardownHarness();
});

beforeEach(async () => {
  await resetDatabase();
  for (const tbl of [
    'announcement_acknowledgements',
    'announcements',
    'student_report_entries',
    'gradebook_scores',
    'gradebook_categories',
    'parents',
    'students',
  ]) {
    try {
      await db(tbl).del();
    } catch (_e) {}
  }
});

async function registerSchool(name, mobile) {
  const res = await post(baseUrl, '/api/v1/auth/register-school', {
    body: {
      school_name: name,
      city: 'تهران',
      education_level: 'متوسطه دوم',
      majors: ['ریاضی', 'تجربی'],
      principal_name: `مدیر ${name}`,
      principal_phone: mobile,
      password: 'Password123!',
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function registerTeacher({ schoolId, fullName, phone }) {
  const res = await post(baseUrl, '/api/v1/auth/register-teacher', {
    body: {
      full_name: fullName,
      phone,
      school_id: schoolId,
      education_level: 'متوسطه دوم',
      majors: ['ریاضی'],
      taught_grades: ['پایه دهم', 'پایه یازدهم'],
      password: 'Password123!',
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function registerStudent({ schoolUsername, displayName, phone, grade }) {
  const res = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      display_name: displayName,
      phone,
      school_username: `@${schoolUsername}`,
      education_level: 'متوسطه دوم',
      major: 'ریاضی',
      grade,
      password: 'Password123!',
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function registerParent({ schoolUsername, displayName, phone, studentName, studentUsername, relationType = 'father', relation = 'پدر' }) {
  const res = await post(baseUrl, '/api/v1/auth/register-parent', {
    body: {
      display_name: displayName,
      phone,
      school_username: `@${schoolUsername}`,
      student_name: studentName,
      student_username: `@${studentUsername}`,
      relation_type: relationType,
      relation,
      password: 'Password123!',
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

// ═══════════════════════════════════════════════════════════════
// 1. UNIT TEST — 4 Auto-Calculated Class Stat Boxes
// ═══════════════════════════════════════════════════════════════

test('unit: computeClassGradeStats computes total_students, class_average, highest_score, and pass_rate accurately', () => {
  const stats = computeClassGradeStats([19, 11, 15], { totalStudents: 4, passThreshold: 12 });
  assert.equal(stats.total_students, 4);
  assert.equal(stats.graded_count, 3);
  assert.equal(stats.class_average, 15);
  assert.equal(stats.highest_score, 19);
  assert.equal(stats.pass_rate, 67);

  const emptyStats = computeClassGradeStats([], { totalStudents: 5 });
  assert.equal(emptyStats.total_students, 5);
  assert.equal(emptyStats.graded_count, 0);
  assert.equal(emptyStats.class_average, null);
  assert.equal(emptyStats.highest_score, null);
  assert.equal(emptyStats.pass_rate, 0);
});

// ═══════════════════════════════════════════════════════════════
// 2. REQUEST A — Add Exam + Scores, 4 Auto Stats, Student/Parent Personal View, Direct Manager Overview
// ═══════════════════════════════════════════════════════════════

test('integration: Teacher adds exam with scores -> auto 4 stats -> Student & Parent personal panels -> Direct classified Manager overview with strict school isolation', async () => {
  const schoolA = await registerSchool('دبیرستان علامه الف', '09128220001');
  const schoolB = await registerSchool('دبیرستان علامه ب', '09128220002');

  const managerAToken = schoolA.accessToken;
  const managerBToken = schoolB.accessToken;

  const teacherA = await registerTeacher({
    schoolId: schoolA.school.id,
    fullName: 'استاد بهرام ریاضی',
    phone: '09128220011',
  });
  const teacherAToken = teacherA.accessToken;

  const student1 = await registerStudent({
    schoolUsername: schoolA.school.username,
    displayName: 'سینا محمدی',
    phone: '09358220021',
    grade: 'پایه دهم',
  });
  const student2 = await registerStudent({
    schoolUsername: schoolA.school.username,
    displayName: 'آرش کریمی',
    phone: '09358220022',
    grade: 'پایه دهم',
  });

  const parent1 = await registerParent({
    schoolUsername: schoolA.school.username,
    displayName: 'حمید محمدی',
    phone: '09128220031',
    studentName: 'سینا محمدی',
    studentUsername: student1.user.username,
    relationType: 'father',
    relation: 'پدر',
  });

  // Create class with both students enrolled
  const createClsRes = await post(baseUrl, '/api/v1/gradebook/classes-with-scores', {
    token: teacherAToken,
    body: {
      name: 'ریاضی دهم ۱',
      grade: 'پایه دهم',
      subject: 'ریاضیات',
      entries: [
        { student_id: student1.user.id, score: '' },
        { student_id: student2.user.id, score: '' },
      ],
    },
  });
  assert.equal(createClsRes.status, 201, JSON.stringify(createClsRes.body));
  const classId = createClsRes.body.data.class.id;

  // Teacher records a brand new exam with scores for both students
  const examRes = await post(baseUrl, '/api/v1/gradebook/exams-with-scores', {
    token: teacherAToken,
    body: {
      class_id: classId,
      title: 'آزمون فصل دوم ریاضی',
      max_score: 20,
      weight: 1,
      entries: [
        { student_id: student1.user.id, score: 19, teacher_comment: 'بسیار عالی' },
        { student_id: student2.user.id, score: 11, teacher_comment: 'نیاز به تمرین بیشتر' },
      ],
    },
  });
  assert.equal(examRes.status, 201, JSON.stringify(examRes.body));

  // Assert exact 4 auto-calculated stats
  const stats = examRes.body.data.stats;
  assert.equal(stats.total_students, 2);
  assert.equal(stats.class_average, 15);
  assert.equal(stats.highest_score, 19);
  assert.equal(stats.pass_rate, 50);

  // Student 1 sees their personal exam score (19) and NOT Student 2's score
  const st1ReportRes = await get(baseUrl, '/api/v1/gradebook/report-card', {
    token: student1.accessToken,
  });
  assert.equal(st1ReportRes.status, 200, JSON.stringify(st1ReportRes.body));
  const st1Exam = st1ReportRes.body.data.examScores.find(
    (e) => e.exam_title === 'آزمون فصل دوم ریاضی'
  );
  assert.ok(st1Exam, 'Student 1 must see personal exam score immediately');
  assert.equal(Number(st1Exam.score), 19);
  assert.equal(st1Exam.teacher_comment, 'بسیار عالی');

  // Parent 1 sees their child's exact personal exam score (19)
  const par1ReportRes = await get(baseUrl, '/api/v1/gradebook/report-card', {
    token: parent1.accessToken,
  });
  assert.equal(par1ReportRes.status, 200, JSON.stringify(par1ReportRes.body));
  const par1Exam = par1ReportRes.body.data.examScores.find(
    (e) => e.exam_title === 'آزمون فصل دوم ریاضی'
  );
  assert.ok(par1Exam, 'Parent 1 must see child personal exam score immediately');
  assert.equal(Number(par1Exam.score), 19);

  // Student 1 and Parent 1 must receive automatic personal notifications for the recorded exam
  const st1Notifs = await db('notifications')
    .where({ user_id: student1.user.id })
    .orderBy('created_at', 'desc');
  assert.ok(
    st1Notifs.some((n) => String(n.title || '').includes('آزمون فصل دوم ریاضی') && String(n.body || '').includes('19')),
    `Student 1 must receive automatic personal exam notification, got: ${JSON.stringify(st1Notifs)}`
  );

  const par1Notifs = await db('notifications')
    .where({ user_id: parent1.user.id })
    .orderBy('created_at', 'desc');
  assert.ok(
    par1Notifs.some((n) => String(n.title || '').includes('آزمون فصل دوم ریاضی') && String(n.body || '').includes('19')),
    `Parent 1 must receive automatic personal exam notification for child, got: ${JSON.stringify(par1Notifs)}`
  );

  // School A Manager sees Teacher A -> Class -> Exam + Scores + per-exam & class 4 stats DIRECTLY
  const mgrARes = await get(baseUrl, '/api/v1/gradebook/manager-overview', {
    token: managerAToken,
  });
  assert.equal(mgrARes.status, 200, JSON.stringify(mgrARes.body));
  const mgrTeachers = mgrARes.body.data.teachers;
  assert.equal(mgrTeachers.length, 1);
  assert.equal(mgrTeachers[0].teacher_name, 'استاد بهرام ریاضی');
  const mgrClass = mgrTeachers[0].classes.find((c) => c.id === classId);
  assert.ok(mgrClass, 'Manager must see teacher class directly');
  const mgrExamCat = mgrClass.categories.find((cat) => cat.title === 'آزمون فصل دوم ریاضی');
  assert.ok(mgrExamCat, 'Manager must see the new exam column');
  assert.ok(mgrExamCat.stats, 'Manager exam category must include per-exam 4 stats');
  assert.equal(mgrExamCat.stats.total_students, 2);
  assert.equal(mgrExamCat.stats.class_average, 15);
  assert.equal(mgrExamCat.stats.highest_score, 19);
  assert.equal(mgrExamCat.stats.pass_rate, 50);

  assert.equal(mgrClass.stats.total_students, 2);
  assert.equal(mgrClass.stats.class_average, 15);
  assert.equal(mgrClass.stats.highest_score, 19);
  assert.equal(mgrClass.stats.pass_rate, 50);

  // Save a report entry (18) and then add a second exam (14): verify average reflects ALL recorded exams (not shadowed by stale report_entries)
  const entryRes = await put(baseUrl, '/api/v1/gradebook/report-entries', {
    token: teacherAToken,
    body: {
      class_id: classId,
      entries: [
        { student_id: student1.user.id, continuous_score: 18, status: 'قبول' },
      ],
    },
  });
  assert.equal(entryRes.status, 200, JSON.stringify(entryRes.body));

  const secondExamRes = await post(baseUrl, '/api/v1/gradebook/exams-with-scores', {
    token: teacherAToken,
    body: {
      class_id: classId,
      title: 'آزمون فصل سوم ریاضی',
      max_score: 20,
      weight: 1,
      entries: [
        { student_id: student1.user.id, score: 14, teacher_comment: 'خوب' },
        { student_id: student2.user.id, score: 16, teacher_comment: 'پیشرفت عالی' },
      ],
    },
  });
  assert.equal(secondExamRes.status, 201, JSON.stringify(secondExamRes.body));

  const st1UpdatedReport = await get(baseUrl, '/api/v1/gradebook/report-card', {
    token: student1.accessToken,
  });
  assert.equal(st1UpdatedReport.status, 200);
  const st1Course = st1UpdatedReport.body.data.reportCards.find((c) => c.class_id === classId);
  assert.ok(st1Course, 'Course must exist in updated report card');
  // Student 1 has 3 scores in gradebook_scores: 19, 18 (continuous), 14 -> avg = 17
  assert.equal(Number(st1Course.final_average), 17);

  // School B Manager MUST NOT see School A's teachers or grades (strict school isolation)
  const mgrBRes = await get(baseUrl, '/api/v1/gradebook/manager-overview', {
    token: managerBToken,
  });
  assert.equal(mgrBRes.status, 200);
  assert.equal(mgrBRes.body.data.teachers.length, 0);

  // Non-manager (Teacher/Student) MUST be forbidden from manager-overview
  const teacherForbidden = await get(baseUrl, '/api/v1/gradebook/manager-overview', {
    token: teacherAToken,
  });
  assert.equal(teacherForbidden.status, 403);
});

// ═══════════════════════════════════════════════════════════════
// 3. REQUEST B — Announcements Targeted by Teacher DB Classes + Audience (Students / Parents / Both)
// ═══════════════════════════════════════════════════════════════

test('integration: Teacher publishes class-targeted announcements to Students, Parents, or Both with strict class, role, and school isolation', async () => {
  const schoolA = await registerSchool('دبیرستان پیام الف', '09128330001');
  const schoolB = await registerSchool('دبیرستان پیام ب', '09128330002');

  const teacherA = await registerTeacher({
    schoolId: schoolA.school.id,
    fullName: 'دبیر سارا فیزیک',
    phone: '09128330011',
  });
  const teacherAToken = teacherA.accessToken;

  const teacherB = await registerTeacher({
    schoolId: schoolB.school.id,
    fullName: 'دبیر مدرسه دیگر',
    phone: '09128330012',
  });

  // Two students + their parents in School A (enrolled in DIFFERENT classes)
  const student1 = await registerStudent({
    schoolUsername: schoolA.school.username,
    displayName: 'نگار راد',
    phone: '09358330021',
    grade: 'پایه دهم',
  });
  const parent1 = await registerParent({
    schoolUsername: schoolA.school.username,
    displayName: 'مریم راد',
    phone: '09128330031',
    studentName: 'نگار راد',
    studentUsername: student1.user.username,
    relationType: 'mother',
    relation: 'مادر',
  });

  const student2 = await registerStudent({
    schoolUsername: schoolA.school.username,
    displayName: 'کیان نوری',
    phone: '09358330022',
    grade: 'پایه یازدهم',
  });
  const parent2 = await registerParent({
    schoolUsername: schoolA.school.username,
    displayName: 'رضا نوری',
    phone: '09128330032',
    studentName: 'کیان نوری',
    studentUsername: student2.user.username,
    relationType: 'father',
    relation: 'پدر',
  });

  // Student in School B
  const studentB = await registerStudent({
    schoolUsername: schoolB.school.username,
    displayName: 'دانش‌آموز مدرسه ب',
    phone: '09358330029',
    grade: 'پایه دهم',
  });

  // Teacher A creates 2 classes in DB
  const cls1Res = await post(baseUrl, '/api/v1/gradebook/classes-with-scores', {
    token: teacherAToken,
    body: {
      name: 'فیزیک دهم ۱',
      grade: 'پایه دهم',
      subject: 'فیزیک',
      entries: [{ student_id: student1.user.id, score: '' }],
    },
  });
  assert.equal(cls1Res.status, 201, JSON.stringify(cls1Res.body));
  const class1Id = cls1Res.body.data.class.id;

  const cls2Res = await post(baseUrl, '/api/v1/gradebook/classes-with-scores', {
    token: teacherAToken,
    body: {
      name: 'فیزیک یازدهم ۲',
      grade: 'پایه یازدهم',
      subject: 'فیزیک',
      entries: [{ student_id: student2.user.id, score: '' }],
    },
  });
  assert.equal(cls2Res.status, 201, JSON.stringify(cls2Res.body));
  const class2Id = cls2Res.body.data.class.id;

  // Teacher B creates a class in School B (must NOT appear in Teacher A's targeting options)
  await post(baseUrl, '/api/v1/gradebook/classes-with-scores', {
    token: teacherB.accessToken,
    body: {
      name: 'شیمی مدرسه ب',
      grade: 'پایه دهم',
      subject: 'شیمی',
      entries: [{ student_id: studentB.user.id, score: '' }],
    },
  });

  // 1. Targeting options for Teacher A returns ONLY Teacher A's 2 DB classes
  const optRes = await get(baseUrl, '/api/v1/announcements/targeting-options', {
    token: teacherAToken,
  });
  assert.equal(optRes.status, 200, JSON.stringify(optRes.body));
  const teacherClasses = optRes.body.data.classes;
  assert.equal(teacherClasses.length, 2);
  assert.deepEqual(
    teacherClasses.map((c) => c.name),
    ['فیزیک دهم 1', 'فیزیک یازدهم 2']
  );

  // 2. Publish announcement ONLY to Class 1 with audience = 'all' (دانش‌آموز و اولیاء)
  const annAllRes = await post(baseUrl, '/api/v1/announcements', {
    token: teacherAToken,
    body: {
      title: 'اطلاعیه آزمایشگاه دهم ۱',
      content: 'جلسه آزمایشگاه فیزیک فردا ساعت ۱۰ برگزار می‌شود.',
      priority: 'urgent',
      target_audience: 'all',
      target_class_ids: [class1Id],
    },
  });
  assert.equal(annAllRes.status, 201, JSON.stringify(annAllRes.body));

  // 3. Publish announcement ONLY to Class 1 with audience = 'parents' (فقط اولیاء)
  const annParentsRes = await post(baseUrl, '/api/v1/announcements', {
    token: teacherAToken,
    body: {
      title: 'جلسه اولیای کلاس دهم ۱',
      content: 'از اولیای گرامی دعوت به حضور می‌شود.',
      priority: 'important',
      target_audience: 'parents',
      target_class_ids: [class1Id],
    },
  });
  assert.equal(annParentsRes.status, 201, JSON.stringify(annParentsRes.body));

  // Student 1 sees ONLY the 'all' announcement (NOT the 'parents'-only one)
  const st1Anns = await get(baseUrl, '/api/v1/announcements', {
    token: student1.accessToken,
  });
  assert.equal(st1Anns.status, 200);
  const st1Titles = st1Anns.body.data.announcements.map((a) => a.title);
  assert.deepEqual(st1Titles, ['اطلاعیه آزمایشگاه دهم 1']);
  assert.deepEqual(st1Anns.body.data.announcements[0].target_class_names, ['فیزیک دهم 1 (پایه دهم)']);

  // Parent 1 sees BOTH the 'all' AND the 'parents'-only announcements for Class 1!
  const par1Anns = await get(baseUrl, '/api/v1/announcements', {
    token: parent1.accessToken,
  });
  assert.equal(par1Anns.status, 200);
  const par1Titles = par1Anns.body.data.announcements.map((a) => a.title).sort();
  assert.deepEqual(
    par1Titles,
    ['اطلاعیه آزمایشگاه دهم 1', 'جلسه اولیای کلاس دهم 1'].sort()
  );

  // Student 2 & Parent 2 (Class 2) MUST NOT see Class 1's announcements
  const st2Anns = await get(baseUrl, '/api/v1/announcements', {
    token: student2.accessToken,
  });
  assert.equal(st2Anns.body.data.announcements.length, 0);

  const par2Anns = await get(baseUrl, '/api/v1/announcements', {
    token: parent2.accessToken,
  });
  assert.equal(par2Anns.body.data.announcements.length, 0);

  // School B Student MUST NOT see School A's announcements
  const stBAnns = await get(baseUrl, '/api/v1/announcements', {
    token: studentB.accessToken,
  });
  assert.equal(stBAnns.body.data.announcements.length, 0);

  // Teacher A attempting to target an unauthorized class MUST be rejected (ownership check)
  const badTargetRes = await post(baseUrl, '/api/v1/announcements', {
    token: teacherAToken,
    body: {
      title: 'تلاش غیرمجاز',
      content: 'ارسال به کلاس غیرمجاز',
      priority: 'normal',
      target_audience: 'all',
      target_class_ids: [class2Id, '00000000-0000-4000-8000-000000000099'],
    },
  });
  assert.ok(badTargetRes.status === 403 || badTargetRes.status === 404);
});
