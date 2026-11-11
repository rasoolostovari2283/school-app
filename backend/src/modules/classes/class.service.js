const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../../config/database');
const { generateId, insertAndReturn, updateAndReturn } = require('../../utils/dbHelpers');
const {
  isSchoolAdmin,
  assertSameSchool,
  assertOwnsClass,
  forbiddenError,
  notFoundError,
} = require('../../middleware/auth');

function sanitizeClassSecrets(cls) {
  if (!cls) return cls;
  const copy = { ...cls };
  delete copy.skyroom_api_key;
  delete copy.bbb_secret;
  return copy;
}

class ClassService {
  generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async createClass(actorOrId, { name, subject, grade, school_id, teacher_name }) {
    const actor = typeof actorOrId === 'object' && actorOrId !== null
      ? actorOrId
      : await db('users').where({ id: actorOrId }).first();

    if (!actor) {
      throw forbiddenError();
    }

    let joinCode;
    let codeExists = true;
    while (codeExists) {
      joinCode = this.generateJoinCode();
      const existing = await db('classes').where({ join_code: joinCode }).first();
      codeExists = !!existing;
    }

    const effectiveSchoolId = actor.school_id || school_id || null;
    if (school_id && actor.school_id && school_id !== actor.school_id) {
      throw forbiddenError('ایجاد کلاس برای مدرسه دیگر مجاز نیست');
    }

    let validTeacherId = actor.id;
    if (teacher_name && isSchoolAdmin(actor)) {
      const teacherByName = await db('users')
        .where({ school_id: effectiveSchoolId })
        .andWhere(function () {
          this.where('display_name', teacher_name).orWhere('username', teacher_name);
        })
        .first();
      if (teacherByName) validTeacherId = teacherByName.id;
    }

    const teacherRecord = await db('users').where({ id: validTeacherId }).first();

    const cls = await insertAndReturn(db, 'classes', {
      name,
      subject: subject || 'عمومی',
      grade: grade || 'عمومی',
      join_code: joinCode,
      school_id: effectiveSchoolId,
      teacher_id: validTeacherId,
    });

    if (teacherRecord) {
      cls.teacher_name = teacherRecord.display_name;
    }

    return sanitizeClassSecrets(cls);
  }

  async updateClass(classId, actorOrId, { name, subject, grade, teacher_id, teacher_name }) {
    const actor = typeof actorOrId === 'object' && actorOrId !== null
      ? actorOrId
      : await db('users').where({ id: actorOrId }).first();

    const cls = await assertOwnsClass(actor, classId);

    let validTeacherId = cls.teacher_id;
    if (teacher_id && isSchoolAdmin(actor)) {
      const teacherExists = await db('users')
        .where({ id: teacher_id, school_id: cls.school_id })
        .first();
      if (teacherExists) validTeacherId = teacher_id;
    } else if (teacher_name && isSchoolAdmin(actor)) {
      const teacherByName = await db('users')
        .where({ school_id: cls.school_id })
        .andWhere(function () {
          this.where('display_name', teacher_name).orWhere('username', teacher_name);
        })
        .first();
      if (teacherByName) validTeacherId = teacherByName.id;
    }

    const updates = {
      updated_at: new Date().toISOString(),
    };
    if (name && name.trim()) updates.name = name.trim();
    if (subject && subject.trim()) updates.subject = subject.trim();
    if (grade && grade.trim()) updates.grade = grade.trim();
    if (validTeacherId) updates.teacher_id = validTeacherId;

    await db('classes').where({ id: classId }).update(updates);
    const updatedCls = await db('classes')
      .leftJoin('users as teachers', 'classes.teacher_id', 'teachers.id')
      .select('classes.*', 'teachers.display_name as teacher_name')
      .where({ 'classes.id': classId })
      .first();

    return sanitizeClassSecrets(updatedCls);
  }

  async attachStudentCounts(classesList) {
    if (!Array.isArray(classesList) || classesList.length === 0) return classesList;
    const classIds = classesList.map((c) => c.id);
    const counts = await db('class_members')
      .whereIn('class_id', classIds)
      .andWhere({ role: 'student' })
      .groupBy('class_id')
      .select('class_id')
      .count('id as count');

    const countMap = new Map();
    for (const row of counts) {
      countMap.set(row.class_id, parseInt(row.count || 0, 10));
    }

    for (const c of classesList) {
      c.students_count = countMap.get(c.id) || 0;
    }
    return classesList;
  }

  async getUserClasses(userId, role) {
    const user = await db('users').where({ id: userId }).first();
    const userSchoolId = user?.school_id || null;

    if (isSchoolAdmin({ role })) {
      if (!userSchoolId) return [];
      const list = await db('classes')
        .leftJoin('users as teachers', 'classes.teacher_id', 'teachers.id')
        .select('classes.*', 'teachers.display_name as teacher_name')
        .where({ 'classes.is_active': true, 'classes.school_id': userSchoolId })
        .orderBy('classes.created_at', 'desc');

      await this.attachStudentCounts(list);
      return list.map(sanitizeClassSecrets);
    }

    if (role === 'teacher') {
      let query = db('classes')
        .leftJoin('users as teachers', 'classes.teacher_id', 'teachers.id')
        .select('classes.*', 'teachers.display_name as teacher_name')
        .where('classes.is_active', true)
        .andWhere(function () {
          this.where('classes.teacher_id', userId).orWhereExists(function () {
            this.select('*')
              .from('class_members')
              .whereRaw('class_members.class_id = classes.id')
              .where('class_members.user_id', userId)
              .where('class_members.role', 'teacher');
          });
        });

      if (userSchoolId) {
        query = query.andWhere('classes.school_id', userSchoolId);
      }

      const list = await query.orderBy('classes.created_at', 'desc');
      await this.attachStudentCounts(list);
      return list.map(sanitizeClassSecrets);
    }

    if (role === 'parent') {
      let query = db('parent_student_links')
        .join('class_members', 'class_members.user_id', 'parent_student_links.student_id')
        .join('classes', 'classes.id', 'class_members.class_id')
        .join('users', 'users.id', 'parent_student_links.student_id')
        .where({ 'parent_student_links.parent_id': userId, 'classes.is_active': true });

      if (userSchoolId) {
        query = query.andWhere('classes.school_id', userSchoolId);
      }

      const results = await query
        .select('classes.*', 'users.display_name as student_name', 'users.id as student_id')
        .orderBy('classes.created_at', 'desc');
      await this.attachStudentCounts(results);
      return results.map(sanitizeClassSecrets);
    }

    let studentQuery = db('class_members')
      .join('classes', 'classes.id', 'class_members.class_id')
      .join('users as teacher', 'teacher.id', 'classes.teacher_id')
      .where({ 'class_members.user_id': userId, 'classes.is_active': true });

    if (userSchoolId) {
      studentQuery = studentQuery.andWhere('classes.school_id', userSchoolId);
    }

    const rows = await studentQuery
      .select('classes.*', 'teacher.display_name as teacher_name')
      .orderBy('class_members.joined_at', 'desc');
    await this.attachStudentCounts(rows);
    return rows.map(sanitizeClassSecrets);
  }

  async getParentChildren(parentId) {
    const parentUser = await db('users').where({ id: parentId }).first();
    let query = db('parent_student_links')
      .join('users', 'users.id', 'parent_student_links.student_id')
      .where({ 'parent_student_links.parent_id': parentId });

    if (parentUser?.school_id) {
      query = query.andWhere('users.school_id', parentUser.school_id);
    }

    return query.select(
      'users.id',
      'users.display_name',
      'users.student_code',
      'users.department',
      'users.avatar_url',
      'parent_student_links.relation'
    );
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
    return sanitizeClassSecrets(cls);
  }

  async joinClass(actorOrId, role, joinCode) {
    const actor = typeof actorOrId === 'object' && actorOrId !== null
      ? actorOrId
      : await db('users').where({ id: actorOrId }).first();

    const cls = await db('classes').where({ join_code: joinCode.toUpperCase(), is_active: true }).first();
    if (!cls) {
      throw notFoundError('کد کلاس نامعتبر است', 'Invalid class code');
    }

    assertSameSchool(actor, cls);

    const existingMember = await db('class_members').where({ class_id: cls.id, user_id: actor.id }).first();
    if (existingMember) {
      const error = new Error('شما قبلاً عضو این کلاس هستید');
      error.statusCode = 409;
      throw error;
    }

    try {
      await insertAndReturn(db, 'class_members', {
        class_id: cls.id,
        user_id: actor.id,
        role: role === 'parent' ? 'parent' : 'student',
      });
    } catch (err) {
      if (String(err.message || '').includes('UNIQUE') || err.code === 'SQLITE_CONSTRAINT') {
        const dupErr = new Error('شما قبلاً عضو این کلاس هستید');
        dupErr.statusCode = 409;
        throw dupErr;
      }
      throw err;
    }

    return sanitizeClassSecrets(cls);
  }

  async getClassMembers(classId) {
    return db('class_members')
      .join('users', 'users.id', 'class_members.user_id')
      .where({ 'class_members.class_id': classId })
      .select('users.id', 'users.display_name', 'users.avatar_url', 'users.role', 'class_members.joined_at')
      .orderBy('users.display_name');
  }

  async createInviteLink(classId, actor, targetRole, maxUses = 0, expiresInHours = 48) {
    await assertOwnsClass(actor, classId);

    const token = generateId().replace(/-/g, '').substring(0, 16);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

    const invite = await insertAndReturn(db, 'invite_links', {
      class_id: classId,
      token,
      target_role: targetRole === 'parent' ? 'parent' : 'student',
      max_uses: maxUses,
      expires_at: expiresAt,
    });

    return invite;
  }

  async updateQuietHours(classId, actor, quietHours) {
    await assertOwnsClass(actor, classId);
    const updated = await updateAndReturn(db, 'classes', { id: classId }, {
      quiet_hours: JSON.stringify(quietHours),
    });
    return sanitizeClassSecrets(updated);
  }

  async deleteClass(classId, actorOrId, userRole) {
    const actor = typeof actorOrId === 'object' && actorOrId !== null
      ? actorOrId
      : await db('users').where({ id: actorOrId }).first();

    const cls = await assertOwnsClass(actor || { id: actorOrId, role: userRole }, classId);

    await db.transaction(async (trx) => {
      await trx('class_members').where({ class_id: classId }).del();
      await trx('assignments').where({ class_id: classId }).del();
      await trx('announcements').where({ class_id: classId }).del();
      await trx('invite_links').where({ class_id: classId }).del();
      await trx('messages').where({ class_id: classId }).del();
      await trx('classes').where({ id: classId }).del();
    });
    return sanitizeClassSecrets(cls);
  }

  /**
   * ── Class Rosters & Student Database Management ──
   */
  async getClassRoster(classId, actor) {
    const cls = actor
      ? await assertOwnsClass(actor, classId)
      : await db('classes').where({ id: classId }).first();

    if (!cls) {
      throw notFoundError('کلاس مورد نظر یافت نشد');
    }

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

    const studentIds = enrolledStudents.map((s) => s.id);
    const parentLinks = studentIds.length > 0
      ? await db('parent_student_links')
          .join('users', 'users.id', 'parent_student_links.parent_id')
          .whereIn('parent_student_links.student_id', studentIds)
          .select(
            'parent_student_links.student_id',
            'users.display_name as parent_name',
            'users.phone as parent_phone'
          )
      : [];

    const parentMap = new Map();
    parentLinks.forEach((p) => {
      parentMap.set(p.student_id, { name: p.parent_name, phone: p.parent_phone });
    });

    const allParents = cls.school_id
      ? await db('users')
          .where({ role: 'parent', school_id: cls.school_id })
          .select('id', 'display_name', 'phone', 'student_code')
      : [];

    allParents.forEach((p) => {
      if (p.student_code) {
        const matchingStudent = enrolledStudents.find(
          (s) => s.student_code && s.student_code.toLowerCase() === p.student_code.toLowerCase()
        );
        if (matchingStudent && !parentMap.has(matchingStudent.id)) {
          parentMap.set(matchingStudent.id, { name: p.display_name, phone: p.phone });
        }
      }
    });

    const studentsWithParent = enrolledStudents.map((s) => {
      const parent = parentMap.get(s.id);
      return {
        ...s,
        parent_name: parent ? parent.name : null,
        parent_phone: parent ? parent.phone : null,
      };
    });

    const enrolledIds = new Set(studentIds);
    const allSchoolStudents = cls.school_id
      ? await db('users')
          .where({ role: 'student', school_id: cls.school_id })
          .select('id', 'display_name', 'student_code', 'department', 'phone')
          .orderBy('display_name')
      : [];

    const availableStudents = allSchoolStudents.filter((s) => !enrolledIds.has(s.id));

    return {
      class: sanitizeClassSecrets(cls),
      students: studentsWithParent,
      total_students: studentsWithParent.length,
      available_students: availableStudents,
    };
  }

  async addStudentToClass(classId, actor, { student_id, display_name, student_code, department, phone, parent_name, parent_phone }) {
    const cls = await assertOwnsClass(actor, classId);
    let targetStudentId = student_id;

    if (targetStudentId) {
      const existingStudent = await db('users').where({ id: targetStudentId }).first();
      if (!existingStudent) {
        throw notFoundError('دانش‌آموز یافت نشد');
      }
      assertSameSchool(actor, existingStudent);
      if (existingStudent.role !== 'student') {
        throw forbiddenError('فقط کاربران دانش‌آموز می‌توانند به کلاس اضافه شوند');
      }
    } else {
      if (!display_name || !display_name.trim()) {
        const error = new Error('نام و نام خانوادگی دانش‌آموز الزامی است');
        error.statusCode = 400;
        throw error;
      }

      let existingUser = null;
      if (student_code && student_code.trim()) {
        existingUser = await db('users')
          .where({ student_code: student_code.trim(), school_id: cls.school_id })
          .first();
      }
      if (!existingUser && display_name && display_name.trim()) {
        existingUser = await db('users')
          .where({ display_name: display_name.trim(), role: 'student', school_id: cls.school_id })
          .first();
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
        const defaultCode = student_code && student_code.trim()
          ? student_code.trim()
          : `STD-${Math.floor(10000 + Math.random() * 90000)}`;
        const password_hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

        try {
          const newUser = await insertAndReturn(db, 'users', {
            display_name: display_name.trim(),
            student_code: defaultCode,
            department: department ? department.trim() : null,
            phone: phone ? phone.trim() : null,
            role: 'student',
            school_id: cls.school_id,
            password_hash,
          });
          targetStudentId = newUser.id;
        } catch (insertErr) {
          const fallbackUser = await insertAndReturn(db, 'users', {
            display_name: display_name.trim(),
            student_code: `STD-${Date.now().toString().slice(-6)}`,
            department: department ? department.trim() : null,
            phone: phone ? phone.trim() : null,
            role: 'student',
            school_id: cls.school_id,
            password_hash,
          });
          targetStudentId = fallbackUser.id;
        }
      }
    }

    if (targetStudentId) {
      const alreadyMember = await db('class_members')
        .where({ class_id: cls.id, user_id: targetStudentId })
        .first();

      if (!alreadyMember) {
        await insertAndReturn(db, 'class_members', {
          class_id: cls.id,
          user_id: targetStudentId,
          role: 'student',
        });
      }
    }

    if (parent_name && parent_name.trim()) {
      try {
        const studentUser = await db('users').where({ id: targetStudentId }).first();
        const defaultParentPass = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
        let parentUser = null;
        if (parent_phone && parent_phone.trim()) {
          parentUser = await db('users')
            .where({ phone: parent_phone.trim(), role: 'parent', school_id: cls.school_id })
            .first();
        }
        if (!parentUser) {
          parentUser = await insertAndReturn(db, 'users', {
            display_name: parent_name.trim(),
            phone: parent_phone ? parent_phone.trim() : null,
            student_code: studentUser ? studentUser.student_code : null,
            role: 'parent',
            school_id: cls.school_id,
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
      } catch (e) {}
    }

    const enrolled = await db('users').where({ id: targetStudentId }).first();
    if (enrolled) delete enrolled.password_hash;
    return {
      ...(enrolled || {
        id: targetStudentId,
        display_name: display_name ? display_name.trim() : '',
        student_code: student_code || 'STD-1000',
        department: department || null,
        phone: phone || null,
      }),
      parent_name: parent_name ? parent_name.trim() : null,
      parent_phone: parent_phone ? parent_phone.trim() : null,
    };
  }

  async batchAddStudents(classId, actor, { raw_text = '', students = [] }) {
    const cls = await assertOwnsClass(actor, classId);

    const parsedList = [...students];

    if (raw_text && raw_text.trim()) {
      const lines = raw_text.split('\n');
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const parts = line.split(/[,;\t\-–—]+/).map((p) => p.trim()).filter(Boolean);
        if (parts.length > 0) {
          const name = parts[0];
          let code = parts[1] || '';
          let dept = parts[2] || '';

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

    const validItems = parsedList.filter((item) => item && item.display_name && item.display_name.trim());
    if (validItems.length === 0) {
      return { added_count: 0, students: [] };
    }

    // Batch-fetch existing students by student_code in this school (1 query instead of N)
    const codesToLookup = Array.from(
      new Set(
        validItems
          .map((item) => (item.student_code ? item.student_code.trim() : ''))
          .filter(Boolean)
      )
    );

    const existingUsersByCode = new Map();
    if (codesToLookup.length > 0) {
      const foundUsers = await db('users')
        .where({ school_id: cls.school_id })
        .whereIn('student_code', codesToLookup);
      for (const u of foundUsers) {
        if (u.student_code) {
          existingUsersByCode.set(u.student_code.trim(), u);
        }
      }
    }

    // Batch-fetch existing class_members for this class (1 query instead of N)
    const existingMemberIds = new Set(
      await db('class_members').where({ class_id: classId }).pluck('user_id')
    );

    const addedStudents = [];
    const newMembershipsToInsert = [];

    for (const item of validItems) {
      const cleanCode = item.student_code ? item.student_code.trim() : '';
      let studentUser = cleanCode ? existingUsersByCode.get(cleanCode) : null;

      if (!studentUser) {
        const assignedCode = cleanCode || Math.floor(100000 + Math.random() * 900000).toString();
        // Generate an independent cryptographically random password hash per student (BL-ENR-002)
        const perStudentPasswordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 8);
        studentUser = await insertAndReturn(db, 'users', {
          display_name: item.display_name.trim(),
          student_code: assignedCode,
          department: item.department ? item.department.trim() : cls.grade || null,
          role: 'student',
          school_id: cls.school_id,
          password_hash: perStudentPasswordHash,
        });
        if (cleanCode) {
          existingUsersByCode.set(cleanCode, studentUser);
        }
      }

      if (!existingMemberIds.has(studentUser.id)) {
        existingMemberIds.add(studentUser.id);
        newMembershipsToInsert.push({
          id: generateId(),
          class_id: classId,
          user_id: studentUser.id,
          role: 'student',
          joined_at: new Date().toISOString(),
        });
        const sanitizedUser = { ...studentUser };
        delete sanitizedUser.password_hash;
        addedStudents.push(sanitizedUser);
      }
    }

    if (newMembershipsToInsert.length > 0) {
      await db('class_members').insert(newMembershipsToInsert);
    }

    return {
      added_count: addedStudents.length,
      students: addedStudents,
    };
  }

  async removeStudentFromClass(classId, studentId, actor) {
    await assertOwnsClass(actor, classId);
    await db('class_members')
      .where({ class_id: classId, user_id: studentId })
      .del();
    return { success: true, message: 'دانش‌آموز از کلاس حذف شد' };
  }

  async updateStudentInRoster(classId, studentId, actor, { display_name, student_code, department, phone }) {
    const cls = await assertOwnsClass(actor, classId);

    const targetUser = await db('users').where({ id: studentId }).first();
    if (!targetUser) {
      throw notFoundError('دانش‌آموز یافت نشد');
    }

    assertSameSchool(actor, targetUser);

    if (targetUser.role !== 'student') {
      throw forbiddenError('فقط مشخصات دانش‌آموزان قابل ویرایش است', 'Only student records may be modified');
    }

    const membership = await db('class_members')
      .where({ class_id: cls.id, user_id: studentId })
      .first();
    if (!membership) {
      throw forbiddenError('این دانش‌آموز عضو این کلاس نیست', 'Student is not enrolled in this class');
    }

    const updateData = {};
    if (display_name !== undefined) updateData.display_name = display_name.trim();
    if (student_code !== undefined) updateData.student_code = student_code.trim();
    if (department !== undefined) updateData.department = department.trim();
    if (phone !== undefined) updateData.phone = phone.trim();

    const updated = await updateAndReturn(db, 'users', { id: studentId }, updateData);
    if (updated) delete updated.password_hash;
    return updated;
  }
}

module.exports = new ClassService();
