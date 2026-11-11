/**
 * EduConnect Audit Logging & Security Activity Tracker
 *
 * Records critical user actions (grade modifications, student enrolment, role changes,
 * class deletion, logins) for school accountability and managerial security auditing.
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../config/database');
const config = require('../config');

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

    const id = uuidv4();
    const createdAt = new Date().toISOString();
    const normAction = String(action || 'ACTION').toUpperCase();
    const normModule = String(moduleName || 'SYSTEM').toUpperCase();
    const normTarget = targetId ? String(targetId) : null;

    const payloadObj =
      typeof details === 'object' && details !== null
        ? { ...details }
        : details
        ? { message: String(details) }
        : {};

    const hmacKey = process.env.AUDIT_HMAC_SECRET || config.jwt?.secret || 'educonnect-audit-hmac';
    const canonical = `${id}|${userId || ''}|${normAction}|${normModule}|${normTarget || ''}|${createdAt}`;
    payloadObj._integrity_hmac = crypto.createHmac('sha256', hmacKey).update(canonical).digest('hex').slice(0, 32);

    const detailsStr = JSON.stringify(payloadObj);

    await db('audit_logs').insert({
      id,
      user_id: userId,
      user_name: userName,
      user_role: userRole,
      action: normAction,
      module: normModule,
      target_id: normTarget,
      details: detailsStr,
      ip_address: ip,
      created_at: createdAt,
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
