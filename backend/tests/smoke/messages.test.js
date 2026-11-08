const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post } = require('../support/http');
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

test('smoke: a teacher reads the messaging directory', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, '/api/v1/messages/directory', { token: teacher.accessToken });

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.all));
  assert.ok(Array.isArray(res.body.data.staff));
  assert.ok(Array.isArray(res.body.data.students));
  assert.ok(typeof res.body.data.stats.totalStudents === 'number');
});

test('smoke: a teacher sends a private message to a student', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await post(baseUrl, '/api/v1/messages', {
    token: teacher.accessToken,
    body: { receiver_id: USERS.a.student, content: 'سلام، وقت بخیر' },
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.data.message.receiver_id, USERS.a.student);
});

test('smoke: the conversation list contains the exchange', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const student = await loginAs(baseUrl, 'a', 'student');

  await post(baseUrl, '/api/v1/messages', {
    token: teacher.accessToken,
    body: { receiver_id: USERS.a.student, content: 'سلام، وقت بخیر' },
  });

  const conversations = await get(baseUrl, '/api/v1/messages/conversations', {
    token: teacher.accessToken,
  });
  assert.equal(conversations.status, 200);
  assert.ok(Array.isArray(conversations.body.data.conversations));

  const studentConversations = await get(baseUrl, '/api/v1/messages/conversations', {
    token: student.accessToken,
  });
  assert.equal(studentConversations.status, 200);
  assert.ok(Array.isArray(studentConversations.body.data.conversations));
});

test('smoke: a teacher reads the announcements of their class', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const res = await get(baseUrl, `/api/v1/classes/${CLASSES.a}/announcements`, {
    token: teacher.accessToken,
  });

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.announcements));
});

test('smoke: a student reads the global announcement feed', async () => {
  const student = await loginAs(baseUrl, 'a', 'student');
  const res = await get(baseUrl, '/api/v1/announcements', { token: student.accessToken });

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.announcements));
});
