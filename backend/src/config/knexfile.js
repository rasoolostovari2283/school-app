const config = require('./index');
const path = require('path');

module.exports = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: path.join(__dirname, '..', '..', 'educonnect.db'),
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
  },

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
  } : {
    client: 'better-sqlite3',
    connection: {
      filename: path.join(__dirname, '..', '..', 'educonnect.db'),
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
  },
};
