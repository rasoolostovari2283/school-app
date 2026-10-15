const config = require('./index');
const path = require('path');

module.exports = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: path.join(__dirname, '..', '..', 'educonnect.db'),
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, '..', 'database', 'migrations'),
    },
    seeds: {
      directory: path.join(__dirname, '..', 'database', 'seeds'),
    },
  },

  production: {
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
  },
};
