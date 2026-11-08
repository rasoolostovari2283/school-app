/**
 * Per-file test harness.
 *
 * Boots the disposable database, seeds the two-school fixture and starts the
 * HTTP server once for the whole test file. `node --test` runs every test file
 * in its own process, so each file gets an isolated database, upload directory
 * and ephemeral port.
 */
const { db, migrate, destroy } = require('./database');
const { startServer, stopServer } = require('./server');
const { seedTwoSchools, resetFixture } = require('../fixtures/twoSchools');

let context = null;

/**
 * Prepare the database, fixture and HTTP server.
 * @returns {Promise<{baseUrl: string, port: number, db: import('knex')}>}
 */
async function setupHarness() {
  if (context) return context;
  await migrate();
  await seedTwoSchools(db);
  const { baseUrl, port } = await startServer();
  context = { baseUrl, port, db };
  return context;
}

/** Stop the server and remove the disposable database. */
async function teardownHarness() {
  if (!context) return;
  await stopServer();
  await destroy();
  context = null;
}

/**
 * Restore the fixture to its pristine state.
 * Call this from `beforeEach` in files whose tests mutate shared state.
 */
async function resetDatabase() {
  await resetFixture(db);
}

module.exports = { setupHarness, teardownHarness, resetDatabase, db };
