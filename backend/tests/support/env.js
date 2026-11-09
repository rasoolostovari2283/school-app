/**
 * Test environment bootstrap.
 *
 * This module MUST be loaded before any application module, because
 * `src/config/index.js` and `src/config/database.js` read the environment once
 * at require time.
 *
 * Every test process gets its own disposable SQLite file, its own upload
 * directory and its own ephemeral signing keys, so the suite can run in
 * parallel without touching the development or production database.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const TMP_ROOT = path.join(BACKEND_DIR, '.tmp');
const RUN_ID = String(process.pid);

// ── Application environment ──
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // 0 => the OS assigns a free ephemeral port
process.env.TEST_DB_FILE = path.join(TMP_ROOT, `educonnect.test.${RUN_ID}.db`);
process.env.UPLOAD_DIR = path.join(TMP_ROOT, `uploads.${RUN_ID}`);

// Ephemeral signing keys, generated at runtime. They are never written to disk
// and never committed to the repository.
process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(48).toString('hex');

fs.mkdirSync(TMP_ROOT, { recursive: true });
fs.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });

module.exports = {
  BACKEND_DIR,
  TMP_ROOT,
  RUN_ID,
  TEST_DB_FILE: process.env.TEST_DB_FILE,
  UPLOAD_DIR: process.env.UPLOAD_DIR,
};
