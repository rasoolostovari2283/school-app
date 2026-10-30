const db = require('../../config/database');
const { generateId, insertAndReturn, updateAndReturn } = require('../../utils/dbHelpers');

class AssignmentService {
  async create(teacherId, classId, { title, description, due_date, allow_late, attachments }) {
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

    if (role === 'student') {
      for (const a of assignments) {
        a.submission = await db('submissions').where({ assignment_id: a.id, student_id: userId }).first() || null;
      }
    }
    if (role === 'teacher') {
      for (const a of assignments) {
        const stats = await db('submissions').where({ assignment_id: a.id })
          .select(db.raw('COUNT(*) as total'), db.raw("COUNT(CASE WHEN status = 'graded' THEN 1 END) as graded")).first();
        a.submission_count = parseInt(stats ? stats.total : 0, 10);
        a.graded_count = parseInt(stats ? stats.graded : 0, 10);
      }
    }
    return assignments;
  }

  async getAllUserAssignments(userId, role) {
    let assignmentsQuery = db('assignments')
      .join('classes', 'classes.id', 'assignments.class_id')
      .select(
        'assignments.*',
        'classes.name as class_name',
        'classes.subject as class_subject',
        'classes.grade as class_grade'
      );

    let childIds = [];
    if (role === 'teacher' || role === 'admin' || role === 'manager') {
      const myCount = await db('assignments').where({ teacher_id: userId }).count('id as count').first();
      const countVal = myCount ? parseInt(myCount.count || Object.values(myCount)[0], 10) : 0;
      if (countVal > 0) {
        assignmentsQuery = assignmentsQuery.where({ 'assignments.teacher_id': userId });
      }
    } else if (role === 'parent') {
      childIds = await db('parent_student_links').where({ parent_id: userId }).pluck('student_id');
      if (childIds.length === 0) {
        // Fallback to checking student_code
        const parentUser = await db('users').where({ id: userId }).first();
        if (parentUser?.student_code) {
          const matchedChild = await db('users').where({ student_code: parentUser.student_code, role: 'student' }).first();
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

    for (const a of assignments) {
      if (typeof a.attachments === 'string') {
        try { a.attachments = JSON.parse(a.attachments); } catch(e) { a.attachments = []; }
      }
      if (role === 'student') {
        a.submission = await db('submissions').where({ assignment_id: a.id, student_id: userId }).first() || null;
      } else if (role === 'parent') {
        a.submission = await db('submissions').where({ assignment_id: a.id }).whereIn('student_id', childIds).first() || null;
        if (childIds.length > 0) {
          const childUser = await db('users').whereIn('id', childIds).first();
          if (childUser) a.child_name = childUser.display_name;
        }
      } else if (role === 'teacher') {
        const stats = await db('submissions').where({ assignment_id: a.id })
          .select(db.raw('COUNT(*) as total'), db.raw("COUNT(CASE WHEN status = 'graded' THEN 1 END) as graded")).first();
        a.submission_count = parseInt(stats ? stats.total : 0, 10);
        a.graded_count = parseInt(stats ? stats.graded : 0, 10);
      }
    }
    return assignments;
  }

  async getById(assignmentId, userId, role) {
    const assignment = await db('assignments')
      .join('classes', 'classes.id', 'assignments.class_id')
      .where({ 'assignments.id': assignmentId })
      .select(
        'assignments.*',
        'classes.name as class_name',
        'classes.subject as class_subject',
        'classes.grade as class_grade'
      )
      .first();

    if (!assignment) return null;

    if (typeof assignment.attachments === 'string') {
      try { assignment.attachments = JSON.parse(assignment.attachments); } catch(e) { assignment.attachments = []; }
    }

    if (role === 'teacher') {
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
          const matchedChild = await db('users').where({ student_code: parentUser.student_code, role: 'student' }).first();
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

  async submit(assignmentId, studentId, { files, student_note }) {
    const assignment = await db('assignments').where({ id: assignmentId }).first();
    if (!assignment) { const e = new Error('تکلیف یافت نشد'); e.statusCode = 404; throw e; }

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

  async grade(submissionId, { grade, feedback_text, feedback_audio_url }) {
    const updated = await updateAndReturn(db, 'submissions', { id: submissionId }, {
      grade, feedback_text, feedback_audio_url,
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
