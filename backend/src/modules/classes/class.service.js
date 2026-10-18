const db = require('../../config/database');
const { generateId, insertAndReturn, updateAndReturn } = require('../../utils/dbHelpers');

class ClassService {
  generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async createClass(teacherId, { name, subject, grade, school_id, teacher_name }) {
    let joinCode;
    let codeExists = true;
    while (codeExists) {
      joinCode = this.generateJoinCode();
      const existing = await db('classes').where({ join_code: joinCode }).first();
      codeExists = !!existing;
    }

    let validTeacherId = teacherId;
    if (teacher_name) {
      const teacherByName = await db('users')
        .where('display_name', teacher_name)
        .orWhere('username', teacher_name)
        .first();
      if (teacherByName) validTeacherId = teacherByName.id;
    }

    let teacherExists = await db('users').where({ id: validTeacherId }).first();
    if (!teacherExists) {
      const fallbackTeacher = (await db('users').where({ role: 'teacher' }).first()) || (await db('users').first());
      if (fallbackTeacher) {
        validTeacherId = fallbackTeacher.id;
      } else {
        const newTeacherId = validTeacherId || generateId();
        await db('users').insert({
          id: newTeacherId,
          display_name: teacher_name || 'دبیر گرامی',
          username: 'teacher_' + Date.now(),
          role: 'teacher',
          password_hash: 'mock_hash',
          is_verified: true,
        }).catch(() => {});
        validTeacherId = newTeacherId;
      }
    }

    let validSchoolId = school_id;
    if (school_id) {
      const schoolExists = await db('schools').where({ id: school_id }).first();
      if (!schoolExists) validSchoolId = null;
    }

    const cls = await insertAndReturn(db, 'classes', {
      name,
      subject: subject || 'عمومی',
      grade: grade || 'عمومی',
      join_code: joinCode,
      school_id: validSchoolId || null,
      teacher_id: validTeacherId,
    });

    try {
      await db('class_members').insert({
        id: generateId(),
        class_id: cls.id,
        user_id: validTeacherId,
        role: 'teacher',
      });
    } catch (e) {}

    return cls;
  }

  async getUserClasses(userId, role) {
    if (role === 'teacher' || role === 'admin' || role === 'manager') {
      const owned = await db('classes')
        .where(function () {
          this.where('classes.teacher_id', userId).orWhereExists(function () {
            this.select('*')
              .from('class_members')
              .whereRaw('class_members.class_id = classes.id')
              .where('class_members.user_id', userId)
              .where('class_members.role', 'teacher');
          });
        })
        .where({ 'classes.is_active': true })
        .orderBy('classes.created_at', 'desc');

      if (owned.length > 0) return owned;
      return db('classes').where({ is_active: true }).orderBy('created_at', 'desc');
    }

    if (role === 'parent') {
      let results = await db('parent_student_links')
        .join('class_members', 'class_members.user_id', 'parent_student_links.student_id')
        .join('classes', 'classes.id', 'class_members.class_id')
        .join('users', 'users.id', 'parent_student_links.student_id')
        .where({ 'parent_student_links.parent_id': userId, 'classes.is_active': true })
        .select('classes.*', 'users.display_name as student_name', 'users.id as student_id')
        .orderBy('classes.created_at', 'desc');

      if (results.length === 0) {
        const parentUser = await db('users').where({ id: userId }).first();
        if (parentUser?.student_code) {
          results = await db('users')
            .join('class_members', 'class_members.user_id', 'users.id')
            .join('classes', 'classes.id', 'class_members.class_id')
            .where({ 'users.student_code': parentUser.student_code, 'classes.is_active': true })
            .select('classes.*', 'users.display_name as student_name', 'users.id as student_id')
            .orderBy('classes.created_at', 'desc');
        }
      }
      return results;
    }

    return db('class_members')
      .join('classes', 'classes.id', 'class_members.class_id')
      .join('users as teacher', 'teacher.id', 'classes.teacher_id')
      .where({ 'class_members.user_id': userId, 'classes.is_active': true })
      .select('classes.*', 'teacher.display_name as teacher_name')
      .orderBy('class_members.joined_at', 'desc');
  }

  async getParentChildren(parentId) {
    let children = await db('parent_student_links')
      .join('users', 'users.id', 'parent_student_links.student_id')
      .where({ 'parent_student_links.parent_id': parentId })
      .select('users.id', 'users.display_name', 'users.student_code', 'users.department', 'users.avatar_url', 'parent_student_links.relation');

    if (children.length === 0) {
      const parentUser = await db('users').where({ id: parentId }).first();
      if (parentUser?.student_code) {
        children = await db('users')
          .where({ student_code: parentUser.student_code, role: 'student' })
          .select('id', 'display_name', 'student_code', 'department', 'avatar_url');
      }
    }
    return children;
  }

  async getClassById(classId) {
    const cls = await db('classes')
      .join('users as teacher', 'teacher.id', 'classes.teacher_id')
      .where({ 'classes.id': classId })
      .select('classes.*', 'teacher.display_name as teacher_name', 'teacher.avatar_url as teacher_avatar')
      .first();

    if (!cls) return null;

    const memberCount = await db('class_members').where({ class_id: classId }).count('id as count').first();
    cls.member_count = parseInt(memberCount.count, 10);
    return cls;
  }

  async joinClass(userId, role, joinCode) {
    const cls = await db('classes').where({ join_code: joinCode.toUpperCase(), is_active: true }).first();
    if (!cls) {
      const error = new Error('کد کلاس نامعتبر است');
      error.statusCode = 404;
      throw error;
    }

    const existingMember = await db('class_members').where({ class_id: cls.id, user_id: userId }).first();
    if (existingMember) {
      const error = new Error('شما قبلاً عضو این کلاس هستید');
      error.statusCode = 409;
      throw error;
    }

    await insertAndReturn(db, 'class_members', {
      class_id: cls.id,
      user_id: userId,
      role: role === 'parent' ? 'parent' : 'student',
    });

    return cls;
  }

  async getClassMembers(classId) {
    return db('class_members')
      .join('users', 'users.id', 'class_members.user_id')
      .where({ 'class_members.class_id': classId })
      .select('users.id', 'users.display_name', 'users.avatar_url', 'users.role', 'class_members.joined_at')
      .orderBy('users.display_name');
  }

  async createInviteLink(classId, targetRole, maxUses = 0, expiresInHours = 48) {
    const token = generateId().replace(/-/g, '').substring(0, 16);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

    const invite = await insertAndReturn(db, 'invite_links', {
      class_id: classId,
      token,
      target_role: targetRole,
      max_uses: maxUses,
      expires_at: expiresAt,
    });

    return invite;
  }

  async updateQuietHours(classId, quietHours) {
    return updateAndReturn(db, 'classes', { id: classId }, {
      quiet_hours: JSON.stringify(quietHours),
    });
  }

  async deleteClass(classId, teacherId, userRole) {
    let query = db('classes').where({ id: classId });
    if (userRole !== 'admin' && userRole !== 'manager') {
      query = query.where({ teacher_id: teacherId });
    }
    const cls = await query.first();
    if (!cls) {
      const error = new Error('کلاس یافت نشد یا دسترسی حذف آن را ندارید');
      error.statusCode = 404;
      throw error;
    }

    try { await db('class_members').where({ class_id: classId }).del(); } catch (e) {}
    try { await db('assignments').where({ class_id: classId }).del(); } catch (e) {}
    try { await db('announcements').where({ class_id: classId }).del(); } catch (e) {}
    try { await db('invite_links').where({ class_id: classId }).del(); } catch (e) {}
    try { await db('messages').where({ class_id: classId }).del(); } catch (e) {}
    try { await db('attendance').where({ class_id: classId }).del(); } catch (e) {}

    await db('classes').where({ id: classId }).del();
    return cls;
  }

  /**
   * ── Class Rosters & Student Database Management ──
   */
  async getClassRoster(classId) {
    const cls = await db('classes').where({ id: classId }).first();
    if (!cls) {
      const error = new Error('کلاس مورد نظر یافت نشد');
      error.statusCode = 404;
      throw error;
    }

    // Get all enrolled students in this class
    const enrolledStudents = await db('class_members')
      .join('users', 'users.id', 'class_members.user_id')
      .where({ 'class_members.class_id': classId })
      .where(function () {
        this.where('class_members.role', 'student')
          .orWhere('users.role', 'student');
      })
      .select(
        'users.id',
        'users.display_name',
        'users.student_code',
        'users.department',
        'users.phone',
        'users.avatar_url',
        'class_members.joined_at'
      )
      .orderBy('users.display_name');

    // Fetch parent links to attach parent names to students
    const studentIds = enrolledStudents.map(s => s.id);
    const parentLinks = await db('parent_student_links')
      .join('users', 'users.id', 'parent_student_links.parent_id')
      .whereIn('parent_student_links.student_id', studentIds)
      .select(
        'parent_student_links.student_id',
        'users.display_name as parent_name',
        'users.phone as parent_phone'
      );

    const parentMap = new Map();
    parentLinks.forEach(p => {
      parentMap.set(p.student_id, { name: p.parent_name, phone: p.parent_phone });
    });

    // Also look up parents who have student_code matching
    const allParents = await db('users').where({ role: 'parent' }).select('id', 'display_name', 'phone', 'student_code');
    allParents.forEach(p => {
      if (p.student_code) {
        const matchingStudent = enrolledStudents.find(
          s => s.student_code && s.student_code.toLowerCase() === p.student_code.toLowerCase()
        );
        if (matchingStudent && !parentMap.has(matchingStudent.id)) {
          parentMap.set(matchingStudent.id, { name: p.display_name, phone: p.phone });
        }
      }
    });

    const studentsWithParent = enrolledStudents.map(s => {
      const parent = parentMap.get(s.id);
      return {
        ...s,
        parent_name: parent ? parent.name : null,
        parent_phone: parent ? parent.phone : null,
      };
    });

    // Available students in school not yet in this class
    const enrolledIds = new Set(studentIds);
    const allSchoolStudents = await db('users')
      .where({ role: 'student' })
      .select('id', 'display_name', 'student_code', 'department', 'phone')
      .orderBy('display_name');

    const availableStudents = allSchoolStudents.filter(s => !enrolledIds.has(s.id));

    return {
      class: cls,
      students: studentsWithParent,
      total_students: studentsWithParent.length,
      available_students: availableStudents,
    };
  }

  async addStudentToClass(classId, { student_id, display_name, student_code, department, phone, parent_name, parent_phone }) {
    let cls = await db('classes').where({ id: classId }).first();
    if (!cls) {
      // Auto-create or ensure class exists in DB
      try {
        const defaultTeacher = await db('users').where({ role: 'teacher' }).first();
        const defaultSchool = await db('schools').first();
        cls = await insertAndReturn(db, 'classes', {
          id: classId,
          name: `کلاس ${classId}`,
          teacher_id: defaultTeacher?.id || null,
          school_id: defaultSchool?.id || null,
          grade: department || 'عمومی',
        });
      } catch (err) {
        cls = await db('classes').first();
      }
    }

    const effectiveClassId = cls ? cls.id : classId;
    let targetStudentId = student_id;

    if (!targetStudentId) {
      if (!display_name || !display_name.trim()) {
        const error = new Error('نام و نام خانوادگی دانش‌آموز الزامی است');
        error.statusCode = 400;
        throw error;
      }

      // Check if student exists by student_code
      let existingUser = null;
      if (student_code && student_code.trim()) {
        existingUser = await db('users').where({ student_code: student_code.trim() }).first();
      }
      if (!existingUser && display_name && display_name.trim()) {
        existingUser = await db('users').where({ display_name: display_name.trim(), role: 'student' }).first();
      }

      if (existingUser) {
        targetStudentId = existingUser.id;
        const updates = {};
        if (department && !existingUser.department) updates.department = department.trim();
        if (phone && !existingUser.phone) updates.phone = phone.trim();
        if (Object.keys(updates).length > 0) {
          await db('users').where({ id: existingUser.id }).update(updates);
        }
      } else {
        const bcrypt = require('bcryptjs');
        const defaultCode = student_code && student_code.trim() ? student_code.trim() : `STD-${Math.floor(10000 + Math.random() * 90000)}`;
        const defaultPassword = defaultCode || '123456';
        const password_hash = await bcrypt.hash(defaultPassword, 10);

        try {
          const newUser = await insertAndReturn(db, 'users', {
            display_name: display_name.trim(),
            student_code: defaultCode,
            department: department ? department.trim() : null,
            phone: phone ? phone.trim() : null,
            role: 'student',
            password_hash,
          });
          targetStudentId = newUser.id;
        } catch (insertErr) {
          // If collision on student_code or username
          const fallbackUser = await insertAndReturn(db, 'users', {
            display_name: display_name.trim(),
            student_code: `STD-${Date.now().toString().slice(-6)}`,
            department: department ? department.trim() : null,
            phone: phone ? phone.trim() : null,
            role: 'student',
            password_hash,
          });
          targetStudentId = fallbackUser.id;
        }
      }
    }

    // Check if already in class
    if (effectiveClassId && targetStudentId) {
      const alreadyMember = await db('class_members')
        .where({ class_id: effectiveClassId, user_id: targetStudentId })
        .first();

      if (!alreadyMember) {
        await insertAndReturn(db, 'class_members', {
          class_id: effectiveClassId,
          user_id: targetStudentId,
          role: 'student',
        });
      }
    }

    // If parent info provided, link or record parent
    if (parent_name && parent_name.trim()) {
      try {
        const studentUser = await db('users').where({ id: targetStudentId }).first();
        const bcrypt = require('bcryptjs');
        const defaultParentPass = await bcrypt.hash('123456', 10);
        let parentUser = null;
        if (parent_phone && parent_phone.trim()) {
          parentUser = await db('users').where({ phone: parent_phone.trim(), role: 'parent' }).first();
        }
        if (!parentUser) {
          parentUser = await insertAndReturn(db, 'users', {
            display_name: parent_name.trim(),
            phone: parent_phone ? parent_phone.trim() : null,
            student_code: studentUser ? studentUser.student_code : null,
            role: 'parent',
            password_hash: defaultParentPass,
          });
        }
        const existingLink = await db('parent_student_links')
          .where({ parent_id: parentUser.id, student_id: targetStudentId })
          .first();
        if (!existingLink) {
          await insertAndReturn(db, 'parent_student_links', {
            parent_id: parentUser.id,
            student_id: targetStudentId,
          });
        }
      } catch (e) {
        console.error('Error linking parent:', e);
      }
    }

    const enrolled = await db('users').where({ id: targetStudentId }).first();
    return {
      ...(enrolled || {
        id: targetStudentId,
        display_name: display_name.trim(),
        student_code: student_code || 'STD-1000',
        department: department || null,
        phone: phone || null,
      }),
      parent_name: parent_name ? parent_name.trim() : null,
      parent_phone: parent_phone ? parent_phone.trim() : null,
    };
  }

  async batchAddStudents(classId, { raw_text = '', students = [] }) {
    let cls = await db('classes').where({ id: classId }).first();
    if (!cls) {
      try {
        const defaultTeacher = await db('users').where({ role: 'teacher' }).first();
        const defaultSchool = await db('schools').first();
        cls = await insertAndReturn(db, 'classes', {
          id: classId,
          name: `کلاس ${classId}`,
          teacher_id: defaultTeacher?.id || null,
          school_id: defaultSchool?.id || null,
          grade: 'عمومی',
        });
      } catch (err) {
        cls = await db('classes').first();
      }
    }
    if (!cls) {
      const error = new Error('کلاس مورد نظر یافت نشد');
      error.statusCode = 404;
      throw error;
    }

    let parsedList = [...students];

    if (raw_text && raw_text.trim()) {
      const lines = raw_text.split('\n');
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // Split by comma, dash, tab, or semicolon
        const parts = line.split(/[,;\t\-–—]+/).map(p => p.trim()).filter(Boolean);
        if (parts.length > 0) {
          const name = parts[0];
          // Check if parts[1] is student code or number
          let code = parts[1] || '';
          let dept = parts[2] || '';

          // If code is empty or alphabetical, could be dept
          if (code && !/^\d+$/.test(code) && !dept) {
            dept = code;
            code = '';
          }

          parsedList.push({
            display_name: name,
            student_code: code,
            department: dept,
          });
        }
      }
    }

    if (parsedList.length === 0) {
      const error = new Error('هیچ نام یا اطلاعاتی برای افزودن یافت نشد');
      error.statusCode = 400;
      throw error;
    }

    const bcrypt = require('bcryptjs');
    const defaultPasswordHash = await bcrypt.hash('123456', 10);
    const addedStudents = [];

    for (const item of parsedList) {
      if (!item.display_name || !item.display_name.trim()) continue;

      let studentUser = null;
      if (item.student_code && item.student_code.trim()) {
        studentUser = await db('users').where({ student_code: item.student_code.trim() }).first();
      }

      if (!studentUser) {
        studentUser = await insertAndReturn(db, 'users', {
          display_name: item.display_name.trim(),
          student_code: item.student_code ? item.student_code.trim() : Math.floor(100000 + Math.random() * 900000).toString(),
          department: item.department ? item.department.trim() : cls.grade || null,
          role: 'student',
          password_hash: defaultPasswordHash,
        });
      }

      const already = await db('class_members')
        .where({ class_id: classId, user_id: studentUser.id })
        .first();

      if (!already) {
        await insertAndReturn(db, 'class_members', {
          class_id: classId,
          user_id: studentUser.id,
          role: 'student',
        });
        addedStudents.push(studentUser);
      }
    }

    return {
      added_count: addedStudents.length,
      students: addedStudents,
    };
  }

  async removeStudentFromClass(classId, studentId) {
    await db('class_members')
      .where({ class_id: classId, user_id: studentId })
      .del();
    return { success: true, message: 'دانش‌آموز از کلاس حذف شد' };
  }

  async updateStudentInRoster(classId, studentId, { display_name, student_code, department, phone }) {
    const updateData = {};
    if (display_name !== undefined) updateData.display_name = display_name.trim();
    if (student_code !== undefined) updateData.student_code = student_code.trim();
    if (department !== undefined) updateData.department = department.trim();
    if (phone !== undefined) updateData.phone = phone.trim();

    const updated = await updateAndReturn(db, 'users', { id: studentId }, updateData);
    return updated;
  }
}

module.exports = new ClassService();
