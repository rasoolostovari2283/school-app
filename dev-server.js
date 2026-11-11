const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

// Ensure required environment defaults for local/preview execution (SEC-CFG-001)
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET)) {
  console.error('❌ [EduConnect] FATAL: JWT_SECRET and JWT_REFRESH_SECRET must be explicitly set in production.');
  process.exit(1);
}
process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(32).toString('hex');
process.env.BACKEND_PORT = process.env.BACKEND_PORT || '5000';

async function prepareDatabase() {
  try {
    const db = require('./backend/src/config/database');
    await db.migrate.latest({
      directory: path.join(__dirname, 'backend/src/database/migrations'),
    });
    if (process.env.NODE_ENV !== 'production' || process.env.SEED_DEMO_DATA === 'true') {
      await db.seed.run({
        directory: path.join(__dirname, 'backend/src/database/seeds'),
      });
    }
    console.log('✅ [EduConnect] Database migrations & seeds verified.');
  } catch (err) {
    console.error('⚠️ [EduConnect] Database init warning:', err.message);
  }
}

async function startUnifiedServer() {
  await prepareDatabase();

  // 1. Start Express Backend on port 5000
  const backendEnv = {
    ...process.env,
    PORT: process.env.BACKEND_PORT || '5000',
  };

  const backendProc = spawn(process.execPath, [path.join(__dirname, 'backend/src/app.js')], {
    cwd: path.join(__dirname, 'backend'),
    env: backendEnv,
    stdio: 'inherit',
  });

  backendProc.on('error', (err) => {
    console.error('❌ [EduConnect Backend] Failed to start:', err.message);
  });

  // 2. Start Next.js Frontend on port 3000
  const isProd = process.env.NODE_ENV === 'production';
  const nextScript = isProd ? 'start' : 'dev';
  const frontendEnv = {
    ...process.env,
    PORT: '3000',
  };

  const frontendProc = spawn('npm', ['run', nextScript, '--workspace=frontend'], {
    cwd: __dirname,
    env: frontendEnv,
    stdio: 'inherit',
    shell: true,
  });

  const shutdown = () => {
    try { backendProc.kill('SIGTERM'); } catch {}
    try { frontendProc.kill('SIGTERM'); } catch {}
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startUnifiedServer();
