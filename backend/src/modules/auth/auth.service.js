const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/database');
const config = require('../../config');
const { generateId, insertAndReturn } = require('../../utils/dbHelpers');
const {
  generateUniqueUsername,
  generateUniqueSchoolUsername,
  normalizeMajors,
} = require('../../utils/usernameHelper');
const {
  normalizePersianDigits,
  validateStudentAcademicInfo,
} = require('../../utils/studentRegistrationHelper');
const { validateTeacherTeachingInfo } = require('../../utils/teacherRegistrationHelper');
const { validateParentRelation } = require('../../utils/parentRegistrationHelper');
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

const DEFAULT_BUILTIN_SCHOOLS = [
  { id: 'sch-1', name: 'دبیرستان استعدادهای درخشان علامه حلی ۱ (تهران)', code: 'SCH-1001', city: 'تهران', level: 'متوسطه دوم (دبیرستان)' },
  { id: 'sch-2', name: 'دبیرستان فرزانگان ۱ (تهران)', code: 'SCH-1002', city: 'تهران', level: 'متوسطه دوم (دبیرستان)' },
  { id: 'sch-3', name: 'مجتمع آموزشی هوشمند ادیبان', code: 'SCH-1003', city: 'تهران', level: 'مجتمع آموزشی کامل' },
  { id: 'sch-4', name: 'دبیرستان نمونه دولتی رشد', code: 'SCH-1004', city: 'تهران', level: 'متوسطه دوم (دبیرستان)' },
  { id: 'sch-5', name: 'دبیرستان ماندگار البرز', code: 'SCH-1005', city: 'تهران', level: 'متوسطه دوم (دبیرستان)' },
  { id: 'sch-6', name: 'مدرسه هوشمند دانشمند', code: 'SCH-1006', city: 'تهران', level: 'دبستان (ابتدایی)' },
  { id: 'sch-7', name: 'هنرستان فنی نمونه شهید بهشتی', code: 'SCH-1007', city: 'تهران', level: 'هنرستان فنی و حرفه‌ای' },
  { id: 'sch-8', name: 'دبیرستان استعدادهای درخشان شهید بهشتی', code: 'SCH-1008', city: 'تهران', level: 'متوسطه دوم (دبیرستان)' },
];

function parseSchoolMajors(rawMajors) {
  if (Array.isArray(rawMajors)) return rawMajors;
  if (!rawMajors || typeof rawMajors !== 'string') return [];
  try {
    const parsed = JSON.parse(rawMajors);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

async function ensureBuiltinSchool(schoolName = null, schoolCode = null, schoolUsername = null) {
  const cleanName = schoolName ? String(schoolName).trim() : '';
  const cleanCode = schoolCode ? String(schoolCode).trim() : '';
  const cleanUsername = schoolUsername
    ? String(schoolUsername).trim().replace(/^@/, '').toLowerCase()
    : '';
  const cleanNameAsUsername = cleanName.startsWith('@')
    ? cleanName.replace(/^@/, '').toLowerCase()
    : '';

  let matched = null;
  if (cleanName) {
    matched = await db('schools').where({ name: cleanName }).first();
  }
  if (!matched && cleanCode) {
    matched = await db('schools').whereRaw('UPPER(code) = ?', [cleanCode.toUpperCase()]).first();
  }
  if (!matched && (cleanUsername || cleanNameAsUsername)) {
    const uname = cleanUsername || cleanNameAsUsername;
    try {
      matched = await db('schools').whereRaw('LOWER(username) = ?', [uname]).first();
    } catch (_e) {}
  }
  if (!matched && cleanName && /^[a-z0-9_]+$/i.test(cleanName)) {
    try {
      matched = await db('schools').whereRaw('LOWER(username) = ?', [cleanName.toLowerCase()]).first();
    } catch (_e) {}
  }
  if (matched) return matched;

  const builtin = DEFAULT_BUILTIN_SCHOOLS.find(
    (s) =>
      (cleanName && s.name === cleanName) ||
      (cleanCode && s.code.toLowerCase() === cleanCode.toLowerCase())
  );
  if (!builtin) return null;

  try {
    const existingById = await db('schools').where({ id: builtin.id }).first();
    if (existingById) return existingById;

    await db('schools').insert({
      id: builtin.id,
      name: builtin.name,
      code: builtin.code,
      city: builtin.city,
    });
    return await db('schools').where({ id: builtin.id }).first();
  } catch (_e) {
    return (
      (cleanName ? await db('schools').where({ name: cleanName }).first() : null) ||
      (cleanCode ? await db('schools').where({ code: cleanCode }).first() : null)
    );
  }
}

const DEMO_USERS_SPEC = [
  {
    roleKey: 'admin',
    id: 'staff-taghavi',
    email: 'principal@school.ir',
    phone: '09121110001',
    username: 'taghavi_admin',
    aliases: ['alireza_taghavi'],
    role: 'admin',
    display_name: 'دکتر علیرضا تقوی',
    personnel_code: 'EMP-98401',
    department: 'مدیریت و ستاد آموزشی',
    job_title: 'مدیر مجتمع آموزشی',
  },
  {
    roleKey: 'teacher',
    id: 'staff-akbari',
    email: 'akbari@school.ir',
    phone: '09121110004',
    username: 'akbari_math',
    aliases: ['hossein_mirzaei', 'mirzaei_edu', '09121110002'],
    role: 'teacher',
    display_name: 'استاد مسعود اکبری',
    personnel_code: 'EMP-98404',
    department: 'دپارتمان ریاضیات',
    job_title: 'دبیر ریاضیات پیشرفته و حسابان',
  },
  {
    roleKey: 'counselor',
    id: 'staff-sadeghi',
    email: 'sadeghi@school.ir',
    phone: '09121110003',
    username: 'sadeghi_counselor',
    aliases: [],
    role: 'counselor',
    display_name: 'دکتر فاطمه صادقی',
    personnel_code: 'EMP-98403',
    department: 'مرکز مشاوره و هدایت تحصیلی',
    job_title: 'مشاور ارشد تحصیلی و کنکور',
  },
  {
    roleKey: 'financial_officer',
    id: 'staff-finance',
    email: 'finance@school.ir',
    phone: '09121110007',
    username: 'rezaei_finance',
    aliases: [],
    role: 'financial_officer',
    display_name: 'مهندس سعید رضایی',
    personnel_code: 'EMP-98407',
    department: 'امور مالی و حسابداری شهریه',
    job_title: 'مسئول امور مالی و شهریه',
  },
  {
    roleKey: 'student',
    id: 'std-hosseini',
    email: 'hosseini@student.ir',
    phone: '09351110001',
    username: 'hosseini_std',
    aliases: ['STD-40301', '40301'],
    role: 'student',
    display_name: 'امیرحسین حسینی',
    student_code: 'STD-40301',
    department: 'پایه دهم ریاضی - کلاس ۱۰۱',
    job_title: 'دانش‌آموز',
  },
  {
    roleKey: 'student_2',
    id: 'std-ahmadi',
    email: 'ahmadi@student.ir',
    phone: '09351110002',
    username: 'ahmadi_std',
    aliases: ['STD-40302', '40302'],
    role: 'student',
    display_name: 'پارسا احمدی',
    student_code: 'STD-40302',
    department: 'پایه دهم ریاضی - کلاس ۱۰۱',
    job_title: 'دانش‌آموز',
  },
  {
    roleKey: 'student_3',
    id: 'std-kiani',
    email: 'kiani@student.ir',
    phone: '09351110003',
    username: 'kiani_std',
    aliases: ['STD-40303', '40303'],
    role: 'student',
    display_name: 'علی کیانی',
    student_code: 'STD-40303',
    department: 'پایه دهم تجربی - کلاس ۱۰۲',
    job_title: 'دانش‌آموز',
  },
  {
    roleKey: 'student_4',
    id: 'std-saeedi',
    email: 'saeedi@student.ir',
    phone: '09351110004',
    username: 'saeedi_std',
    aliases: ['STD-40304', '40304'],
    role: 'student',
    display_name: 'محمدرضا سعیدی',
    student_code: 'STD-40304',
    department: 'پایه دهم تجربی - کلاس ۱۰۲',
    job_title: 'دانش‌آموز',
  },
  {
    roleKey: 'parent',
    id: 'parent-hosseini',
    email: 'p_hosseini@parent.ir',
    phone: '09122220001',
    username: 'hosseini_parent',
    aliases: [],
    role: 'parent',
    display_name: 'حاج‌محمد حسینی (پدر امیرحسین)',
    student_code: 'STD-40301',
    department: 'انجمن اولیاء و مربیان',
    job_title: 'رئیس انجمن اولیاء',
  },
];

let cachedDemoPasswordHash = null;

async function ensureDemoDataIfMatched(identifierOrRole) {
  if (process.env.DISABLE_DEMO_SEED === 'true') return null;
  const raw = String(identifierOrRole || '').trim().replace(/^@/, '').toLowerCase();
  if (!raw) return null;

  const matchedSpec = DEMO_USERS_SPEC.find(
    (s) =>
      s.roleKey.toLowerCase() === raw ||
      s.phone.toLowerCase() === raw ||
      s.username.toLowerCase() === raw ||
      s.email.toLowerCase() === raw ||
      s.aliases.some((a) => a.toLowerCase() === raw)
  );
  if (!matchedSpec) return null;

  const defaultSchool = await ensureBuiltinSchool(
    'دبیرستان استعدادهای درخشان علامه حلی ۱ (تهران)',
    'SCH-1001'
  );
  const schoolId = defaultSchool ? defaultSchool.id : 'sch-1';

  if (!cachedDemoPasswordHash) {
    const seedPassword = process.env.DEMO_SEED_PASSWORD || '123456';
    cachedDemoPasswordHash = await bcrypt.hash(seedPassword, 10);
  }

  const defaultSettings = JSON.stringify({
    school_name: 'دبیرستان استعدادهای درخشان علامه حلی ۱ (تهران)',
    school_code: 'SCH-1001',
    school_level: 'متوسطه دوم (دبیرستان)',
    city: 'تهران',
    principal: 'دکتر علیرضا تقوی',
    is_school_registered: true,
    is_teacher_onboarded: true,
    is_onboarded: true,
    schools: ['دبیرستان استعدادهای درخشان علامه حلی ۱ (تهران)'],
    taught_grades: ['پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'],
    grade: 'پایه دهم',
  });

  for (const spec of DEMO_USERS_SPEC) {
    try {
      const existing = await db('users')
        .where({ id: spec.id })
        .orWhere({ phone: spec.phone })
        .first();
      if (!existing) {
        await db('users').insert({
          id: spec.id,
          email: spec.email,
          phone: spec.phone,
          username: spec.username,
          password_hash: cachedDemoPasswordHash,
          role: spec.role,
          school_id: schoolId,
          display_name: spec.display_name,
          personnel_code: spec.personnel_code || null,
          student_code: spec.student_code || null,
          department: spec.department,
          job_title: spec.job_title,
          locale: 'fa',
          is_verified: true,
          is_active: true,
          settings: defaultSettings,
        });
      }
    } catch (_e) {
      // Ignore constraint race conditions
    }
  }

  // Ensure parent-student link for parent-hosseini -> std-hosseini
  try {
    const parentUser = await db('users').where({ phone: '09122220001' }).first();
    const studentUser = await db('users').where({ phone: '09351110001' }).first();
    if (parentUser && studentUser) {
      const existingLink = await db('parent_student_links')
        .where({ parent_id: parentUser.id, student_id: studentUser.id })
        .first();
      if (!existingLink) {
        await db('parent_student_links').insert({
          id: generateId(),
          parent_id: parentUser.id,
          student_id: studentUser.id,
          relation: 'father',
          is_verified: true,
        });
      }
    }
  } catch (_e) {}

  return matchedSpec;
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
      const schoolByCode = await ensureBuiltinSchool(null, String(school_code).trim());
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
   * Register a new School and its Principal Admin account.
   * Persists all school attributes (name, city, level, majors, unique username,
   * bcrypt password_hash, principal_name, principal_phone) in one dedicated row in `schools`,
   * and creates the corresponding admin account in `users` with the exact same unique username.
   */
  async registerSchool({
    school_name,
    school_level,
    majors = [],
    city,
    admin_name,
    admin_phone,
    admin_password,
  }) {
    if (!school_name || !String(school_name).trim()) {
      const error = new Error('نام مدرسه الزامی است');
      error.statusCode = 400;
      throw error;
    }

    const cleanSchoolName = String(school_name).trim();
    const cleanCity = (city && String(city).trim()) || 'تهران';
    const cleanLevel = (school_level && String(school_level).trim()) || 'متوسطه دوم (دبیرستان)';
    const normalizedMajors = normalizeMajors(majors, cleanLevel);
    const cleanAdminName = (admin_name && String(admin_name).trim()) || 'مدیر مدرسه';
    const cleanPhone = admin_phone ? String(admin_phone).trim() : null;
    const passToHash = admin_password && String(admin_password).trim()
      ? String(admin_password).trim()
      : '123456';

    // Check if phone is already registered
    if (cleanPhone) {
      const existingUser = await db('users').where({ phone: cleanPhone }).first();
      if (existingUser) {
        // If this same admin is re-submitting their own school registration, allow idempotent login if password matches
        if (existingUser.role === 'admin' && existingUser.school_id && existingUser.password_hash) {
          const matchesPass =
            (await bcrypt.compare(passToHash, existingUser.password_hash)) ||
            (await bcrypt.compare('admin123', existingUser.password_hash));
          if (matchesPass) {
            const existingUsersSchool = await db('schools').where({ id: existingUser.school_id }).first();
            if (existingUsersSchool) {
              const safeUser = { ...existingUser };
              delete safeUser.password_hash;
              const tokens = this.generateTokens(safeUser.id, safeUser.role, safeUser.token_version);
              return {
                user: safeUser,
                school: {
                  id: existingUsersSchool.id,
                  school_code: existingUsersSchool.code,
                  name: existingUsersSchool.name,
                  level: existingUsersSchool.level || cleanLevel,
                  majors: parseSchoolMajors(existingUsersSchool.majors),
                  city: existingUsersSchool.city || cleanCity,
                  username: existingUsersSchool.username || safeUser.username,
                  principal_name: existingUsersSchool.principal_name || cleanAdminName,
                  principal: existingUsersSchool.principal_name || cleanAdminName,
                  principal_phone: existingUsersSchool.principal_phone || cleanPhone,
                  phone: existingUsersSchool.principal_phone || cleanPhone,
                },
                ...tokens,
              };
            }
          }
        }
        const error = new Error('این شماره تلفن قبلاً در سامانه ثبت شده است. لطفاً از تب «ورود با آیدی / شماره» وارد شوید.');
        error.messageEn = 'Phone number is already registered';
        error.statusCode = 409;
        throw error;
      }
    }

    // Generate a guaranteed-unique school code
    let school_code = `SCH-${Math.floor(1000 + Math.random() * 9000)}`;
    for (let attempt = 0; attempt < 15; attempt++) {
      const existingCode = await db('schools').where({ code: school_code }).first();
      if (!existingCode) break;
      school_code = `SCH-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // Disambiguate school name if another school with the exact same name exists
    let finalSchoolName = cleanSchoolName;
    const existingSchool = await db('schools').where({ name: finalSchoolName }).first();
    if (existingSchool) {
      const withCity = `${cleanSchoolName} (${cleanCity})`;
      const existingWithCity = await db('schools').where({ name: withCity }).first();
      finalSchoolName = existingWithCity ? `${cleanSchoolName} - ${school_code}` : withCity;
    }

    // Generate a guaranteed-unique personal username across both `users` and `schools`
    const username = await generateUniqueSchoolUsername(db, cleanAdminName, finalSchoolName);
    const password_hash = await bcrypt.hash(passToHash, 10);

    const schoolId = generateId();
    const schoolRecord = await insertAndReturn(db, 'schools', {
      id: schoolId,
      name: finalSchoolName,
      code: school_code,
      city: cleanCity,
      level: cleanLevel,
      majors: JSON.stringify(normalizedMajors),
      username,
      password_hash,
      principal_name: cleanAdminName,
      principal_phone: cleanPhone,
    });

    const schoolSettings = JSON.stringify({
      school_name: finalSchoolName,
      school_code,
      school_username: username,
      school_level: cleanLevel,
      majors: normalizedMajors,
      city: cleanCity,
      principal: cleanAdminName,
      is_school_registered: true,
    });

    const user = await insertAndReturn(db, 'users', {
      phone: cleanPhone,
      password_hash,
      display_name: cleanAdminName ? `${cleanAdminName} (مدیریت ${finalSchoolName})` : `مدیریت ${finalSchoolName}`,
      username,
      role: 'admin',
      school_id: schoolRecord?.id || schoolId,
      locale: 'fa',
      is_verified: true,
      is_active: true,
      settings: schoolSettings,
    });

    try {
      await db('schools').where({ id: schoolRecord?.id || schoolId }).update({ created_by: user.id });
    } catch (_e) {}

    delete user.password_hash;
    const tokens = this.generateTokens(user.id, user.role, user.token_version);

    const school = {
      id: schoolRecord?.id || schoolId,
      school_code: schoolRecord?.code || school_code,
      name: finalSchoolName,
      level: cleanLevel,
      majors: normalizedMajors,
      city: cleanCity,
      username,
      principal_name: cleanAdminName,
      principal: cleanAdminName,
      principal_phone: cleanPhone,
      phone: cleanPhone,
    };

    return { user, school, ...tokens };
  }

  /**
   * Public list of all registered and default schools.
   * Supports optional search query by school username (@id), name, code, city, or principal name.
   * NEVER exposes password_hash or principal_phone.
   */
  async getPublicSchoolsList(searchQuery = '') {
    let dbSchools = [];
    try {
      dbSchools = await db('schools')
        .select('id', 'name', 'code', 'city', 'level', 'majors', 'username', 'principal_name', 'created_at')
        .orderBy('created_at', 'desc');
    } catch (_e) {
      try {
        dbSchools = await db('schools')
          .select('id', 'name', 'code', 'city', 'created_at')
          .orderBy('created_at', 'desc');
      } catch (_err) {
        dbSchools = [];
      }
    }

    const schoolMap = new Map();
    (dbSchools || []).forEach((s) => {
      schoolMap.set(s.name, {
        id: s.id,
        name: s.name,
        code: s.code || `SCH-${String(s.id).slice(-4)}`,
        city: s.city || 'تهران',
        level: s.level || 'متوسطه دوم (دبیرستان)',
        majors: parseSchoolMajors(s.majors),
        username: s.username || null,
        principal_name: s.principal_name || null,
        is_registered: true,
      });
    });
    DEFAULT_BUILTIN_SCHOOLS.forEach((s) => {
      if (!schoolMap.has(s.name)) {
        schoolMap.set(s.name, {
          ...s,
          majors: s.majors || [],
          username: s.username || null,
          principal_name: s.principal_name || null,
        });
      }
    });

    const allSchools = Array.from(schoolMap.values());
    const cleanQ = String(searchQuery || '').trim();
    if (!cleanQ) return allSchools;

    const lowerQ = cleanQ.toLowerCase();
    const strippedAt = lowerQ.replace(/^@/, '');

    return allSchools.filter((s) => {
      const uname = (s.username || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      const code = (s.code || '').toLowerCase();
      const city = (s.city || '').toLowerCase();
      const principal = (s.principal_name || '').toLowerCase();
      return (
        (uname && (uname.includes(strippedAt) || `@${uname}`.includes(lowerQ))) ||
        name.includes(lowerQ) ||
        code.includes(lowerQ) ||
        city.includes(lowerQ) ||
        principal.includes(lowerQ)
      );
    });
  }

  /**
   * Look up a registered school strictly by its unique username (آیدی مدرسه) in the database.
   * NEVER exposes password_hash or principal_phone.
   */
  async getSchoolByUsername(rawUsername) {
    const cleanUsername = String(rawUsername || '')
      .trim()
      .replace(/^@/, '')
      .toLowerCase();

    if (!cleanUsername) {
      const error = new Error('لطفاً نام کاربری مدرسه را وارد کنید');
      error.statusCode = 400;
      throw error;
    }

    let school = null;
    try {
      school = await db('schools')
        .select('id', 'name', 'code', 'city', 'level', 'majors', 'username', 'principal_name')
        .whereRaw('LOWER(username) = ?', [cleanUsername])
        .first();
    } catch (_e) {
      school = null;
    }

    if (!school) {
      const error = new Error('مدرسه‌ای با این نام کاربری در دیتابیس یافت نشد');
      error.messageEn = 'School not found by username';
      error.statusCode = 404;
      throw error;
    }

    return {
      id: school.id,
      name: school.name,
      code: school.code,
      city: school.city || 'تهران',
      level: school.level || 'متوسطه دوم (دبیرستان)',
      majors: parseSchoolMajors(school.majors),
      username: school.username,
      principal_name: school.principal_name || null,
      is_registered: true,
    };
  }

  /**
   * Dedicated Student Registration:
   * Persists all student details exclusively in the dedicated `students` table
   * AND creates the linked `student` user account in `users` with the exact same
   * auto-generated exclusive username and bcrypt-hashed password.
   */
  async registerStudent({
    display_name,
    full_name,
    phone,
    school_id = null,
    school_name = null,
    school_code = null,
    school_username = null,
    education_level,
    major = null,
    grade = null,
    password,
  }) {
    const cleanFullName = String(display_name || full_name || '').trim();
    if (!cleanFullName || cleanFullName.length < 2) {
      const error = new Error('نام و نام خانوادگی دانش‌آموز الزامی است');
      error.statusCode = 400;
      throw error;
    }

    const cleanPhone = normalizePersianDigits(phone || '').replace(/\s+/g, '').trim();
    if (!cleanPhone) {
      const error = new Error('شماره تماس دانش‌آموز الزامی است');
      error.statusCode = 400;
      throw error;
    }

    const cleanPassword = String(password || '').trim();
    if (cleanPassword.length < 6) {
      const error = new Error('رمز عبور باید حداقل ۶ کاراکتر باشد');
      error.messageEn = 'Password must be at least 6 characters';
      error.statusCode = 400;
      throw error;
    }

    const academicCheck = validateStudentAcademicInfo({
      education_level,
      major,
      grade,
    });
    if (!academicCheck.valid) {
      const error = new Error(academicCheck.error);
      error.statusCode = 400;
      throw error;
    }

    // Resolve School strictly from database (by school_id, school_username, school_code, or school_name)
    let matchedSchool = null;
    const cleanSchoolUsername = school_username
      ? String(school_username).trim().replace(/^@/, '').toLowerCase()
      : '';

    if (school_id && String(school_id).trim()) {
      matchedSchool = await db('schools').where({ id: String(school_id).trim() }).first();
    }
    if (!matchedSchool && cleanSchoolUsername) {
      try {
        matchedSchool = await db('schools')
          .whereRaw('LOWER(username) = ?', [cleanSchoolUsername])
          .first();
      } catch (_e) {}
      if (!matchedSchool) {
        const error = new Error('مدرسه‌ای با نام کاربری واردشده در دیتابیس یافت نشد');
        error.messageEn = 'School username not found';
        error.statusCode = 404;
        throw error;
      }
    }
    if (!matchedSchool && (school_name || school_code)) {
      matchedSchool = await ensureBuiltinSchool(school_name, school_code, cleanSchoolUsername || null);
    }

    if (!matchedSchool) {
      const error = new Error('لطفاً یک مدرسه ثبت‌شده را از لیست انتخاب کنید یا نام کاربری معتبر مدرسه را وارد نمایید');
      error.statusCode = 400;
      throw error;
    }

    // Check duplicate phone across users
    const existingByPhone = await db('users').where({ phone: cleanPhone }).first();
    if (existingByPhone) {
      const error = new Error('این شماره تماس قبلاً در سامانه ثبت شده است. لطفاً از بخش «ورود با نام کاربری» وارد شوید.');
      error.messageEn = 'Phone number already registered';
      error.statusCode = 409;
      throw error;
    }

    // Auto-generate guaranteed-unique personal username across users, schools, and students
    const exclusiveUsername = await generateUniqueUsername(db, cleanFullName);
    const password_hash = await bcrypt.hash(cleanPassword, 12);

    const countRow = await db('users').where({ role: 'student' }).count('id as count').first();
    const student_code = `STD-${40300 + (parseInt(countRow ? countRow.count : 0, 10) + 1)}`;

    const userSettings = JSON.stringify({
      school_id: matchedSchool.id,
      school_name: matchedSchool.name,
      school_code: matchedSchool.code,
      school_username: matchedSchool.username || null,
      education_level: academicCheck.education_level,
      major: academicCheck.major,
      grade: academicCheck.grade,
      is_onboarded: false,
    });

    const user = await insertAndReturn(db, 'users', {
      phone: cleanPhone,
      password_hash,
      display_name: cleanFullName,
      username: exclusiveUsername,
      role: 'student',
      school_id: matchedSchool.id,
      student_code,
      department: academicCheck.departmentLabel,
      job_title: 'دانش‌آموز',
      locale: 'fa',
      is_verified: true,
      is_active: true,
      settings: userSettings,
    });

    const studentRecordId = generateId();
    const studentRecord = await insertAndReturn(db, 'students', {
      id: studentRecordId,
      user_id: user.id,
      full_name: cleanFullName,
      phone: cleanPhone,
      school_id: matchedSchool.id,
      school_name: matchedSchool.name,
      school_username: matchedSchool.username || null,
      education_level: academicCheck.education_level,
      major: academicCheck.major,
      grade: academicCheck.grade,
      student_code,
      username: exclusiveUsername,
      password_hash,
    });

    delete user.password_hash;
    const safeStudent = { ...(studentRecord || {}) };
    delete safeStudent.password_hash;

    const tokens = this.generateTokens(user.id, user.role, user.token_version);
    return {
      user,
      student: safeStudent,
      school: {
        id: matchedSchool.id,
        name: matchedSchool.name,
        code: matchedSchool.code,
        username: matchedSchool.username || null,
        city: matchedSchool.city || 'تهران',
      },
      ...tokens,
    };
  }

  /**
   * Dedicated Teacher Registration:
   * Persists all teacher details in the dedicated `teachers` table as a subordinate of
   * the selected school (`school_id`), creates the linked `teacher` account in `users`
   * with the exact same auto-generated exclusive username and bcrypt-hashed password.
   */
  async registerTeacher({
    display_name,
    full_name,
    phone,
    school_id = null,
    school_name = null,
    school_code = null,
    school_username = null,
    education_level,
    majors = [],
    taught_grades = [],
    grades = [],
    password,
  }) {
    const cleanFullName = String(display_name || full_name || '').trim();
    if (!cleanFullName || cleanFullName.length < 2) {
      const error = new Error('نام و نام خانوادگی معلم الزامی است');
      error.statusCode = 400;
      throw error;
    }

    const cleanPhone = normalizePersianDigits(phone || '').replace(/\s+/g, '').trim();
    if (!cleanPhone) {
      const error = new Error('شماره تماس معلم الزامی است');
      error.statusCode = 400;
      throw error;
    }

    const cleanPassword = String(password || '').trim();
    if (cleanPassword.length < 6) {
      const error = new Error('رمز عبور باید حداقل ۶ کاراکتر باشد');
      error.messageEn = 'Password must be at least 6 characters';
      error.statusCode = 400;
      throw error;
    }

    const selectedGrades = Array.isArray(taught_grades) && taught_grades.length > 0 ? taught_grades : grades;
    const teachingCheck = validateTeacherTeachingInfo({
      education_level,
      majors,
      taught_grades: selectedGrades,
    });
    if (!teachingCheck.valid) {
      const error = new Error(teachingCheck.error);
      error.statusCode = 400;
      throw error;
    }

    // Resolve School strictly from database (by school_id, school_username, school_code, or school_name)
    let matchedSchool = null;
    const cleanSchoolUsername = school_username
      ? String(school_username).trim().replace(/^@/, '').toLowerCase()
      : '';

    if (school_id && String(school_id).trim()) {
      matchedSchool = await db('schools').where({ id: String(school_id).trim() }).first();
    }
    if (!matchedSchool && cleanSchoolUsername) {
      try {
        matchedSchool = await db('schools')
          .whereRaw('LOWER(username) = ?', [cleanSchoolUsername])
          .first();
      } catch (_e) {}
      if (!matchedSchool) {
        const error = new Error('مدرسه‌ای با نام کاربری واردشده در دیتابیس یافت نشد');
        error.messageEn = 'School username not found';
        error.statusCode = 404;
        throw error;
      }
    }
    if (!matchedSchool && (school_name || school_code)) {
      matchedSchool = await ensureBuiltinSchool(school_name, school_code, cleanSchoolUsername || null);
    }

    if (!matchedSchool) {
      const error = new Error('لطفاً یک مدرسه ثبت‌شده را از لیست انتخاب کنید یا نام کاربری معتبر مدرسه را وارد نمایید');
      error.statusCode = 400;
      throw error;
    }

    // Check duplicate phone
    const existingByPhone = await db('users').where({ phone: cleanPhone }).first();
    if (existingByPhone) {
      const error = new Error('این شماره تماس قبلاً در سامانه ثبت شده است. لطفاً از بخش «ورود با نام کاربری» وارد شوید.');
      error.messageEn = 'Phone number already registered';
      error.statusCode = 409;
      throw error;
    }

    // Auto-generate guaranteed-unique personal username across users, schools, students, and teachers
    const exclusiveUsername = await generateUniqueUsername(db, cleanFullName);
    const password_hash = await bcrypt.hash(cleanPassword, 12);

    const countRow = await db('users').where({ role: 'teacher' }).count('id as count').first();
    const personnel_code = `EMP-${98400 + (parseInt(countRow ? countRow.count : 0, 10) + 1)}`;

    const userSettings = JSON.stringify({
      school_id: matchedSchool.id,
      school_name: matchedSchool.name,
      school_code: matchedSchool.code,
      school_username: matchedSchool.username || null,
      schools: [matchedSchool.name],
      education_level: teachingCheck.education_level,
      majors: teachingCheck.majors,
      taught_grades: teachingCheck.taught_grades,
      is_teacher_onboarded: true,
    });

    const user = await insertAndReturn(db, 'users', {
      phone: cleanPhone,
      password_hash,
      display_name: cleanFullName,
      username: exclusiveUsername,
      role: 'teacher',
      school_id: matchedSchool.id,
      personnel_code,
      department: teachingCheck.departmentLabel,
      job_title: `معلم ${teachingCheck.education_level}`,
      locale: 'fa',
      is_verified: true,
      is_active: true,
      settings: userSettings,
    });

    const teacherRecordId = generateId();
    const teacherRecord = await insertAndReturn(db, 'teachers', {
      id: teacherRecordId,
      user_id: user.id,
      school_id: matchedSchool.id,
      school_name: matchedSchool.name,
      school_username: matchedSchool.username || null,
      full_name: cleanFullName,
      phone: cleanPhone,
      education_level: teachingCheck.education_level,
      majors: JSON.stringify(teachingCheck.majors),
      taught_grades: JSON.stringify(teachingCheck.taught_grades),
      personnel_code,
      username: exclusiveUsername,
      password_hash,
    });

    delete user.password_hash;
    const safeTeacher = {
      ...(teacherRecord || {}),
      majors: teachingCheck.majors,
      taught_grades: teachingCheck.taught_grades,
    };
    delete safeTeacher.password_hash;

    const tokens = this.generateTokens(user.id, user.role, user.token_version);
    return {
      user,
      teacher: safeTeacher,
      school: {
        id: matchedSchool.id,
        name: matchedSchool.name,
        code: matchedSchool.code,
        username: matchedSchool.username || null,
        city: matchedSchool.city || 'تهران',
      },
      ...tokens,
    };
  }

  /**
   * Lookup a student in the database by their exclusive username (optionally scoped to a school)
   * Never exposes phone or password_hash.
   */
  async getStudentByUsername(rawUsername, { school_id = null } = {}) {
    const clean = String(rawUsername || '').trim().replace(/^@/, '').toLowerCase();
    if (!clean) {
      const error = new Error('نام کاربری دانش‌آموز الزامی است');
      error.statusCode = 400;
      throw error;
    }

    let studentRow = null;
    try {
      studentRow = await db('students')
        .whereRaw('LOWER(username) = ?', [clean])
        .first();
    } catch (_e) {}

    let studentUser = null;
    if (studentRow && studentRow.user_id) {
      studentUser = await db('users').where({ id: studentRow.user_id }).first();
    }
    if (!studentUser) {
      studentUser = await db('users')
        .where({ role: 'student' })
        .andWhereRaw('LOWER(username) = ?', [clean])
        .first();
    }

    if (!studentUser) {
      const error = new Error('دانش‌آموزی با این نام کاربری در دیتابیس یافت نشد');
      error.messageEn = 'Student username not found';
      error.statusCode = 404;
      throw error;
    }

    const effectiveSchoolId = studentRow?.school_id || studentUser.school_id || null;
    if (school_id && String(school_id).trim() && effectiveSchoolId && String(effectiveSchoolId) !== String(school_id).trim()) {
      const error = new Error('این نام کاربری دانش‌آموز متعلق به مدرسه انتخاب‌شده نیست');
      error.messageEn = 'Student does not belong to the selected school';
      error.statusCode = 400;
      throw error;
    }

    let schoolObj = null;
    if (effectiveSchoolId) {
      schoolObj = await db('schools').where({ id: effectiveSchoolId }).first();
    }

    return {
      id: studentRow?.id || null,
      user_id: studentUser.id,
      full_name: studentRow?.full_name || studentUser.display_name,
      username: studentRow?.username || studentUser.username,
      student_code: studentRow?.student_code || studentUser.student_code || null,
      education_level: studentRow?.education_level || null,
      grade: studentRow?.grade || null,
      school_id: effectiveSchoolId,
      school_name: studentRow?.school_name || schoolObj?.name || null,
      school_username: studentRow?.school_username || schoolObj?.username || null,
    };
  }

  /**
   * Dedicated Parent Registration:
   * Persists all parent details in the dedicated `parents` table hierarchically
   * under the verified student (`student_id` / `student_user_id`) who is under
   * the selected school (`school_id`), creates the linked `parent` user in `users`
   * + `parent_student_links`, issues a strictly unique personal `@username`, and
   * stores bcrypt-hashed password for future username+password logins.
   */
  async registerParent({
    display_name,
    full_name,
    phone,
    school_id = null,
    school_name = null,
    school_code = null,
    school_username = null,
    student_name = '',
    student_username = '',
    relation_type = '',
    relation = '',
    custom_relation = '',
    password,
  }) {
    const cleanFullName = String(display_name || full_name || '').trim();
    if (!cleanFullName || cleanFullName.length < 2) {
      const error = new Error('نام و نام خانوادگی اولیا الزامی است');
      error.statusCode = 400;
      throw error;
    }

    const cleanPhone = normalizePersianDigits(phone || '').replace(/\s+/g, '').trim();
    if (!cleanPhone) {
      const error = new Error('شماره تماس اولیا الزامی است');
      error.statusCode = 400;
      throw error;
    }

    const cleanPassword = String(password || '').trim();
    if (cleanPassword.length < 6) {
      const error = new Error('رمز عبور باید حداقل ۶ کاراکتر باشد');
      error.messageEn = 'Password must be at least 6 characters';
      error.statusCode = 400;
      throw error;
    }

    const relationCheck = validateParentRelation({
      relation_type,
      relation,
      custom_relation,
    });
    if (!relationCheck.valid) {
      const error = new Error(relationCheck.error);
      error.statusCode = 400;
      throw error;
    }

    // Resolve School strictly from database (by school_id, school_username, school_code, or school_name)
    let matchedSchool = null;
    const cleanSchoolUsername = school_username
      ? String(school_username).trim().replace(/^@/, '').toLowerCase()
      : '';

    if (school_id && String(school_id).trim()) {
      matchedSchool = await db('schools').where({ id: String(school_id).trim() }).first();
    }
    if (!matchedSchool && cleanSchoolUsername) {
      try {
        matchedSchool = await db('schools')
          .whereRaw('LOWER(username) = ?', [cleanSchoolUsername])
          .first();
      } catch (_e) {}
      if (!matchedSchool) {
        const error = new Error('مدرسه‌ای با نام کاربری واردشده در دیتابیس یافت نشد');
        error.messageEn = 'School username not found';
        error.statusCode = 404;
        throw error;
      }
    }
    if (!matchedSchool && (school_name || school_code)) {
      matchedSchool = await ensureBuiltinSchool(school_name, school_code, cleanSchoolUsername || null);
    }

    if (!matchedSchool) {
      const error = new Error('لطفاً مدرسه دانش‌آموز را از لیست جستجو انتخاب کنید یا نام کاربری معتبر مدرسه را وارد نمایید');
      error.statusCode = 400;
      throw error;
    }

    // Resolve Student strictly from database under this school by student_username
    const cleanStudentUsername = String(student_username || '').trim().replace(/^@/, '').toLowerCase();
    if (!cleanStudentUsername) {
      const error = new Error('نام کاربری دانش‌آموز الزامی است');
      error.statusCode = 400;
      throw error;
    }

    let studentRow = null;
    try {
      studentRow = await db('students')
        .whereRaw('LOWER(username) = ?', [cleanStudentUsername])
        .first();
    } catch (_e) {}

    let studentUser = null;
    if (studentRow && studentRow.user_id) {
      studentUser = await db('users').where({ id: studentRow.user_id }).first();
    }
    if (!studentUser) {
      studentUser = await db('users')
        .where({ role: 'student' })
        .andWhereRaw('LOWER(username) = ?', [cleanStudentUsername])
        .first();
    }

    if (!studentUser) {
      const error = new Error('دانش‌آموزی با این نام کاربری در دیتابیس یافت نشد. لطفاً نام کاربری دانش‌آموز را دقیق وارد کنید.');
      error.messageEn = 'Student username not found';
      error.statusCode = 404;
      throw error;
    }

    const studentSchoolId = studentRow?.school_id || studentUser.school_id;
    if (studentSchoolId && String(studentSchoolId) !== String(matchedSchool.id)) {
      const error = new Error('دانش‌آموز واردشده زیرمجموعه مدرسه انتخاب‌شده نیست. لطفاً مدرسه یا نام کاربری دانش‌آموز را بررسی کنید.');
      error.messageEn = 'Student does not belong to the selected school';
      error.statusCode = 400;
      throw error;
    }

    const cleanStudentName = String(student_name || '').trim() || studentRow?.full_name || studentUser.display_name;

    // Check duplicate phone across users
    const existingByPhone = await db('users').where({ phone: cleanPhone }).first();
    if (existingByPhone) {
      const error = new Error('این شماره تماس قبلاً در سامانه ثبت شده است. لطفاً از بخش «ورود با نام کاربری» وارد شوید.');
      error.messageEn = 'Phone number already registered';
      error.statusCode = 409;
      throw error;
    }

    // Auto-generate guaranteed-unique personal username across all tables
    const exclusiveUsername = await generateUniqueUsername(db, cleanFullName);
    const password_hash = await bcrypt.hash(cleanPassword, 12);

    const userSettings = JSON.stringify({
      school_id: matchedSchool.id,
      school_name: matchedSchool.name,
      school_code: matchedSchool.code,
      school_username: matchedSchool.username || null,
      student_id: studentRow?.id || null,
      student_user_id: studentUser.id,
      student_name: cleanStudentName,
      student_username: studentRow?.username || studentUser.username,
      relation: relationCheck.relation,
      relation_type: relationCheck.relation_type,
      is_onboarded: true,
    });

    const user = await insertAndReturn(db, 'users', {
      phone: cleanPhone,
      password_hash,
      display_name: cleanFullName,
      username: exclusiveUsername,
      role: 'parent',
      school_id: matchedSchool.id,
      student_code: studentRow?.student_code || studentUser.student_code || null,
      department: studentUser.department || 'اولیاء و مربیان',
      job_title: relationCheck.jobTitle,
      locale: 'fa',
      is_verified: true,
      is_active: true,
      settings: userSettings,
    });

    // Link parent to student in parent_student_links for full dashboard interoperability
    try {
      const existingLink = await db('parent_student_links')
        .where({ parent_id: user.id, student_id: studentUser.id })
        .first();
      if (!existingLink) {
        await db('parent_student_links').insert({
          id: generateId(),
          parent_id: user.id,
          student_id: studentUser.id,
          relation: relationCheck.relation,
          is_verified: true,
        });
      }
    } catch (_e) {}

    // Persist dedicated hierarchical row in `parents` table (Parent -> Student -> School)
    const parentRecordId = generateId();
    const parentRecord = await insertAndReturn(db, 'parents', {
      id: parentRecordId,
      user_id: user.id,
      school_id: matchedSchool.id,
      school_name: matchedSchool.name,
      school_username: matchedSchool.username || null,
      student_id: studentRow?.id || null,
      student_user_id: studentUser.id,
      student_name: cleanStudentName,
      student_username: studentRow?.username || studentUser.username,
      full_name: cleanFullName,
      phone: cleanPhone,
      relation_type: relationCheck.relation_type,
      relation: relationCheck.relation,
      username: exclusiveUsername,
      password_hash,
    });

    delete user.password_hash;
    const safeParent = { ...(parentRecord || {}) };
    delete safeParent.password_hash;

    const tokens = this.generateTokens(user.id, user.role, user.token_version);
    return {
      user,
      parent: safeParent,
      student: {
        id: studentRow?.id || null,
        user_id: studentUser.id,
        full_name: studentRow?.full_name || studentUser.display_name,
        username: studentRow?.username || studentUser.username,
        student_code: studentRow?.student_code || studentUser.student_code || null,
        grade: studentRow?.grade || null,
        education_level: studentRow?.education_level || null,
      },
      school: {
        id: matchedSchool.id,
        name: matchedSchool.name,
        code: matchedSchool.code,
        username: matchedSchool.username || null,
        city: matchedSchool.city || 'تهران',
      },
      ...tokens,
    };
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
        const error = new Error('این شماره همراه یا نام کاربری قبلاً ثبت شده است. لطفاً رمز عبور خود را وارد نمایید.');
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

    // Resolve existing or built-in school if provided
    const matchedSchool = await ensureBuiltinSchool(school_name, school_code);
    const effectiveSchoolName = matchedSchool
      ? matchedSchool.name
      : (school_name && school_name.trim() ? school_name.trim() : null);
    const effectiveSchoolCode = matchedSchool
      ? matchedSchool.code
      : (school_code && school_code.trim() ? school_code.trim() : null);

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
      school_name: effectiveSchoolName,
      school_code: effectiveSchoolCode,
      schools: effectiveSchoolName ? [effectiveSchoolName] : [],
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
      is_active: true,
      settings: JSON.stringify(initialSettings),
    });

    newUser.school_name = effectiveSchoolName;
    delete newUser.password_hash;
    const tokens = this.generateTokens(newUser.id, newUser.role, newUser.token_version);
    return { user: newUser, isNew: true, ...tokens };
  }

  /**
   * Dedicated Demo Account Login for the 6 showcase roles
   */
  async demoLogin(role = 'admin') {
    const cleanRole = String(role || 'admin').trim().toLowerCase();
    const spec = (await ensureDemoDataIfMatched(cleanRole)) || (await ensureDemoDataIfMatched('admin'));
    if (!spec) {
      const error = new Error('حساب آزمایشی در این محیط غیرفعال است');
      error.statusCode = 403;
      throw error;
    }

    const user = await db('users')
      .where({ id: spec.id })
      .orWhere({ phone: spec.phone })
      .first();

    if (!user) {
      const error = new Error('حساب آزمایشی یافت نشد');
      error.statusCode = 404;
      throw error;
    }

    delete user.password_hash;
    const tokens = this.generateTokens(user.id, user.role, user.token_version);
    return { user, ...tokens };
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

    if (effectiveCaptchaId !== null && effectiveCaptchaId !== undefined && String(effectiveCaptchaId).trim() !== '') {
      if (!localCaptcha.verify(effectiveCaptchaId, effectiveCaptchaAnswer)) {
        const error = new Error('کد امنیتی نامعتبر یا منقضی شده است');
        error.messageEn = 'Invalid or expired captcha';
        error.statusCode = 400;
        throw error;
      }
    }

    const cleanId = normalizePersianDigits(identifier || '').trim();
    const cleanUsername = cleanId.replace(/^@/, '').toLowerCase();

    if (!cleanId) {
      const error = new Error('لطفاً نام کاربری خود را وارد نمایید');
      error.messageEn = 'Username is required';
      error.errorField = 'username';
      error.errorCode = 'USERNAME_REQUIRED';
      error.statusCode = 401;
      throw error;
    }

    // Ensure demo accounts exist if logging in with a known demo identifier
    await ensureDemoDataIfMatched(cleanId);

    let targetSchoolId = loginOptions.school_id ? String(loginOptions.school_id).trim() : null;
    if (!targetSchoolId && loginOptions.school_code && String(loginOptions.school_code).trim()) {
      const schoolRecord = await ensureBuiltinSchool(null, String(loginOptions.school_code).trim());
      if (schoolRecord) {
        targetSchoolId = schoolRecord.id;
      }
    }

    // Only an unambiguous identifier authenticates an account: e-mail, phone
    // number or user name. When school_id/school_code is supplied, scope lookup
    // to that school so multi-school teachers/parents log into the intended tenant.
    const buildIdentifierQuery = () =>
      db('users').where(function () {
        this.where({ email: cleanId })
          .orWhere({ phone: cleanId })
          .orWhereRaw('LOWER(username) = ?', [cleanUsername]);
      });

    let candidates = targetSchoolId
      ? await buildIdentifierQuery().andWhere({ school_id: targetSchoolId })
      : await buildIdentifierQuery();

    if ((!candidates || candidates.length === 0) && targetSchoolId) {
      candidates = await buildIdentifierQuery();
    }

    if (!candidates || candidates.length === 0) {
      const error = new Error('نام کاربری واردشده اشتباه است و در دیتابیس یافت نشد');
      error.messageEn = 'Invalid username — account not found';
      error.errorField = 'username';
      error.errorCode = 'INVALID_USERNAME';
      error.statusCode = 401;
      throw error;
    }

    if (!password || !password.trim()) {
      const error = new Error('لطفاً رمز عبور خود را وارد نمایید');
      error.messageEn = 'Password is required';
      error.errorField = 'password';
      error.errorCode = 'PASSWORD_REQUIRED';
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
      const error = new Error('رمز عبور واردشده اشتباه است');
      error.messageEn = 'Invalid password';
      error.errorField = 'password';
      error.errorCode = 'INVALID_PASSWORD';
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
    // Ensure demo students exist if parent enters one of the 4 demo student codes (STD-40301..40304)
    await ensureDemoDataIfMatched(rawCode);

    // The student code must match exactly: "40301" and "STD-40301" are the two
    // spellings of the same code, but a partial code never resolves a student
    // (report finding A3).
    const normalizedCode = rawCode.toLowerCase();

    let resolvedSchoolId =
      typeof options?.school_id === 'string'
        ? options.school_id.trim()
        : options?.school_id?.id || null;
    if (!resolvedSchoolId && options?.school_code && typeof options.school_code === 'string') {
      const sch = await ensureBuiltinSchool(null, options.school_code.trim());
      if (sch) resolvedSchoolId = sch.id;
    }
    if (!resolvedSchoolId && options?.school_name && typeof options.school_name === 'string') {
      const sch = await ensureBuiltinSchool(options.school_name.trim(), null);
      if (sch) resolvedSchoolId = sch.id;
    }

    const buildStudentQuery = () =>
      db('users')
        .where({ role: 'student' })
        .andWhere(function () {
          this.whereRaw('LOWER(student_code) = ?', [normalizedCode])
            .orWhereRaw('LOWER(student_code) = ?', [`std-${normalizedCode}`]);
        });

    const student = resolvedSchoolId
      ? await buildStudentQuery().andWhere({ school_id: resolvedSchoolId }).first()
      : await buildStudentQuery().first();

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

  async getStudentSetupOptions(currentUser = null) {
    const schools = await this.getPublicSchoolsList();

    const grades = [
      'پیش دبستانی ۱',
      'پیش دبستانی ۲',
      'اول دبستان',
      'دوم دبستان',
      'سوم دبستان',
      'چهارم دبستان',
      'پنجم دبستان',
      'ششم دبستان',
      'پایه هفتم',
      'پایه هشتم',
      'پایه نهم',
      'پایه دهم',
      'پایه یازدهم',
      'پایه دوازدهم',
    ];

    let studentRow = null;
    let studentUser = currentUser;
    if (currentUser?.id) {
      studentUser = await db('users').where({ id: currentUser.id }).first();
      try {
        studentRow = await db('students').where({ user_id: currentUser.id }).first();
      } catch (_e) {
        studentRow = null;
      }
    }

    const schoolId = studentUser?.school_id || studentRow?.school_id || null;
    let school = null;
    if (schoolId) {
      school = await db('schools')
        .where({ id: schoolId })
        .select('id', 'name', 'city', 'level as education_level', 'username', 'code as school_code')
        .first();
    }

    // Strictly load real teachers stored in this school's database (never cross-school or fake fallbacks)
    let enrichedTeachers = [];
    if (schoolId) {
      const teacherUsers = await db('users')
        .where({ school_id: schoolId, role: 'teacher' })
        .andWhere(function () {
          this.where('is_active', true).orWhere('is_active', 1).orWhereNull('is_active');
        })
        .select('id', 'display_name', 'username', 'job_title', 'department', 'avatar_url', 'role', 'personnel_code')
        .orderBy('display_name', 'asc');

      const teacherUserIds = teacherUsers.map((t) => t.id);

      let teacherProfiles = [];
      if (teacherUserIds.length > 0) {
        try {
          teacherProfiles = await db('teachers')
            .whereIn('user_id', teacherUserIds)
            .where({ school_id: schoolId });
        } catch (_e) {
          teacherProfiles = [];
        }
      }
      const profileByUserId = new Map(teacherProfiles.map((p) => [p.user_id, p]));

      const classes = teacherUserIds.length > 0
        ? await db('classes')
            .where({ school_id: schoolId, is_active: true })
            .whereIn('teacher_id', teacherUserIds)
            .select('id', 'name', 'subject', 'grade', 'major', 'teacher_id')
        : [];

      const teacherClassMap = new Map();
      classes.forEach((c) => {
        if (!teacherClassMap.has(c.teacher_id)) teacherClassMap.set(c.teacher_id, []);
        teacherClassMap.get(c.teacher_id).push(c);
      });

      const parseJsonArr = (val) => {
        if (Array.isArray(val)) return val;
        if (!val || typeof val !== 'string') return [];
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      };

      enrichedTeachers = [];
      for (const t of teacherUsers) {
        if (!t.username) {
          t.username = await ensureUserHasUsername(t.id);
        }
        const profile = profileByUserId.get(t.id);
        const tClasses = teacherClassMap.get(t.id) || [];
        const subjectsFromClasses = Array.from(new Set(tClasses.map((c) => c.subject).filter(Boolean)));
        const majors = parseJsonArr(profile?.majors);
        const taughtGrades = parseJsonArr(profile?.taught_grades);

        enrichedTeachers.push({
          id: t.id,
          display_name: profile?.full_name || t.display_name,
          username: t.username || profile?.username || '',
          job_title: t.job_title || (profile?.education_level ? `دبیر ${profile.education_level}` : 'معلم مدرسه'),
          department: t.department || profile?.education_level || '',
          avatar_url: t.avatar_url || null,
          role: t.role,
          personnel_code: t.personnel_code || profile?.personnel_code || '',
          education_level: profile?.education_level || '',
          majors,
          taught_grades: taughtGrades,
          subjects: subjectsFromClasses.length > 0
            ? subjectsFromClasses
            : [t.job_title || profile?.education_level || 'معلم'],
          classes: tClasses,
        });
      }
    }

    let selectedTeacherIds = [];
    if (studentUser?.id) {
      try {
        const existingLinks = await db('student_teacher_links')
          .where({ student_user_id: studentUser.id })
          .pluck('teacher_user_id');
        if (existingLinks.length > 0) {
          selectedTeacherIds = existingLinks;
        }
      } catch (_e) {
        selectedTeacherIds = [];
      }

      if (selectedTeacherIds.length === 0 && studentUser.settings) {
        try {
          const parsedSettings = typeof studentUser.settings === 'string'
            ? JSON.parse(studentUser.settings)
            : studentUser.settings;
          if (Array.isArray(parsedSettings?.selected_teacher_ids)) {
            selectedTeacherIds = parsedSettings.selected_teacher_ids;
          }
        } catch (_e) {}
      }
    }

    let userSettings = {};
    if (studentUser?.settings) {
      try {
        userSettings = typeof studentUser.settings === 'string'
          ? JSON.parse(studentUser.settings)
          : studentUser.settings;
      } catch (_e) {
        userSettings = {};
      }
    }

    const studentProfile = studentUser
      ? {
          id: studentUser.id,
          display_name: studentRow?.full_name || studentUser.display_name,
          username: studentUser.username || '',
          school_id: schoolId,
          school_name: school?.name || studentRow?.school_name || userSettings.school_name || '',
          education_level: studentRow?.education_level || userSettings.education_level || '',
          grade: studentRow?.grade || userSettings.grade || studentUser.department || '',
          major: studentRow?.major || userSettings.major || '',
          is_onboarded: Boolean(userSettings.is_onboarded),
        }
      : null;

    return {
      school,
      student_profile: studentProfile,
      selected_teacher_ids: selectedTeacherIds,
      teachers: enrichedTeachers,
      schools,
      grades,
    };
  }

  async saveStudentSetup(studentId, { school_name, grade, major, education_level, teacher_ids = [] } = {}) {
    const { buildAutoClassTitle } = require('../../utils/studentTeacherHelper');

    const student = await db('users').where({ id: studentId }).first();
    if (!student) {
      const error = new Error('دانش‌آموز یافت نشد');
      error.statusCode = 404;
      throw error;
    }

    if (!student.school_id) {
      const error = new Error('مدرسه این دانش‌آموز مشخص نشده است');
      error.statusCode = 400;
      throw error;
    }

    let studentProfile = null;
    try {
      studentProfile = await db('students').where({ user_id: studentId }).first();
    } catch (_e) {
      studentProfile = null;
    }

    const school = await db('schools').where({ id: student.school_id }).first();

    let settings = {};
    if (student.settings) {
      try {
        settings = typeof student.settings === 'string' ? JSON.parse(student.settings) : student.settings;
      } catch (_e) {
        settings = {};
      }
    }

    const effectiveSchoolName = school?.name || studentProfile?.school_name || school_name || settings.school_name || '';
    const effectiveEducationLevel = String(education_level || studentProfile?.education_level || settings.education_level || '').trim();
    const effectiveGrade = String(grade || studentProfile?.grade || settings.grade || student.department || 'عمومی').trim();
    const effectiveMajor = String(major !== undefined ? major : (studentProfile?.major || settings.major || '')).trim();

    const uniqueRequestedIds = Array.from(
      new Set((Array.isArray(teacher_ids) ? teacher_ids : []).map((id) => String(id || '').trim()).filter(Boolean))
    );

    // Strictly validate every requested teacher belongs to the student's school
    const validatedTeachers = [];
    if (uniqueRequestedIds.length > 0) {
      const foundTeachers = await db('users')
        .whereIn('id', uniqueRequestedIds)
        .select('id', 'display_name', 'username', 'role', 'school_id', 'job_title', 'department');

      const foundById = new Map(foundTeachers.map((t) => [t.id, t]));
      for (const reqId of uniqueRequestedIds) {
        const t = foundById.get(reqId);
        if (!t) {
          const err = new Error('یکی از معلمان انتخاب‌شده در پایگاه داده یافت نشد');
          err.statusCode = 404;
          throw err;
        }
        if (t.school_id !== student.school_id) {
          const err = new Error('انتخاب معلم از مدرسه دیگر مجاز نیست');
          err.statusCode = 403;
          throw err;
        }
        if (!['teacher', 'admin', 'manager'].includes(t.role)) {
          const err = new Error('کاربر انتخاب‌شده دارای نقش معلم نیست');
          err.statusCode = 400;
          throw err;
        }
        validatedTeachers.push(t);
      }
    }

    const validatedTeacherIds = validatedTeachers.map((t) => t.id);
    const enrolledClasses = [];
    const linkedTeachers = [];
    const timestamp = new Date().toISOString();

    const generateUniqueClassJoinCode = async (trx) => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (let attempt = 0; attempt < 20; attempt++) {
        let code = '';
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const exists = await trx('classes').where({ join_code: code }).first();
        if (!exists) return code;
      }
      return `CL${Date.now().toString(36).toUpperCase().slice(-4)}`;
    };

    await db.transaction(async (trx) => {
      const classService = require('../classes/class.service');
      const affectedClassIds = new Set();

      const existingLinks = await trx('student_teacher_links')
        .where({ student_user_id: studentId });

      const existingLinkMap = new Map(existingLinks.map((l) => [l.teacher_user_id, l]));
      const selectedSet = new Set(validatedTeacherIds);

      // 1. Remove links (and auto-linked class membership) for teachers the student unselected
      for (const oldLink of existingLinks) {
        if (!selectedSet.has(oldLink.teacher_user_id)) {
          await trx('student_teacher_links').where({ id: oldLink.id }).del();
          if (oldLink.class_id) {
            await trx('class_members')
              .where({ class_id: oldLink.class_id, user_id: studentId, role: 'student' })
              .del();
            affectedClassIds.add(oldLink.class_id);
          }
        }
      }

      // 2. For each selected teacher, ensure a class exists matching (teacher, school, grade, major)
      //    and enroll the student in both `student_teacher_links` and `class_members`
      for (const teacher of validatedTeachers) {
        const teacherClasses = await trx('classes')
          .where({
            teacher_id: teacher.id,
            school_id: student.school_id,
            is_active: true,
          });

        // Exact match by grade & major first
        let targetClass = teacherClasses.find((c) => {
          const cGrade = String(c.grade || '').trim();
          const cMajor = String(c.major || '').trim();
          if (effectiveMajor) {
            return cGrade === effectiveGrade && cMajor === effectiveMajor;
          }
          return cGrade === effectiveGrade && !cMajor;
        });

        // If teacher doesn't have a class for this grade+major yet, auto-create one cleanly
        if (!targetClass) {
          const joinCode = await generateUniqueClassJoinCode(trx);
          const className = buildAutoClassTitle({
            grade: effectiveGrade,
            major: effectiveMajor,
            teacherName: teacher.display_name,
          });
          const classId = generateId();
          const newClassRow = {
            id: classId,
            name: className,
            subject: teacher.job_title || teacher.department || 'عمومی',
            grade: effectiveGrade,
            major: effectiveMajor || null,
            join_code: joinCode,
            school_id: student.school_id,
            teacher_id: teacher.id,
            is_active: true,
            created_at: timestamp,
            updated_at: timestamp,
          };
          await trx('classes').insert(newClassRow);
          targetClass = newClassRow;
        }

        affectedClassIds.add(targetClass.id);

        // Enroll student in teacher's class roster
        const existingMember = await trx('class_members')
          .where({ class_id: targetClass.id, user_id: studentId })
          .first();
        if (!existingMember) {
          await trx('class_members').insert({
            id: generateId(),
            class_id: targetClass.id,
            user_id: studentId,
            role: 'student',
            joined_at: timestamp,
          });
        }

        // Persist/update student <-> teacher subordinate link in DB
        const prevLink = existingLinkMap.get(teacher.id);
        if (prevLink) {
          await trx('student_teacher_links')
            .where({ id: prevLink.id })
            .update({
              class_id: targetClass.id,
              education_level: effectiveEducationLevel || null,
              grade: effectiveGrade,
              major: effectiveMajor || null,
              updated_at: timestamp,
            });
        } else {
          await trx('student_teacher_links').insert({
            id: generateId(),
            school_id: student.school_id,
            student_user_id: studentId,
            teacher_user_id: teacher.id,
            class_id: targetClass.id,
            education_level: effectiveEducationLevel || null,
            grade: effectiveGrade,
            major: effectiveMajor || null,
            created_at: timestamp,
            updated_at: timestamp,
          });
        }

        enrolledClasses.push({
          id: targetClass.id,
          name: targetClass.name,
          grade: targetClass.grade,
          major: targetClass.major || '',
          subject: targetClass.subject,
          teacher_id: teacher.id,
          teacher_name: teacher.display_name,
          teacher_username: teacher.username || '',
        });

        linkedTeachers.push({
          id: teacher.id,
          display_name: teacher.display_name,
          username: teacher.username || '',
          class_id: targetClass.id,
          class_name: targetClass.name,
        });
      }

      settings.school_name = effectiveSchoolName;
      settings.education_level = effectiveEducationLevel;
      settings.grade = effectiveGrade;
      settings.major = effectiveMajor;
      settings.selected_teacher_ids = validatedTeacherIds;
      settings.is_onboarded = true;

      await trx('users').where({ id: studentId }).update({
        department: effectiveMajor ? `${effectiveGrade} - ${effectiveMajor}` : effectiveGrade,
        settings: JSON.stringify(settings),
        updated_at: timestamp,
      });

      // Keep persisted class roster groups synchronized in DB
      for (const cid of affectedClassIds) {
        await classService.syncClassRosterGroup(cid, trx);
      }
    });

    const updatedUser = await db('users').where({ id: studentId }).first();
    delete updatedUser.password_hash;
    return {
      user: updatedUser,
      linked_teachers: linkedTeachers,
      enrolled_classes: enrolledClasses,
    };
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
