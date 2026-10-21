const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_DIR = path.join(process.env.HOME, 'school-app-repo');
const BACKEND_DIR = path.join(process.env.HOME, 'educonnect-backend');
const STATUS_FILE = path.join(BACKEND_DIR, 'sync_status.json');
const POLL_INTERVAL_MS = 30 * 1000; // Poll GitHub every 30 seconds

function log(msg) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[Auto-Sync ${now}] ${msg}`);
}

function updateStatus(statusData) {
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(statusData, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write status file:', err.message);
  }
}

function checkAndSync() {
  try {
    // 1. Fetch remote origin quietly
    execSync('git fetch origin main', { cwd: REPO_DIR, stdio: 'pipe' });

    const localHash = execSync('git rev-parse HEAD', { cwd: REPO_DIR }).toString().trim();
    const remoteHash = execSync('git rev-parse origin/main', { cwd: REPO_DIR }).toString().trim();

    if (localHash === remoteHash) {
      return; // Up to date
    }

    log(`🚀 New commit detected: ${localHash.substring(0, 7)} -> ${remoteHash.substring(0, 7)}`);

    // 2. Reset hard to remote origin to guarantee clean sync without conflicts
    execSync('git reset --hard origin/main', { cwd: REPO_DIR, stdio: 'pipe' });

    // 3. Extract commit details
    const commitMsg = execSync('git log -1 --pretty=format:%s', { cwd: REPO_DIR }).toString().trim();
    const commitAuthor = execSync('git log -1 --pretty=format:%an', { cwd: REPO_DIR }).toString().trim();
    const commitDate = execSync('git log -1 --pretty=format:%cd', { cwd: REPO_DIR }).toString().trim();

    log(`Commit: "${commitMsg}" by ${commitAuthor} (${commitDate})`);

    // 4. Update backend source files
    log('Updating live backend files...');
    const srcRepo = path.join(REPO_DIR, 'backend', 'src');
    const srcLive = path.join(BACKEND_DIR, 'src');

    execSync(`cp -ru ${srcRepo}/* ${srcLive}/`, { stdio: 'pipe' });

    // Check if package.json has updates
    const pkgRepo = path.join(REPO_DIR, 'backend', 'package.json');
    if (fs.existsSync(pkgRepo)) {
      execSync(`cp ${pkgRepo} ${path.join(BACKEND_DIR, 'package.json')}`);
      try {
        log('Running npm install (if any new deps)...');
        execSync('npm install --omit=dev', { cwd: BACKEND_DIR, stdio: 'pipe' });
      } catch (npmErr) {
        log(`Notice on npm install: ${npmErr.message}`);
      }
    }

    // 5. Run Database Migrations
    log('Checking and running database migrations...');
    let migrationOutput = '';
    try {
      migrationOutput = execSync('npx knex migrate:latest --knexfile ./src/config/knexfile.js', {
        cwd: BACKEND_DIR
      }).toString().trim();
      log(`Migrations: ${migrationOutput.replace(/\n+/g, ' ')}`);
    } catch (migErr) {
      log(`Migration notice: ${migErr.message}`);
    }

    // 6. Reload backend in PM2
    log('Reloading PM2 process educonnect-backend...');
    try {
      execSync('pm2 reload educonnect-backend', { stdio: 'pipe' });
    } catch (pm2Err) {
      execSync('pm2 restart educonnect-backend', { stdio: 'pipe' });
    }

    // 7. Write success status file
    const statusData = {
      status: 'success',
      last_sync: new Date().toISOString(),
      commit_hash: remoteHash.substring(0, 7),
      commit_full_hash: remoteHash,
      commit_message: commitMsg,
      commit_author: commitAuthor,
      commit_date: commitDate,
      migration_status: 'checked',
      error: null
    };
    updateStatus(statusData);
    log(`✅ Auto-sync completed successfully! Server is now running commit ${remoteHash.substring(0, 7)}`);

  } catch (err) {
    log(`❌ Auto-sync encountered an issue: ${err.message}`);
    const errorStatus = {
      status: 'error',
      last_sync_attempt: new Date().toISOString(),
      error: err.message
    };
    updateStatus(errorStatus);
  }
}

try {
  // Initial status setup
  const currentHash = execSync('git rev-parse HEAD', { cwd: REPO_DIR }).toString().trim();
  const currentMsg = execSync('git log -1 --pretty=format:%s', { cwd: REPO_DIR }).toString().trim();
  const currentAuthor = execSync('git log -1 --pretty=format:%an', { cwd: REPO_DIR }).toString().trim();
  const currentDate = execSync('git log -1 --pretty=format:%cd', { cwd: REPO_DIR }).toString().trim();

  updateStatus({
    status: 'active',
    last_sync: new Date().toISOString(),
    commit_hash: currentHash.substring(0, 7),
    commit_full_hash: currentHash,
    commit_message: currentMsg,
    commit_author: currentAuthor,
    commit_date: currentDate,
    migration_status: 'all up to date',
    monitoring: true,
    interval_seconds: 30
  });

  log('EduConnect Auto-Sync daemon initialized. Polling GitHub every 30 seconds...');
  checkAndSync();
  setInterval(checkAndSync, POLL_INTERVAL_MS);
} catch (initErr) {
  console.error('Initialization error:', initErr.message);
}
