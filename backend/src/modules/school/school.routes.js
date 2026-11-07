const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const bcrypt = require('bcryptjs');
const { authenticate, authorize } = require('../../middleware/auth');
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
 * Helper: Resolve active school for user
 */
async function resolveSchool(user) {
  let school = null;
  if (user && user.school_id) {
    school = await db('schools').where({ id: user.school_id }).first();
  }
  if (!school && user) {
    let settings = {};
    try {
      settings = typeof user.settings === 'string' ? JSON.parse(user.settings) : (user.settings || {});
    } catch (e) {}

    const schoolCode = user.school_code || settings.school_code;
    const schoolName = user.school_name || settings.school_name;

    if (schoolCode) {
      school = await db('schools').whereRaw('UPPER(code) = ?', [schoolCode.toUpperCase()]).first();
    }
    if (!school && schoolName) {
      school = await db('schools').where('name', schoolName).first();
    }
  }
  if (!school) {
    school = await db('schools').first();
  }
  return school;
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

    // Find principal / admin
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
 * Get all teachers and students registered in the database for this school
 */
router.get('/members', async (req, res, next) => {
  try {
    const school = await resolveSchool(req.user);
    const schoolId = school ? school.id : null;

    let teachersQuery = db('users').where({ role: 'teacher' });
    let studentsQuery = db('users').where({ role: 'student' });

    if (schoolId) {
      teachersQuery = teachersQuery.where(function () {
        this.where({ school_id: schoolId }).orWhereNull('school_id');
      });
      studentsQuery = studentsQuery.where(function () {
        this.where({ school_id: schoolId }).orWhereNull('school_id');
      });
    }

    const [rawTeachers, rawStudents] = await Promise.all([
      teachersQuery.orderBy('created_at', 'desc'),
      studentsQuery.orderBy('created_at', 'desc'),
    ]);

    // Format teachers
    const teachers = rawTeachers.map((t) => {
      let settings = {};
      try {
        settings = typeof t.settings === 'string' ? JSON.parse(t.settings) : (t.settings || {});
      } catch (e) {}

      return {
        id: t.id,
        name: t.display_name,
        code: t.personnel_code || `TCH-${t.id.slice(-4)}`,
        subject: t.job_title || settings.subject || 'عمومی',
        phone: t.phone || 'ثبت نشده',
        grades: Array.isArray(settings.taught_grades) && settings.taught_grades.length > 0 ? settings.taught_grades : ['پایه دهم'],
        created_at: t.created_at,
      };
    });

    // Format students
    const students = rawStudents.map((s) => {
      let settings = {};
      try {
        settings = typeof s.settings === 'string' ? JSON.parse(s.settings) : (s.settings || {});
      } catch (e) {}

      return {
        id: s.id,
        name: s.display_name,
        code: s.student_code || `STD-${s.id.slice(-4)}`,
        grade: s.department || settings.grade || 'پایه دهم',
        class_name: settings.class_name || 'کلاس عمومی',
        teacher_name: settings.teacher_name || 'دبیر محترم',
        parent_phone: settings.parent_phone || s.phone || 'ثبت نشده',
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
    const { name, code, subject, phone, grades } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'نام و نام خانوادگی دبیر الزامی است' });
    }

    const school = await resolveSchool(req.user);
    const schoolId = school ? school.id : null;

    const cleanName = name.trim();
    const cleanCode = (code || `TCH-${Math.floor(1000 + Math.random() * 9000)}`).trim().toUpperCase();
    const cleanPhone = phone && phone.trim() ? phone.trim() : null;
    const defaultPassword = cleanCode || '123456';
    const password_hash = await bcrypt.hash(defaultPassword, 10);

    const teacherSettings = JSON.stringify({
      taught_grades: Array.isArray(grades) && grades.length > 0 ? grades : ['پایه دهم'],
      subject: subject || 'ریاضی و هندسه',
      school_code: school?.code || 'SCH-1001',
    });

    const newTeacher = await insertAndReturn(db, 'users', {
      display_name: cleanName,
      personnel_code: cleanCode,
      phone: cleanPhone,
      job_title: subject || 'ریاضی و هندسه',
      role: 'teacher',
      password_hash,
      school_id: schoolId,
      locale: 'fa',
      is_verified: true,
      settings: teacherSettings,
    });

    res.status(201).json({
      success: true,
      message: `معلم گرامی «${cleanName}» با موفقیت در دیتابیس ثبت شد`,
      data: {
        teacher: {
          id: newTeacher.id,
          name: newTeacher.display_name,
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
 * Remove teacher from database
 */
router.delete('/teachers/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const teacherId = req.params.id;
    await db('class_members').where({ user_id: teacherId }).del().catch(() => {});
    await db('classes').where({ teacher_id: teacherId }).update({ teacher_id: req.user.id }).catch(() => {});
    await db('users').where({ id: teacherId, role: 'teacher' }).del();

    res.json({
      success: true,
      message: 'معلم از دیتابیس حذف گردید',
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
    const { name, code, grade, class_name, class_id, teacher_name, parent_phone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'نام دانش‌آموز الزامی است' });
    }

    const school = await resolveSchool(req.user);
    const schoolId = school ? school.id : null;

    const cleanName = name.trim();
    const cleanCode = (code || `STD-${Math.floor(10000 + Math.random() * 90000)}`).trim().toUpperCase();
    const defaultPassword = cleanCode || '123456';
    const password_hash = await bcrypt.hash(defaultPassword, 10);

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

    // If class_id is given or class_name matches an existing class, enroll student
    let targetClassId = class_id;
    if (!targetClassId && class_name) {
      const matchedClass = await db('classes')
        .where('name', class_name.trim())
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
 * Remove student from database
 */
router.delete('/students/:id', authorize('admin', 'manager', 'teacher'), async (req, res, next) => {
  try {
    const studentId = req.params.id;
    await db('class_members').where({ user_id: studentId }).del().catch(() => {});
    await db('users').where({ id: studentId, role: 'student' }).del();

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
 * Retrieve school-wide administrative directives from announcements table
 */
router.get('/directives', async (req, res, next) => {
  try {
    const directives = await db('announcements')
      .where(function () {
        this.whereIn('target_audience', ['school', 'teachers', 'students', 'parents', 'all'])
          .orWhereNull('class_id');
      })
      .orderBy('created_at', 'desc')
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
 * Remove directive from announcements table
 */
router.delete('/directives/:id', authorize('admin', 'manager', 'teacher'), async (req, res, next) => {
  try {
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

    // 1. Check system_settings table
    try {
      const setting = await db('system_settings').where({ key: 'school_website' }).first();
      if (setting && setting.value) {
        websiteUrl = setting.value;
      }
    } catch (e) {}

    // 2. Check schools table as fallback or context
    try {
      let schoolQuery = db('schools');
      if (req.user && req.user.school_id) {
        schoolQuery = schoolQuery.where({ id: req.user.school_id });
      }
      const school = await schoolQuery.first();
      if (school) {
        schoolName = school.name || '';
        if (!websiteUrl && school.website) {
          websiteUrl = school.website;
        }
      }
    } catch (e) {}

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

    // 1. Upsert into system_settings
    try {
      const existing = await db('system_settings').where({ key: 'school_website' }).first();
      if (existing) {
        await db('system_settings')
          .where({ key: 'school_website' })
          .update({
            value: normalized,
            updated_at: db.fn.now(),
          });
      } else {
        await db('system_settings').insert({
          key: 'school_website',
          value: normalized,
          updated_at: db.fn.now(),
        });
      }
    } catch (e) {}

    // 2. Also update schools table
    try {
      let schoolQuery = db('schools');
      if (req.user && req.user.school_id) {
        schoolQuery = schoolQuery.where({ id: req.user.school_id });
      }
      const school = await schoolQuery.first();
      if (school) {
        await db('schools').where({ id: school.id }).update({ website: normalized });
      } else {
        await db('schools').update({ website: normalized });
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

module.exports = router;
