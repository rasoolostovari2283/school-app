/**
 * EduConnect Audit Logging & Security Activity Tracker
 * 
 * Records critical user actions (grade modifications, student enrolment, role changes,
 * class deletion, logins) for school accountability and managerial security auditing.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

let tableReady = false;

async function ensureAuditTable() {
  if (tableReady) return;
  try {
    const exists = await db.schema.hasTable('audit_logs');
    if (!exists) {
      await db.schema.createTable('audit_logs', (t) => {
        t.string('id').primary();
        t.string('user_id').nullable();
        t.string('user_name').nullable();
        t.string('user_role').nullable();
        t.string('action').notNullable(); // e.g. CREATE, UPDATE, DELETE, GRADE_CHANGE, LOGIN
        t.string('module').notNullable(); // e.g. GRADEBOOK, USERS, CLASSES, AUTH
        t.string('target_id').nullable();
        t.text('details').nullable();
        t.string('ip_address').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.index(['module', 'action']);
        t.index(['created_at']);
      });
      console.log('[AuditLogger] audit_logs table created.');
    }
    tableReady = true;
  } catch (err) {
    console.warn('[AuditLogger] ensureTable error:', err.message);
  }
}

/**
 * Logs an administrative or critical security action asynchronously
 */
async function logAudit({
  userId = null,
  userName = null,
  userRole = null,
  action,
  module,
  targetId = null,
  details = null,
  ip = null,
}) {
  try {
    await ensureAuditTable();
    const detailsStr = typeof details === 'object' ? JSON.stringify(details) : details;

    await db('audit_logs').insert({
      id: uuidv4(),
      user_id: userId,
      user_name: userName,
      user_role: userRole,
      action: action.toUpperCase(),
      module: module.toUpperCase(),
      target_id: targetId ? String(targetId) : null,
      details: detailsStr,
      ip_address: ip,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[AuditLogger] write error:', err.message);
  }
}

/**
 * Fetches recent audit logs for administration
 */
async function getAuditLogs({ limit = 50, offset = 0, module = null, action = null } = {}) {
  await ensureAuditTable();
  try {
    let query = db('audit_logs').orderBy('created_at', 'desc').limit(limit).offset(offset);

    if (module) query = query.where({ module: module.toUpperCase() });
    if (action) query = query.where({ action: action.toUpperCase() });

    const logs = await query;
    const totalCount = await db('audit_logs').count('id as count').first();

    return {
      logs,
      total: Number(totalCount?.count || 0),
    };
  } catch (err) {
    return { logs: [], total: 0 };
  }
}

module.exports = {
  logAudit,
  getAuditLogs,
};

