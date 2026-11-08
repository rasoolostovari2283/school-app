require('dotenv').config();

/**
 * The environment of the running backend.
 *
 * `NODE_ENV` is never guessed. An unset (or blank) value used to fall back to
 * "development", the mode in which fabricated `mock_*` bearer tokens were
 * accepted (report finding A4). The application refuses to start without an
 * explicit `NODE_ENV`; `nodeEnv` only carries a safe fallback for the modules
 * that need a value.
 */
const rawNodeEnv = process.env.NODE_ENV;
const nodeEnvIsSet = Boolean(rawNodeEnv && rawNodeEnv.trim());
const nodeEnv = nodeEnvIsSet ? rawNodeEnv.trim() : 'production';

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv,
  nodeEnvIsSet,

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'educonnect',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 52428800,
  },

  sms: {
    apiKey: process.env.SMS_API_KEY,
    sender: process.env.SMS_SENDER,
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
};
