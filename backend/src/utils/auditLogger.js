/**
 * EduConnect Audit Logging & Security Activity Tracker
 *
 * Records critical user actions (grade modifications, student enrolment, role changes,
 * class deletion, logins) for school accountability and managerial security auditing.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

async function logAudit(firstArg, actionArg, moduleArg, targetIdArg = null, detailsArg = null) {
  try {
    let userId = null;
    let userName = null;
    let userRole = null;
    let action = actionArg;
    let moduleName = moduleArg;
    let targetId = targetIdArg;
    let details = detailsArg;
    let ip = null;

    if (firstArg && typeof firstArg === 'object' && !firstArg.headers && !firstArg.user && (firstArg.action || firstArg.module)) {
      userId = firstArg.userId || null;
      userName = firstArg.userName || null;
      userRole = firstArg.userRole || null;
      action = firstArg.action;
      moduleName = firstArg.module;
      targetId = firstArg.targetId || null;
      details = firstArg.details || null;
      ip = firstArg.ip || null;
    } else if (firstArg && typeof firstArg === 'object') {
      userId = firstArg.user?.id || null;
      userName = firstArg.user?.display_name || null;
      userRole = firstArg.user?.role || null;
      ip = firstArg.ip || firstArg.headers?.['x-forwarded-for'] || null;
    }

    const detailsStr = typeof details === 'object' && details !== null ? JSON.stringify(details) : details;

    await db('audit_logs').insert({
      id: uuidv4(),
      user_id: userId,
      user_name: userName,
      user_role: userRole,
      action: String(action || 'ACTION').toUpperCase(),
      module: String(moduleName || 'SYSTEM').toUpperCase(),
      target_id: targetId ? String(targetId) : null,
      details: detailsStr,
      ip_address: ip,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[AuditLogger] write error:', err.message);
  }
}

async function getAuditLogs({ limit = 50, offset = 0, module = null, action = null, schoolId = null } = {}) {
  try {
    let baseQuery = db('audit_logs')
      .leftJoin('users', 'users.id', 'audit_logs.user_id');

    if (schoolId) {
      baseQuery = baseQuery.where('users.school_id', schoolId);
    }
    if (module) baseQuery = baseQuery.where('audit_logs.module', module.toUpperCase());
    if (action) baseQuery = baseQuery.where('audit_logs.action', action.toUpperCase());

    const logs = await baseQuery
      .clone()
      .select('audit_logs.*')
      .orderBy('audit_logs.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const totalCount = await baseQuery.clone().count('audit_logs.id as count').first();

    return {
      logs,
      total: Number(totalCount?.count || 0),
    };
  } catch (_err) {
    return { logs: [], total: 0 };
  }
}

module.exports = {
  logAudit,
  getAuditLogs,
};
