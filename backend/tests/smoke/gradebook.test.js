const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post } = require('../support/http');
const { loginAs } = require('../support/auth');
const { CLASSES, USERS, GRADEBOOK_CATEGORIES } = require('../fixtures/twoSchools');

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

test('smoke: the class teacher reads the gradebook of their class', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, `/api/v1/gradebook/classes/${CLASSES.a}`, {
    token: teacher.accessToken,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.class.id, CLASSES.a);
  assert.ok(
    res.body.data.categories.some((c) => c.id === GRADEBOOK_CATEGORIES.a),
    'gradebook must expose the class categories',
  );
  assert.ok(
    res.body.data.students.some((s) => s.id === USERS.a.student),
    'gradebook must expose the enrolled student',
  );
});

test('smoke: the class teacher writes and reads a score', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');

  const written = await post(baseUrl, '/api/v1/gradebook/scores', {
    token: teacher.accessToken,
    body: {
      category_id: GRADEBOOK_CATEGORIES.a,
      student_id: USERS.a.student,
      score: 19.5,
      teacher_comment: 'خوب',
    },
  });
  assert.equal(written.status, 200);
  assert.equal(written.body.data.score, 19.5);

  const gradebook = await get(baseUrl, `/api/v1/gradebook/classes/${CLASSES.a}`, {
    token: teacher.accessToken,
  });
  const student = gradebook.body.data.students.find((s) => s.id === USERS.a.student);
  assert.equal(student.scores[GRADEBOOK_CATEGORIES.a].score, 19.5);
  assert.equal(student.weightedAverage, 19.5);
});

test('smoke: the class teacher creates an evaluation category', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await post(baseUrl, '/api/v1/gradebook/categories', {
    token: teacher.accessToken,
    body: {
      class_id: CLASSES.a,
      title: 'آزمون میان‌ترم',
      weight: 1,
      max_score: 20,
      term: 'term1',
    },
  });

  assert.equal(res.status, 201);
  assert.ok(res.body.data.category.id);
});

test('smoke: a score outside the 0..20 range is rejected', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await post(baseUrl, '/api/v1/gradebook/scores', {
    token: teacher.accessToken,
    body: {
      category_id: GRADEBOOK_CATEGORIES.a,
      student_id: USERS.a.student,
      score: 55,
    },
  });

  assert.equal(res.status, 400);
});

test('smoke: the class teacher reads a report card for their student', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, `/api/v1/gradebook/report-card/${USERS.a.student}`, {
    token: teacher.accessToken,
  });

  assert.equal(res.status, 200);
});
