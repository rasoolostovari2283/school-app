/**
 * Authentication regression tests (Phase 0 safety net).
 *
 * Every `expectFailure` below documents a finding of the security report that
 * is still open. `expectFailure` (the `node:test` equivalent of `test.failing`)
 * inverts the expectation: the test MUST fail today. When a later remediation
 * phase fixes the finding, the test starts passing and `expectFailure` reports
 * it as an error — which is exactly the signal to remove the wrapper.
 *
 * Finding ids refer to the security report:
 *   F11 — universal / default password authentication
 *   A1  — unauthenticated administrative account creation
 *   A2  — quick-entry logs in an existing account without a password
 *   A3  — parent account takeover via a partial student code
 *   A4  — development-mode mock token authentication
 */
const { test, expectFailure, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { setupHarness, teardownHarness, resetDatabase, db } = require('../support/harness');
const { get, post } = require('../support/http');
const { emailFor, phoneFor, FIXTURE_PASSWORD } = require('../fixtures/twoSchools');
const { ROLES } = require('../support/auth');
const { BACKEND_DIR } = require('../support/env');

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

test('[F11] POST /auth/login without a password must be rejected', async () => {
  const res = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: emailFor('a', 'teacher') },
  });

  assert.equal(
    res.status,
    401,
    `login without a password must fail, got ${res.status}: ${String(res.text).slice(0, 200)}`,
  );
});

test('[F11] POST /auth/login with the universal password 123456 must be rejected', async () => {
  const res = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: emailFor('a', 'teacher'), password: '123456' },
  });

  assert.equal(
    res.status,
    401,
    `the universal password must not authenticate, got ${res.status}: ${String(res.text).slice(0, 200)}`,
  );
});

test('[F11] the correct password still authenticates every fixture role', async () => {
  for (const school of ['a', 'b']) {
    for (const role of ROLES) {
      const res = await post(baseUrl, '/api/v1/auth/login', {
        body: { identifier: emailFor(school, role), password: FIXTURE_PASSWORD },
      });

      assert.equal(
        res.status,
        200,
        `${school}/${role} must still be able to log in with its own password, got ${res.status}: ${String(res.text).slice(0, 200)}`,
      );
      assert.ok(res.body.data.accessToken, `${school}/${role} received no access token`);
      assert.ok(res.body.data.refreshToken, `${school}/${role} received no refresh token`);
      assert.equal(res.body.data.user.role, role);
    }
  }
});

test('[F11] an account with a legacy short password can still sign in', async () => {
  // Accounts created before the 8 character rule keep their password: only the
  // presence of a password is required on login.
  const passwordHash = await bcrypt.hash('old1234', 8);
  await db('users').insert({
    id: 'legacy-short-password',
    email: 'legacy.short@school.test',
    phone: '09120009999',
    password_hash: passwordHash,
    display_name: 'Legacy Short Password',
    username: 'legacy_short',
    role: 'student',
    school_id: 'school-a',
    locale: 'fa',
    is_verified: true,
  });

  const res = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: 'legacy.short@school.test', password: 'old1234' },
  });

  assert.equal(
    res.status,
    200,
    `a legacy short password must still sign in, got ${res.status}: ${String(res.text).slice(0, 200)}`,
  );
  assert.ok(res.body.data.accessToken);
});

test('[F11] registration requires a password of at least 8 characters', async () => {
  const tooShort = await post(baseUrl, '/api/v1/auth/register', {
    body: {
      display_name: 'Too Short Password',
      email: 'too.short@example.com',
      password: 'old1234',
    },
  });
  assert.equal(
    tooShort.status,
    400,
    `a 7 character password must be rejected, got ${tooShort.status}: ${String(tooShort.text).slice(0, 200)}`,
  );

  const longEnough = await post(baseUrl, '/api/v1/auth/register', {
    body: {
      display_name: 'Long Enough Password',
      email: 'long.enough@example.com',
      password: 'Passw0rd',
    },
  });
  assert.equal(
    longEnough.status,
    201,
    `an 8 character password must be accepted, got ${longEnough.status}: ${String(longEnough.text).slice(0, 200)}`,
  );
  assert.ok(longEnough.body.data.accessToken);
});

test('[A1] POST /auth/register must not accept role=admin', async () => {
  const res = await post(baseUrl, '/api/v1/auth/register', {
    body: {
      display_name: 'Attacker Account',
      role: 'admin',
      password: 'Str0ngFixturePass!2026',
      email: 'attacker@example.com',
    },
  });

  assert.equal(
    res.status,
    400,
    `self-registration must not mint an administrator, got ${res.status}: ${String(res.text).slice(0, 200)}`,
  );
});

test('[A1] POST /auth/quick-entry must not accept role=admin', async () => {
  const res = await post(baseUrl, '/api/v1/auth/quick-entry', {
    body: {
      display_name: 'Attacker Quick Entry',
      phone: '09128887777',
      role: 'admin',
      password: 'Str0ngFixturePass!2026',
    },
  });

  assert.equal(
    res.status,
    400,
    `quick entry must not mint an administrator, got ${res.status}: ${String(res.text).slice(0, 200)}`,
  );
});

test('[A1] a privileged role requested by the client is never granted', async () => {
  // The service decides the role itself: even when the validator is bypassed,
  // an anonymous caller can only reach a non-privileged role.
  const authService = require('../../src/modules/auth/auth.service');
  const result = await authService.register({
    display_name: 'Direct Service Administrator',
    role: 'admin',
    password: 'Str0ngFixturePass!2026',
    email: 'direct.admin@example.com',
  });

  assert.equal(result.user.role, 'student', 'a privileged role must never be granted');

  const stored = await db('users').where({ email: 'direct.admin@example.com' }).first();
  assert.equal(stored.role, 'student');
});

test('[A1] a self-registered account keeps its non-privileged role and can sign in', async () => {
  const registered = await post(baseUrl, '/api/v1/auth/register', {
    body: {
      display_name: 'Self Registered Teacher',
      role: 'teacher',
      password: 'Str0ngFixturePass!2026',
      email: 'self.teacher@example.com',
    },
  });

  assert.equal(
    registered.status,
    201,
    `a self-service registration must still work, got ${registered.status}: ${String(registered.text).slice(0, 200)}`,
  );
  assert.equal(registered.body.data.user.role, 'teacher');
  assert.ok(registered.body.data.accessToken);

  const signedIn = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: 'self.teacher@example.com', password: 'Str0ngFixturePass!2026' },
  });

  assert.equal(
    signedIn.status,
    200,
    `the registered account must be able to sign in, got ${signedIn.status}: ${String(signedIn.text).slice(0, 200)}`,
  );
  assert.equal(signedIn.body.data.user.role, 'teacher');
});

test('[A2] POST /auth/quick-entry must not authenticate an existing account without a password', async () => {
  const res = await post(baseUrl, '/api/v1/auth/quick-entry', {
    body: {
      display_name: 'A teacher',
      phone: phoneFor('a', 'teacher'),
      role: 'teacher',
    },
  });

  assert.equal(
    res.status,
    401,
    `quick entry must not issue tokens for an existing account, got ${res.status}: ${String(res.text).slice(0, 200)}`,
  );
});

test('[A2] POST /auth/quick-entry must not authenticate an existing account with a wrong password', async () => {
  const res = await post(baseUrl, '/api/v1/auth/quick-entry', {
    body: {
      display_name: 'A teacher',
      phone: phoneFor('a', 'teacher'),
      role: 'teacher',
      password: 'not-the-fixture-password',
    },
  });

  assert.equal(
    res.status,
    401,
    `quick entry must not issue tokens for a wrong password, got ${res.status}: ${String(res.text).slice(0, 200)}`,
  );
});

test('[A2] POST /auth/quick-entry authenticates an existing account with its own password', async () => {
  const res = await post(baseUrl, '/api/v1/auth/quick-entry', {
    body: {
      display_name: 'A teacher',
      phone: phoneFor('a', 'teacher'),
      role: 'teacher',
      password: FIXTURE_PASSWORD,
    },
  });

  assert.equal(
    res.status,
    200,
    `quick entry must still work for the owner of an account, got ${res.status}: ${String(res.text).slice(0, 200)}`,
  );
  assert.equal(res.body.data.isNew, false);
  assert.equal(res.body.data.user.id, 'a-teacher');
  assert.ok(res.body.data.accessToken);
  assert.ok(res.body.data.refreshToken);
});

test('[A2] POST /auth/quick-entry still creates a new non-privileged account', async () => {
  const res = await post(baseUrl, '/api/v1/auth/quick-entry', {
    body: {
      display_name: 'Brand New Student',
      phone: '09127776666',
      role: 'student',
      password: 'Str0ngFixturePass!2026',
    },
  });

  assert.equal(
    res.status,
    200,
    `quick entry must still create a new account, got ${res.status}: ${String(res.text).slice(0, 200)}`,
  );
  assert.equal(res.body.data.isNew, true);
  assert.equal(res.body.data.user.role, 'student');
  assert.ok(res.body.data.accessToken);
});

test('[A3] POST /auth/parent-login must not accept a partial student code', async () => {
  const res = await post(baseUrl, '/api/v1/auth/parent-login', {
    body: {
      student_code: '2002',
      parent_name: 'Attacker',
      phone: '09129999999',
    },
  });

  assert.equal(
    res.status,
    401,
    `a partial student code must not authenticate a parent, got ${res.status}: ${String(res.text).slice(0, 200)}`,
  );
});

test('[A3] POST /auth/parent-login resolves the child from the exact student code', async () => {
  const res = await post(baseUrl, '/api/v1/auth/parent-login', {
    body: { student_code: 'STD-A-1001' },
  });

  assert.equal(
    res.status,
    200,
    `the exact student code must still resolve the child, got ${res.status}: ${String(res.text).slice(0, 200)}`,
  );
  assert.equal(res.body.data.student.id, 'a-student');
  assert.ok(res.body.data.accessToken);
});

test('[A3] POST /auth/parent-login accepts the code without its STD- prefix', async () => {
  const res = await post(baseUrl, '/api/v1/auth/parent-login', {
    body: { student_code: 'A-1001' },
  });

  assert.equal(
    res.status,
    200,
    `the canonical short spelling must still resolve the child, got ${res.status}: ${String(res.text).slice(0, 200)}`,
  );
  assert.equal(res.body.data.student.id, 'a-student');
});

test('[A3] POST /auth/parent-login never rewrites the identity of an existing parent', async () => {
  const before = await db('users').where({ id: 'a-parent' }).first();

  const res = await post(baseUrl, '/api/v1/auth/parent-login', {
    body: {
      student_code: 'STD-A-1001',
      parent_name: 'Attacker',
      phone: '09129999999',
    },
  });

  assert.equal(
    res.status,
    200,
    `the parent must still be able to sign in, got ${res.status}: ${String(res.text).slice(0, 200)}`,
  );

  const after = await db('users').where({ id: 'a-parent' }).first();
  assert.equal(after.display_name, before.display_name, 'the display name must not be rewritten');
  assert.equal(after.phone, before.phone, 'the phone number must not be rewritten');
  assert.equal(after.student_code, before.student_code, 'the student code must not be rewritten');
});

expectFailure('[A4] NODE_ENV must not default to "development" when it is unset', () => {
  const reported = execFileSync(
    process.execPath,
    ['-e', "console.log(require('./src/config').nodeEnv)"],
    {
      cwd: BACKEND_DIR,
      env: { ...process.env, NODE_ENV: '' },
      encoding: 'utf8',
    },
  ).trim();

  assert.notEqual(
    reported,
    'development',
    'the backend must not silently run in development mode (it accepts mock_* tokens there)',
  );
});

test('[A4] a mock_* bearer token is rejected outside development mode', async () => {
  const res = await get(baseUrl, '/api/v1/classes', { token: 'mock_admin' });
  assert.equal(res.status, 401);
});

test('[A4] NODE_ENV is documented in .env.example', () => {
  const envExample = require('node:fs').readFileSync(
    path.join(BACKEND_DIR, '.env.example'),
    'utf8',
  );
  assert.match(envExample, /^NODE_ENV=/m, '.env.example must document NODE_ENV');
});
