const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post } = require('../support/http');
const { loginAs, ROLES } = require('../support/auth');
const { emailFor, USERS, SCHOOLS } = require('../fixtures/twoSchools');

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

test('smoke: every fixture role of both schools can log in and read its own profile', async () => {
  for (const school of ['a', 'b']) {
    for (const role of ROLES) {
      const session = await loginAs(baseUrl, school, role);

      assert.ok(session.accessToken, `${school}/${role} did not receive an access token`);
      assert.ok(session.refreshToken, `${school}/${role} did not receive a refresh token`);
      assert.equal(session.user.role, role);
      assert.equal(session.user.school_id, SCHOOLS[school].id);

      const me = await get(baseUrl, '/api/v1/auth/me', { token: session.accessToken });
      assert.equal(me.status, 200);
      assert.equal(me.body.data.user.id, session.user.id);
      assert.equal(me.body.data.user.school_id, SCHOOLS[school].id);
    }
  }
});

test('smoke: a wrong password is rejected with 401 and specifies password errorField', async () => {
  const res = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: emailFor('a', 'teacher'), password: 'not-the-fixture-password' },
  });

  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.errorField, 'password');
  assert.equal(res.body.errorCode, 'INVALID_PASSWORD');
  assert.ok(String(res.body.message).includes('رمز عبور'));
});

test('smoke: an unknown identifier is rejected with 401 and specifies username errorField', async () => {
  const res = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: 'nobody@school.test', password: 'whatever' },
  });

  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.errorField, 'username');
  assert.equal(res.body.errorCode, 'INVALID_USERNAME');
  assert.ok(String(res.body.message).includes('نام کاربری'));
});

test('smoke: an unauthenticated request to a protected route returns 401', async () => {
  const res = await get(baseUrl, '/api/v1/classes');
  assert.equal(res.status, 401);
});

test('smoke: the health endpoint is reachable without authentication', async () => {
  const res = await get(baseUrl, '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

test('smoke: the school list endpoint is reachable without authentication', async () => {
  const res = await get(baseUrl, '/api/v1/auth/schools');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
});

test('smoke: a user can refresh their access token', async () => {
  const session = await loginAs(baseUrl, 'a', 'student');
  const res = await post(baseUrl, '/api/v1/auth/refresh', {
    body: { refreshToken: session.refreshToken },
  });

  assert.equal(res.status, 200);
  assert.ok(res.body.data.accessToken);
});

test('smoke: the parent login flow resolves the child from the student code', async () => {
  const res = await post(baseUrl, '/api/v1/auth/parent-login', {
    body: { student_code: 'STD-A-1001' },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.student.id, USERS.a.student);
});
