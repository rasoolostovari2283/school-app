/**
 * Shared assertions for the security regression suite.
 */
const assert = require('node:assert/strict');
const { api } = require('./http');

/**
 * Assert that a cross-tenant request is rejected.
 *
 * @param {string} baseUrl
 * @param {object} options
 * @param {string} options.finding - Finding id, e.g. `A13`
 * @param {string} options.method - HTTP verb
 * @param {string} options.path - Request path
 * @param {string} [options.token] - Bearer token of the requesting user
 * @param {any}    [options.body] - JSON body
 * @param {number} [options.expectedStatus] - Denial status, defaults to 403
 * @returns {Promise<{status: number, body: any, text: string}>}
 */
async function expectCrossTenantDenied(baseUrl, options) {
  const {
    finding,
    method,
    path,
    token,
    body,
    expectedStatus = 403,
  } = options;

  const res = await api(baseUrl, method, path, { token, body });

  assert.equal(
    res.status,
    expectedStatus,
    `[${finding}] expected HTTP ${expectedStatus} for ${method} ${path}, `
      + `got ${res.status}: ${String(res.text).slice(0, 300)}`,
  );

  return res;
}

/**
 * Assert that a payload does not mention any of the given identifiers.
 *
 * @param {any} payload
 * @param {string[]} identifiers
 * @param {object} [options]
 * @param {string} [options.finding]
 * @param {string} [options.label]
 */
function expectNoLeak(payload, identifiers, options = {}) {
  const { finding = '', label = 'response' } = options;
  const serialized = JSON.stringify(payload ?? null);

  for (const identifier of identifiers) {
    assert.ok(
      !serialized.includes(identifier),
      `[${finding}] ${label} leaked the foreign identifier "${identifier}"`,
    );
  }
}

module.exports = { expectCrossTenantDenied, expectNoLeak };
