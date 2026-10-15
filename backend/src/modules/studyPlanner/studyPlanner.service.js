const db = require('../../config/database');
const { insertAndReturn, updateAndReturn } = require('../../utils/dbHelpers');
const { v4: uuidv4 } = require('uuid');

class StudyPlannerService {
  async ensureTeacherPlansTable() {
    const hasTable = await db.schema.hasTable('teacher_lesson_plans');
    if (!hasTable) {
      await db.schema.createTable('teacher_lesson_plans', (t) => {
        t.string('id', 36).primary();
        t.string('teacher_id', 36).notNullable();
        t.string('grade').notNullable(); // پایه دهم، یازدهم، دوازدهم و...
        t.integer('day_of_week').notNullable(); // 0 to 5
        t.integer('period_number').notNullable(); // 1 to 5
        t.string('start_time', 10).defaultTo('08:00');
        t.string('end_time', 10).defaultTo('09:30');
        t.string('subject').notNullable();
        t.string('class_name').defaultTo('کلاس اصلی');
        t.string('topic').defaultTo('');
        t.string('session_type').defaultTo('teaching'); // teaching, practice, quiz, lab, review
        t.string('room').defaultTo('کلاس اصلی');
        t.string('status').defaultTo('upcoming'); // upcoming, completed, in_progress, cancelled
        t.text('notes').defaultTo('');
        t.timestamp('created_at').defaultTo(db.fn.now());
      });

      const defaultPlans = [
        {
          id: uuidv4(),
          teacher_id: 'default',
          grade: 'پایه دهم ریاضی',
          day_of_week: 0, // شنبه
          period_number: 1,
          start_time: '07:45',
          end_time: '09:15',
          subject: 'ریاضی ۱ و هندسه',
          class_name: 'کلاس ۱۰۱ (شهید بهشتی)',
          topic: 'فصل دوم: توان‌های گویا و عبارت‌های جبری',
          session_type: 'teaching',
          room: 'کلاس ۱۰۱',
          status: 'completed',
          notes: 'حل تمرین‌های صفحه ۳۴ تا ۳۸ کتاب درسی',
        },
        {
          id: uuidv4(),
          teacher_id: 'default',
          grade: 'پایه یازدهم تجربی',
          day_of_week: 0, // شنبه
          period_number: 2,
          start_time: '09:30',
          end_time: '11:00',
          subject: 'زیست‌شناسی ۲',
          class_name: 'کلاس ۲۰۱ (علامه حلی)',
          topic: 'گفتار دوم: دستگاه عصبی محیطی و انعکاس‌ها',
          session_type: 'practice',
          room: 'آزمایشگاه زیست‌شناسی',
          status: 'upcoming',
          notes: 'آزمون تشریحی کوتاه ۵ نمره‌ای ابتدای جلسه',
        },
        {
          id: uuidv4(),
          teacher_id: 'default',
          grade: 'پایه دوازدهم ریاضی',
          day_of_week: 1, // یکشنبه
          period_number: 1,
          start_time: '07:45',
          end_time: '09:15',
          subject: 'حسابان ۲ و کاربرد مشتق',
          class_name: 'کلاس ۳۰۱ (خوارزمی)',
          topic: 'اکسترمم‌های نسبی و مطلق و نقاط عطف تابع',
          session_type: 'teaching',
          room: 'کلاس ۳۰۱',
          status: 'upcoming',
          notes: 'تست‌های جامع سنجش و کانون فرهنگی آموزش',
        },
        {
          id: uuidv4(),
          teacher_id: 'default',
          grade: 'پایه دهم تجربی',
          day_of_week: 1, // یکشنبه
          period_number: 3,
          start_time: '11:15',
          end_time: '12:45',
          subject: 'فیزیک ۱',
          class_name: 'کلاس ۱۰۲',
          topic: 'فصل ۳: کار، انرژی پتانسیل و پایستگی انرژی مکانیکی',
          session_type: 'lab',
          room: 'آزمایشگاه مرکزی فیزیک',
          status: 'upcoming',
          notes: 'آزمایش عملی برخورد کشسان گلوله‌ها',
        },
        {
          id: uuidv4(),
          teacher_id: 'default',
          grade: 'پایه یازدهم ریاضی',
          day_of_week: 2, // دوشنبه
          period_number: 2,
          start_time: '09:30',
          end_time: '11:00',
          subject: 'هندسه ۲',
          class_name: 'کلاس ۲۰۲',
          topic: 'دایره، زاویه‌های محاطی و ظلی و مماس بر دایره',
          session_type: 'teaching',
          room: 'کلاس ۲۰۲',
          status: 'upcoming',
          notes: 'اثبات قضایای هندسی مهم امتحان نهایی',
        },
        {
          id: uuidv4(),
          teacher_id: 'default',
          grade: 'پایه دهم ریاضی',
          day_of_week: 3, // سه‌شنبه
          period_number: 1,
          start_time: '07:45',
          end_time: '09:15',
          subject: 'شیمی ۱',
          class_name: 'کلاس ۱۰۱',
          topic: 'آرایش الکترونی و پیوند‌های یونی و کووالانسی',
          session_type: 'quiz',
          room: 'کلاس ۱۰۱',
          status: 'upcoming',
          notes: 'کوئیز تستی و تحلیل تست‌های چالشی سنجش',
        },
        {
          id: uuidv4(),
          teacher_id: 'default',
          grade: 'پایه دوازدهم تجربی',
          day_of_week: 4, // چهارشنبه
          period_number: 2,
          start_time: '09:30',
          end_time: '11:00',
          subject: 'فیزیک ۳',
          class_name: 'کلاس ۳۰۲',
          topic: 'فصل نوسان و امواج: تداخل و بازتاب موج',
          session_type: 'teaching',
          room: 'کلاس ۳۰۲',
          status: 'upcoming',
          notes: 'تحلیل تست‌های کنکور سراسری ۱۴۰۲ و ۱۴۰۳',
        },
      ];

      for (const p of defaultPlans) {
        await db('teacher_lesson_plans').insert(p);
      }
    }
  }

  async getTeacherPlans(teacherId) {
    await this.ensureTeacherPlansTable();
    const plans = await db('teacher_lesson_plans')
      .where(function () {
        this.where('teacher_id', teacherId).orWhere('teacher_id', 'default');
      })
      .orderBy([
        { column: 'day_of_week', order: 'asc' },
        { column: 'period_number', order: 'asc' },
      ]);
    return plans;
  }

  async createTeacherPlan(teacherId, data) {
    await this.ensureTeacherPlansTable();
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

  async updateTeacherPlan(teacherId, planId, data) {
    await this.ensureTeacherPlansTable();
    const updated = await updateAndReturn(db, 'teacher_lesson_plans', { id: planId }, data);
    return updated;
  }

  async deleteTeacherPlan(teacherId, planId) {
    await this.ensureTeacherPlansTable();
    await db('teacher_lesson_plans').where({ id: planId }).del();
    return true;
  }

  async ensureTeacherDocumentsTable() {
    const hasTable = await db.schema.hasTable('teacher_documents');
    if (!hasTable) {
      await db.schema.createTable('teacher_documents', (t) => {
        t.string('id', 36).primary();
        t.string('teacher_id', 36).notNullable();
        t.string('title').notNullable();
        t.string('category').defaultTo('lesson_plan'); // lesson_plan, content_calendar, syllabus, guide
        t.string('grade').defaultTo('عمومی');
        t.string('subject').defaultTo('');
        t.text('file_url').notNullable();
        t.string('file_name').defaultTo('');
        t.string('original_name').defaultTo('');
        t.integer('file_size').defaultTo(0);
        t.string('file_type').defaultTo('pdf');
        t.string('academic_term').defaultTo('سال تحصیلی ۱۴۰۵-۱۴۰۴');
        t.text('description').defaultTo('');
        t.timestamp('created_at').defaultTo(db.fn.now());
      });

      const defaultDocs = [
        {
          id: uuidv4(),
          teacher_id: 'default',
          title: 'طرح درس جامع سالانه و بودجه‌بندی تدریس حسابان ۲',
          category: 'lesson_plan',
          grade: 'پایه دوازدهم ریاضی',
          subject: 'حسابان ۲',
          file_url: '/uploads/sample_tarh_dars_hesaban.pdf',
          file_name: 'tarh_hesaban_1404.pdf',
          original_name: 'Tarh-Dars-Hesaban-1404.pdf',
          file_size: 1420000,
          file_type: 'pdf',
          academic_term: 'سال تحصیلی ۱۴۰۵-۱۴۰۴',
          description: 'طرح درس مصوب سالانه شامل سرفصل‌های تدریس هفتگی، بودجه‌بندی کنکوری و امتحانات نهایی',
        },
        {
          id: uuidv4(),
          teacher_id: 'default',
          title: 'تقویم محتوایی و زمان‌بندی آموزش ترم اول - ریاضی ۱ و هندسه',
          category: 'content_calendar',
          grade: 'پایه دهم ریاضی',
          subject: 'ریاضی ۱ و هندسه',
          file_url: '/uploads/sample_taghvim_mohtava_riazi.xlsx',
          file_name: 'content_calendar_riazi1.xlsx',
          original_name: 'Content-Calendar-Riazi1-Term1.xlsx',
          file_size: 850000,
          file_type: 'excel',
          academic_term: 'نیم‌سال اول ۱۴۰۴-۱۴۰۵',
          description: 'جدول زمان‌بندی هفتگی تدریس، تکالیف تشریحی و تاریخ آزمون‌های میان‌ترم و ارزشیابی مستمر',
        },
        {
          id: uuidv4(),
          teacher_id: 'default',
          title: 'سناریوی تدریس و طرح درس روزانه: گفتار دوم دستگاه عصبی',
          category: 'lesson_plan',
          grade: 'پایه یازدهم تجربی',
          subject: 'زیست‌شناسی ۲',
          file_url: '/uploads/sample_daily_plan.docx',
          file_name: 'daily_plan_zist2.docx',
          original_name: 'Daily-Plan-Biology2-Nervous.docx',
          file_size: 520000,
          file_type: 'word',
          academic_term: 'نیم‌سال اول ۱۴۰۴-۱۴۰۵',
          description: 'سناریوی یادگیری کلاسی، پروتکل کار آزمایشگاهی و کوییز آغاز جلسه',
        },
      ];

      for (const doc of defaultDocs) {
        await db('teacher_documents').insert(doc);
      }
    }
  }

  async getTeacherDocuments(teacherId) {
    await this.ensureTeacherDocumentsTable();
    const docs = await db('teacher_documents')
      .where(function () {
        this.where('teacher_id', teacherId).orWhere('teacher_id', 'default');
      })
      .orderBy('created_at', 'desc');
    return docs;
  }

  async createTeacherDocument(teacherId, data) {
    await this.ensureTeacherDocumentsTable();
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
      file_url: file_url,
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

  async deleteTeacherDocument(teacherId, docId) {
    await this.ensureTeacherDocumentsTable();
    await db('teacher_documents').where({ id: docId }).del();
    return true;
  }
  async getLogs(userId, role, targetStudentId) {
    const studentId = (role === 'teacher' && targetStudentId) ? targetStudentId : userId;
    const logs = await db('study_logs')
      .join('users as student', 'student.id', 'study_logs.student_id')
      .leftJoin('users as advisor', 'advisor.id', 'study_logs.advisor_id')
      .where('study_logs.student_id', studentId)
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

  async addAdvisorFeedback(advisorId, logId, { advisor_feedback }) {
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

  async getStats(userId, role, targetStudentId) {
    const studentId = (role === 'teacher' && targetStudentId) ? targetStudentId : userId;
    const logs = await db('study_logs').where({ student_id: studentId });

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

  async ensureStudentNotesTable() {
    const hasTable = await db.schema.hasTable('student_study_notes');
    if (!hasTable) {
      await db.schema.createTable('student_study_notes', (t) => {
        t.string('id', 36).primary();
        t.string('student_id', 36).notNullable();
        t.string('title').defaultTo('');
        t.text('content').notNullable();
        t.string('color', 20).defaultTo('yellow'); // yellow, blue, green, purple, pink
        t.boolean('is_pinned').defaultTo(false);
        t.boolean('is_completed').defaultTo(false);
        t.string('category', 50).defaultTo('general'); // general, homework, exam, reminder
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.timestamp('updated_at').defaultTo(db.fn.now());
      });
    } else {
      const hasCompletedCol = await db.schema.hasColumn('student_study_notes', 'is_completed');
      if (!hasCompletedCol) {
        await db.schema.table('student_study_notes', (t) => {
          t.boolean('is_completed').defaultTo(false);
        });
      }
    }
  }

  async getStudentNotes(studentId) {
    await this.ensureStudentNotesTable();
    const notes = await db('student_study_notes')
      .where({ student_id: studentId })
      .orderBy('is_pinned', 'desc')
      .orderBy('created_at', 'desc');
    return notes;
  }

  async createStudentNote(studentId, { title, content, color, is_pinned, is_completed, category }) {
    await this.ensureStudentNotesTable();
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
    await this.ensureStudentNotesTable();
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

    return await db('student_study_notes').where({ id: noteId }).first();
  }

  async deleteStudentNote(studentId, noteId) {
    await this.ensureStudentNotesTable();
    await db('student_study_notes')
      .where({ id: noteId, student_id: studentId })
      .del();
    return true;
  }
}

module.exports = new StudyPlannerService();
