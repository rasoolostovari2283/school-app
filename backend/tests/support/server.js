/**
 * Boots the real application (`src/app.js`) on an ephemeral port and exposes
 * the base URL used by the HTTP helpers.
 *
 * The application is NOT modified or stubbed: the tests exercise the same
 * middleware stack, routers and error handler that production uses.
 */
require('./env');

const { server } = require('../../src/app');

let startPromise = null;

/**
 * Start the server (idempotent) and return its connection details.
 * @returns {Promise<{baseUrl: string, port: number, server: import('http').Server}>}
 */
async function startServer() {
  if (!startPromise) {
    startPromise = (async () => {
      if (!server.listening) {
        await new Promise((resolve, reject) => {
          server.once('listening', resolve);
          server.once('error', reject);
        });
      }
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      return { baseUrl: `http://127.0.0.1:${port}`, port, server };
    })();
  }
  return startPromise;
}

/** Stop the server and release every open connection. */
async function stopServer() {
  if (!server.listening) return;
  if (typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }
  await new Promise((resolve) => server.close(() => resolve()));
}

module.exports = { startServer, stopServer, server };
