const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post, put } = require('../support/http');
const { loginAs } = require('../support/auth');
const { CLASSES, USERS } = require('../fixtures/twoSchools');

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

test('smoke: a teacher only sees the classes of their own school', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, '/api/v1/classes', { token: teacher.accessToken });

  assert.equal(res.status, 200);
  const ids = res.body.data.classes.map((c) => c.id);
  assert.ok(ids.includes(CLASSES.a), 'teacher must see their own class');
  assert.ok(!ids.includes(CLASSES.b), 'teacher must not see the other school class');
});

test('smoke: a student sees the class they are enrolled in', async () => {
  const student = await loginAs(baseUrl, 'a', 'student');
  const res = await get(baseUrl, '/api/v1/classes', { token: student.accessToken });

  assert.equal(res.status, 200);
  const ids = res.body.data.classes.map((c) => c.id);
  assert.deepEqual(ids, [CLASSES.a]);
});

test('smoke: a parent sees the classes of their child', async () => {
  const parent = await loginAs(baseUrl, 'a', 'parent');
  const res = await get(baseUrl, '/api/v1/classes', { token: parent.accessToken });

  assert.equal(res.status, 200);
  const ids = res.body.data.classes.map((c) => c.id);
  assert.deepEqual(ids, [CLASSES.a]);
});

test('smoke: the class owner can read the class details', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, `/api/v1/classes/${CLASSES.a}`, { token: teacher.accessToken });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.class.id, CLASSES.a);
});

test('smoke: the class owner can read the roster', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, `/api/v1/classes/${CLASSES.a}/roster`, { token: teacher.accessToken });

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.students));
  assert.ok(
    res.body.data.students.some((s) => s.id === USERS.a.student),
    'roster must contain the enrolled student',
  );
});

test('smoke: a teacher can rename their own class', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await put(baseUrl, `/api/v1/classes/${CLASSES.a}`, {
    token: teacher.accessToken,
    body: { name: 'کلاس الف (ویرایش‌شده)' },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.class.name, 'کلاس الف (ویرایش‌شده)');
});

test('smoke: a teacher can create a class', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await post(baseUrl, '/api/v1/classes', {
    token: teacher.accessToken,
    body: { name: 'کلاس جدید', subject: 'شیمی', grade: 'پایه یازدهم' },
  });

  assert.equal(res.status, 201);
  assert.ok(res.body.data.class.id);
});
