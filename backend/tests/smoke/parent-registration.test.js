const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post } = require('../support/http');
const db = require('../../src/config/database');
const {
  PARENT_RELATION_OPTIONS,
  validateParentRelation,
} = require('../../src/utils/parentRegistrationHelper');

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
    await db('parents').del();
  } catch (_e) {}
  try {
    await db('students').del();
  } catch (_e) {}
});

test('unit: validateParentRelation supports پدر، مادر، and سایر موارد with custom relation validation', () => {
  assert.deepEqual(PARENT_RELATION_OPTIONS, ['پدر', 'مادر', 'سایر موارد']);

  const father = validateParentRelation({ relation_type: 'father', relation: 'پدر' });
  assert.equal(father.valid, true);
  assert.equal(father.relation_type, 'father');
  assert.equal(father.relation, 'پدر');

  const mother = validateParentRelation({ relation_type: 'mother', relation: 'مادر' });
  assert.equal(mother.valid, true);
  assert.equal(mother.relation_type, 'mother');
  assert.equal(mother.relation, 'مادر');

  const otherValid = validateParentRelation({
    relation_type: 'other',
    relation: 'سایر موارد',
    custom_relation: 'پدربزرگ',
  });
  assert.equal(otherValid.valid, true);
  assert.equal(otherValid.relation_type, 'other');
  assert.equal(otherValid.relation, 'پدربزرگ');

  const otherEmpty = validateParentRelation({
    relation_type: 'other',
    relation: 'سایر موارد',
    custom_relation: '',
  });
  assert.equal(otherEmpty.valid, false);

  const missing = validateParentRelation({});
  assert.equal(missing.valid, false);
});

test('parent registration persists hierarchically under student and school, supports custom relation, rejects wrong school, and enables username+password login', async () => {
  // 1. Register two real schools in DB
  const school1Res = await post(baseUrl, '/api/v1/auth/register-school', {
    body: {
      school_name: 'دبیرستان هوشمند رازی تهران',
      school_level: 'متوسطه دوم (دبیرستان)',
      majors: ['ریاضی و فیزیک', 'علوم تجربی'],
      city: 'تهران',
      admin_name: 'حسین رضوی',
      admin_phone: '09121002001',
      admin_password: 'SchoolPass#2026',
    },
  });
  assert.equal(school1Res.status, 201);
  const school1 = school1Res.body.data.school;

  const school2Res = await post(baseUrl, '/api/v1/auth/register-school', {
    body: {
      school_name: 'دبستان امید شیراز',
      school_level: 'دبستان',
      city: 'شیراز',
      admin_name: 'سعید احمدی',
      admin_phone: '09171002002',
      admin_password: 'SchoolPass#2026',
    },
  });
  assert.equal(school2Res.status, 201);
  const school2 = school2Res.body.data.school;

  // 2. Register a student under school1
  const studentRes = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      display_name: 'کیان محمدی',
      phone: '09351002003',
      school_username: `@${school1.username}`,
      education_level: 'متوسطه دوم',
      major: 'ریاضی',
      grade: 'پایه یازدهم',
      password: 'StudentPass#2026',
    },
  });
  assert.equal(studentRes.status, 201);
  const studentUser = studentRes.body.data.user;
  const studentRow = studentRes.body.data.student;

  // 3. Verify GET /api/v1/auth/students/by-username/:username works and enforces school scope
  const lookupOk = await get(
    baseUrl,
    `/api/v1/auth/students/by-username/@${encodeURIComponent(studentUser.username)}?school_id=${encodeURIComponent(school1.id)}`
  );
  assert.equal(lookupOk.status, 200);
  assert.equal(lookupOk.body.data.full_name, 'کیان محمدی');
  assert.equal(lookupOk.body.data.school_id, school1.id);
  assert.equal(lookupOk.body.data.phone, undefined, 'public student lookup must never expose phone');
  assert.equal(lookupOk.body.data.password_hash, undefined);

  const lookupWrongSchool = await get(
    baseUrl,
    `/api/v1/auth/students/by-username/${encodeURIComponent(studentUser.username)}?school_id=${encodeURIComponent(school2.id)}`
  );
  assert.equal(lookupWrongSchool.status, 400);

  // 4. Reject registering parent when student belongs to another school
  const mismatchReg = await post(baseUrl, '/api/v1/auth/register-parent', {
    body: {
      display_name: 'ناصر محمدی',
      phone: '09121002004',
      school_id: school2.id,
      student_name: 'کیان محمدی',
      student_username: `@${studentUser.username}`,
      relation_type: 'father',
      relation: 'پدر',
      password: 'ParentSecret#2026',
    },
  });
  assert.equal(mismatchReg.status, 400);

  // 5. Register parent with "سایر موارد" + custom relation ("پدربزرگ") under school1 -> student
  const parentRes = await post(baseUrl, '/api/v1/auth/register-parent', {
    body: {
      display_name: 'ناصر محمدی',
      phone: '09121002004',
      school_username: `@${school1.username}`,
      student_name: 'کیان محمدی',
      student_username: `@${studentUser.username}`,
      relation_type: 'other',
      relation: 'سایر موارد',
      custom_relation: 'پدربزرگ',
      password: 'ParentSecret#2026',
    },
  });
  assert.equal(parentRes.status, 201);
  assert.equal(parentRes.body.success, true);

  const { user: parentUser, parent, student: linkedStudent, school: linkedSchool, accessToken } = parentRes.body.data;
  assert.ok(accessToken);
  assert.equal(parentUser.role, 'parent');
  assert.equal(parentUser.school_id, school1.id);
  assert.ok(parentUser.username && parentUser.username.length >= 3);
  assert.equal(parent.username, parentUser.username);
  assert.equal(parent.school_id, school1.id);
  assert.equal(parent.student_id, studentRow.id);
  assert.equal(parent.student_user_id, studentUser.id);
  assert.equal(parent.student_username, studentUser.username);
  assert.equal(parent.relation_type, 'other');
  assert.equal(parent.relation, 'پدربزرگ');
  assert.equal(parent.password_hash, undefined, 'password_hash must never be leaked');
  assert.equal(linkedStudent.username, studentUser.username);
  assert.equal(linkedSchool.id, school1.id);

  // 6. Direct DB verification: hierarchical persistence in `parents` AND `parent_student_links`
  const dbParentRow = await db('parents').where({ user_id: parentUser.id }).first();
  assert.ok(dbParentRow, 'parent must have a dedicated row in `parents` table');
  assert.equal(dbParentRow.school_id, school1.id);
  assert.equal(dbParentRow.student_id, studentRow.id);
  assert.equal(dbParentRow.student_user_id, studentUser.id);
  assert.equal(dbParentRow.student_name, 'کیان محمدی');
  assert.equal(dbParentRow.student_username, studentUser.username);
  assert.equal(dbParentRow.relation_type, 'other');
  assert.equal(dbParentRow.relation, 'پدربزرگ');
  assert.equal(dbParentRow.username, parentUser.username);
  assert.notEqual(dbParentRow.password_hash, 'ParentSecret#2026');
  assert.equal(await bcrypt.compare('ParentSecret#2026', dbParentRow.password_hash), true);

  const linkRow = await db('parent_student_links')
    .where({ parent_id: parentUser.id, student_id: studentUser.id })
    .first();
  assert.ok(linkRow, 'parent_student_links must connect parent to student');
  assert.equal(linkRow.relation, 'پدربزرگ');

  // 7. Subsequent login via "ورود با نام کاربری" with @parent_username + password
  const loginOk = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: `@${parentUser.username}`, password: 'ParentSecret#2026' },
  });
  assert.equal(loginOk.status, 200);
  assert.equal(loginOk.body.data.user.id, parentUser.id);
  assert.equal(loginOk.body.data.user.role, 'parent');
  assert.equal(loginOk.body.data.user.school_id, school1.id);

  const loginBad = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: parentUser.username, password: 'WrongPassword!' },
  });
  assert.equal(loginBad.status, 401);

  // 8. Second parent (mother) with identical name gets a strictly unique username
  const motherRes = await post(baseUrl, '/api/v1/auth/register-parent', {
    body: {
      display_name: 'ناصر محمدی',
      phone: '09121002005',
      school_id: school1.id,
      student_name: 'کیان محمدی',
      student_username: studentUser.username,
      relation_type: 'mother',
      relation: 'مادر',
      password: 'MotherSecret#2026',
    },
  });
  assert.equal(motherRes.status, 201);
  assert.notEqual(motherRes.body.data.user.username, parentUser.username);
  assert.equal(motherRes.body.data.parent.relation_type, 'mother');
  assert.equal(motherRes.body.data.parent.relation, 'مادر');
});
