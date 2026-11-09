/**
 * Database lifecycle for the test suite.
 *
 * The suite never touches `backend/educonnect.db`: each test process runs the
 * real migrations against its own disposable SQLite file.
 */
require('./env');

const fs = require('fs');
const db = require('../../src/config/database');
const { TEST_DB_FILE, UPLOAD_DIR } = require('./env');

/** Run every pending migration against the disposable test database. */
async function migrate() {
  await db.migrate.latest();
}

/** Close the connection and delete the disposable database and upload files. */
async function destroy() {
  try {
    await db.destroy();
  } catch {
    /* already closed */
  }
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${TEST_DB_FILE}${suffix}`;
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      /* best effort */
    }
  }
  try {
    if (fs.existsSync(UPLOAD_DIR)) fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

module.exports = { db, migrate, destroy, TEST_DB_FILE };
