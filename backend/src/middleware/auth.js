const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../config/database');

const ADMIN_ROLES = ['admin', 'manager', 'school_admin', 'principal', 'headmaster'];

function isSchoolAdmin(user) {
  return Boolean(user && ADMIN_ROLES.includes(String(user.role || '').toLowerCase()));
}

function extractTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token && token.trim()) return token.trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('accessToken='));
    if (match) {
      const value = decodeURIComponent(match.slice('accessToken='.length)).trim();
      if (value) return value;
    }
  }
  return null;
}

/**
 * Throws a 403 Forbidden error.
 */
function forbiddenError(message = 'شما اجازه دسترسی به این منبع را ندارید', messageEn = 'You do not have permission to access this resource') {
  const err = new Error(message);
  err.messageEn = messageEn;
  err.statusCode = 403;
  return err;
}

function notFoundError(message = 'مورد درخواستی یافت نشد', messageEn = 'Resource not found') {
  const err = new Error(message);
  err.messageEn = messageEn;
  err.statusCode = 404;
  return err;
}

/**
 * Asserts that `actor` belongs to the same school as `target` (an object with
 * `school_id` or a school_id string). Throws 403 if schools do not match.
 */
function assertSameSchool(actor, target, message) {
  if (!actor) {
    throw forbiddenError(message);
  }
  if (!target) {
    throw notFoundError();
  }
  const targetSchoolId = typeof target === 'string' ? target : target.school_id;
  if (!actor.school_id || !targetSchoolId || actor.school_id !== targetSchoolId) {
    throw forbiddenError(message || 'دسترسی بین مدرسه‌ای مجاز نیست', 'Cross-school access is not allowed');
  }
  return true;
}

/**
 * Asserts that `actor` owns or is authorized to manage/access `classId` within their school.
 * - Loads the class from DB (`404` if missing).
 * - Checks `assertSameSchool(actor, classRecord)` (`403` if another school).
 * - School admins of the same school are allowed.
 * - Teachers must be `classRecord.teacher_id === actor.id` or listed as a teacher in `class_members`.
 * - Students/parents are only allowed when `options.allowEnrolled` is true and they (or their linked child) are enrolled in `class_members`.
 */
async function assertOwnsClass(actor, classId, options = {}) {
  const { allowEnrolled = false } = options;
  if (!classId) {
    throw notFoundError('کلاس یافت نشد', 'Class not found');
  }

  const classRecord = await db('classes').where({ id: classId }).first();
  if (!classRecord) {
    throw notFoundError('کلاس یافت نشد', 'Class not found');
  }

  assertSameSchool(actor, classRecord);

  const role = String(actor.role || '').toLowerCase();
  if (isSchoolAdmin(actor)) {
    return classRecord;
  }

  if (role === 'teacher') {
    if (classRecord.teacher_id === actor.id) {
      return classRecord;
    }
    const teacherMembership = await db('class_members')
      .where({ class_id: classId, user_id: actor.id, role: 'teacher' })
      .first();
    if (teacherMembership) {
      return classRecord;
    }
    throw forbiddenError('شما معلم این کلاس نیستید', 'You are not the teacher of this class');
  }

  if (allowEnrolled) {
    if (role === 'student') {
      const member = await db('class_members')
        .where({ class_id: classId, user_id: actor.id })
        .first();
      if (member) return classRecord;
    } else if (role === 'parent') {
      const directMember = await db('class_members')
        .where({ class_id: classId, user_id: actor.id })
        .first();
      if (directMember) return classRecord;

      const childInClass = await db('parent_student_links')
        .join('class_members', 'class_members.user_id', 'parent_student_links.student_id')
        .where({
          'parent_student_links.parent_id': actor.id,
          'class_members.class_id': classId,
        })
        .first();
      if (childInClass) return classRecord;
    }
  }

  throw forbiddenError('شما دسترسی به این کلاس ندارید', 'You do not have access to this class');
}

/**
 * Asserts that `actor` owns `resource` (via `ownerField`, default `teacher_id`) or is a school admin of the same school.
 */
function assertOwnsResource(actor, resource, ownerField = 'teacher_id') {
  if (!resource) {
    throw notFoundError();
  }
  if (resource.school_id !== undefined && resource.school_id !== null) {
    assertSameSchool(actor, resource);
  }
  if (isSchoolAdmin(actor)) {
    return resource;
  }
  if (resource[ownerField] !== actor.id) {
    throw forbiddenError('شما مالک این منبع نیستید', 'You do not own this resource');
  }
  return resource;
}

/**
 * Loads `studentId` from `users` and verifies that `actor` belongs to the same school.
 */
async function assertTeacherOfStudent(actor, studentId) {
  const student = await db('users').where({ id: studentId }).first();
  if (!student) {
    throw notFoundError('دانش‌آموز یافت نشد', 'Student not found');
  }
  assertSameSchool(actor, student);
  return student;
}

/**
 * Authentication middleware — validates JWT access token
 * and attaches user object to req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const token = extractTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'توکن احراز هویت ارائه نشده است',
        messageEn: 'Authentication token not provided',
      });
    }

    // Every token is a real JWT: there is no mock token and no environment in
    // which a fabricated bearer token is accepted (report finding A4).
    const decoded = jwt.verify(token, config.jwt.secret);
    if (decoded && decoded.typ === 'refresh') {
      return res.status(401).json({
        success: false,
        message: 'توکن نامعتبر است',
        messageEn: 'Invalid token type',
      });
    }

    const user = await db('users')
      .where({ id: decoded.userId })
      .first();

    if (!user || user.is_active === false || user.is_active === 0) {
      return res.status(401).json({
        success: false,
        message: 'کاربر یافت نشد یا غیرفعال است',
        messageEn: 'User not found or inactive',
      });
    }

    // Remove sensitive fields
    delete user.password_hash;
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'توکن منقضی شده است',
        messageEn: 'Token has expired',
        code: 'TOKEN_EXPIRED',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'توکن نامعتبر است',
      messageEn: 'Invalid token',
    });
  }
};

/**
 * Role-based access control middleware
 * @param  {...string} roles - Allowed roles (teacher, student, parent)
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'ابتدا وارد شوید',
        messageEn: 'Please authenticate first',
      });
    }

    const userRole = (req.user.role || '').toLowerCase();
    const normalizedRoles = roles.map((r) => r.toLowerCase());

    // Expand management and admin aliases
    if (normalizedRoles.includes('admin') || normalizedRoles.includes('manager')) {
      normalizedRoles.push('admin', 'manager', 'school_admin', 'principal', 'headmaster');
    }

    if (!normalizedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'شما دسترسی به این بخش ندارید',
        messageEn: 'You do not have permission to access this resource',
      });
    }

    next();
  };
};

/**
 * Class membership middleware — verifies user belongs to the class and same school
 * without any universal teacher bypass or student auto-enrollment (findings F1, A26).
 */
const requireClassMember = async (req, res, next) => {
  try {
    const classId = req.params.classId || req.params.id;
    const classRecord = await assertOwnsClass(req.user, classId, { allowEnrolled: true });
    req.classRecord = classRecord;
    req.isClassTeacher = Boolean(
      classRecord.teacher_id === req.user.id || isSchoolAdmin(req.user),
    );
    next();
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        messageEn: error.messageEn,
      });
    }
    next(error);
  }
};

/**
 * Optional authentication middleware — attaches user if token is valid,
 * but allows request to continue if no token is provided.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromRequest(req);
    if (token) {
      const decoded = jwt.verify(token, config.jwt.secret);
      if (!decoded || decoded.typ !== 'refresh') {
        const user = await db('users').where({ id: decoded.userId }).first();
        if (user && user.is_active !== false && user.is_active !== 0) {
          delete user.password_hash;
          req.user = user;
        }
      }
    }
  } catch (e) {
    // Gracefully ignore token errors for optional routes
  }
  next();
};

module.exports = {
  authenticate,
  authorize,
  requireClassMember,
  requireClassAccess: requireClassMember,
  optionalAuth,
  isSchoolAdmin,
  assertSameSchool,
  assertOwnsClass,
  assertOwnsResource,
  assertTeacherOfStudent,
  forbiddenError,
  notFoundError,
};
