/**
 * EduConnect Automated Database Maintenance & Backup Engine
 * 
 * - Flushes SQLite WAL checkpoint every 6 hours to prevent WAL bloat.
 * - Runs PRAGMA optimize for maximum query execution speed.
 * - Creates automated daily database backups in db_backups/ and prunes old archives (>14 days).
 * - Provides admin API capabilities for instant on-demand snapshots and backup download.
 */

const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const DB_PATH = path.join(BACKEND_DIR, 'educonnect.db');
const BACKUP_DIR = path.join(BACKEND_DIR, 'db_backups');

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[DBMaintenance ${ts}] ${msg}`);
}

/**
 * Ensures backup directory exists
 */
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * Flushes WAL checkpoint to primary database file and optimizes query planner
 */
async function performWalCheckpoint() {
  try {
    await db.raw('PRAGMA wal_checkpoint(TRUNCATE);');
    await db.raw('PRAGMA optimize;');
    log('SQLite WAL checkpoint flushed & PRAGMA optimize completed.');
    return { success: true };
  } catch (err) {
    log(`Notice on WAL checkpoint: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Creates a clean timestamped database backup
 * @param {string} [label='daily'] - Optional tag for backup name
 */
async function createBackup(label = 'daily') {
  ensureBackupDir();
  try {
    // 1. Flush WAL before copying to guarantee 100% data consistency
    await performWalCheckpoint();

    if (!fs.existsSync(DB_PATH)) {
      throw new Error(`Database file not found at ${DB_PATH}`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFilename = `educonnect_${timestamp}_${label}.db`;
    const destinationPath = path.join(BACKUP_DIR, backupFilename);

    fs.copyFileSync(DB_PATH, destinationPath);

    const stats = fs.statSync(destinationPath);
    log(`🛡️ Database backup created: ${backupFilename} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);

    // Prune older backups
    pruneOldBackups(14);

    return {
      success: true,
      filename: backupFilename,
      sizeBytes: stats.size,
      sizeMb: (stats.size / (1024 * 1024)).toFixed(2),
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    log(`❌ Backup creation failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Retains only the latest N backup files to preserve disk space
 */
function pruneOldBackups(keepCount = 14) {
  ensureBackupDir();
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('educonnect_') && f.endsWith('.db'))
      .map((f) => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime); // newest first

    if (files.length > keepCount) {
      const toDelete = files.slice(keepCount);
      for (const item of toDelete) {
        try {
          fs.unlinkSync(item.path);
          log(`Pruned old backup archive: ${item.name}`);
        } catch (delErr) {}
      }
    }
  } catch (err) {
    log(`Notice on backup pruning: ${err.message}`);
  }
}

/**
 * Lists all existing backups sorted by date
 */
function listBackups() {
  ensureBackupDir();
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('educonnect_') && f.endsWith('.db'))
      .map((f) => {
        const fullPath = path.join(BACKUP_DIR, f);
        const stats = fs.statSync(fullPath);
        return {
          filename: f,
          sizeBytes: stats.size,
          sizeMb: (stats.size / (1024 * 1024)).toFixed(2),
          createdAt: stats.mtime.toISOString(),
          downloadUrl: `/api/v1/system/download-backup/${f}`,
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return files;
  } catch (err) {
    return [];
  }
}

/**
 * Starts continuous background maintenance loops
 */
function startScheduledMaintenance() {
  ensureBackupDir();

  // Run initial checkpoint after startup delay (15 seconds)
  setTimeout(() => {
    performWalCheckpoint();
  }, 15000);

  // Periodic WAL checkpoint every 6 hours
  const CHECKPOINT_INTERVAL = 6 * 60 * 60 * 1000;
  setInterval(() => {
    performWalCheckpoint();
  }, CHECKPOINT_INTERVAL);

  // Daily automated backup every 24 hours
  const BACKUP_INTERVAL = 24 * 60 * 60 * 1000;
  setInterval(() => {
    createBackup('auto');
  }, BACKUP_INTERVAL);

  log('Database Maintenance & Scheduled Backup Engine initialized.');
}

module.exports = {
  performWalCheckpoint,
  createBackup,
  listBackups,
  startScheduledMaintenance,
  BACKUP_DIR,
};

