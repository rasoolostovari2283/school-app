const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post } = require('../support/http');
const {
  normalizePersianSearch,
  matchSchoolStudent,
  isExactStudentMatch,
  buildRosterGroupSnapshot,
  parseRosterGroupRow,
} = require('../../src/utils/classRosterHelper');

let baseUrl;
let db;

before(async () => {
  ({ baseUrl, db } = await setupHarness());
});

after(async () => {
  await teardownHarness();
});

beforeEach(async () => {
  await resetDatabase();
});

// ═══════════════════════════════════════════════════════════════
// 1. PURE UNIT TESTS (classRosterHelper)
// ═══════════════════════════════════════════════════════════════

test('unit: normalizePersianSearch normalizes Arabic letters, Persian digits, and @ prefix', () => {
  assert.equal(normalizePersianSearch('@Reza_123'), 'reza_123');
  assert.equal(normalizePersianSearch('علي كريمي ۱۲۳'), 'علی کریمی 123');
  assert.equal(normalizePersianSearch('  سارا   احمدی  '), 'سارا احمدی');
});

test('unit: matchSchoolStudent and isExactStudentMatch match Persian name, @username, and student code', () => {
  const student = {
    id: 'st-1',
    display_name: 'مریم کاظمی',
    username: 'maryam_k99',
    student_code: '4031055',
  };

  assert.equal(matchSchoolStudent(student, 'مريم كاظمي'), true);
  assert.equal(matchSchoolStudent(student, '@maryam_k99'), true);
  assert.equal(matchSchoolStudent(student, '4031055'), true);
  assert.equal(matchSchoolStudent(student, 'ناموجود'), false);

  assert.equal(isExactStudentMatch(student, '@maryam_k99'), true);
  assert.equal(isExactStudentMatch(student, 'مريم كاظمي'), true);
  assert.equal(isExactStudentMatch(student, 'مریم'), false);
});

test('unit: buildRosterGroupSnapshot and parseRosterGroupRow preserve roster group members', () => {
  const snapshot = buildRosterGroupSnapshot(
    {
      id: 'cls-1',
      school_id: 'sch-1',
      teacher_id: 'tch-1',
      name: 'کلاس دهم تجربی',
      grade: 'پایه دهم',
      major: 'علوم تجربی',
    },
    [
      { id: 'u1', display_name: 'علی رضایی', username: 'ali_r', student_code: '101', grade: 'پایه دهم', major: 'علوم تجربی' },
      { id: 'u2', display_name: 'سارا محمدی', username: 'sara_m', student_code: '102', grade: 'پایه دهم', major: 'علوم تجربی' },
    ]
  );

  assert.equal(snapshot.member_count, 2);
  const parsed = parseRosterGroupRow(snapshot);
  assert.deepEqual(parsed.member_user_ids, ['u1', 'u2']);
  assert.equal(parsed.members_snapshot.length, 2);
  assert.equal(parsed.members_snapshot[1].display_name, 'سارا محمدی');
});

// ═══════════════════════════════════════════════════════════════
// 2. INTEGRATION TESTS (Manual DB Search, Not-Found Alert & Persisted Groups)
// ═══════════════════════════════════════════════════════════════

test('integration: teacher searches school DB students, handles نام کاربری وجود ندارد, blocks cross-school, and persists roster group', async () => {
  // 1. Register School 1
  const regSchool1 = await post(baseUrl, '/api/v1/auth/register-school', {
    body: {
      school_name: 'دبیرستان اندیشه',
      city: 'تهران',
      education_level: 'متوسطه دوم',
      majors: ['تجربی', 'ریاضی'],
      principal_name: 'مدیر اندیشه',
      principal_phone: '09120001111',
      password: 'Password123!',
    },
  });
  assert.equal(regSchool1.status, 201, JSON.stringify(regSchool1.body));
  const school1 = regSchool1.body.data.school;

  // Register School 2 (for cross-school isolation check)
  const regSchool2 = await post(baseUrl, '/api/v1/auth/register-school', {
    body: {
      school_name: 'دبیرستان دیگر',
      city: 'شیراز',
      education_level: 'متوسطه دوم',
      majors: ['تجربی'],
      principal_name: 'مدیر دیگر',
      principal_phone: '09120002222',
      password: 'Password123!',
    },
  });
  assert.equal(regSchool2.status, 201, JSON.stringify(regSchool2.body));
  const school2 = regSchool2.body.data.school;

  // 2. Register Teacher in School 1
  const regTeacher = await post(baseUrl, '/api/v1/auth/register-teacher', {
    body: {
      full_name: 'استاد بهرام شیمی',
      phone: '09120003333',
      school_id: school1.id,
      education_level: 'متوسطه دوم',
      majors: ['تجربی'],
      taught_grades: ['پایه دهم', 'پایه یازدهم'],
      password: 'Password123!',
    },
  });
  assert.equal(regTeacher.status, 201, JSON.stringify(regTeacher.body));
  const teacherToken = regTeacher.body.data.accessToken;
  const teacherUser = regTeacher.body.data.user;

  // 3. Register Student A in School 1 (will select teacher via student-setup)
  const regStudentA = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      full_name: 'آرش نادری',
      phone: '09120004444',
      school_id: school1.id,
      education_level: 'متوسطه دوم',
      grade: 'پایه دهم',
      major: 'تجربی',
      password: 'Password123!',
    },
  });
  assert.equal(regStudentA.status, 201, JSON.stringify(regStudentA.body));
  const studentAToken = regStudentA.body.data.accessToken;
  const studentA = regStudentA.body.data.user;

  // 4. Register Student B in School 1 (does NOT select teacher — will be manually searched & added)
  const regStudentB = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      full_name: 'نیلوفر پارسا',
      phone: '09120005555',
      school_id: school1.id,
      education_level: 'متوسطه دوم',
      grade: 'پایه دهم',
      major: 'تجربی',
      password: 'Password123!',
    },
  });
  assert.equal(regStudentB.status, 201, JSON.stringify(regStudentB.body));
  const studentB = regStudentB.body.data.user;

  // 5. Register Student C in School 2 (cross-school negative test)
  const regStudentC = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      full_name: 'امیرحسین مدرسه دیگر',
      phone: '09120006666',
      school_id: school2.id,
      education_level: 'متوسطه دوم',
      grade: 'پایه دهم',
      major: 'تجربی',
      password: 'Password123!',
    },
  });
  assert.equal(regStudentC.status, 201, JSON.stringify(regStudentC.body));
  const studentC = regStudentC.body.data.user;

  // 6. Student A selects Teacher -> auto-creates class + syncs class_roster_groups
  const setupRes = await post(baseUrl, '/api/v1/auth/student-setup', {
    token: studentAToken,
    body: {
      school_name: school1.name,
      education_level: 'متوسطه دوم',
      grade: 'پایه دهم',
      major: 'تجربی',
      teacher_ids: [teacherUser.id],
    },
  });
  assert.equal(setupRes.status, 200, JSON.stringify(setupRes.body));
  assert.equal(setupRes.body.data.enrolled_classes.length, 1);
  const classId = setupRes.body.data.enrolled_classes[0].id;

  // 7. Verify Teacher's class roster contains Student A and persisted class_roster_groups row
  const rosterRes1 = await get(baseUrl, `/api/v1/classes/${classId}/roster`, { token: teacherToken });
  assert.equal(rosterRes1.status, 200);
  assert.equal(rosterRes1.body.data.students.length, 1);
  assert.equal(rosterRes1.body.data.students[0].id, studentA.id);
  assert.ok(rosterRes1.body.data.roster_group);
  assert.equal(rosterRes1.body.data.roster_group.member_count, 1);
  assert.deepEqual(rosterRes1.body.data.roster_group.member_user_ids, [studentA.id]);

  // 8. Teacher searches Student B by Persian name -> found & not enrolled yet
  const searchB = await get(
    baseUrl,
    `/api/v1/classes/${classId}/students/search?q=${encodeURIComponent('نیلوفر')}`,
    { token: teacherToken }
  );
  assert.equal(searchB.status, 200);
  assert.equal(searchB.body.data.not_found, false);
  assert.equal(searchB.body.data.students.length, 1);
  assert.equal(searchB.body.data.students[0].id, studentB.id);
  assert.equal(searchB.body.data.students[0].already_in_class, false);

  // 9. Teacher searches Student A -> already_in_class: true
  const searchA = await get(
    baseUrl,
    `/api/v1/classes/${classId}/students/search?q=${encodeURIComponent(`@${studentA.username}`)}`,
    { token: teacherToken }
  );
  assert.equal(searchA.status, 200);
  assert.equal(searchA.body.data.students.length, 1);
  assert.equal(searchA.body.data.students[0].already_in_class, true);

  // 10. Teacher searches non-existent student -> returns exact "نام کاربری وجود ندارد"
  const searchMissing = await get(
    baseUrl,
    `/api/v1/classes/${classId}/students/search?q=${encodeURIComponent('کاربر_ناموجود_۹۹۹')}`,
    { token: teacherToken }
  );
  assert.equal(searchMissing.status, 200);
  assert.equal(searchMissing.body.data.not_found, true);
  assert.equal(searchMissing.body.data.students.length, 0);
  assert.equal(searchMissing.body.data.message, 'نام کاربری وجود ندارد');

  // 11. Teacher submits non-existent query -> returns 404 "نام کاربری وجود ندارد"
  const addMissing = await post(baseUrl, `/api/v1/classes/${classId}/roster/add-students`, {
    token: teacherToken,
    body: { query: 'کاربر_ناموجود_۹۹۹' },
  });
  assert.equal(addMissing.status, 404);
  assert.equal(addMissing.body.message, 'نام کاربری وجود ندارد');

  // 12. Cross-school student cannot be added -> 403
  const addCrossSchool = await post(baseUrl, `/api/v1/classes/${classId}/roster/add-students`, {
    token: teacherToken,
    body: { student_ids: [studentC.id] },
  });
  assert.equal(addCrossSchool.status, 403);

  // 13. Teacher manually adds Student B -> 201 and class_roster_groups persists both students as a group
  const addB = await post(baseUrl, `/api/v1/classes/${classId}/roster/add-students`, {
    token: teacherToken,
    body: { student_ids: [studentB.id] },
  });
  assert.equal(addB.status, 201, JSON.stringify(addB.body));
  assert.equal(addB.body.data.added_students.length, 1);
  assert.equal(addB.body.data.added_students[0].id, studentB.id);
  assert.equal(addB.body.data.roster_group.member_count, 2);

  // Verify direct DB persistence in `class_roster_groups` and `student_teacher_links`
  const dbGroupRow = await db('class_roster_groups').where({ class_id: classId }).first();
  assert.ok(dbGroupRow, 'class_roster_groups row should be persisted in SQLite');
  assert.equal(dbGroupRow.member_count, 2);
  const memberIds = JSON.parse(dbGroupRow.member_user_ids);
  assert.ok(memberIds.includes(studentA.id));
  assert.ok(memberIds.includes(studentB.id));

  const linkRow = await db('student_teacher_links')
    .where({ student_user_id: studentB.id, teacher_user_id: teacherUser.id })
    .first();
  assert.ok(linkRow, 'manual roster addition should also link student under teacher');
  assert.equal(linkRow.class_id, classId);
});
