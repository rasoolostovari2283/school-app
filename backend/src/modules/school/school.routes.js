const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const bcrypt = require('bcryptjs');
const {
  authenticate,
  authorize,
  assertSameSchool,
  assertOwnsResource,
  assertTeacherOfStudent,
} = require('../../middleware/auth');
const { generateId, insertAndReturn } = require('../../utils/dbHelpers');

/**
 * Normalize website URL so it always has http:// or https:// protocol
 */
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let trimmed = url.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'https://' + trimmed;
  }
  return trimmed;
}

/**
 * Helper: Resolve active school for user strictly within user's tenant
 */
async function resolveSchool(user) {
  if (!user) return null;
  if (user.school_id) {
    return db('schools').where({ id: user.school_id }).first();
  }
  let settings = {};
  try {
    settings = typeof user.settings === 'string' ? JSON.parse(user.settings) : (user.settings || {});
  } catch (e) {}

  const schoolCode = user.school_code || settings.school_code;
  const schoolName = user.school_name || settings.school_name;

  if (schoolCode) {
    const byCode = await db('schools').whereRaw('UPPER(code) = ?', [schoolCode.toUpperCase()]).first();
    if (byCode) return byCode;
  }
  if (schoolName) {
    const byName = await db('schools').where('name', schoolName).first();
    if (byName) return byName;
  }
  return null;
}

// ── All routes require authentication ──
router.use(authenticate);

/**
 * GET /api/v1/school/info
 * Get active school metadata and identity
 */
router.get('/info', async (req, res, next) => {
  try {
    const school = await resolveSchool(req.user);
    if (!school) {
      return res.json({
        success: true,
        data: {
          name: 'مجتمع آموزشی هوشمند',
          code: 'SCH-1001',
          level: 'دوره دوم متوسطه',
          city: 'تهران',
          principal: req.user?.display_name || 'مدیر مدرسه',
          website: '',
        },
      });
    }

    let principalName = req.user?.display_name;
    try {
      const adminUser = await db('users')
        .where({ school_id: school.id, role: 'admin' })
        .first();
      if (adminUser) principalName = adminUser.display_name;
    } catch (e) {}

    res.json({
      success: true,
      data: {
        id: school.id,
        name: school.name,
        code: school.code,
        level: school.level || 'دوره دوم متوسطه',
        city: school.city || 'تهران',
        province: school.province || 'تهران',
        principal: principalName,
        website: school.website || '',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/school/members
 * Get all teachers and students registered in the database for this school only
 */
router.get('/members', async (req, res, next) => {
  try {
    const schoolId = req.user.school_id || (await resolveSchool(req.user))?.id || null;
    if (!schoolId) {
      return res.json({
        success: true,
        data: { teachers: [], students: [] },
      });
    }

    const STAFF_ROLES = ['teacher', 'counselor', 'financial_officer', 'accountant'];
    const [rawTeachers, rawStudents] = await Promise.all([
      db('users').whereIn('role', STAFF_ROLES).andWhere({ school_id: schoolId }).orderBy('created_at', 'desc'),
      db('users').where({ role: 'student', school_id: schoolId }).orderBy('created_at', 'desc'),
    ]);

    const isStaffViewer = ['admin', 'manager', 'teacher', 'counselor', 'financial_officer', 'accountant'].includes(req.user.role);

    const teachers = rawTeachers.map((t) => {
      let settings = {};
      try {
        settings = typeof t.settings === 'string' ? JSON.parse(t.settings) : (t.settings || {});
      } catch (e) {}

      return {
        id: t.id,
        name: t.display_name,
        role: t.role,
        code: t.personnel_code || `TCH-${t.id.slice(-4)}`,
        subject: t.job_title || settings.subject || 'عمومی',
        phone: isStaffViewer ? (t.phone || 'ثبت نشده') : 'محرمانه',
        grades: Array.isArray(settings.taught_grades) && settings.taught_grades.length > 0 ? settings.taught_grades : ['پایه دهم'],
        created_at: t.created_at,
      };
    });

    const students = rawStudents.map((s) => {
      let settings = {};
      try {
        settings = typeof s.settings === 'string' ? JSON.parse(s.settings) : (s.settings || {});
      } catch (e) {}

      const isSelf = s.id === req.user.id;
      return {
        id: s.id,
        name: s.display_name,
        code: s.student_code || `STD-${s.id.slice(-4)}`,
        grade: s.department || settings.grade || 'پایه دهم',
        class_name: settings.class_name || 'کلاس عمومی',
        teacher_name: settings.teacher_name || 'دبیر محترم',
        parent_phone: (isStaffViewer || isSelf) ? (settings.parent_phone || s.phone || 'ثبت نشده') : 'محرمانه',
        created_at: s.created_at,
      };
    });

    res.json({
      success: true,
      data: {
        teachers,
        students,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/school/teachers
 * Add and persist a new teacher in SQLite users table
 */
router.post('/teachers', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { name, code, subject, phone, grades, password, role: requestedRole } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'نام و نام خانوادگی همکار الزامی است' });
    }

    const ALLOWED_STAFF_ROLES = ['teacher', 'counselor', 'financial_officer', 'accountant'];
    const normalizedRequestedRole = String(requestedRole || 'teacher').trim().toLowerCase();
    const staffRole = ALLOWED_STAFF_ROLES.includes(normalizedRequestedRole)
      ? (normalizedRequestedRole === 'accountant' ? 'financial_officer' : normalizedRequestedRole)
      : 'teacher';

    const school = await resolveSchool(req.user);
    const schoolId = req.user.school_id || (school ? school.id : null);

    const codePrefix = staffRole === 'counselor' ? 'CNS' : (staffRole === 'financial_officer' ? 'FIN' : 'TCH');
    const defaultJobTitle = staffRole === 'counselor'
      ? 'مشاور تحصیلی و هدایت تحصیلی'
      : (staffRole === 'financial_officer' ? 'مسئول امور مالی و شهریه' : 'ریاضی و هندسه');

    const cleanName = name.trim();
    const cleanCode = (code || `${codePrefix}-${Math.floor(1000 + Math.random() * 9000)}`).trim().toUpperCase();
    const cleanPhone = phone && phone.trim() ? phone.trim() : null;
    const secretToHash = password && String(password).trim()
      ? String(password).trim()
      : crypto.randomBytes(24).toString('hex');
    const password_hash = await bcrypt.hash(secretToHash, 10);

    const teacherSettings = JSON.stringify({
      taught_grades: Array.isArray(grades) && grades.length > 0 ? grades : ['پایه دهم'],
      subject: subject || defaultJobTitle,
      school_code: school?.code || 'SCH-1001',
      staff_role: staffRole,
    });

    const newTeacher = await insertAndReturn(db, 'users', {
      display_name: cleanName,
      personnel_code: cleanCode,
      phone: cleanPhone,
      job_title: subject || defaultJobTitle,
      role: staffRole,
      password_hash,
      school_id: schoolId,
      locale: 'fa',
      is_verified: true,
      is_active: true,
      settings: teacherSettings,
    });

    res.status(201).json({
      success: true,
      message: `همکار گرامی «${cleanName}» با موفقیت در دیتابیس ثبت شد`,
      data: {
        teacher: {
          id: newTeacher.id,
          name: newTeacher.display_name,
          role: newTeacher.role,
          code: newTeacher.personnel_code,
          subject: newTeacher.job_title,
          phone: newTeacher.phone || 'ثبت نشده',
          grades: Array.isArray(grades) && grades.length > 0 ? grades : ['پایه دهم'],
          created_at: newTeacher.created_at,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/school/teachers/:id
 * Remove teacher/staff member from database (scoped to caller's school)
 */
router.delete('/teachers/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const teacherId = req.params.id;
    const STAFF_ROLES = ['teacher', 'counselor', 'financial_officer', 'accountant'];
    const teacher = await db('users').where({ id: teacherId }).whereIn('role', STAFF_ROLES).first();
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'همکار یافت نشد',
      });
    }

    assertSameSchool(req.user, teacher);

    await db.transaction(async (trx) => {
      await trx('class_members').where({ user_id: teacherId }).del().catch(() => {});
      await trx('classes')
        .where({ teacher_id: teacherId, school_id: req.user.school_id })
        .update({ teacher_id: req.user.id })
        .catch(() => {});
      await trx('users').where({ id: teacherId, school_id: req.user.school_id }).whereIn('role', STAFF_ROLES).del();
    });

    res.json({
      success: true,
      message: 'همکار از دیتابیس حذف گردید',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/school/students
 * Add and persist a new student in SQLite users & class_members table
 */
router.post('/students', authorize('admin', 'manager', 'teacher'), async (req, res, next) => {
  try {
    const { name, code, grade, class_name, class_id, teacher_name, parent_phone, password } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'نام دانش‌آموز الزامی است' });
    }

    const school = await resolveSchool(req.user);
    const schoolId = req.user.school_id || (school ? school.id : null);

    const cleanName = name.trim();
    const cleanCode = (code || `STD-${Math.floor(10000 + Math.random() * 90000)}`).trim().toUpperCase();
    const secretToHash = password && String(password).trim()
      ? String(password).trim()
      : crypto.randomBytes(24).toString('hex');
    const password_hash = await bcrypt.hash(secretToHash, 10);

    const studentSettings = JSON.stringify({
      class_name: class_name || 'کلاس عمومی',
      teacher_name: teacher_name || req.user?.display_name || 'دبیر محترم',
      parent_phone: parent_phone && parent_phone.trim() ? parent_phone.trim() : null,
      school_code: school?.code || 'SCH-1001',
      grade: grade || 'پایه دهم',
    });

    const newStudent = await insertAndReturn(db, 'users', {
      display_name: cleanName,
      student_code: cleanCode,
      department: grade || 'پایه دهم',
      phone: parent_phone && parent_phone.trim() ? parent_phone.trim() : null,
      role: 'student',
      password_hash,
      school_id: schoolId,
      locale: 'fa',
      is_verified: true,
      settings: studentSettings,
    });

    // If class_id is given or class_name matches an existing class in the same school, enroll student
    let targetClassId = class_id;
    if (targetClassId) {
      const targetClass = await db('classes').where({ id: targetClassId }).first();
      if (!targetClass || targetClass.school_id !== schoolId) {
        targetClassId = null;
      }
    } else if (class_name) {
      const matchedClass = await db('classes')
        .where({ name: class_name.trim(), school_id: schoolId })
        .first();
      if (matchedClass) targetClassId = matchedClass.id;
    }

    if (targetClassId) {
      try {
        await db('class_members').insert({
          id: generateId(),
          class_id: targetClassId,
          user_id: newStudent.id,
          role: 'student',
          joined_at: db.fn.now(),
        });
      } catch (e) {}
    }

    res.status(201).json({
      success: true,
      message: `دانش‌آموز «${cleanName}» با موفقیت در دیتابیس ثبت شد`,
      data: {
        student: {
          id: newStudent.id,
          name: newStudent.display_name,
          code: newStudent.student_code,
          grade: newStudent.department || 'پایه دهم',
          class_name: class_name || 'کلاس عمومی',
          teacher_name: teacher_name || 'دبیر محترم',
          parent_phone: parent_phone || 'ثبت نشده',
          created_at: newStudent.created_at,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/school/students/:id
 * Remove student from database (scoped to caller's school)
 */
router.delete('/students/:id', authorize('admin', 'manager', 'teacher'), async (req, res, next) => {
  try {
    const studentId = req.params.id;
    const student = await db('users').where({ id: studentId, role: 'student' }).first();
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'دانش‌آموز یافت نشد',
      });
    }

    assertSameSchool(req.user, student);
    if (req.user.role === 'teacher') {
      await assertTeacherOfStudent(req.user, studentId);
    }

    await db.transaction(async (trx) => {
      await trx('class_members').where({ user_id: studentId }).del().catch(() => {});
      await trx('users').where({ id: studentId, role: 'student', school_id: req.user.school_id }).del();
    });

    res.json({
      success: true,
      message: 'دانش‌آموز از دیتابیس حذف شد',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/school/directives
 * Retrieve school-wide administrative directives from announcements table (scoped to caller's school)
 */
router.get('/directives', async (req, res, next) => {
  try {
    const schoolId = req.user.school_id;
    if (!schoolId) {
      return res.json({ success: true, data: { directives: [] } });
    }

    const directives = await db('announcements')
      .join('users as author', 'author.id', 'announcements.teacher_id')
      .where('author.school_id', schoolId)
      .where(function () {
        this.whereIn('announcements.target_audience', ['school', 'teachers', 'students', 'parents', 'all'])
          .orWhereNull('announcements.class_id');
      })
      .select('announcements.*')
      .orderBy('announcements.created_at', 'desc')
      .limit(50);

    const mapped = directives.map((d) => ({
      id: d.id,
      title: d.title,
      body: d.content,
      category: d.target_audience === 'teachers' ? 'council' : 'administrative',
      priority: d.priority || 'important',
      target_audience: d.target_audience || 'students',
      recipients_count: d.target_audience === 'teachers' ? 'کلیه دبیران' : (d.target_audience === 'parents' ? 'کلیه اولیا' : 'کلیه دانش‌آموزان'),
      is_mandatory: !!d.is_mandatory,
      is_pinned: !!d.is_pinned,
      created_at: d.created_at,
    }));

    res.json({
      success: true,
      data: { directives: mapped },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/school/directives
 * Create and persist a school-wide directive in announcements table
 */
router.post('/directives', authorize('admin', 'manager', 'teacher'), async (req, res, next) => {
  try {
    const { title, body, priority, target_audience, target_grades, teacher_ids, is_mandatory, is_pinned } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'عنوان بخشنامه الزامی است' });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ success: false, message: 'متن بخشنامه الزامی است' });
    }

    let recText = 'کلیه مخاطبان مدرسه';
    if (target_audience === 'students') {
      recText = Array.isArray(target_grades) && !target_grades.includes('*') ? `دانش‌آموزان (${target_grades.join('، ')})` : 'کلیه دانش‌آموزان';
    } else if (target_audience === 'teachers') {
      recText = Array.isArray(teacher_ids) && !teacher_ids.includes('*') ? `${teacher_ids.length} دبیر منتخب` : 'کلیه دبیران مدرسه';
    } else if (target_audience === 'parents') {
      recText = 'کلیه اولیای دانش‌آموزان';
    }

    const directive = await insertAndReturn(db, 'announcements', {
      title: title.trim(),
      content: body.trim(),
      priority: priority || 'important',
      target_audience: target_audience || 'students',
      target_grades: JSON.stringify(target_grades || ['*']),
      is_mandatory: is_mandatory !== false,
      is_pinned: !!is_pinned,
      teacher_id: req.user.id,
      created_at: db.fn.now(),
    });

    res.status(201).json({
      success: true,
      message: 'بخشنامه با موفقیت در دیتابیس ثبت و ابلاغ شد 🚀',
      data: {
        directive: {
          id: directive.id,
          title: directive.title,
          body: directive.content,
          category: target_audience === 'teachers' ? 'council' : 'administrative',
          priority: directive.priority,
          target_audience: directive.target_audience,
          recipients_count: recText,
          is_mandatory: !!directive.is_mandatory,
          is_pinned: !!directive.is_pinned,
          created_at: directive.created_at,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/school/directives/:id
 * Remove directive from announcements table (scoped to caller's school and ownership)
 */
router.delete('/directives/:id', authorize('admin', 'manager', 'teacher'), async (req, res, next) => {
  try {
    const directive = await db('announcements').where({ id: req.params.id }).first();
    if (!directive) {
      return res.status(404).json({
        success: false,
        message: 'بخشنامه یافت نشد',
      });
    }

    const author = await db('users').where({ id: directive.teacher_id }).first();
    assertSameSchool(req.user, author || { school_id: null });
    assertOwnsResource(req.user, directive, 'teacher_id');

    await db('announcements').where({ id: req.params.id }).del();
    res.json({
      success: true,
      message: 'بخشنامه از دیتابیس حذف شد',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/school/website
 */
router.get('/website', async (req, res, next) => {
  try {
    let websiteUrl = '';
    let schoolName = '';

    const school = await resolveSchool(req.user);
    if (school) {
      schoolName = school.name || '';
      websiteUrl = school.website || '';
    }

    if (!websiteUrl && school) {
      try {
        const setting = await db('system_settings')
          .where({ key: `school_website_${school.id}` })
          .first();
        if (setting && setting.value) {
          websiteUrl = setting.value;
        }
      } catch (e) {}
    }

    return res.json({
      success: true,
      data: {
        website_url: websiteUrl,
        school_name: schoolName,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/school/website
 */
router.put('/website', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const rawUrl = req.body?.website_url || req.body?.url || '';
    const normalized = normalizeUrl(rawUrl);

    const school = await resolveSchool(req.user);
    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'مدرسه یافت نشد',
      });
    }

    assertSameSchool(req.user, school.id);

    await db('schools').where({ id: school.id }).update({ website: normalized });

    try {
      const settingKey = `school_website_${school.id}`;
      const existing = await db('system_settings').where({ key: settingKey }).first();
      if (existing) {
        await db('system_settings')
          .where({ key: settingKey })
          .update({
            value: normalized,
            updated_at: db.fn.now(),
          });
      } else {
        await db('system_settings').insert({
          key: settingKey,
          value: normalized,
          updated_at: db.fn.now(),
        });
      }
    } catch (e) {}

    return res.json({
      success: true,
      message: 'آدرس وب‌سایت مدرسه با موفقیت در دیتابیس ذخیره شد',
      data: {
        website_url: normalized,
      },
    });
  } catch (err) {
    next(err);
  }
});

const sidaService = require('./sida.service');
const smsGateway = require('../../services/smsGateway');

/**
 * POST /api/v1/school/sida/preview
 * Intelligent dry-run preview & column mapping for Sida / Hamkelasi / Legacy Excel imports
 */
router.post('/sida/preview', authorize('admin', 'manager', 'teacher'), async (req, res, next) => {
  try {
    const preview = sidaService.previewImport(req.body || {});
    res.json({
      success: true,
      message: `${preview.total_rows} ردیف با موفقیت تحلیل و نگاشت شد (${preview.valid_count} معتبر، ${preview.warning_count} دارای هشدار)`,
      data: preview,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/school/sida/import
 * Atomic one-click import of Sida / Legacy roster into classes, users, class_members & parent_student_links
 */
router.post('/sida/import', authorize('admin', 'manager', 'teacher'), async (req, res, next) => {
  try {
    const result = await sidaService.importRoster(req.user, req.body || {});
    res.status(201).json({
      success: true,
      message: `عملیات مهاجرت داده از «${result.source_system.toUpperCase()}» تکمیل شد: ${result.imported_students_count} دانش‌آموز جدید، ${result.created_classes_count} کلاس و ${result.linked_parents_count} پیوند ولی-فرزند ثبت گردید.`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/school/sida/export-grades
 * Exports class continuous & final grades in official Sida CSV/JSON format
 */
router.get('/sida/export-grades', authorize('admin', 'manager', 'teacher'), async (req, res, next) => {
  try {
    const classId = req.query.class_id;
    if (!classId) {
      return res.status(400).json({ success: false, message: 'شناسه کلاس (class_id) برای خروجی سیدا الزامی است' });
    }
    const result = await sidaService.exportClassGradesForSida(req.user, classId);
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="sida-grades-${classId}.csv"`);
      return res.send(result.csv_content);
    }
    res.json({
      success: true,
      message: 'فایل استاندارد نمرات سیدا آماده دریافت است',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/school/sms/logs
 * Returns recent pattern/service SMS dispatches for the caller's school
 */
router.get('/sms/logs', authorize('admin', 'manager', 'teacher', 'counselor', 'financial_officer', 'accountant'), async (req, res, next) => {
  try {
    const logs = smsGateway.getRecentDispatches(req.user.school_id, 50);
    res.json({
      success: true,
      data: {
        provider: smsGateway.provider,
        sender_line: smsGateway.senderLine,
        logs,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/school/sms/send-pattern
 * Sends a pattern-based service SMS (خط خدماتی پترن) to a parent or student
 */
router.post('/sms/send-pattern', authorize('admin', 'manager', 'teacher', 'counselor', 'financial_officer', 'accountant'), async (req, res, next) => {
  try {
    const { receptor, template, tokens, message_preview, category } = req.body;
    if (!receptor) {
      return res.status(400).json({ success: false, message: 'شماره موبایل گیرنده الزامی است' });
    }
    const entry = await smsGateway.sendPatternSms({
      schoolId: req.user.school_id,
      receptor,
      template: template || 'educonnect-school-notice',
      tokens: tokens || { token1: req.user.display_name },
      messagePreview: message_preview || 'اطلاعیه رسمی از طرف مدرسه در سامانه هوشمند ادوکانکت',
      category: category || 'manual_notice',
    });
    res.status(201).json({
      success: true,
      message: 'پیامک خدماتی از طریق خط پترن ارسال شد',
      data: { sms: entry },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

