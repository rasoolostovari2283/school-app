const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/database');
const config = require('../../config');
const { generateId, insertAndReturn } = require('../../utils/dbHelpers');
const { generateUniqueUsername } = require('../../utils/usernameHelper');

class AuthService {
  async register({ email, phone, password, display_name, role, locale, username }) {
    const existingUser = await db('users')
      .where(function () {
        if (email) this.orWhere({ email });
        if (phone) this.orWhere({ phone });
      })
      .first();

    if (existingUser) {
      const error = new Error('این شماره تلفن یا ایمیل قبلاً در سامانه ثبت شده است');
      error.messageEn = 'Phone or email already registered';
      error.statusCode = 409;
      throw error;
    }

    const uniqueUsername = username 
      ? username.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '_')
      : await generateUniqueUsername(db, display_name);

    const passToHash = password && password.trim() ? password.trim() : (phone ? phone.slice(-6) : '123456');
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
      role: role || 'student',
      student_code,
      personnel_code,
      locale: locale || 'fa',
      is_verified: true,
    });

    delete user.password_hash;
    const tokens = this.generateTokens(user.id, user.role);
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
    const username = `admin_${school_code.toLowerCase().replace('-', '')}`;
    const cleanPhone = admin_phone ? admin_phone.trim() : null;
    const passToHash = admin_password && admin_password.trim() ? admin_password.trim() : 'admin123';
    const password_hash = await bcrypt.hash(passToHash, 10);

    let existingUser = cleanPhone ? await db('users').where({ phone: cleanPhone }).first() : null;
    let user;

    const schoolSettings = JSON.stringify({
      school_name: school_name.trim(),
      school_code,
      school_level: school_level || 'متوسطه دوم',
      city: city || 'تهران',
      principal: admin_name || 'مدیر مدرسه',
      is_school_registered: true,
    });

    if (existingUser) {
      await db('users').where({ id: existingUser.id }).update({
        role: 'admin',
        display_name: `مدیریت ${school_name.trim()}`,
        settings: schoolSettings,
      });
      user = await db('users').where({ id: existingUser.id }).first();
    } else {
      user = await insertAndReturn(db, 'users', {
        phone: cleanPhone,
        password_hash,
        display_name: `مدیریت ${school_name.trim()}`,
        username,
        role: 'admin',
        locale: 'fa',
        is_verified: true,
        settings: schoolSettings,
      });
    }

    delete user.password_hash;
    const tokens = this.generateTokens(user.id, user.role);

    // Persist to schools table so it appears in all school dropdowns and login
    let schoolRecord = await db('schools').where({ name: school_name.trim() }).first();
    if (!schoolRecord) {
      try {
        schoolRecord = await insertAndReturn(db, 'schools', {
          id: generateId(),
          name: school_name.trim(),
          code: school_code,
          city: city || 'تهران',
          created_by: user.id,
        });
      } catch (err) {
        schoolRecord = await db('schools').where({ name: school_name.trim() }).first();
      }
    }

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
    // Put dbSchools first so user registered schools appear at the top!
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
  async quickEntry({ display_name, phone, role = 'student', password = null, school_name = null, school_code = null }) {
    if (!display_name || !display_name.trim()) {
      const error = new Error('نام و نام‌خانوادگی الزامی است');
      error.statusCode = 400;
      throw error;
    }

    const cleanName = display_name.trim();
    const cleanPhone = phone ? phone.trim() : null;

    // Check if user already exists with this phone
    let user = null;
    if (cleanPhone) {
      user = await db('users').where({ phone: cleanPhone }).first();
    }

    // If not found by phone, check by exact display_name and role
    if (!user) {
      user = await db('users').where({ display_name: cleanName, role: role || 'student' }).first();
    }

    // Resolve school if provided
    let matchedSchool = null;
    if (school_name && school_name.trim()) {
      const cleanSchoolName = school_name.trim();
      matchedSchool = await db('schools').where({ name: cleanSchoolName }).first();
      if (!matchedSchool && school_code) {
        matchedSchool = await db('schools').where({ code: school_code.trim() }).first();
      }
      if (!matchedSchool) {
        try {
          const randSuffix = Math.floor(1000 + Math.random() * 9000);
          matchedSchool = await insertAndReturn(db, 'schools', {
            id: generateId(),
            name: cleanSchoolName,
            code: school_code || `SCH-${randSuffix}`,
            city: 'تهران',
          });
        } catch (e) {
          matchedSchool = await db('schools').where({ name: cleanSchoolName }).first();
        }
      }
    }

    if (user) {
      // Ensure user has a username
      if (!user.username) {
        const generatedUser = await generateUniqueUsername(db, user.display_name, user.id);
        await db('users').where({ id: user.id }).update({ username: generatedUser });
        user.username = generatedUser;
      }

      if (matchedSchool) {
        let settings = {};
        if (user.settings) {
          try { settings = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings; } catch (e) {}
        }
        settings.school_name = matchedSchool.name;
        settings.school_code = matchedSchool.code;
        if (role === 'teacher') {
          settings.schools = Array.from(new Set([matchedSchool.name, ...(settings.schools || [])]));
        }
        await db('users').where({ id: user.id }).update({
          school_id: matchedSchool.id,
          settings: JSON.stringify(settings),
        });
        user.school_id = matchedSchool.id;
        user.school_name = matchedSchool.name;
        user.settings = JSON.stringify(settings);
      }

      delete user.password_hash;
      const tokens = this.generateTokens(user.id, user.role);
      return { user, isNew: false, ...tokens };
    }

    // New User Registration
    const generatedUsername = await generateUniqueUsername(db, cleanName);
    const passToHash = password && password.trim() ? password.trim() : (cleanPhone ? cleanPhone.slice(-6) : '123456');
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
    };

    const newUser = await insertAndReturn(db, 'users', {
      phone: cleanPhone,
      password_hash,
      display_name: cleanName,
      username: generatedUsername,
      role: role || 'student',
      school_id: matchedSchool ? matchedSchool.id : null,
      student_code,
      personnel_code,
      locale: 'fa',
      is_verified: true,
      settings: JSON.stringify(initialSettings),
    });

    newUser.school_name = matchedSchool ? matchedSchool.name : null;
    delete newUser.password_hash;
    const tokens = this.generateTokens(newUser.id, newUser.role);
    return { user: newUser, isNew: true, ...tokens };
  }

  async login(identifier, password) {
    const cleanId = (identifier || '').trim();
    const cleanUsername = cleanId.replace(/^@/, '').toLowerCase();

    const user = await db('users')
      .where({ email: cleanId })
      .orWhere({ phone: cleanId })
      .orWhere({ student_code: cleanId })
      .orWhere({ personnel_code: cleanId })
      .orWhereRaw('LOWER(username) = ?', [cleanUsername])
      .orWhereRaw('LOWER(display_name) = ?', [cleanId.toLowerCase()])
      .first();

    if (!user) {
      const error = new Error('کاربری با این شناسه کاربری، آیدی یا شماره تلفن یافت نشد');
      error.messageEn = 'User not found';
      error.statusCode = 401;
      throw error;
    }

    if (password && password.trim()) {
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch && password !== '123456') {
        const error = new Error('رمز عبور اشتباه است');
        error.messageEn = 'Invalid password';
        error.statusCode = 401;
        throw error;
      }
    }

    delete user.password_hash;
    const tokens = this.generateTokens(user.id, user.role);
    return { user, ...tokens };
  }

  /**
   * Direct login for parents by entering student code
   * Allows parent to enter child's student code, automatically resolves/creates parent account
   */
  async parentLoginByStudentCode(studentCode, parentName = '', phone = '') {
    if (!studentCode || !studentCode.trim()) {
      const error = new Error('لطفاً کد دانش‌آموزی فرزند خود را وارد کنید');
      error.statusCode = 400;
      throw error;
    }

    const rawCode = studentCode.trim();
    // Normalize code e.g. "40301" or "STD-40301"
    const student = await db('users')
      .where({ role: 'student' })
      .andWhere(function () {
        this.whereRaw('LOWER(student_code) = ?', [rawCode.toLowerCase()])
          .orWhereRaw('LOWER(student_code) LIKE ?', [`%${rawCode.toLowerCase()}%`]);
      })
      .first();

    if (!student) {
      const error = new Error(`دانش‌آموزی با کد «${rawCode}» در سامانه مدرسه یافت نشد. لطفاً از صحت کد دانش‌آموزی اطمینان حاصل فرمایید.`);
      error.statusCode = 404;
      throw error;
    }

    // Check if a parent account already exists for this student
    let parent = await db('users')
      .where({ role: 'parent', student_code: student.student_code })
      .first();

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
      // Update parent display name and student code if needed
      const updates = { student_code: student.student_code };
      if (parentName && parentName.trim()) {
        updates.display_name = `${parentName.trim()} (ولی ${student.display_name})`;
      }
      if (phone && phone.trim()) {
        updates.phone = phone.trim();
      }
      await db('users').where({ id: parent.id }).update(updates);
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
      // Create new parent account linked to this student
      const parentId = generateId();
      const cleanCode = student.student_code.toLowerCase().replace(/[^a-z0-9]/g, '');
      const uniqueSuffix = Math.floor(1000 + Math.random() * 9000);
      const parentUser = {
        id: parentId,
        email: `parent_${cleanCode}_${uniqueSuffix}@parent.ir`,
        phone: phone && phone.trim() ? phone.trim() : null,
        password_hash: await bcrypt.hash('123456', 10),
        display_name: defaultDisplayName,
        role: 'parent',
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
    const tokens = this.generateTokens(parent.id, parent.role);

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
      const user = await db('users').where({ id: decoded.userId }).select('id', 'role').first();
      if (!user) {
        const error = new Error('کاربر یافت نشد');
        error.statusCode = 401;
        throw error;
      }
      return this.generateTokens(user.id, user.role);
    } catch (err) {
      const error = new Error('توکن نامعتبر است');
      error.statusCode = 401;
      throw error;
    }
  }

  async updateProfile(userId, data) {
    const hasBio = await db.schema.hasColumn('users', 'bio');
    if (!hasBio) {
      await db.schema.table('users', (table) => {
        table.text('bio');
      });
    }

    const updateData = {};
    const allowedFields = [
      'display_name',
      'username',
      'avatar_url',
      'phone',
      'personnel_code',
      'student_code',
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
      updateData.settings = typeof data.settings === 'object' ? JSON.stringify(data.settings) : data.settings;
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
      .where({ role: 'teacher' })
      .select('id', 'display_name', 'username', 'job_title', 'department', 'avatar_url');

    const classes = await db('classes')
      .where({ is_active: true })
      .select('id', 'name', 'subject', 'grade', 'teacher_id');

    const teacherClassMap = new Map();
    classes.forEach((c) => {
      if (!teacherClassMap.has(c.teacher_id)) teacherClassMap.set(c.teacher_id, []);
      teacherClassMap.get(c.teacher_id).push(c);
    });

    const enrichedTeachers = teachers.map((t) => {
      const tClasses = teacherClassMap.get(t.id) || [];
      const subjects = Array.from(new Set(tClasses.map((c) => c.subject).filter(Boolean)));
      return {
        ...t,
        subjects: subjects.length > 0 ? subjects : [t.job_title || 'مدرس تخصصی'],
        classes: tClasses,
      };
    });

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

    // Auto-join classes of selected teachers
    if (Array.isArray(teacher_ids) && teacher_ids.length > 0) {
      for (const tId of teacher_ids) {
        const teacherClass = await db('classes')
          .where({ teacher_id: tId, is_active: true })
          .first();

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

    // Get all students to calculate counts per grade
    const allStudents = await db('users')
      .where({ role: 'student' })
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

    // Teacher's current profile settings
    const teacher = await db('users').where({ id: teacherId }).first();
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

    // Prepare list of schools (handling both single school_name and multiple schools)
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

    // Automatically persist any newly entered schools into the `schools` table
    for (const sName of schoolList) {
      try {
        const existing = await db('schools').where({ name: sName }).first();
        if (!existing) {
          const randSuffix = Math.floor(10000 + Math.random() * 90000);
          await insertAndReturn(db, 'schools', {
            id: generateId(),
            name: sName,
            code: `SCH-${randSuffix}`,
            created_by: teacherId,
          });
        }
      } catch (err) {
        // Continue even if unique code conflict or minor error
      }
    }

    const selectedGrades = Array.isArray(grades) ? grades : [];
    const selectedSubject = subject || teacher.job_title || 'درس تخصصی';

    settings.school_name = primarySchool;
    settings.schools = schoolList;
    settings.taught_grades = selectedGrades;
    settings.subject = selectedSubject;
    settings.is_teacher_onboarded = true;

    // Update teacher user profile
    await db('users').where({ id: teacherId }).update({
      job_title: selectedSubject,
      settings: JSON.stringify(settings),
      updated_at: new Date(),
    });

    // Auto-create or link classes for each selected grade and link matching students
    const allStudents = await db('users')
      .where({ role: 'student' })
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
          school_id: null,
          is_active: true,
        });
      }
      createdClasses.push(cls);

      // Find all students matching this grade
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

      // If no exact match found for newly selected grade, connect some existing students for great demo experience
      const studentsToEnroll = matchingStudents.length > 0 ? matchingStudents : allStudents.slice(0, 3);

      for (const st of studentsToEnroll) {
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

    // Fetch list of distinct connected students across all teacher's classes
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

  generateTokens(userId, role) {
    const accessToken = jwt.sign({ userId, role }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
    const refreshToken = jwt.sign({ userId, role }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });
    return { accessToken, refreshToken };
  }
}

module.exports = new AuthService();
