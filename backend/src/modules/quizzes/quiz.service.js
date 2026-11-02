const db = require('../../config/database');
const { generateId, insertAndReturn, updateAndReturn } = require('../../utils/dbHelpers');

class QuizService {
  async create(teacherId, classId, { title, description, duration_minutes, start_time, end_time, has_negative_marking, attachments, questions }) {
    const quiz = await insertAndReturn(db, 'quizzes', {
      class_id: classId,
      teacher_id: teacherId,
      title,
      description: description || null,
      duration_minutes: duration_minutes ? parseInt(duration_minutes, 10) : 30,
      start_time: start_time || null,
      end_time: end_time || null,
      has_negative_marking: !!has_negative_marking,
      attachments: JSON.stringify(attachments || []),
      is_published: true, // Auto-publish for smooth UX
    });

    if (questions && Array.isArray(questions) && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const hasTextOrImg = (q.question_text && q.question_text.trim()) || q.question_image_url;
        if (hasTextOrImg) {
          await insertAndReturn(db, 'quiz_questions', {
            quiz_id: quiz.id,
            question_text: (q.question_text && q.question_text.trim()) ? q.question_text.trim() : 'سوال تصویری',
            question_image_url: q.question_image_url || null,
            options: JSON.stringify(q.options || []),
            correct_option: String(q.correct_option ?? '0'),
            points: q.points || 1,
            order_index: i,
          });
        }
      }
    }

    // Automatically notify students when quiz is created/shared
    try {
      const members = await db('class_members').where({ class_id: classId, role: 'student' }).select('user_id');
      if (members && members.length > 0) {
        for (const m of members) {
          await insertAndReturn(db, 'notifications', {
            user_id: m.user_id,
            type: 'quiz',
            title: 'آزمون آنلاین جدید',
            body: `آزمون "${title}" برای کلاس شما به اشتراک گذاشته شد`,
            data: JSON.stringify({ quiz_id: quiz.id, class_id: classId }),
          }).catch(() => {});
        }
      }
    } catch (notifErr) {
      console.warn('Could not dispatch quiz notifications:', notifErr.message);
    }

    return quiz;
  }

  async getByClass(classId) {
    const quizzes = await db('quizzes').where({ class_id: classId }).orderBy('created_at', 'desc');
    for (const q of quizzes) {
      if (typeof q.attachments === 'string') {
        try { q.attachments = JSON.parse(q.attachments); } catch (e) { q.attachments = []; }
      } else if (!q.attachments) {
        q.attachments = [];
      }
      const qCount = await db('quiz_questions').where({ quiz_id: q.id }).count('id as count').first();
      q.questions_count = parseInt(qCount ? (qCount.count || Object.values(qCount)[0]) : 0, 10);
      const attemptsCount = await db('quiz_attempts').where({ quiz_id: q.id }).count('id as count').first();
      q.attempts_count = parseInt(attemptsCount ? (attemptsCount.count || Object.values(attemptsCount)[0]) : 0, 10);
    }
    return quizzes;
  }

  async getById(quizId, userId, role) {
    const quiz = await db('quizzes')
      .join('classes', 'classes.id', 'quizzes.class_id')
      .where({ 'quizzes.id': quizId })
      .select('quizzes.*', 'classes.name as class_name', 'classes.grade as class_grade', 'classes.subject as class_subject')
      .first();

    if (!quiz) return null;

    if (typeof quiz.attachments === 'string') {
      try {
        quiz.attachments = JSON.parse(quiz.attachments);
      } catch (e) {
        quiz.attachments = [];
      }
    } else if (!quiz.attachments) {
      quiz.attachments = [];
    }

    quiz.questions = await db('quiz_questions').where({ quiz_id: quizId }).orderBy('order_index');
    quiz.questions.forEach((q) => {
      q.options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
      if (role !== 'teacher' && role !== 'admin' && role !== 'manager') delete q.correct_option;
    });

    if (role === 'student') {
      quiz.attempt = await db('quiz_attempts').where({ quiz_id: quizId, student_id: userId }).first();
      if (quiz.attempt && typeof quiz.attempt.answers === 'string') {
        try {
          quiz.attempt.answers_data = JSON.parse(quiz.attempt.answers);
        } catch (e) {
          quiz.attempt.answers_data = {};
        }
      }
    } else if (role === 'parent') {
      let childIds = await db('parent_student_links').where({ parent_id: userId }).pluck('student_id');
      if (childIds.length === 0) {
        const parentUser = await db('users').where({ id: userId }).first();
        if (parentUser?.student_code) {
          const matchedChild = await db('users').where({ student_code: parentUser.student_code, role: 'student' }).first();
          if (matchedChild) childIds = [matchedChild.id];
        }
      }
      quiz.attempt = await db('quiz_attempts').where({ quiz_id: quizId }).whereIn('student_id', childIds).first() || null;
      if (quiz.attempt && typeof quiz.attempt.answers === 'string') {
        try {
          quiz.attempt.answers_data = JSON.parse(quiz.attempt.answers);
        } catch (e) {
          quiz.attempt.answers_data = {};
        }
      }
      if (childIds.length > 0) {
        const childUser = await db('users').whereIn('id', childIds).first();
        if (childUser) quiz.child_name = childUser.display_name;
      }
    }

    if (role === 'teacher' || role === 'admin' || role === 'manager') {
      quiz.attempts = await db('quiz_attempts')
        .join('users', 'users.id', 'quiz_attempts.student_id')
        .where({ quiz_id: quizId })
        .select(
          'quiz_attempts.*',
          'users.display_name as student_name',
          'users.student_code as student_code',
          'users.avatar_url as student_avatar',
          'users.phone as student_phone'
        )
        .orderBy('quiz_attempts.started_at', 'desc');

      quiz.attempts.forEach((att) => {
        if (typeof att.answers === 'string') {
          try {
            att.answers_data = JSON.parse(att.answers);
          } catch (e) {
            att.answers_data = {};
          }
        }
      });

      try {
        const classStudents = await db('class_members')
          .join('users', 'users.id', 'class_members.user_id')
          .where({ 'class_members.class_id': quiz.class_id })
          .where(function () {
            this.where('class_members.role', 'student').orWhereNull('class_members.role');
          })
          .select(
            'users.id as student_id',
            'users.display_name as student_name',
            'users.student_code as student_code',
            'users.avatar_url as student_avatar',
            'users.phone as student_phone'
          );
        quiz.class_students = classStudents || [];
      } catch (err) {
        quiz.class_students = [];
      }
    }

    return quiz;
  }

  async publish(quizId) {
    return updateAndReturn(db, 'quizzes', { id: quizId }, { is_published: true });
  }

  async shareQuiz(quizId, teacherId, { sendToAnnouncements = true, customMessage = '' } = {}) {
    const quiz = await db('quizzes')
      .join('classes', 'classes.id', 'quizzes.class_id')
      .where({ 'quizzes.id': quizId })
      .select('quizzes.*', 'classes.name as class_name', 'classes.grade as class_grade', 'classes.subject as class_subject')
      .first();

    if (!quiz) {
      const err = new Error('آزمون یافت نشد');
      err.statusCode = 404;
      throw err;
    }

    // Ensure published
    await db('quizzes').where({ id: quizId }).update({ is_published: true });

    let notifiedCount = 0;
    try {
      const members = await db('class_members').where({ class_id: quiz.class_id, role: 'student' }).select('user_id');
      if (members && members.length > 0) {
        notifiedCount = members.length;
        for (const m of members) {
          await insertAndReturn(db, 'notifications', {
            user_id: m.user_id,
            type: 'quiz',
            title: 'آزمون آنلاین: ' + quiz.title,
            body: customMessage || `آزمون آنلاین "${quiz.title}" هم‌اکنون فعال و آماده شرکت است (مدت: ${quiz.duration_minutes} دقیقه)`,
            data: JSON.stringify({ quiz_id: quiz.id, class_id: quiz.class_id }),
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Error sending quiz notifications:', e.message);
    }

    let announcement = null;
    if (sendToAnnouncements) {
      try {
        announcement = await insertAndReturn(db, 'announcements', {
          class_id: quiz.class_id,
          title: `📢 برگزاری آزمون آنلاین: ${quiz.title}`,
          content: customMessage || `دانش‌آموزان گرامی، آزمون آنلاین «${quiz.title}» برای کلاس شما به اشتراک گذاشته شد. مدت زمان آزمون ${quiz.duration_minutes} دقیقه می‌باشد. لطفاً از طریق منوی آزمون‌ها در آزمون شرکت فرمایید.`,
          attachments: quiz.attachments || '[]',
          is_pinned: true,
        }).catch(() => null);
      } catch (annErr) {
        console.warn('Could not create announcement for quiz:', annErr.message);
      }
    }

    return {
      quizId,
      classId: quiz.class_id,
      className: quiz.class_name,
      notifiedCount,
      announcementCreated: !!announcement,
      shareLink: `/dashboard/quizzes?classId=${quiz.class_id}&quizId=${quiz.id}`,
    };
  }

  async startAttempt(quizId, studentId) {
    const quiz = await db('quizzes').where({ id: quizId, is_published: true }).first();
    if (!quiz) {
      const e = new Error('کوییز یافت نشد یا هنوز فعال نشده است');
      e.statusCode = 404;
      throw e;
    }

    const existing = await db('quiz_attempts').where({ quiz_id: quizId, student_id: studentId }).first();
    if (existing) {
      return existing;
    }

    return insertAndReturn(db, 'quiz_attempts', {
      quiz_id: quizId,
      student_id: studentId,
      started_at: new Date().toISOString(),
      answers: '{}',
      score: 0,
      total_points: 0,
    });
  }

  async submitAttempt(quizId, studentId, body = {}) {
    const quiz = await db('quizzes').where({ id: quizId, is_published: true }).first();
    if (!quiz) {
      const e = new Error('کوییز یافت نشد');
      e.statusCode = 404;
      throw e;
    }

    let answers = {};
    let files = [];
    let note = '';
    let autoSubmitted = false;

    if (body && typeof body === 'object') {
      if (body.answers !== undefined) {
        answers = body.answers || {};
        files = body.files || [];
        note = body.note || '';
        autoSubmitted = !!body.auto_submitted;
      } else {
        answers = body;
      }
    }

    const existing = await db('quiz_attempts')
      .where({ quiz_id: quizId, student_id: studentId })
      .whereNotNull('completed_at')
      .first();

    if (existing) {
      const e = new Error('پاسخنامه شما برای این آزمون قبلاً نهایی و ثبت شده است');
      e.statusCode = 409;
      throw e;
    }

    const questions = await db('quiz_questions').where({ quiz_id: quizId });
    let score = 0;
    let totalPoints = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let blankCount = 0;

    if (questions && questions.length > 0) {
      for (const q of questions) {
        totalPoints += q.points;
        const studentAns = answers[q.id];
        if (studentAns === q.correct_option) {
          correctCount++;
          score += q.points;
        } else if (studentAns !== undefined && studentAns !== null && studentAns !== '') {
          wrongCount++;
          if (quiz.has_negative_marking) {
            score -= (q.points / 3);
          }
        } else {
          blankCount++;
        }
      }

      score = Math.max(0, parseFloat(score.toFixed(2)));
      const totalQ = questions.length || 1;
      const percentage = quiz.has_negative_marking
        ? Math.max(0, parseFloat((((3 * correctCount - wrongCount) / (3 * totalQ)) * 100).toFixed(1)))
        : (totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0);

      const diagnostic = {
        correctCount,
        wrongCount,
        blankCount,
        percentage,
        has_negative_marking: !!quiz.has_negative_marking,
        submitted_answers: answers,
        student_files: files,
        student_note: note,
        auto_submitted: autoSubmitted,
        konkur_score: percentage,
      };

      const payload = {
        answers: JSON.stringify(diagnostic),
        score: Math.round(score),
        total_points: totalPoints,
        completed_at: new Date().toISOString(),
      };

      const currentAttempt = await db('quiz_attempts')
        .where({ quiz_id: quizId, student_id: studentId })
        .first();

      if (currentAttempt) {
        return updateAndReturn(db, 'quiz_attempts', { id: currentAttempt.id }, payload);
      }

      return insertAndReturn(db, 'quiz_attempts', {
        quiz_id: quizId,
        student_id: studentId,
        ...payload,
      });
    } else {
      // File-based exam (e.g. PDF questions paper)
      const diagnostic = {
        is_file_exam: true,
        submitted_answers: answers,
        student_files: files,
        student_note: note,
        auto_submitted: autoSubmitted,
        submitted_at: new Date().toISOString(),
      };

      const payload = {
        answers: JSON.stringify(diagnostic),
        score: 0,
        total_points: 20,
        completed_at: new Date().toISOString(),
      };

      const currentAttempt = await db('quiz_attempts')
        .where({ quiz_id: quizId, student_id: studentId })
        .first();

      if (currentAttempt) {
        return updateAndReturn(db, 'quiz_attempts', { id: currentAttempt.id }, payload);
      }

      return insertAndReturn(db, 'quiz_attempts', {
        quiz_id: quizId,
        student_id: studentId,
        ...payload,
      });
    }
  }
}

module.exports = new QuizService();
