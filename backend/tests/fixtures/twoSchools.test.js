const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { db, migrate, destroy } = require('../support/database');
const { resetFixture, USERS, SCHOOLS, CLASSES } = require('./twoSchools');

before(async () => {
  await migrate();
});

after(async () => {
  await destroy();
});

beforeEach(async () => {
  await resetFixture(db);
});

/**
 * Guards the fixture invariant called out in the security report: the
 * production seeds leave `users.school_id` NULL, which silently disables the
 * tenant branches in `class.service.js`. A fixture with NULL school ids would
 * make every cross-tenant test meaningless.
 */
test('two-school fixture: every fixture user belongs to a school', async () => {
  const schools = await db('schools').select('id');
  assert.equal(schools.length, 2, 'fixture must create exactly two schools');

  const users = await db('users').select('id', 'role', 'school_id');
  assert.equal(users.length, 8, 'fixture must create 8 users (4 roles x 2 schools)');

  for (const user of users) {
    assert.ok(user.school_id, `user ${user.id} must have a populated school_id`);
    assert.ok(
      schools.some((s) => s.id === user.school_id),
      `user ${user.id} points at an unknown school (${user.school_id})`,
    );
  }

  for (const school of Object.keys(SCHOOLS)) {
    for (const role of ['admin', 'teacher', 'student', 'parent']) {
      const user = await db('users').where({ id: USERS[school][role] }).first();
      assert.ok(user, `missing fixture user ${school}/${role}`);
      assert.equal(user.role, role);
      assert.equal(user.school_id, SCHOOLS[school].id);
    }
  }
});

test('two-school fixture: classes and rosters are isolated per school', async () => {
  for (const school of ['a', 'b']) {
    const klass = await db('classes').where({ id: CLASSES[school] }).first();
    assert.ok(klass, `missing class for school ${school}`);
    assert.equal(klass.school_id, SCHOOLS[school].id);
    assert.equal(klass.teacher_id, USERS[school].teacher);

    const members = await db('class_members').where({ class_id: CLASSES[school] }).select('user_id');
    assert.deepEqual(
      members.map((m) => m.user_id),
      [USERS[school].student],
      `class ${CLASSES[school]} must only contain its own school's student`,
    );
  }

  const crossMembers = await db('class_members')
    .where({ class_id: CLASSES.a, user_id: USERS.b.student })
    .first();
  assert.equal(crossMembers, undefined, 'school B student must not be enrolled in school A class');
});

test('two-school fixture: tuition ledgers and installments stay inside their school', async () => {
  const ledgers = await db('tuition_ledgers').select('id', 'student_id');
  assert.equal(ledgers.length, 2);

  for (const ledger of ledgers) {
    const student = await db('users').where({ id: ledger.student_id }).first();
    assert.ok(student, `ledger ${ledger.id} references an unknown student`);

    const expectedSchool = student.id === USERS.a.student ? 'a' : 'b';
    assert.equal(student.school_id, SCHOOLS[expectedSchool].id);

    const installment = await db('tuition_installments').where({ ledger_id: ledger.id }).first();
    assert.ok(installment, `ledger ${ledger.id} must have an installment`);
  }
});

test('two-school fixture: resetFixture restores a pristine world', async () => {
  await db('users').where({ id: USERS.a.student }).update({ display_name: ' tampered ' });

  await resetFixture(db);

  const student = await db('users').where({ id: USERS.a.student }).first();
  assert.equal(student.display_name, 'A student');
  const count = await db('users').count('id as c').first();
  assert.equal(Number(count.c), 8);
});
