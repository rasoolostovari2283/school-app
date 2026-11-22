const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post } = require('../support/http');
const db = require('../../src/config/database');
const {
  TEACHER_EDUCATION_LEVELS,
  HIGH_SCHOOL_TEACHER_MAJORS,
  GRADES_BY_EDUCATION_LEVEL,
  validateTeacherTeachingInfo,
} = require('../../src/utils/teacherRegistrationHelper');

let baseUrl;

before(async () => {
  ({ baseUrl } = await setupHarness());
});

after(async () => {
  await teardownHarness();
});

beforeEach(async () => {
  await resetDatabase();
  try {
    await db('teachers').del();
  } catch (_e) {}
});

test('unit: validateTeacherTeachingInfo enforces exact levels, multi-select grades, preschool auto-grade, and high-school majors', () => {
  assert.deepEqual(TEACHER_EDUCATION_LEVELS, [
    'پیش دبستانی ۱',
    'پیش دبستانی ۲',
    'دبستان',
    'متوسطه اول',
    'متوسطه دوم',
  ]);
  assert.deepEqual(HIGH_SCHOOL_TEACHER_MAJORS, [
    'تجربی',
    'ریاضی',
    'علوم انسانی',
    'هنرستان',
    'کار دانش',
  ]);
  assert.equal(GRADES_BY_EDUCATION_LEVEL['دبستان'].length, 6);
  assert.equal(GRADES_BY_EDUCATION_LEVEL['متوسطه اول'].length, 3);
  assert.equal(GRADES_BY_EDUCATION_LEVEL['متوسطه دوم'].length, 3);

  // High school valid with multiple grades and multiple majors
  const hsOk = validateTeacherTeachingInfo({
    education_level: 'متوسطه دوم',
    majors: ['ریاضی', 'تجربی', 'ریاضی'],
    taught_grades: ['پایه دهم', 'پایه دوازدهم', 'پایه دهم'],
  });
  assert.equal(hsOk.valid, true);
  assert.deepEqual(hsOk.majors, ['ریاضی', 'تجربی']);
  assert.deepEqual(hsOk.taught_grades, ['پایه دهم', 'پایه دوازدهم']);

  // Elementary valid with multiple grades 1..6 and majors cleared
  const elemOk = validateTeacherTeachingInfo({
    education_level: 'دبستان',
    majors: ['ریاضی'],
    taught_grades: ['پایه اول', 'پایه سوم', 'پایه پنجم'],
  });
  assert.equal(elemOk.valid, true);
  assert.deepEqual(elemOk.majors, []);
  assert.deepEqual(elemOk.taught_grades, ['پایه اول', 'پایه سوم', 'پایه پنجم']);

  // Middle school valid with grades 7..9
  const midOk = validateTeacherTeachingInfo({
    education_level: 'متوسطه اول',
    taught_grades: ['پایه هفتم', 'پایه نهم'],
  });
  assert.equal(midOk.valid, true);
  assert.deepEqual(midOk.taught_grades, ['پایه هفتم', 'پایه نهم']);

  // Empty grades rejected for non-preschool
  const emptyGrades = validateTeacherTeachingInfo({
    education_level: 'دبستان',
    taught_grades: [],
  });
  assert.equal(emptyGrades.valid, false);

  // Mismatched grade for level rejected
  const mismatch = validateTeacherTeachingInfo({
    education_level: 'دبستان',
    taught_grades: ['پایه اول', 'پایه دهم'],
  });
  assert.equal(mismatch.valid, false);

  // Preschool auto-assigns its own grade
  const preOk = validateTeacherTeachingInfo({
    education_level: 'پیش دبستانی ۲',
    taught_grades: [],
  });
  assert.equal(preOk.valid, true);
  assert.deepEqual(preOk.taught_grades, ['پیش دبستانی ۲']);
  assert.deepEqual(preOk.majors, []);
});

test('teacher registration links teacher under school in DB, stores multi-select grades, issues unique username, and enables username+password login', async () => {
  // 1. Register a real school in DB
  const schoolRes = await post(baseUrl, '/api/v1/auth/register-school', {
    body: {
      school_name: 'دبیرستان فرزانگان اصفهان',
      school_level: 'متوسطه دوم (دبیرستان)',
      majors: ['ریاضی و فیزیک', 'علوم تجربی'],
      city: 'اصفهان',
      admin_name: 'مریم بهرامی',
      admin_phone: '09131112233',
      admin_password: 'SchoolPass#2026',
    },
  });
  assert.equal(schoolRes.status, 201);
  const school = schoolRes.body.data.school;
  const adminToken = schoolRes.body.data.accessToken;
  assert.ok(school.username);

  // 2. Register a teacher under that school using @school_username and multiple grades
  const regRes = await post(baseUrl, '/api/v1/auth/register-teacher', {
    body: {
      display_name: 'استاد حمیدرضا کریمی',
      phone: '09134445566',
      school_username: `@${school.username}`,
      education_level: 'متوسطه دوم',
      majors: ['ریاضی', 'تجربی'],
      taught_grades: ['پایه دهم', 'پایه دوازدهم'],
      password: 'TeacherSecret#99',
    },
  });
  assert.equal(regRes.status, 201);
  assert.equal(regRes.body.success, true);

  const { user, teacher, accessToken } = regRes.body.data;
  assert.ok(accessToken);
  assert.equal(user.role, 'teacher');
  assert.equal(user.school_id, school.id);
  assert.ok(user.username && user.username.length >= 3);
  assert.equal(teacher.username, user.username);
  assert.equal(teacher.full_name, 'استاد حمیدرضا کریمی');
  assert.equal(teacher.phone, '09134445566');
  assert.equal(teacher.school_id, school.id);
  assert.equal(teacher.school_name, 'دبیرستان فرزانگان اصفهان');
  assert.equal(teacher.school_username, school.username);
  assert.equal(teacher.education_level, 'متوسطه دوم');
  assert.deepEqual(teacher.majors, ['ریاضی', 'تجربی']);
  assert.deepEqual(teacher.taught_grades, ['پایه دهم', 'پایه دوازدهم']);
  assert.equal(teacher.password_hash, undefined, 'password_hash must never be leaked');

  // 3. Verify directly in SQLite `teachers` table that teacher is persisted under school_id
  const dbTeacherRow = await db('teachers').where({ user_id: user.id }).first();
  assert.ok(dbTeacherRow, 'teacher must have a dedicated row in the `teachers` table');
  assert.equal(dbTeacherRow.school_id, school.id);
  assert.equal(dbTeacherRow.school_name, 'دبیرستان فرزانگان اصفهان');
  assert.equal(dbTeacherRow.school_username, school.username);
  assert.equal(dbTeacherRow.full_name, 'استاد حمیدرضا کریمی');
  assert.equal(dbTeacherRow.phone, '09134445566');
  assert.equal(dbTeacherRow.education_level, 'متوسطه دوم');
  assert.deepEqual(JSON.parse(dbTeacherRow.majors), ['ریاضی', 'تجربی']);
  assert.deepEqual(JSON.parse(dbTeacherRow.taught_grades), ['پایه دهم', 'پایه دوازدهم']);
  assert.equal(dbTeacherRow.username, user.username);
  assert.notEqual(dbTeacherRow.password_hash, 'TeacherSecret#99');
  assert.equal(await bcrypt.compare('TeacherSecret#99', dbTeacherRow.password_hash), true);

  // 4. Verify school admin sees the teacher under their school members
  const membersRes = await get(baseUrl, '/api/v1/school/members', { token: adminToken });
  assert.equal(membersRes.status, 200);
  const staffList = membersRes.body?.data?.staff || membersRes.body?.data?.teachers || membersRes.body?.data || [];
  const matchedInSchool = Array.isArray(staffList)
    ? staffList.some((m) => m.id === user.id || m.username === user.username)
    : JSON.stringify(membersRes.body).includes(user.id);
  assert.equal(matchedInSchool, true, 'registered teacher must appear under the school members list');

  // 5. Verify login via username + password matches DB
  const loginOk = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: `@${user.username}`, password: 'TeacherSecret#99' },
  });
  assert.equal(loginOk.status, 200);
  assert.equal(loginOk.body.data.user.id, user.id);
  assert.equal(loginOk.body.data.user.role, 'teacher');
  assert.equal(loginOk.body.data.user.school_id, school.id);

  // Wrong password rejected
  const loginBad = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: user.username, password: 'WrongPassword!' },
  });
  assert.equal(loginBad.status, 401);

  // 6. Second teacher with identical name gets a strictly unique username & elementary multi-grades work
  const regRes2 = await post(baseUrl, '/api/v1/auth/register-teacher', {
    body: {
      display_name: 'استاد حمیدرضا کریمی',
      phone: '09137778899',
      school_id: school.id,
      education_level: 'دبستان',
      taught_grades: ['پایه اول', 'پایه سوم', 'پایه پنجم'],
      password: 'AnotherSecret#88',
    },
  });
  assert.equal(regRes2.status, 201);
  assert.notEqual(regRes2.body.data.user.username, user.username);
  assert.equal(regRes2.body.data.teacher.education_level, 'دبستان');
  assert.deepEqual(regRes2.body.data.teacher.taught_grades, ['پایه اول', 'پایه سوم', 'پایه پنجم']);
  assert.deepEqual(regRes2.body.data.teacher.majors, []);
});
