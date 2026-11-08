const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../config/database');
const { generateId } = require('../utils/dbHelpers');

/**
 * Authentication middleware — validates JWT access token
 * and attaches user object to req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'توکن احراز هویت ارائه نشده است',
        messageEn: 'Authentication token not provided',
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token || !token.trim()) {
      return res.status(401).json({
        success: false,
        message: 'توکن نامعتبر است',
        messageEn: 'Invalid token',
      });
    }

    // Every token is a real JWT: there is no mock token and no environment in
    // which a fabricated bearer token is accepted (report finding A4).
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await db('users')
      .where({ id: decoded.userId })
      .first();

    if (!user) {
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
 * Class membership middleware — verifies user belongs to the class
 */
const requireClassMember = async (req, res, next) => {
  try {
    const classId = req.params.classId || req.params.id;
    const userId = req.user.id;

    // Teachers own classes directly
    const classRecord = await db('classes')
      .where({ id: classId })
      .first();

    if (!classRecord) {
      return res.status(404).json({
        success: false,
        message: 'کلاس یافت نشد',
        messageEn: 'Class not found',
      });
    }

    if (classRecord.teacher_id === userId || req.user.role === 'teacher' || req.user.role === 'admin' || req.user.role === 'manager') {
      req.classRecord = classRecord;
      req.isClassTeacher = true;
      return next();
    }

    // Check membership for students/parents
    const membership = await db('class_members')
      .where({ class_id: classId, user_id: userId })
      .first();

    if (!membership) {
      if (req.user.role === 'student') {
        const classExists = await db('classes').where({ id: classId }).first();
        if (classExists) {
          await db('class_members').insert({
            id: generateId(),
            class_id: classId,
            user_id: userId,
            role: 'student',
          }).catch(() => {});
          req.classRecord = classRecord;
          req.isClassTeacher = false;
          return next();
        }
      }

      // Check if parent has a child in this class
      if (req.user.role === 'parent') {
        const childInClass = await db('parent_student_links')
          .join('class_members', 'class_members.user_id', 'parent_student_links.student_id')
          .where({
            'parent_student_links.parent_id': userId,
            'class_members.class_id': classId,
          })
          .first();

        if (childInClass) {
          req.classRecord = classRecord;
          req.isClassTeacher = false;
          return next();
        }
      }

      return res.status(403).json({
        success: false,
        message: 'شما عضو این کلاس نیستید',
        messageEn: 'You are not a member of this class',
      });
    }

    req.classRecord = classRecord;
    req.isClassTeacher = false;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication middleware — attaches user if token is valid,
 * but allows request to continue if no token is provided.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await db('users').where({ id: decoded.userId }).first();
      if (user) {
        delete user.password_hash;
        req.user = user;
      }
    }
  } catch (e) {
    // Gracefully ignore token errors for optional routes
  }
  next();
};

module.exports = { authenticate, authorize, requireClassMember, optionalAuth };
