const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post } = require('../support/http');
const db = require('../../src/config/database');
const {
  STUDENT_EDUCATION_LEVELS,
  HIGH_SCHOOL_STUDENT_MAJORS,
  GRADES_BY_EDUCATION_LEVEL,
  validateStudentAcademicInfo,
} = require('../../src/utils/studentRegistrationHelper');

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
    await db('students').del();
  } catch (_e) {}
});

test('unit: validateStudentAcademicInfo enforces exact levels, high-school majors, and grade ranges', () => {
  assert.deepEqual(STUDENT_EDUCATION_LEVELS, [
    'پیش دبستانی ۱',
    'پیش دبستانی ۲',
    'دبستان',
    'متوسطه اول',
    'متوسطه دوم',
  ]);
  assert.deepEqual(HIGH_SCHOOL_STUDENT_MAJORS, [
    'تجربی',
    'ریاضی',
    'علوم انسانی',
    'هنرستان',
    'کار دانش',
  ]);
  assert.equal(GRADES_BY_EDUCATION_LEVEL['دبستان'].length, 6);
  assert.equal(GRADES_BY_EDUCATION_LEVEL['متوسطه اول'].length, 3);
  assert.equal(GRADES_BY_EDUCATION_LEVEL['متوسطه دوم'].length, 3);

  // High school valid with major & grade 10..12
  const hsOk = validateStudentAcademicInfo({
    education_level: 'متوسطه دوم',
    major: 'تجربی',
    grade: 'پایه یازدهم',
  });
  assert.equal(hsOk.valid, true);
  assert.equal(hsOk.major, 'تجربی');
  assert.equal(hsOk.grade, 'پایه یازدهم');

  // High school missing major rejected
  const hsNoMajor = validateStudentAcademicInfo({
    education_level: 'متوسطه دوم',
    major: '',
    grade: 'پایه دهم',
  });
  assert.equal(hsNoMajor.valid, false);

  // Elementary valid with grades 1..6, major cleared
  const elemOk = validateStudentAcademicInfo({
    education_level: 'دبستان',
    major: 'ریاضی',
    grade: 'پایه چهارم',
  });
  assert.equal(elemOk.valid, true);
  assert.equal(elemOk.major, null);
  assert.equal(elemOk.grade, 'پایه چهارم');

  // Elementary with grade 10 rejected
  const elemBadGrade = validateStudentAcademicInfo({
    education_level: 'دبستان',
    grade: 'پایه دهم',
  });
  assert.equal(elemBadGrade.valid, false);

  // Middle school valid with grades 7..9
  const midOk = validateStudentAcademicInfo({
    education_level: 'متوسطه اول',
    grade: 'پایه هشتم',
  });
  assert.equal(midOk.valid, true);
  assert.equal(midOk.major, null);

  // Preschool auto-assigns grade
  const preOk = validateStudentAcademicInfo({
    education_level: 'پیش دبستانی ۱',
  });
  assert.equal(preOk.valid, true);
  assert.equal(preOk.grade, 'پیش دبستانی ۱');
  assert.equal(preOk.major, null);
});

test('student registration resolves school by DB username, persists exclusive row in dedicated students table, and enables username+password login', async () => {
  // 1. Register a real school in DB so it has a generated unique school username
  const schoolRes = await post(baseUrl, '/api/v1/auth/register-school', {
    body: {
      school_name: 'دبیرستان علامه طباطبایی شیراز',
      school_level: 'متوسطه دوم (دبیرستان)',
      majors: ['ریاضی و فیزیک', 'علوم تجربی'],
      city: 'شیراز',
      admin_name: 'رضا طاهری',
      admin_phone: '09173334455',
      admin_password: 'SchoolPass#2026',
    },
  });
  assert.equal(schoolRes.status, 201);
  const school = schoolRes.body.data.school;
  assert.ok(school.username);

  // 2. Look up the school via GET /api/v1/auth/schools/by-username/:username
  const lookupRes = await get(baseUrl, `/api/v1/auth/schools/by-username/@${encodeURIComponent(school.username)}`);
  assert.equal(lookupRes.status, 200);
  assert.equal(lookupRes.body.data.id, school.id);
  assert.equal(lookupRes.body.data.name, 'دبیرستان علامه طباطبایی شیراز');
  assert.equal(lookupRes.body.data.password_hash, undefined);
  assert.equal(lookupRes.body.data.principal_phone, undefined);

  // Unknown school username returns 404
  const notFoundRes = await get(baseUrl, '/api/v1/auth/schools/by-username/nonexistent_school_xyz');
  assert.equal(notFoundRes.status, 404);

  // 3. Register a high-school student using school_username
  const regRes = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      display_name: 'امیررضا نوری',
      phone: '09361234567',
      school_username: `@${school.username}`,
      education_level: 'متوسطه دوم',
      major: 'ریاضی',
      grade: 'پایه یازدهم',
      password: 'StudentSecret#99',
    },
  });
  assert.equal(regRes.status, 201);
  assert.equal(regRes.body.success, true);

  const { user, student, accessToken } = regRes.body.data;
  assert.ok(accessToken);
  assert.equal(user.role, 'student');
  assert.ok(user.username && user.username.length >= 3);
  assert.equal(student.username, user.username);
  assert.equal(student.full_name, 'امیررضا نوری');
  assert.equal(student.phone, '09361234567');
  assert.equal(student.school_id, school.id);
  assert.equal(student.school_name, 'دبیرستان علامه طباطبایی شیراز');
  assert.equal(student.school_username, school.username);
  assert.equal(student.education_level, 'متوسطه دوم');
  assert.equal(student.major, 'ریاضی');
  assert.equal(student.grade, 'پایه یازدهم');
  assert.equal(student.password_hash, undefined, 'password_hash must never be returned in API response');

  // 4. Direct DB check: verify exclusive personal row in dedicated `students` table
  const dbStudentRow = await db('students').where({ user_id: user.id }).first();
  assert.ok(dbStudentRow, 'student must have a dedicated row in the `students` table');
  assert.equal(dbStudentRow.full_name, 'امیررضا نوری');
  assert.equal(dbStudentRow.phone, '09361234567');
  assert.equal(dbStudentRow.school_id, school.id);
  assert.equal(dbStudentRow.school_name, 'دبیرستان علامه طباطبایی شیراز');
  assert.equal(dbStudentRow.school_username, school.username);
  assert.equal(dbStudentRow.education_level, 'متوسطه دوم');
  assert.equal(dbStudentRow.major, 'ریاضی');
  assert.equal(dbStudentRow.grade, 'پایه یازدهم');
  assert.equal(dbStudentRow.username, user.username);
  assert.notEqual(dbStudentRow.password_hash, 'StudentSecret#99');
  assert.equal(await bcrypt.compare('StudentSecret#99', dbStudentRow.password_hash), true);

  // 5. Subsequent login via "ورود با نام کاربری" using exclusive @username + password
  const loginOk = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: `@${user.username}`, password: 'StudentSecret#99' },
  });
  assert.equal(loginOk.status, 200);
  assert.equal(loginOk.body.data.user.id, user.id);
  assert.equal(loginOk.body.data.user.role, 'student');

  // Wrong password rejected with 401
  const loginBad = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: user.username, password: 'WrongPassword!' },
  });
  assert.equal(loginBad.status, 401);

  // 6. Second student with identical name receives a strictly unique username & elementary grade works
  const regRes2 = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      display_name: 'امیررضا نوری',
      phone: '09367654321',
      school_id: school.id,
      education_level: 'دبستان',
      grade: 'پایه پنجم',
      password: 'AnotherSecret#88',
    },
  });
  assert.equal(regRes2.status, 201);
  assert.notEqual(regRes2.body.data.user.username, user.username);
  assert.equal(regRes2.body.data.student.education_level, 'دبستان');
  assert.equal(regRes2.body.data.student.grade, 'پایه پنجم');
  assert.equal(regRes2.body.data.student.major, null);
});
