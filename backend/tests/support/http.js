/**
 * Thin fetch-based HTTP client for the test suite.
 *
 * A dedicated helper is used instead of `supertest` so the project keeps zero
 * new runtime dependencies.
 */

/**
 * Perform an HTTP request against the test server.
 *
 * @param {string} baseUrl - e.g. `http://127.0.0.1:51234`
 * @param {string} method - HTTP verb
 * @param {string} pathname - Path beginning with `/`
 * @param {object} [options]
 * @param {string} [options.token] - Bearer token
 * @param {any}    [options.body] - JSON body
 * @param {object} [options.headers] - Extra headers
 * @param {boolean}[options.raw] - Return the raw body instead of parsing JSON
 */
async function api(baseUrl, method, pathname, options = {}) {
  const { token, body, headers = {}, raw = false } = options;

  const init = {
    method,
    headers: { ...headers },
  };

  if (token) {
    init.headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${pathname}`, init);
  const text = await response.text();

  let parsed = null;
  if (!raw) {
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
  }

  return {
    status: response.status,
    body: parsed,
    text,
    headers: response.headers,
  };
}

/** GET helper. */
const get = (baseUrl, pathname, options) => api(baseUrl, 'GET', pathname, options);
/** POST helper. */
const post = (baseUrl, pathname, options) => api(baseUrl, 'POST', pathname, options);
/** PUT helper. */
const put = (baseUrl, pathname, options) => api(baseUrl, 'PUT', pathname, options);
/** DELETE helper. */
const del = (baseUrl, pathname, options) => api(baseUrl, 'DELETE', pathname, options);

module.exports = { api, get, post, put, del };
