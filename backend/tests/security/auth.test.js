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
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post } = require('../support/http');
const { emailFor, phoneFor } = require('../fixtures/twoSchools');
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

expectFailure('[F11] POST /auth/login without a password must be rejected', async () => {
  const res = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: emailFor('a', 'teacher') },
  });

  assert.equal(
    res.status,
    401,
    `login without a password must fail, got ${res.status}: ${String(res.text).slice(0, 200)}`,
  );
});

expectFailure('[F11] POST /auth/login with the universal password 123456 must be rejected', async () => {
  const res = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: emailFor('a', 'teacher'), password: '123456' },
  });

  assert.equal(
    res.status,
    401,
    `the universal password must not authenticate, got ${res.status}: ${String(res.text).slice(0, 200)}`,
  );
});

expectFailure('[A1] POST /auth/register must not accept role=admin', async () => {
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

expectFailure('[A2] POST /auth/quick-entry must not authenticate an existing account without a password', async () => {
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

expectFailure('[A3] POST /auth/parent-login must not accept a partial student code', async () => {
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
