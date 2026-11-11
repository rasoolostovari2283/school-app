const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/database');
const config = require('../../config');
const { generateId, insertAndReturn } = require('../../utils/dbHelpers');
const { generateUniqueUsername } = require('../../utils/usernameHelper');
const localCaptcha = require('../../utils/localCaptcha');

/**
 * Roles an unauthenticated (self-service) request may end up with.
 */
const SELF_SERVICE_ROLES = ['student', 'teacher', 'parent'];

/**
 * Roles that grant administrative access. They are never assigned from a
 * client supplied value on an unauthenticated endpoint (report finding A1).
 */
const PRIVILEGED_ROLES = [
  'admin',
  'manager',
  'principal',
  'headmaster',
  'school_admin',
  'superadmin',
  'owner',
  'counselor',
  'financial_officer',
  'accountant',
];

/** The role an unauthenticated request receives when it asks for nothing usable. */
const DEFAULT_SELF_SERVICE_ROLE = 'student';

/**
 * Resolve the role of an unauthenticated (self-service) request.
 *
 * The role is always decided on the server: a privileged role requested by the
 * client is ignored and falls back to the default non-privileged role, so an
 * anonymous caller can never mint an administrator (report finding A1).
 *
 * @param {string} [requestedRole]
 * @returns {'student'|'teacher'|'parent'}
 */
function resolveSelfServiceRole(requestedRole) {
  const normalized = String(requestedRole || '').trim().toLowerCase();

  if (!normalized || PRIVILEGED_ROLES.includes(normalized)) {
    return DEFAULT_SELF_SERVICE_ROLE;
  }

  return SELF_SERVICE_ROLES.includes(normalized) ? normalized : DEFAULT_SELF_SERVICE_ROLE;
}

class AuthService {
  async register({ email, phone, password, display_name, role: requestedRole, locale, username, school_id = null, school_code = null }) {
    // The role of an unauthenticated registration is decided on the server.
    const role = resolveSelfServiceRole(requestedRole);

    if (!password || String(password).trim().length < 8) {
      const error = new Error('رمز عبور باید حداقل ۸ کاراکتر باشد');
      error.messageEn = 'Password must be at least 8 characters';
      error.statusCode = 400;
      throw error;
    }

    let effectiveSchoolId = school_id ? String(school_id).trim() : null;
    if (!effectiveSchoolId && school_code && String(school_code).trim()) {
      const schoolByCode = await db('schools').where({ code: String(school_code).trim() }).first();
      if (schoolByCode) {
        effectiveSchoolId = schoolByCode.id;
      }
    }

    let duplicateQuery = db('users').where(function () {
      if (email) this.orWhere({ email });
      if (phone) this.orWhere({ phone });
    });
    if (effectiveSchoolId) {
      duplicateQuery = duplicateQuery.andWhere({ school_id: effectiveSchoolId });
    }
    const existingUser = await duplicateQuery.first();

    if (existingUser) {
      const error = new Error('این شماره تلفن یا ایمیل قبلاً در سامانه ثبت شده است');
      error.messageEn = 'Phone or email already registered';
      error.statusCode = 409;
      throw error;
    }

    const uniqueUsername = username 
      ? username.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '_')
      : await generateUniqueUsername(db, display_name);

    const passToHash = String(password).trim();
    const password_hash = await bcrypt.hash(passToHash, 12);

    let student_code = null;
    let personnel_code = null;
    if (role === 'student') {
      const count = await db('users').where({ role: 'student' }).count('id as count').first();
      student_code = `STD-${40300 + (parseInt(count ? count.count : 0, 10) + 1)}`;
    } else if (role === 'teacher') {
      const count = await db('users').where({ role: 'teacher' }).count('id as count').first();
      personnel_code = `EMP-${98400 + (parseInt(count ? count.count : 0, 10) + 1)}`;
    }

    const user = await insertAndReturn(db, 'users', {
      email: email || null,
      phone: phone || null,
      password_hash,
      display_name,
      username: uniqueUsername,
      role,
      school_id: effectiveSchoolId,
      student_code,
      personnel_code,
      locale: locale || 'fa',
      is_verified: true,
      is_active: true,
    });

    delete user.password_hash;
    const tokens = this.generateTokens(user.id, user.role, user.token_version);
    return { user, ...tokens };
  }

  /**
   * Register a new School and its Principal Admin account
   */
  async registerSchool({ school_name, school_level, city, admin_name, admin_phone, admin_password }) {
    if (!school_name || !school_name.trim()) {
      const error = new Error('نام مدرسه الزامی است');
      error.statusCode = 400;
      throw error;
    }

    const school_code = `SCH-${Math.floor(1000 + Math.random() * 9000)}`;
    const username = `admin_${school_code.toLowerCase().replace('-', '')}_${crypto.randomBytes(2).toString('hex')}`;
    const cleanPhone = admin_phone ? admin_phone.trim() : null;
    const passToHash = admin_password && admin_password.trim()
      ? admin_password.trim()
      : crypto.randomBytes(24).toString('hex');
    const password_hash = await bcrypt.hash(passToHash, 10);

    // Never escalate an existing user account to 'admin' via an unauthenticated school registration (finding A1).
    if (cleanPhone) {
      const existingUser = await db('users').where({ phone: cleanPhone }).first();
      if (existingUser) {
        const error = new Error('این شماره تلفن قبلاً در سامانه ثبت شده است');
        error.messageEn = 'Phone number is already registered';
        error.statusCode = 409;
        throw error;
      }
    }

    const existingSchool = await db('schools').where({ name: school_name.trim() }).first();
    if (existingSchool) {
      const error = new Error('مدرسه‌ای با این نام قبلاً ثبت شده است');
      error.messageEn = 'School with this name already exists';
      error.statusCode = 409;
      throw error;
    }

    const schoolSettings = JSON.stringify({
      school_name: school_name.trim(),
      school_code,
      school_level: school_level || 'متوسطه دوم',
      city: city || 'تهران',
      principal: admin_name || 'مدیر مدرسه',
      is_school_registered: true,
    });

    const user = await insertAndReturn(db, 'users', {
      phone: cleanPhone,
      password_hash,
      display_name: `مدیریت ${school_name.trim()}`,
      username,
      role: 'admin',
      locale: 'fa',
      is_verified: true,
      settings: schoolSettings,
    });

    delete user.password_hash;
    const tokens = this.generateTokens(user.id, user.role, user.token_version);

    const schoolRecord = await insertAndReturn(db, 'schools', {
      id: generateId(),
      name: school_name.trim(),
      code: school_code,
      city: city || 'تهران',
      created_by: user.id,
    });

    if (schoolRecord && schoolRecord.id) {
      await db('users').where({ id: user.id }).update({ school_id: schoolRecord.id });
      user.school_id = schoolRecord.id;
    }

    const school = {
      id: schoolRecord?.id || `sch-${Date.now()}`,
      school_code: schoolRecord?.code || school_code,
      name: school_name.trim(),
      level: school_level || 'متوسطه دوم',
      city: city || 'تهران',
      principal: admin_name || 'مدیر مدرسه',
      phone: cleanPhone,
    };

    return { user, school, ...tokens };
  }

  /**
   * Public list of all registered and default schools
   */
  async getPublicSchoolsList() {
    let dbSchools = [];
    try {
      dbSchools = await db('schools').select('*').orderBy('created_at', 'desc');
    } catch (e) {
      dbSchools = [];
    }

    const defaultSchools = [
      { id: 'sch-1', name: 'دبیرستان استعدادهای درخشان علامه حلی ۱ (تهران)', code: 'SCH-1001', city: 'تهران', level: 'متوسطه دوم (دبیرستان)' },
      { id: 'sch-2', name: 'دبیرستان فرزانگان ۱ (تهران)', code: 'SCH-1002', city: 'تهران', level: 'متوسطه دوم (دبیرستان)' },
      { id: 'sch-3', name: 'مجتمع آموزشی هوشمند ادیبان', code: 'SCH-1003', city: 'تهران', level: 'مجتمع آموزشی کامل' },
      { id: 'sch-4', name: 'دبیرستان نمونه دولتی رشد', code: 'SCH-1004', city: 'تهران', level: 'متوسطه دوم (دبیرستان)' },
      { id: 'sch-5', name: 'دبیرستان ماندگار البرز', code: 'SCH-1005', city: 'تهران', level: 'متوسطه دوم (دبیرستان)' },
      { id: 'sch-6', name: 'مدرسه هوشمند دانشمند', code: 'SCH-1006', city: 'تهران', level: 'دبستان (ابتدایی)' },
      { id: 'sch-7', name: 'هنرستان فنی نمونه شهید بهشتی', code: 'SCH-1007', city: 'تهران', level: 'هنرستان فنی و حرفه‌ای' },
    ];

    const schoolMap = new Map();
    (dbSchools || []).forEach((s) => {
      schoolMap.set(s.name, {
        id: s.id,
        name: s.name,
        code: s.code || `SCH-${s.id.slice(-4)}`,
        city: s.city || 'تهران',
        level: s.level || 'متوسطه دوم (دبیرستان)',
        is_registered: true,
      });
    });
    defaultSchools.forEach((s) => {
      if (!schoolMap.has(s.name)) {
        schoolMap.set(s.name, s);
      }
    });

    return Array.from(schoolMap.values());
  }

  /**
   * Smart Quick Entry by full name and phone number
   * Generates a unique entry ID / username based on name, or logs in if already registered
   */
  async quickEntry({ display_name, phone, role: requestedRole, password = null, school_name = null, school_code = null, grades = null, subject = null }) {
    if (!display_name || !display_name.trim()) {
      const error = new Error('نام و نام‌خانوادگی الزامی است');
      error.statusCode = 400;
      throw error;
    }

    // The role of an unauthenticated quick entry is decided on the server.
    const role = resolveSelfServiceRole(requestedRole);

    const cleanName = display_name.trim();
    const cleanPhone = phone ? phone.trim() : null;

    // Check if user already exists with this phone
    let user = null;
    if (cleanPhone) {
      user = await db('users').where({ phone: cleanPhone }).first();
    }

    // If not found by phone, check by exact display_name and role
    if (!user) {
      user = await db('users').where({ display_name: cleanName, role }).first();
    }

    if (user) {
      // An existing account is only ever authenticated with its own password.
      // Verify credentials BEFORE any DB writes or school creation (finding A2).
      if (!password || !password.trim()) {
        const error = new Error('برای ورود به حساب کاربری موجود، رمز عبور الزامی است');
        error.messageEn = 'Password is required to sign in to an existing account';
        error.statusCode = 401;
        throw error;
      }

      const isMatch = user.password_hash
        ? await bcrypt.compare(password, user.password_hash)
        : false;
      if (!isMatch) {
        const error = new Error('رمز عبور اشتباه است');
        error.messageEn = 'Invalid password';
        error.statusCode = 401;
        throw error;
      }

      // Ensure user has a username
      if (!user.username) {
        const generatedUser = await generateUniqueUsername(db, user.display_name, user.id);
        await db('users').where({ id: user.id }).update({ username: generatedUser });
        user.username = generatedUser;
      }

      delete user.password_hash;
      const tokens = this.generateTokens(user.id, user.role, user.token_version);
      return { user, isNew: false, ...tokens };
    }

    // Resolve existing school if provided (do not allow unauthenticated creation of arbitrary schools)
    let matchedSchool = null;
    if (school_name && school_name.trim()) {
      matchedSchool = await db('schools').where({ name: school_name.trim() }).first();
    }
    if (!matchedSchool && school_code && school_code.trim()) {
      matchedSchool = await db('schools').where({ code: school_code.trim() }).first();
    }

    // New User Registration
    const generatedUsername = await generateUniqueUsername(db, cleanName);
    const passToHash = password && password.trim()
      ? password.trim()
      : crypto.randomBytes(24).toString('hex');
    const password_hash = await bcrypt.hash(passToHash, 10);

    let student_code = null;
    let personnel_code = null;
    if (role === 'student') {
      const count = await db('users').where({ role: 'student' }).count('id as count').first();
      student_code = `STD-${40300 + (parseInt(count ? count.count : 0, 10) + 1)}`;
    } else if (role === 'teacher') {
      const count = await db('users').where({ role: 'teacher' }).count('id as count').first();
      personnel_code = `EMP-${98400 + (parseInt(count ? count.count : 0, 10) + 1)}`;
    }

    const initialSettings = {
      school_name: matchedSchool ? matchedSchool.name : null,
      school_code: matchedSchool ? matchedSchool.code : null,
      schools: matchedSchool ? [matchedSchool.name] : [],
      taught_grades: Array.isArray(grades) && grades.length > 0 ? grades : [],
      subject: subject && subject.trim() ? subject.trim() : null,
      is_teacher_onboarded: Array.isArray(grades) && grades.length > 0,
    };

    const newUser = await insertAndReturn(db, 'users', {
      phone: cleanPhone,
      password_hash,
      display_name: cleanName,
      username: generatedUsername,
      role,
      school_id: matchedSchool ? matchedSchool.id : null,
      student_code,
      personnel_code,
      locale: 'fa',
      is_verified: true,
      settings: JSON.stringify(initialSettings),
    });

    newUser.school_name = matchedSchool ? matchedSchool.name : null;
    delete newUser.password_hash;
    const tokens = this.generateTokens(newUser.id, newUser.role, newUser.token_version);
    return { user: newUser, isNew: true, ...tokens };
  }

  async login(identifier, password, captchaId = null, captchaAnswer = null, options = {}) {
    let effectiveCaptchaId = captchaId;
    let effectiveCaptchaAnswer = captchaAnswer;
    let loginOptions = options || {};

    if (captchaId && typeof captchaId === 'object') {
      loginOptions = captchaId;
      effectiveCaptchaId = loginOptions.captchaId ?? null;
      effectiveCaptchaAnswer = loginOptions.captchaAnswer ?? null;
    }

    if (effectiveCaptchaId !== null && effectiveCaptchaId !== undefined) {
      if (!localCaptcha.verify(effectiveCaptchaId, effectiveCaptchaAnswer)) {
        const error = new Error('کد امنیتی نامعتبر یا منقضی شده است');
        error.messageEn = 'Invalid or expired captcha';
        error.statusCode = 400;
        throw error;
      }
    }

    const cleanId = (identifier || '').trim();
    const cleanUsername = cleanId.replace(/^@/, '').toLowerCase();

    let targetSchoolId = loginOptions.school_id ? String(loginOptions.school_id).trim() : null;
    if (!targetSchoolId && loginOptions.school_code && String(loginOptions.school_code).trim()) {
      const schoolRecord = await db('schools').where({ code: String(loginOptions.school_code).trim() }).first();
      if (schoolRecord) {
        targetSchoolId = schoolRecord.id;
      }
    }

    // Only an unambiguous identifier authenticates an account: e-mail, phone
    // number or user name. When school_id/school_code is supplied, scope lookup
    // to that school so multi-school teachers/parents log into the intended tenant.
    let userQuery = db('users').where(function () {
      this.where({ email: cleanId })
        .orWhere({ phone: cleanId })
        .orWhereRaw('LOWER(username) = ?', [cleanUsername]);
    });

    if (targetSchoolId) {
      userQuery = userQuery.andWhere({ school_id: targetSchoolId });
    }

    const candidates = await userQuery;
    if (!candidates || candidates.length === 0) {
      const error = new Error('کاربری با این شناسه کاربری، آیدی یا شماره تلفن یافت نشد');
      error.messageEn = 'User not found';
      error.statusCode = 401;
      throw error;
    }

    if (!password || !password.trim()) {
      const error = new Error('رمز عبور الزامی است');
      error.messageEn = 'Password is required';
      error.statusCode = 401;
      throw error;
    }

    // bcrypt.compare is the only authority: there is no universal password and
    // no default password that unlocks an account (report finding F11).
    let matchedUser = null;
    for (const candidate of candidates) {
      const isMatch = candidate.password_hash
        ? await bcrypt.compare(password, candidate.password_hash)
        : false;
      if (isMatch) {
        matchedUser = candidate;
        break;
      }
    }

    if (!matchedUser) {
      const error = new Error('رمز عبور اشتباه است');
      error.messageEn = 'Invalid password';
      error.statusCode = 401;
      throw error;
    }

    if (matchedUser.is_active === false || matchedUser.is_active === 0) {
      const error = new Error('حساب کاربری شما غیرفعال شده است');
      error.messageEn = 'User account is deactivated';
      error.statusCode = 403;
      throw error;
    }

    delete matchedUser.password_hash;
    const tokens = this.generateTokens(matchedUser.id, matchedUser.role, matchedUser.token_version);
    return { user: matchedUser, ...tokens };
  }

  /**
   * Direct login for parents by entering student code
   * Allows parent to enter child's student code, automatically resolves/creates parent account
   */
  async parentLoginByStudentCode(studentCode, parentName = '', phone = '', options = {}) {
    if (!studentCode || !String(studentCode).trim()) {
      const error = new Error('لطفاً کد دانش‌آموزی فرزند خود را وارد کنید');
      error.statusCode = 400;
      throw error;
    }

    const rawCode = String(studentCode).trim();
    // The student code must match exactly: "40301" and "STD-40301" are the two
    // spellings of the same code, but a partial code never resolves a student
    // (report finding A3).
    const normalizedCode = rawCode.toLowerCase();

    let resolvedSchoolId =
      typeof options?.school_id === 'string'
        ? options.school_id.trim()
        : options?.school_id?.id || null;
    if (!resolvedSchoolId && options?.school_code && typeof options.school_code === 'string') {
      const sch = await db('schools').where({ code: options.school_code.trim() }).first();
      if (sch) resolvedSchoolId = sch.id;
    }
    if (!resolvedSchoolId && options?.school_name && typeof options.school_name === 'string') {
      const sch = await db('schools').where({ name: options.school_name.trim() }).first();
      if (sch) resolvedSchoolId = sch.id;
    }

    let studentQuery = db('users')
      .where({ role: 'student' })
      .andWhere(function () {
        this.whereRaw('LOWER(student_code) = ?', [normalizedCode])
          .orWhereRaw('LOWER(student_code) = ?', [`std-${normalizedCode}`]);
      });

    if (resolvedSchoolId) {
      studentQuery = studentQuery.andWhere({ school_id: resolvedSchoolId });
    }

    const student = await studentQuery.first();

    if (!student) {
      const error = new Error(`دانش‌آموزی با کد «${rawCode}» در سامانه مدرسه یافت نشد. لطفاً از صحت کد دانش‌آموزی اطمینان حاصل فرمایید.`);
      error.messageEn = 'Student code not found';
      error.statusCode = 401;
      throw error;
    }

    // If student has a registered parent_phone in settings and caller supplied a mismatched phone, reject (SEC-AUTH-001)
    let stSettings = {};
    try {
      stSettings = typeof student.settings === 'string' ? JSON.parse(student.settings || '{}') : (student.settings || {});
    } catch (_e) {}
    const registeredParentPhone = stSettings.parent_phone ? String(stSettings.parent_phone).trim() : '';
    const suppliedPhone = phone ? String(phone).trim() : '';
    if (registeredParentPhone && suppliedPhone && registeredParentPhone !== suppliedPhone) {
      const error = new Error('شماره همراه ولی با شماره ثبت‌شده در پرونده دانش‌آموز مطابقت ندارد');
      error.messageEn = 'Parent phone mismatch';
      error.statusCode = 401;
      throw error;
    }

    // Check if a parent account already exists for this student (scoped to student's school)
    let parentQuery = db('users').where({ role: 'parent', student_code: student.student_code });
    if (student.school_id) {
      parentQuery = parentQuery.andWhere({ school_id: student.school_id });
    }
    let parent = await parentQuery.first();

    // If not found by student_code, check parent_student_links
    if (!parent) {
      const link = await db('parent_student_links')
        .where({ student_id: student.id })
        .first();
      if (link) {
        parent = await db('users').where({ id: link.parent_id }).first();
      }
    }

    const defaultDisplayName = parentName && parentName.trim()
      ? `${parentName.trim()} (ولی ${student.display_name})`
      : `ولی ${student.display_name}`;

    if (parent) {
      // The identity of an existing account is never rewritten from an
      // unauthenticated request (report finding A3).
      parent = await db('users').where({ id: parent.id }).first();

      // Ensure link exists
      const existingLink = await db('parent_student_links')
        .where({ parent_id: parent.id, student_id: student.id })
        .first();
      if (!existingLink) {
        await db('parent_student_links').insert({
          id: generateId(),
          parent_id: parent.id,
          student_id: student.id,
          relation: 'guardian',
          is_verified: true,
        });
      }
    } else {
      // Create new parent account linked to this student with a random unguessable password hash
      const parentId = generateId();
      const cleanCode = student.student_code.toLowerCase().replace(/[^a-z0-9]/g, '');
      const uniqueSuffix = Math.floor(1000 + Math.random() * 9000);
      const randomSecret = crypto.randomBytes(24).toString('hex');
      const parentUser = {
        id: parentId,
        email: `parent_${cleanCode}_${uniqueSuffix}@parent.ir`,
        phone: phone && phone.trim() ? phone.trim() : null,
        password_hash: await bcrypt.hash(randomSecret, 10),
        display_name: defaultDisplayName,
        role: 'parent',
        school_id: student.school_id || null,
        student_code: student.student_code,
        department: student.department || 'اولیاء و مربیان',
        job_title: 'ولی و همیار خانواده',
        locale: 'fa',
        is_verified: true,
      };

      await insertAndReturn(db, 'users', parentUser);
      parent = await db('users').where({ id: parentId }).first();

      await db('parent_student_links').insert({
        id: generateId(),
        parent_id: parentId,
        student_id: student.id,
        relation: 'guardian',
        is_verified: true,
      });
    }

    delete parent.password_hash;
    const tokens = this.generateTokens(parent.id, parent.role, parent.token_version);

    return {
      user: parent,
      student: {
        id: student.id,
        display_name: student.display_name,
        student_code: student.student_code,
        department: student.department,
      },
      ...tokens,
    };
  }

  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
      if (decoded && decoded.typ && decoded.typ !== 'refresh') {
        const error = new Error('توکن نامعتبر است');
        error.statusCode = 401;
        throw error;
      }
      const user = await db('users')
        .where({ id: decoded.userId })
        .select('id', 'role', 'is_active', 'token_version')
        .first();
      if (!user || user.is_active === false || user.is_active === 0) {
        const error = new Error('کاربر یافت نشد یا غیرفعال است');
        error.statusCode = 401;
        throw error;
      }

      const currentVersion = Number(user.token_version || 0);
      if (decoded.tv !== undefined && Number(decoded.tv) !== currentVersion) {
        const error = new Error('نشست کاربری ابطال شده است');
        error.messageEn = 'Session has been revoked';
        error.statusCode = 401;
        throw error;
      }

      if (decoded.jti) {
        const alreadyRevoked = await db('revoked_tokens')
          .where({ jti: decoded.jti })
          .first()
          .catch(() => null);
        if (alreadyRevoked) {
          // Replay of a rotated or revoked refresh token: invalidate all sessions for safety
          await db('users').where({ id: user.id }).increment('token_version', 1).catch(() => {});
          const error = new Error('توکن بازنشانی قبلاً استفاده یا ابطال شده است');
          error.messageEn = 'Refresh token has already been used or revoked';
          error.statusCode = 401;
          throw error;
        }

        // Single-use refresh token rotation: mark current refresh token JTI as consumed
        await this.revokeTokenByJti(
          decoded.jti,
          user.id,
          'refresh',
          'rotated',
          decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
        );
      }

      return this.generateTokens(user.id, user.role, currentVersion);
    } catch (err) {
      const error = new Error(err.message || 'توکن نامعتبر است');
      error.messageEn = err.messageEn || 'Invalid token';
      error.statusCode = 401;
      throw error;
    }
  }

  async revokeTokenByJti(jti, userId = null, tokenType = 'access', reason = 'logout', expiresAt = null) {
    if (!jti) return false;
    try {
      await db('revoked_tokens')
        .insert({
          jti: String(jti),
          user_id: userId || null,
          token_type: tokenType,
          reason,
          expires_at: expiresAt,
          revoked_at: new Date().toISOString(),
        })
        .onConflict('jti')
        .ignore();
      return true;
    } catch (_e) {
      return false;
    }
  }

  async revokeAllUserSessions(userId, reason = 'manual_revoke', currentJti = null) {
    if (!userId) return false;
    if (currentJti) {
      await this.revokeTokenByJti(currentJti, userId, 'access', reason);
    }
    const user = await db('users').where({ id: userId }).select('token_version').first();
    const nextVersion = Number(user?.token_version || 0) + 1;
    await db('users').where({ id: userId }).update({
      token_version: nextVersion,
      updated_at: new Date(),
    });
    return { success: true, token_version: nextVersion };
  }

  async changePassword(userId, currentPassword, newPassword) {
    if (!currentPassword || !newPassword || String(newPassword).trim().length < 8) {
      const error = new Error('رمز عبور فعلی و رمز عبور جدید (حداقل ۸ کاراکتر) الزامی است');
      error.statusCode = 400;
      throw error;
    }

    const user = await db('users').where({ id: userId }).first();
    if (!user) {
      const error = new Error('کاربر یافت نشد');
      error.statusCode = 404;
      throw error;
    }

    const isMatch = user.password_hash
      ? await bcrypt.compare(currentPassword, user.password_hash)
      : false;
    if (!isMatch) {
      const error = new Error('رمز عبور فعلی اشتباه است');
      error.statusCode = 401;
      throw error;
    }

    const password_hash = await bcrypt.hash(String(newPassword).trim(), 12);
    const nextTokenVersion = Number(user.token_version || 0) + 1;
    await db('users').where({ id: userId }).update({
      password_hash,
      token_version: nextTokenVersion,
      updated_at: new Date(),
    });

    return { success: true };
  }

  async updateProfile(userId, data) {
    const updateData = {};
    // Only non-privileged profile attributes may be updated by the user.
    const allowedFields = [
      'display_name',
      'username',
      'avatar_url',
      'phone',
      'department',
      'job_title',
      'bio',
      'locale',
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    if (data.settings !== undefined) {
      const sanitizedSettings = typeof data.settings === 'object' && data.settings !== null
        ? { ...data.settings }
        : {};
      delete sanitizedSettings.school_id;
      delete sanitizedSettings.school_code;
      delete sanitizedSettings.role;
      updateData.settings = JSON.stringify(sanitizedSettings);
    }

    if (Object.keys(updateData).length > 0) {
      updateData.updated_at = new Date();
      await db('users').where({ id: userId }).update(updateData);
    }

    const user = await db('users').where({ id: userId }).first();
    if (!user) {
      const error = new Error('کاربر یافت نشد');
      error.statusCode = 404;
      throw error;
    }
    delete user.password_hash;
    return user;
  }

  async getStudentSetupOptions() {
    const schools = await this.getPublicSchoolsList();

    const grades = [
      // پیش‌دبستانی
      'پیش‌دبستانی ۱',
      'پیش‌دبستانی ۲',
      // دبستان
      'اول دبستان',
      'دوم دبستان',
      'سوم دبستان',
      'چهارم دبستان',
      'پنجم دبستان',
      'ششم دبستان',
      // متوسطه اول
      'پایه هفتم',
      'پایه هشتم',
      'پایه نهم',
      // متوسطه دوم (نظری)
      'پایه دهم ریاضی',
      'پایه دهم تجربی',
      'پایه دهم انسانی',
      'پایه یازدهم ریاضی',
      'پایه یازدهم تجربی',
      'پایه یازدهم انسانی',
      'پایه دوازدهم ریاضی',
      'پایه دوازدهم تجربی',
      'پایه دوازدهم انسانی',
      // هنرستان و فنی‌حرفه‌ای
      'دهم هنرستان (فنی‌حرفه‌ای)',
      'دهم هنرستان (کاردانش)',
      'یازدهم هنرستان (فنی‌حرفه‌ای)',
      'یازدهم هنرستان (کاردانش)',
      'دوازدهم هنرستان (فنی‌حرفه‌ای)',
      'دوازدهم هنرستان (کاردانش)',
    ];

    const teachers = await db('users')
      .whereIn('role', ['teacher', 'admin'])
      .select('id', 'display_name', 'username', 'job_title', 'department', 'avatar_url', 'role');

    const classes = await db('classes')
      .where({ is_active: true })
      .select('id', 'name', 'subject', 'grade', 'teacher_id');

    const teacherClassMap = new Map();
    classes.forEach((c) => {
      if (!teacherClassMap.has(c.teacher_id)) teacherClassMap.set(c.teacher_id, []);
      teacherClassMap.get(c.teacher_id).push(c);
    });

    let enrichedTeachers = teachers.map((t) => {
      const tClasses = teacherClassMap.get(t.id) || [];
      const subjects = Array.from(new Set(tClasses.map((c) => c.subject).filter(Boolean)));
      return {
        ...t,
        subjects: subjects.length > 0 ? subjects : [t.job_title || 'مدرس تخصصی'],
        classes: tClasses,
      };
    });

    if (enrichedTeachers.length === 0) {
      enrichedTeachers = [
        { id: 'staff-mirzaei', display_name: 'مهندس حسین میرزایی', username: 'hossein_mirzaei', job_title: 'معاون آموزشی و دبیر حسابان', subjects: ['حسابان و دیفرانسیل', 'ریاضی'] },
        { id: 'staff-sadeghi', display_name: 'دکتر فاطمه صادقی', username: 'fatemeh_sadeghi', job_title: 'دبیر زیست‌شناسی و ژنتیک', subjects: ['زیست‌شناسی و ژنتیک'] },
        { id: 'staff-akbari', display_name: 'استاد مسعود اکبری', username: 'masoud_akbari', job_title: 'دبیر ادبیات فارسی و نگارش', subjects: ['ادبیات فارسی', 'نگارش'] },
        { id: 'staff-jalali', display_name: 'سرکار خانم مهندس جلالی', username: 'jalali', job_title: 'دبیر شیمی پایه و پیشرفته', subjects: ['شیمی'] },
        { id: 'staff-rahmani', display_name: 'دکتر مهدی رحمانی', username: 'mehdi_rahmani', job_title: 'دبیر و طراح فیزیک کنکور', subjects: ['فیزیک'] },
        { id: '15148e90-e32b-418f-a356-fa77867f86b2', display_name: 'دکتر مسعود کریمی', username: 'masoud_karimi', job_title: 'دبیر هندسه و گسسته', subjects: ['هندسه', 'ریاضیات گسسته'] },
        { id: 'staff-taghavi', display_name: 'دکتر علیرضا تقوی', username: 'alireza_taghavi', job_title: 'مدیریت و مدرس معارف', subjects: ['دین و زندگی'] },
      ];
    }

    return { schools, grades, teachers: enrichedTeachers };
  }

  async saveStudentSetup(studentId, { school_name, grade, teacher_ids = [] }) {
    const student = await db('users').where({ id: studentId }).first();
    if (!student) {
      const error = new Error('دانش‌آموز یافت نشد');
      error.statusCode = 404;
      throw error;
    }

    let settings = {};
    if (student.settings) {
      try { settings = JSON.parse(student.settings); } catch (e) { settings = {}; }
    }

    settings.school_name = school_name || settings.school_name || 'دبیرستان استعدادهای درخشان علامه حلی ۱ (تهران)';
    settings.grade = grade || settings.grade || 'پایه دهم ریاضی';
    settings.selected_teacher_ids = Array.isArray(teacher_ids) ? teacher_ids : [];
    settings.is_onboarded = true;

    // Update user
    await db('users').where({ id: studentId }).update({
      department: grade || student.department,
      settings: JSON.stringify(settings),
      updated_at: new Date(),
    });

    // Auto-join classes of selected teachers within the same school only
    if (Array.isArray(teacher_ids) && teacher_ids.length > 0) {
      for (const tId of teacher_ids) {
        const classQuery = db('classes').where({ teacher_id: tId, is_active: true });
        if (student.school_id) {
          classQuery.andWhere({ school_id: student.school_id });
        }
        const teacherClass = await classQuery.first();

        if (teacherClass) {
          const isMember = await db('class_members')
            .where({ class_id: teacherClass.id, user_id: studentId })
            .first();

          if (!isMember) {
            await insertAndReturn(db, 'class_members', {
              class_id: teacherClass.id,
              user_id: studentId,
              role: 'student',
            });
          }
        }
      }
    }

    const updatedUser = await db('users').where({ id: studentId }).first();
    delete updatedUser.password_hash;
    return updatedUser;
  }

  async getTeacherSetupOptions(teacherId) {
    const schools = await this.getPublicSchoolsList();
    const teacher = teacherId ? await db('users').where({ id: teacherId }).first() : null;

    const stages = [
      {
        id: 'high',
        title: 'متوسطه دوم (دبیرستان نظری)',
        icon: '🎓',
        grades: [
          'پایه دهم ریاضی',
          'پایه دهم تجربی',
          'پایه دهم انسانی',
          'پایه یازدهم ریاضی',
          'پایه یازدهم تجربی',
          'پایه یازدهم انسانی',
          'پایه دوازدهم ریاضی',
          'پایه دوازدهم تجربی',
          'پایه دوازدهم انسانی',
        ],
      },
      {
        id: 'middle',
        title: 'متوسطه اول (راهنمایی)',
        icon: '📚',
        grades: [
          'پایه هفتم',
          'پایه هشتم',
          'پایه نهم',
        ],
      },
      {
        id: 'elementary',
        title: 'دبستان (ابتدایی)',
        icon: '🎒',
        grades: [
          'اول دبستان',
          'دوم دبستان',
          'سوم دبستان',
          'چهارم دبستان',
          'پنجم دبستان',
          'ششم دبستان',
        ],
      },
      {
        id: 'vocational',
        title: 'هنرستان و فنی‌حرفه‌ای',
        icon: '⚙️',
        grades: [
          'دهم هنرستان (فنی‌حرفه‌ای)',
          'دهم هنرستان (کاردانش)',
          'یازدهم هنرستان (فنی‌حرفه‌ای)',
          'یازدهم هنرستان (کاردانش)',
          'دوازدهم هنرستان (فنی‌حرفه‌ای)',
          'دوازدهم هنرستان (کاردانش)',
        ],
      },
      {
        id: 'special',
        title: 'کنکور، المپیاد و دوره‌های تقویتی',
        icon: '🏆',
        grades: [
          'کلاس کنکور سراسری',
          'المپیاد علمی و تیزهوشان',
          'کلاس‌های تقویتی و تست‌زنی',
        ],
      },
    ];

    const subjects = [
      'ریاضیات و حسابان',
      'فیزیک و آزمایشگاه',
      'شیمی تخصصی',
      'زیست‌شناسی',
      'هندسه و گسسته',
      'ادبیات و فارسی',
      'زبان انگلیسی',
      'عربی و زبان قرآن',
      'دین و زندگی',
      'علوم تجربی',
      'برنامه‌نویسی و کامپیوتر',
      'معارف و تاریخ',
      'هنر و گرافیک',
    ];

    // Get students in the teacher's school only
    const studentQuery = db('users').where({ role: 'student' });
    if (teacher?.school_id) {
      studentQuery.andWhere({ school_id: teacher.school_id });
    } else {
      studentQuery.whereRaw('1 = 0');
    }
    const allStudents = await studentQuery
      .select('id', 'display_name', 'department', 'settings', 'student_code', 'avatar_url');

    const studentCounts = {};
    for (const stage of stages) {
      for (const grade of stage.grades) {
        const cleanGrade = grade.replace(/^پایه\s*/, '').trim();
        const count = allStudents.filter((s) => {
          if (s.department && (s.department.includes(grade) || s.department.includes(cleanGrade))) return true;
          if (s.settings) {
            try {
              const parsed = typeof s.settings === 'string' ? JSON.parse(s.settings) : s.settings;
              if (parsed?.grade && (parsed.grade.includes(grade) || parsed.grade.includes(cleanGrade) || grade.includes(parsed.grade))) return true;
            } catch (e) {}
          }
          return false;
        }).length;
        studentCounts[grade] = count;
      }
    }

    let currentSettings = {};
    if (teacher?.settings) {
      try { currentSettings = typeof teacher.settings === 'string' ? JSON.parse(teacher.settings) : teacher.settings; } catch (e) {}
    }

    return {
      schools,
      stages,
      subjects,
      studentCounts,
      totalStudentsInSchool: allStudents.length,
      currentSetup: {
        school_name: currentSettings.school_name || (Array.isArray(currentSettings.schools) && currentSettings.schools[0]) || 'دبیرستان استعدادهای درخشان علامه حلی ۱ (تهران)',
        schools: Array.isArray(currentSettings.schools) && currentSettings.schools.length > 0
          ? currentSettings.schools
          : (currentSettings.school_name ? [currentSettings.school_name] : ['دبیرستان استعدادهای درخشان علامه حلی ۱ (تهران)']),
        taught_grades: currentSettings.taught_grades || [],
        subject: currentSettings.subject || teacher?.job_title || 'ریاضیات و حسابان',
        is_onboarded: Boolean(currentSettings.is_teacher_onboarded),
      },
    };
  }

  async saveTeacherSetup(teacherId, { school_name, schools = [], grades = [], subject }) {
    const teacher = await db('users').where({ id: teacherId }).first();
    if (!teacher) {
      const error = new Error('معلم یافت نشد');
      error.statusCode = 404;
      throw error;
    }

    let settings = {};
    if (teacher.settings) {
      try { settings = typeof teacher.settings === 'string' ? JSON.parse(teacher.settings) : teacher.settings; } catch (e) { settings = {}; }
    }

    let schoolList = [];
    if (Array.isArray(schools) && schools.length > 0) {
      schoolList = schools
        .map((s) => (typeof s === 'string' ? s.trim() : (s?.name || '').trim()))
        .filter(Boolean);
    } else if (school_name && typeof school_name === 'string' && school_name.trim()) {
      schoolList = [school_name.trim()];
    }

    if (schoolList.length === 0) {
      schoolList = ['دبیرستان استعدادهای درخشان علامه حلی ۱ (تهران)'];
    }

    const primarySchool = schoolList[0];

    const selectedGrades = Array.isArray(grades) ? grades : [];
    const selectedSubject = subject || teacher.job_title || 'درس تخصصی';

    settings.school_name = primarySchool;
    settings.schools = schoolList;
    settings.taught_grades = selectedGrades;
    settings.subject = selectedSubject;
    settings.is_teacher_onboarded = true;

    await db('users').where({ id: teacherId }).update({
      job_title: selectedSubject,
      settings: JSON.stringify(settings),
      updated_at: new Date(),
    });

    // Scope students strictly to teacher's school_id
    const studentQuery = db('users').where({ role: 'student' });
    if (teacher.school_id) {
      studentQuery.andWhere({ school_id: teacher.school_id });
    } else {
      studentQuery.whereRaw('1 = 0');
    }
    const allStudents = await studentQuery
      .select('id', 'display_name', 'department', 'settings', 'student_code', 'avatar_url');

    const createdClasses = [];
    const newlyConnectedStudentIds = new Set();

    for (const grade of selectedGrades) {
      let cls = await db('classes')
        .where({ teacher_id: teacherId, grade: grade, is_active: true })
        .first();

      if (!cls) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let joinCode = '';
        let codeExists = true;
        while (codeExists) {
          joinCode = '';
          for (let i = 0; i < 6; i++) {
            joinCode += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          const existing = await db('classes').where({ join_code: joinCode }).first();
          codeExists = !!existing;
        }

        cls = await insertAndReturn(db, 'classes', {
          name: `کلاس ${selectedSubject} - ${grade}`,
          subject: selectedSubject,
          grade: grade,
          join_code: joinCode,
          teacher_id: teacherId,
          school_id: teacher.school_id || null,
          is_active: true,
        });
      }
      createdClasses.push(cls);

      const cleanGrade = grade.replace(/^پایه\s*/, '').trim();
      const matchingStudents = allStudents.filter((s) => {
        if (s.department && (s.department.includes(grade) || s.department.includes(cleanGrade))) return true;
        if (s.settings) {
          try {
            const parsed = typeof s.settings === 'string' ? JSON.parse(s.settings) : s.settings;
            if (parsed?.grade && (parsed.grade.includes(grade) || parsed.grade.includes(cleanGrade) || grade.includes(parsed.grade))) return true;
          } catch (e) {}
        }
        return false;
      });

      for (const st of matchingStudents) {
        const isMember = await db('class_members')
          .where({ class_id: cls.id, user_id: st.id })
          .first();

        if (!isMember) {
          await insertAndReturn(db, 'class_members', {
            class_id: cls.id,
            user_id: st.id,
            role: 'student',
          });
        }
        newlyConnectedStudentIds.add(st.id);
      }
    }

    const connectedStudents = await db('class_members')
      .join('classes', 'classes.id', 'class_members.class_id')
      .join('users', 'users.id', 'class_members.user_id')
      .where('classes.teacher_id', teacherId)
      .where('class_members.role', 'student')
      .select(
        'users.id',
        'users.display_name',
        'users.student_code',
        'users.avatar_url',
        'users.department',
        'classes.grade',
        'classes.name as class_name'
      )
      .distinct();

    const updatedUser = await db('users').where({ id: teacherId }).first();
    delete updatedUser.password_hash;

    return {
      user: updatedUser,
      classes: createdClasses,
      connectedStudents,
      connectedCount: connectedStudents.length,
    };
  }

  generateTokens(userId, role, tokenVersion = 0) {
    const tv = Number(tokenVersion || 0);
    const accessJti = generateId();
    const refreshJti = generateId();
    const accessToken = jwt.sign(
      { userId, role, typ: 'access', tv, jti: accessJti },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn },
    );
    const refreshToken = jwt.sign(
      { userId, role, typ: 'refresh', tv, jti: refreshJti },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn },
    );
    return { accessToken, refreshToken };
  }
}

module.exports = new AuthService();
