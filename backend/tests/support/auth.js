/**
 * Login helpers for the test suite.
 *
 * Each fixture account has a real bcrypt hash of a password that is NOT the
 * universal `123456` literal, so the helpers exercise the genuine credential
 * path rather than the universal-password bypass documented in the report.
 */
const { post } = require('./http');
const { emailFor, FIXTURE_PASSWORD } = require('../fixtures/twoSchools');

const ROLES = ['admin', 'teacher', 'student', 'parent'];

/**
 * Log a user in through the real `/api/v1/auth/login` endpoint.
 *
 * @param {string} baseUrl
 * @param {string} identifier - e-mail, phone, username or student code
 * @param {string} [password]
 * @returns {Promise<{user: object, accessToken: string, refreshToken: string}>}
 */
async function login(baseUrl, identifier, password = FIXTURE_PASSWORD) {
  const res = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier, password },
  });

  if (res.status !== 200 || !res.body || !res.body.data || !res.body.data.accessToken) {
    throw new Error(`Login failed for "${identifier}": HTTP ${res.status} ${res.text}`);
  }

  return res.body.data;
}

/**
 * Log in as one fixture role of one school.
 *
 * @param {string} baseUrl
 * @param {'a'|'b'} school
 * @param {'admin'|'teacher'|'student'|'parent'} role
 * @param {string} [password]
 */
async function loginAs(baseUrl, school, role, password = FIXTURE_PASSWORD) {
  return login(baseUrl, emailFor(school, role), password);
}

/**
 * Log in as every role of one school.
 *
 * @param {string} baseUrl
 * @param {'a'|'b'} school
 * @returns {Promise<Record<string, {user: object, accessToken: string}>>}
 */
async function loginSchool(baseUrl, school) {
  const sessions = {};
  for (const role of ROLES) {
    sessions[role] = await loginAs(baseUrl, school, role);
  }
  return sessions;
}

/**
 * Log in as every role of both schools.
 *
 * @param {string} baseUrl
 * @returns {Promise<{a: object, b: object}>}
 */
async function loginAll(baseUrl) {
  return {
    a: await loginSchool(baseUrl, 'a'),
    b: await loginSchool(baseUrl, 'b'),
  };
}

module.exports = { login, loginAs, loginSchool, loginAll, ROLES };
