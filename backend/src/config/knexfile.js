const config = require('./index');
const path = require('path');

const DEV_DB_FILE = path.join(__dirname, '..', '..', 'educonnect.db');
const TEST_DB_FILE = process.env.TEST_DB_FILE || path.join(__dirname, '..', '..', '.tmp', 'educonnect.test.db');

/**
 * Shared SQLite configuration.
 * @param {string} filename - Absolute path of the SQLite database file.
 */
const sqliteConfig = (filename) => ({
  client: 'better-sqlite3',
  connection: {
    filename,
  },
  useNullAsDefault: true,
  pool: {
    afterCreate: (db, done) => {
      try {
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('busy_timeout = 10000');
        db.pragma('cache_size = -64000');
        db.pragma('foreign_keys = ON');
      } catch (e) {
        console.error('Failed to set sqlite pragmas:', e.message);
      }
      done(null, db);
    },
  },
  migrations: {
    directory: path.join(__dirname, '..', 'database', 'migrations'),
  },
  seeds: {
    directory: path.join(__dirname, '..', 'database', 'seeds'),
  },
});

module.exports = {
  development: sqliteConfig(DEV_DB_FILE),

  // Disposable database used by the automated test suite (Phase 0 safety net).
  // Never points at the development or production database file.
  test: sqliteConfig(TEST_DB_FILE),

  production: process.env.DB_CLIENT === 'pg' ? {
    client: 'pg',
    connection: {
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      ssl: { rejectUnauthorized: false },
    },
    migrations: {
      directory: path.join(__dirname, '..', 'database', 'migrations'),
    },
    seeds: {
      directory: path.join(__dirname, '..', 'database', 'seeds'),
    },
    pool: {
      min: 2,
      max: 20,
    },
  } : sqliteConfig(DEV_DB_FILE),
};
