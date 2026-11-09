const db = require('../../config/database');
const { insertAndReturn, updateAndReturn } = require('../../utils/dbHelpers');
const { v4: uuidv4 } = require('uuid');
const {
  assertSameSchool,
  assertOwnsResource,
  assertTeacherOfStudent,
  notFoundError,
} = require('../../middleware/auth');

const ALLOWED_PLAN_FIELDS = [
  'grade',
  'day_of_week',
  'period_number',
  'start_time',
  'end_time',
  'subject',
  'class_name',
  'topic',
  'session_type',
  'room',
  'status',
  'notes',
];

class StudyPlannerService {
  async getTeacherPlans(teacherId) {
    const plans = await db('teacher_lesson_plans')
      .where('teacher_id', teacherId)
      .orderBy([
        { column: 'day_of_week', order: 'asc' },
        { column: 'period_number', order: 'asc' },
      ]);
    return plans;
  }

  async createTeacherPlan(teacherId, data) {
    const {
      grade,
      day_of_week,
      period_number,
      start_time,
      end_time,
      subject,
      class_name,
      topic,
      session_type,
      room,
      notes,
    } = data;

    const newPlan = {
      id: uuidv4(),
      teacher_id: teacherId,
      grade: grade || 'پایه دهم',
      day_of_week: parseInt(day_of_week, 10) || 0,
      period_number: parseInt(period_number, 10) || 1,
      start_time: start_time || '08:00',
      end_time: end_time || '09:30',
      subject: subject || 'درس عمومی',
      class_name: class_name || 'کلاس اصلی',
      topic: topic || '',
      session_type: session_type || 'teaching',
      room: room || 'کلاس اصلی',
      status: 'upcoming',
      notes: notes || '',
    };

    await db('teacher_lesson_plans').insert(newPlan);
    return newPlan;
  }

  async updateTeacherPlan(teacherId, planId, data, currentUser = null) {
    const plan = await db('teacher_lesson_plans').where({ id: planId }).first();
    if (!plan) {
      throw notFoundError('برنامه کلاسی یافت نشد');
    }

    const user = currentUser || await db('users').where({ id: teacherId }).first();
    if (user) {
      const owner = await db('users').where({ id: plan.teacher_id }).first();
      if (owner) assertSameSchool(user, owner);
      assertOwnsResource(user, plan, 'teacher_id');
    }

    const safeUpdates = {};
    for (const key of ALLOWED_PLAN_FIELDS) {
      if (data && data[key] !== undefined) {
        safeUpdates[key] = data[key];
      }
    }

    const updated = await updateAndReturn(db, 'teacher_lesson_plans', { id: planId }, safeUpdates);
    return updated;
  }

  async deleteTeacherPlan(teacherId, planId, currentUser = null) {
    const plan = await db('teacher_lesson_plans').where({ id: planId }).first();
    if (!plan) {
      throw notFoundError('برنامه کلاسی یافت نشد');
    }

    const user = currentUser || await db('users').where({ id: teacherId }).first();
    if (user) {
      const owner = await db('users').where({ id: plan.teacher_id }).first();
      if (owner) assertSameSchool(user, owner);
      assertOwnsResource(user, plan, 'teacher_id');
    }

    await db('teacher_lesson_plans').where({ id: planId }).del();
    return true;
  }

  async getTeacherDocuments(teacherId) {
    const docs = await db('teacher_documents')
      .where('teacher_id', teacherId)
      .orderBy('created_at', 'desc');
    return docs;
  }

  async createTeacherDocument(teacherId, data) {
    const {
      title,
      category,
      grade,
      subject,
      file_url,
      file_name,
      original_name,
      file_size,
      file_type,
      academic_term,
      description,
    } = data;

    const newDoc = {
      id: uuidv4(),
      teacher_id: teacherId,
      title: title || 'سند آموزشی بدون عنوان',
      category: category || 'lesson_plan',
      grade: grade || 'عمومی',
      subject: subject || '',
      file_url,
      file_name: file_name || '',
      original_name: original_name || '',
      file_size: parseInt(file_size, 10) || 0,
      file_type: file_type || 'pdf',
      academic_term: academic_term || 'سال تحصیلی ۱۴۰۵-۱۴۰۴',
      description: description || '',
    };

    await db('teacher_documents').insert(newDoc);
    return newDoc;
  }

  async deleteTeacherDocument(teacherId, docId, currentUser = null) {
    const doc = await db('teacher_documents').where({ id: docId }).first();
    if (!doc) {
      throw notFoundError('سند یافت نشد');
    }

    const user = currentUser || await db('users').where({ id: teacherId }).first();
    if (user) {
      const owner = await db('users').where({ id: doc.teacher_id }).first();
      if (owner) assertSameSchool(user, owner);
      assertOwnsResource(user, doc, 'teacher_id');
    }

    await db('teacher_documents').where({ id: docId }).del();
    return true;
  }

  async getLogs(userId, role, targetStudentId, currentUser = null) {
    const user = currentUser || await db('users').where({ id: userId }).first();
    if (!user || !user.school_id) return [];

    const isStaff = ['teacher', 'admin', 'manager'].includes(role);
    const studentId = (isStaff && targetStudentId) ? targetStudentId : userId;

    const logs = await db('study_logs')
      .join('users as student', 'student.id', 'study_logs.student_id')
      .leftJoin('users as advisor', 'advisor.id', 'study_logs.advisor_id')
      .where('study_logs.student_id', studentId)
      .andWhere('student.school_id', user.school_id)
      .select(
        'study_logs.*',
        'student.display_name as student_name',
        'student.student_code as student_code',
        'advisor.display_name as advisor_name'
      )
      .orderBy('study_logs.date', 'desc');

    return logs;
  }

  async createLog(studentId, data) {
    const {
      date,
      subject,
      study_minutes_descriptive = 0,
      study_minutes_test = 0,
      tests_count = 0,
      tests_correct = 0,
      tests_wrong = 0,
      satisfaction_score = 4,
      student_notes = '',
    } = data;

    const log = await insertAndReturn(db, 'study_logs', {
      student_id: studentId,
      date: date || new Date().toISOString().slice(0, 10),
      subject,
      study_minutes_descriptive: parseInt(study_minutes_descriptive, 10) || 0,
      study_minutes_test: parseInt(study_minutes_test, 10) || 0,
      tests_count: parseInt(tests_count, 10) || 0,
      tests_correct: parseInt(tests_correct, 10) || 0,
      tests_wrong: parseInt(tests_wrong, 10) || 0,
      satisfaction_score: parseInt(satisfaction_score, 10) || 4,
      student_notes,
    });

    return log;
  }

  async addAdvisorFeedback(advisorId, logId, { advisor_feedback }, currentUser = null) {
    const log = await db('study_logs').where({ id: logId }).first();
    if (!log) {
      throw notFoundError('گزارش مطالعه یافت نشد');
    }

    const user = currentUser || await db('users').where({ id: advisorId }).first();
    if (user) {
      const student = await assertTeacherOfStudent(user, log.student_id);
      assertSameSchool(user, student);
    }

    const updated = await updateAndReturn(db, 'study_logs', { id: logId }, {
      advisor_feedback,
      advisor_id: advisorId,
      updated_at: new Date().toISOString(),
    });

    if (updated) {
      await insertAndReturn(db, 'notifications', {
        user_id: updated.student_id,
        type: 'grade',
        title: 'نظر مشاور تحصیلی ثبت شد 🎯',
        body: `مشاور شما برای مطالعه درس "${updated.subject}" بازخورد تحلیلی ثبت کرد.`,
        data: JSON.stringify({ log_id: logId }),
      });
    }

    return updated;
  }

  async getStats(userId, role, targetStudentId, currentUser = null) {
    const user = currentUser || await db('users').where({ id: userId }).first();
    const isStaff = ['teacher', 'admin', 'manager'].includes(role);
    const studentId = (isStaff && targetStudentId) ? targetStudentId : userId;

    let logsQuery = db('study_logs')
      .join('users as student', 'student.id', 'study_logs.student_id')
      .where('study_logs.student_id', studentId)
      .select('study_logs.*');

    if (user && user.school_id) {
      logsQuery = logsQuery.andWhere('student.school_id', user.school_id);
    }

    const logs = await logsQuery;

    let totalDescriptiveMinutes = 0;
    let totalTestMinutes = 0;
    let totalTests = 0;
    let totalCorrect = 0;
    let totalWrong = 0;

    for (const log of logs) {
      totalDescriptiveMinutes += log.study_minutes_descriptive || 0;
      totalTestMinutes += log.study_minutes_test || 0;
      totalTests += log.tests_count || 0;
      totalCorrect += log.tests_correct || 0;
      totalWrong += log.tests_wrong || 0;
    }

    const totalHours = ((totalDescriptiveMinutes + totalTestMinutes) / 60).toFixed(1);
    const accuracyPercentage = totalTests > 0
      ? Math.max(0, Math.round(((3 * totalCorrect - totalWrong) / (3 * totalTests)) * 100))
      : 0;

    const subjectsSummary = {};
    for (const log of logs) {
      if (!subjectsSummary[log.subject]) {
        subjectsSummary[log.subject] = { hours: 0, tests: 0 };
      }
      subjectsSummary[log.subject].hours += ((log.study_minutes_descriptive + log.study_minutes_test) / 60);
      subjectsSummary[log.subject].tests += (log.tests_count || 0);
    }

    return {
      totalHours: parseFloat(totalHours),
      totalDescriptiveHours: parseFloat((totalDescriptiveMinutes / 60).toFixed(1)),
      totalTestHours: parseFloat((totalTestMinutes / 60).toFixed(1)),
      totalTests,
      totalCorrect,
      totalWrong,
      accuracyPercentage,
      testRatioPercentage: (totalDescriptiveMinutes + totalTestMinutes) > 0
        ? Math.round((totalTestMinutes / (totalDescriptiveMinutes + totalTestMinutes)) * 100)
        : 50,
      academicRating: accuracyPercentage >= 80 ? 'ممتاز (سطح عالی و رتبه برتر)' : accuracyPercentage >= 65 ? 'بسیار خوب (تراز بالا و موفق)' : 'نیاز به تمرین و تثبیت',
      sampadRating: accuracyPercentage >= 80 ? 'ممتاز (سطح عالی و رتبه برتر)' : accuracyPercentage >= 65 ? 'بسیار خوب (تراز بالا و موفق)' : 'نیاز به تمرین و تثبیت',
    };
  }

  async getStudentNotes(studentId, currentUser = null) {
    let query = db('student_study_notes')
      .join('users as student', 'student.id', 'student_study_notes.student_id')
      .where('student_study_notes.student_id', studentId)
      .select('student_study_notes.*');

    if (currentUser && currentUser.school_id) {
      query = query.andWhere('student.school_id', currentUser.school_id);
    }

    const notes = await query
      .orderBy('student_study_notes.is_pinned', 'desc')
      .orderBy('student_study_notes.created_at', 'desc');
    return notes;
  }

  async createStudentNote(studentId, { title, content, color, is_pinned, is_completed, category }) {
    const newNote = {
      id: uuidv4(),
      student_id: studentId,
      title: title || '',
      content: content || '',
      color: color || 'yellow',
      is_pinned: is_pinned ? 1 : 0,
      is_completed: is_completed ? 1 : 0,
      category: category || 'general',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db('student_study_notes').insert(newNote);
    return newNote;
  }

  async updateStudentNote(studentId, noteId, updates) {
    const allowed = {};
    if (updates.title !== undefined) allowed.title = updates.title;
    if (updates.content !== undefined) allowed.content = updates.content;
    if (updates.color !== undefined) allowed.color = updates.color;
    if (updates.is_pinned !== undefined) allowed.is_pinned = updates.is_pinned ? 1 : 0;
    if (updates.is_completed !== undefined) allowed.is_completed = updates.is_completed ? 1 : 0;
    if (updates.category !== undefined) allowed.category = updates.category;
    allowed.updated_at = new Date().toISOString();

    await db('student_study_notes')
      .where({ id: noteId, student_id: studentId })
      .update(allowed);

    return db('student_study_notes').where({ id: noteId, student_id: studentId }).first();
  }

  async deleteStudentNote(studentId, noteId) {
    await db('student_study_notes')
      .where({ id: noteId, student_id: studentId })
      .del();
    return true;
  }
}

module.exports = new StudyPlannerService();
