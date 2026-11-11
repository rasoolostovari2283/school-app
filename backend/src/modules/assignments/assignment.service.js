const db = require('../../config/database');
const { insertAndReturn, updateAndReturn } = require('../../utils/dbHelpers');
const {
  isSchoolAdmin,
  assertOwnsClass,
  forbiddenError,
  notFoundError,
} = require('../../middleware/auth');

class AssignmentService {
  async create(teacherId, classId, { title, description, due_date, allow_late, attachments }, currentUser = null) {
    if (currentUser) {
      await assertOwnsClass(currentUser, classId);
    }

    const rawAttachments = Array.isArray(attachments)
      ? JSON.stringify(attachments)
      : (typeof attachments === 'string' ? attachments : '[]');

    const assignment = await insertAndReturn(db, 'assignments', {
      class_id: classId,
      teacher_id: teacherId,
      title,
      description: description || '',
      due_date: due_date || null,
      allow_late: allow_late ? 1 : 0,
      attachments: rawAttachments,
    });

    try {
      const members = await db('class_members').where({ class_id: classId, role: 'student' }).select('user_id');
      if (members && members.length > 0) {
        for (const m of members) {
          await insertAndReturn(db, 'notifications', {
            user_id: m.user_id,
            type: 'assignment',
            title: 'تکلیف جدید',
            body: `تکلیف "${title}" اضافه شد`,
            data: JSON.stringify({ assignment_id: assignment.id, class_id: classId }),
          }).catch(() => {});
        }
      }
    } catch (notifErr) {
      console.warn('Could not dispatch notifications:', notifErr.message);
    }
    return assignment;
  }

  async getByClass(classId, userId, role) {
    const assignments = await db('assignments').where({ class_id: classId }).orderBy('created_at', 'desc');
    if (assignments.length === 0) return assignments;

    const assignmentIds = assignments.map((a) => a.id);

    if (role === 'student') {
      const subs = await db('submissions')
        .whereIn('assignment_id', assignmentIds)
        .andWhere({ student_id: userId });
      const subByAssignment = new Map(subs.map((s) => [s.assignment_id, s]));
      for (const a of assignments) {
        a.submission = subByAssignment.get(a.id) || null;
      }
    } else if (role === 'teacher' || role === 'admin' || role === 'manager') {
      const statsRows = await db('submissions')
        .whereIn('assignment_id', assignmentIds)
        .select(
          'assignment_id',
          db.raw('COUNT(*) as total'),
          db.raw("COUNT(CASE WHEN status = 'graded' THEN 1 END) as graded")
        )
        .groupBy('assignment_id');
      const statsByAssignment = new Map(statsRows.map((r) => [r.assignment_id, r]));
      for (const a of assignments) {
        const st = statsByAssignment.get(a.id);
        a.submission_count = parseInt(st ? st.total : 0, 10);
        a.graded_count = parseInt(st ? st.graded : 0, 10);
      }
    }
    return assignments;
  }

  async getAllUserAssignments(userId, role, schoolId = null) {
    const user = schoolId ? { id: userId, role, school_id: schoolId } : await db('users').where({ id: userId }).first();
    const effectiveSchoolId = user?.school_id;
    if (!effectiveSchoolId) return [];

    let assignmentsQuery = db('assignments')
      .join('classes', 'classes.id', 'assignments.class_id')
      .where('classes.school_id', effectiveSchoolId)
      .select(
        'assignments.*',
        'classes.name as class_name',
        'classes.subject as class_subject',
        'classes.grade as class_grade'
      );

    let childIds = [];
    if (role === 'teacher') {
      assignmentsQuery = assignmentsQuery.where({ 'assignments.teacher_id': userId });
    } else if (role === 'admin' || role === 'manager') {
      // School admins see assignments in their own school only
    } else if (role === 'parent') {
      childIds = await db('parent_student_links').where({ parent_id: userId }).pluck('student_id');
      if (childIds.length === 0) {
        const parentUser = await db('users').where({ id: userId }).first();
        if (parentUser?.student_code) {
          const matchedChild = await db('users')
            .where({ student_code: parentUser.student_code, role: 'student', school_id: effectiveSchoolId })
            .first();
          if (matchedChild) childIds = [matchedChild.id];
        }
      }
      if (childIds.length === 0) return [];
      const classIds = await db('class_members').whereIn('user_id', childIds).pluck('class_id');
      if (classIds.length === 0) return [];
      assignmentsQuery = assignmentsQuery.whereIn('assignments.class_id', classIds);
    } else {
      const classIds = await db('class_members').where({ user_id: userId }).pluck('class_id');
      if (classIds.length === 0) return [];
      assignmentsQuery = assignmentsQuery.whereIn('assignments.class_id', classIds);
    }

    const assignments = await assignmentsQuery.orderBy('assignments.created_at', 'desc');
    if (assignments.length === 0) return assignments;

    const assignmentIds = assignments.map((a) => a.id);

    let subByAssignment = new Map();
    let statsByAssignment = new Map();
    let childName = null;

    if (role === 'student') {
      const subs = await db('submissions')
        .whereIn('assignment_id', assignmentIds)
        .andWhere({ student_id: userId });
      subByAssignment = new Map(subs.map((s) => [s.assignment_id, s]));
    } else if (role === 'parent' && childIds.length > 0) {
      const subs = await db('submissions')
        .whereIn('assignment_id', assignmentIds)
        .whereIn('student_id', childIds);
      for (const s of subs) {
        if (!subByAssignment.has(s.assignment_id)) {
          subByAssignment.set(s.assignment_id, s);
        }
      }
      const childUser = await db('users').whereIn('id', childIds).first();
      if (childUser) childName = childUser.display_name;
    } else if (role === 'teacher' || role === 'admin' || role === 'manager') {
      const statsRows = await db('submissions')
        .whereIn('assignment_id', assignmentIds)
        .select(
          'assignment_id',
          db.raw('COUNT(*) as total'),
          db.raw("COUNT(CASE WHEN status = 'graded' THEN 1 END) as graded")
        )
        .groupBy('assignment_id');
      statsByAssignment = new Map(statsRows.map((r) => [r.assignment_id, r]));
    }

    for (const a of assignments) {
      if (typeof a.attachments === 'string') {
        try { a.attachments = JSON.parse(a.attachments); } catch (_e) { a.attachments = []; }
      }
      if (role === 'student') {
        a.submission = subByAssignment.get(a.id) || null;
      } else if (role === 'parent') {
        a.submission = subByAssignment.get(a.id) || null;
        if (childName) a.child_name = childName;
      } else if (role === 'teacher' || role === 'admin' || role === 'manager') {
        const st = statsByAssignment.get(a.id);
        a.submission_count = parseInt(st ? st.total : 0, 10);
        a.graded_count = parseInt(st ? st.graded : 0, 10);
      }
    }
    return assignments;
  }

  async getById(assignmentId, userId, role, classId = null, currentUser = null) {
    const assignment = await db('assignments')
      .join('classes', 'classes.id', 'assignments.class_id')
      .where({ 'assignments.id': assignmentId })
      .select(
        'assignments.*',
        'classes.name as class_name',
        'classes.subject as class_subject',
        'classes.grade as class_grade',
        'classes.school_id as class_school_id',
        'classes.teacher_id as class_teacher_id'
      )
      .first();

    if (!assignment) return null;

    if (classId && assignment.class_id !== classId) {
      throw forbiddenError('این تکلیف متعلق به کلاس انتخاب‌شده نیست');
    }
    if (currentUser) {
      await assertOwnsClass(currentUser, assignment.class_id, { allowEnrolled: true });
    }

    if (typeof assignment.attachments === 'string') {
      try { assignment.attachments = JSON.parse(assignment.attachments); } catch (_e) { assignment.attachments = []; }
    }

    const canManage = (role === 'teacher' && assignment.class_teacher_id === userId)
      || (isSchoolAdmin(currentUser || { role }) && (!currentUser || assignment.class_school_id === currentUser.school_id));

    if (canManage) {
      assignment.submissions = await db('submissions')
        .join('users', 'users.id', 'submissions.student_id')
        .where({ assignment_id: assignmentId })
        .select('submissions.*', 'users.display_name as student_name')
        .orderBy('submissions.submitted_at', 'desc');
    } else if (role === 'parent') {
      let childIds = await db('parent_student_links').where({ parent_id: userId }).pluck('student_id');
      if (childIds.length === 0) {
        const parentUser = await db('users').where({ id: userId }).first();
        if (parentUser?.student_code) {
          const matchedChild = await db('users')
            .where({ student_code: parentUser.student_code, role: 'student', school_id: assignment.class_school_id })
            .first();
          if (matchedChild) childIds = [matchedChild.id];
        }
      }
      assignment.submission = await db('submissions').where({ assignment_id: assignmentId }).whereIn('student_id', childIds).first() || null;
      if (childIds.length > 0) {
        const childUser = await db('users').whereIn('id', childIds).first();
        if (childUser) assignment.child_name = childUser.display_name;
      }
    } else {
      assignment.submission = await db('submissions').where({ assignment_id: assignmentId, student_id: userId }).first();
    }
    return assignment;
  }

  async submit(assignmentId, studentId, { files, student_note }, classId = null, currentUser = null) {
    const assignment = await db('assignments').where({ id: assignmentId }).first();
    if (!assignment) {
      throw notFoundError('تکلیف یافت نشد');
    }
    if (classId && assignment.class_id !== classId) {
      throw forbiddenError('این تکلیف متعلق به کلاس انتخاب‌شده نیست');
    }
    if (currentUser) {
      await assertOwnsClass(currentUser, assignment.class_id, { allowEnrolled: true });
    }

    const isAllowLate = assignment.allow_late === true || assignment.allow_late === 1 || assignment.allow_late === '1' || assignment.allow_late === 'true';
    const isLate = assignment.due_date && new Date() > new Date(assignment.due_date);
    if (isLate && !isAllowLate) {
      const e = new Error('مهلت ارسال این تکلیف به پایان رسیده و طبق تنظیم دبیر امکان آپلود بسته شده است ⛔');
      e.statusCode = 400;
      throw e;
    }

    const existing = await db('submissions').where({ assignment_id: assignmentId, student_id: studentId }).first();
    if (existing) {
      return updateAndReturn(db, 'submissions', { id: existing.id }, {
        files: JSON.stringify(files || []),
        student_note,
        status: isLate ? 'late' : 'submitted',
        submitted_at: new Date().toISOString(),
      });
    }

    return insertAndReturn(db, 'submissions', {
      assignment_id: assignmentId,
      student_id: studentId,
      files: JSON.stringify(files || []),
      student_note,
      status: isLate ? 'late' : 'submitted',
    });
  }

  async grade(submissionId, { grade, feedback_text, feedback_audio_url }, assignmentId = null, classId = null, currentUser = null) {
    const sub = await db('submissions').where({ id: submissionId }).first();
    if (!sub) {
      throw notFoundError('پاسخ تکلیف یافت نشد');
    }
    if (assignmentId && sub.assignment_id !== assignmentId) {
      throw forbiddenError('این پاسخ متعلق به تکلیف انتخاب‌شده نیست');
    }

    const assignment = await db('assignments').where({ id: sub.assignment_id }).first();
    if (!assignment) {
      throw notFoundError('تکلیف یافت نشد');
    }
    if (classId && assignment.class_id !== classId) {
      throw forbiddenError('این تکلیف متعلق به کلاس انتخاب‌شده نیست');
    }
    if (currentUser) {
      await assertOwnsClass(currentUser, assignment.class_id);
    }

    const updated = await updateAndReturn(db, 'submissions', { id: submissionId }, {
      grade,
      feedback_text,
      feedback_audio_url,
      status: 'graded',
      graded_at: new Date().toISOString(),
    });

    if (updated) {
      await insertAndReturn(db, 'notifications', {
        user_id: updated.student_id,
        type: 'grade',
        title: 'نمره جدید ثبت شد',
        body: `نمره ${grade} برای تکلیف شما ثبت شد`,
        data: JSON.stringify({ assignment_id: updated.assignment_id, submission_id: updated.id }),
      });
    }
    return updated;
  }
}

module.exports = new AssignmentService();
