const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const {
  authenticate,
  authorize,
  assertSameSchool,
  assertOwnsClass,
  assertTeacherOfStudent,
} = require('../../middleware/auth');
const { logAudit } = require('../../utils/auditLogger');
const { cache } = require('../../utils/cache');
const {
  rankStudentSuggestions,
  validateManualClassPayload,
} = require('../../utils/gradebookClassHelper');
const { buildRosterGroupSnapshot } = require('../../utils/classRosterHelper');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

/**
 * GET /api/v1/gradebook/students/search
 * Live DB student autocomplete strictly scoped to the teacher's school.
 */
router.get('/students/search', authorize('teacher', 'admin', 'manager'), async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(30, Math.max(5, parseInt(req.query.limit, 10) || 15));

    if (!req.user.school_id) {
      return res.json({ success: true, data: { students: [] } });
    }

    const rows = await db('users')
      .leftJoin('students', 'students.user_id', 'users.id')
      .where({
        'users.role': 'student',
        'users.school_id': req.user.school_id,
        'users.is_active': true,
      })
      .select(
        'users.id',
        'users.display_name',
        'users.username',
        'users.student_code',
        'users.phone',
        'students.grade',
        'students.major',
        'students.education_level'
      );

    const suggestions = rankStudentSuggestions(rows, q, limit);

    res.json({
      success: true,
      data: {
        students: suggestions,
        total_school_students: rows.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/gradebook/classes-with-scores
 * Creates a new class in DB, enrolls verified DB students (linking teacher <-> student),
 * creates the evaluation category, and persists initial scores atomically so every student
 * sees the grades immediately in their own «کارنامه‌ها» panel.
 */
router.post('/classes-with-scores', authorize('teacher', 'admin', 'manager'), async (req, res, next) => {
  try {
    const validation = validateManualClassPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    const { name, grade, subject, category_title, max_score, entries } = validation.data;

    if (!req.user.school_id) {
      return res.status(400).json({ success: false, message: 'حساب کاربری شما به هیچ مدرسه‌ای متصل نیست' });
    }

    // Verify every selected student exists in DB and belongs to the teacher's exact school
    const requestedStudentIds = entries.map((e) => e.student_id);
    let verifiedStudents = [];
    if (requestedStudentIds.length > 0) {
      verifiedStudents = await db('users')
        .leftJoin('students', 'students.user_id', 'users.id')
        .whereIn('users.id', requestedStudentIds)
        .andWhere({
          'users.role': 'student',
          'users.school_id': req.user.school_id,
        })
        .select(
          'users.id',
          'users.display_name',
          'users.username',
          'users.student_code',
          'students.grade',
          'students.major'
        );

      if (verifiedStudents.length !== requestedStudentIds.length) {
        return res.status(403).json({
          success: false,
          message: 'یک یا چند دانش‌آموز انتخاب‌شده در دیتابیس مدرسه شما یافت نشد',
        });
      }
    }

    const classId = uuidv4();
    const categoryId = uuidv4();
    const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const nowIso = new Date().toISOString();

    const classRow = {
      id: classId,
      school_id: req.user.school_id,
      teacher_id: req.user.id,
      name,
      subject,
      grade,
      join_code: joinCode,
      is_active: true,
    };

    const categoryRow = {
      id: categoryId,
      class_id: classId,
      title: category_title,
      weight: 1.0,
      max_score,
      term: 'term1',
    };

    let scoresSaved = 0;
    const hasLinksTable = await db.schema.hasTable('student_teacher_links');
    const hasRosterGroupsTable = await db.schema.hasTable('class_roster_groups');

    await db.transaction(async (trx) => {
      await trx('classes').insert(classRow);

      // Enroll teacher as class owner
      await trx('class_members').insert({
        id: uuidv4(),
        class_id: classId,
        user_id: req.user.id,
        role: 'teacher',
      });

      // Create evaluation category
      await trx('gradebook_categories').insert(categoryRow);

      // Enroll verified students & persist scores
      for (const entry of entries) {
        await trx('class_members').insert({
          id: uuidv4(),
          class_id: classId,
          user_id: entry.student_id,
          role: 'student',
        });

        // Link student <-> teacher if table exists
        if (hasLinksTable) {
          const existingLink = await trx('student_teacher_links')
            .where({ student_user_id: entry.student_id, teacher_user_id: req.user.id })
            .first();
          if (!existingLink) {
            await trx('student_teacher_links').insert({
              id: uuidv4(),
              school_id: req.user.school_id,
              student_user_id: entry.student_id,
              teacher_user_id: req.user.id,
              class_id: classId,
              grade,
              created_at: nowIso,
              updated_at: nowIso,
            });
          }
        }

        if (entry.score !== null && entry.score !== undefined) {
          await trx('gradebook_scores').insert({
            id: uuidv4(),
            category_id: categoryId,
            student_id: entry.student_id,
            score: entry.score,
            teacher_comment: entry.teacher_comment || '',
            graded_at: nowIso,
          });
          scoresSaved += 1;
        }
      }

      // Sync persisted class roster group snapshot
      if (hasRosterGroupsTable) {
        const snapshot = buildRosterGroupSnapshot(classRow, verifiedStudents);
        await trx('class_roster_groups').insert({
          id: uuidv4(),
          ...snapshot,
          created_at: nowIso,
          updated_at: nowIso,
        });
      }
    });

    try {
      cache.delBySchool(req.user.school_id);
    } catch (_e) {}

    await logAudit(req, 'CREATE_CLASS_WITH_GRADEBOOK_SCORES', 'class', classId, {
      name,
      grade,
      subject,
      enrolled_count: entries.length,
      scores_saved: scoresSaved,
    });

    res.status(201).json({
      success: true,
      message: `کلاس «${name}» با ${entries.length} دانش‌آموز و ${scoresSaved} نمره با موفقیت ثبت شد`,
      data: {
        class: {
          ...classRow,
          teacher_name: req.user.display_name,
          student_count: entries.length,
        },
        category: categoryRow,
        enrolled_count: entries.length,
        scores_saved: scoresSaved,
      },
    });
  } catch (err) {
    next(err);
  }
});

const parsePersianScore = (val) => {
  if (val === null || val === undefined || val === '') return null;
  const str = String(val)
    .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
    .replace(/[/,،]/g, '.')
    .trim();
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
};

/**
 * GET /api/v1/gradebook/classes/:classId
 * Returns all categories, enrolled students, and the scores matrix with weighted averages
 */
router.get('/classes/:classId', async (req, res, next) => {
  try {
    const { classId } = req.params;

    // Verify class exists, belongs to caller's school, and caller owns or is enrolled in it
    const cls = await assertOwnsClass(req.user, classId, { allowEnrolled: true });

    let categories = await db('gradebook_categories')
      .where('class_id', classId)
      .orderBy('created_at', 'asc');

    if (categories.length === 0 && (req.user.role === 'teacher' || req.user.role === 'admin' || req.user.role === 'manager')) {
      const defaultCats = [
        { id: uuidv4(), class_id: classId, title: 'ارزشیابی مستمر کلاسی', weight: 1.0, max_score: 20.0, term: 'term1' },
        { id: uuidv4(), class_id: classId, title: 'آزمون میان‌ترم', weight: 1.0, max_score: 20.0, term: 'term1' },
        { id: uuidv4(), class_id: classId, title: 'امتحان نوبت اول', weight: 1.0, max_score: 20.0, term: 'term1' },
      ];
      try {
        await db('gradebook_categories').insert(defaultCats);
      } catch (e) {}
      categories = await db('gradebook_categories')
        .where('class_id', classId)
        .orderBy('created_at', 'asc');
    }

    // Fetch strictly the students enrolled in this class (never auto-enroll all students in DB — finding A26)
    let studentsQuery = db('class_members')
      .join('users', 'users.id', 'class_members.user_id')
      .where({ 'class_members.class_id': classId, 'class_members.role': 'student' });

    if (req.user.role === 'student') {
      studentsQuery = studentsQuery.andWhere('users.id', req.user.id);
    }

    const students = await studentsQuery
      .select('users.id', 'users.display_name', 'users.student_code', 'users.email')
      .orderBy('users.display_name', 'asc');

    const categoryIds = categories.map((c) => c.id);
    let scores = [];
    if (categoryIds.length > 0) {
      scores = await db('gradebook_scores')
        .whereIn('category_id', categoryIds);
    }

    const scoreMap = {};
    for (const s of scores) {
      if (!scoreMap[s.student_id]) scoreMap[s.student_id] = {};
      scoreMap[s.student_id][s.category_id] = {
        score: s.score,
        comment: s.teacher_comment,
      };
    }

    const studentMatrix = students.map((st) => {
      const studentScores = scoreMap[st.id] || {};
      let totalWeight = 0;
      let weightedSum = 0;

      for (const cat of categories) {
        if (studentScores[cat.id] && studentScores[cat.id].score != null) {
          const score = studentScores[cat.id].score;
          weightedSum += score * (cat.weight || 1.0);
          totalWeight += (cat.weight || 1.0);
        }
      }

      const weightedAverage = totalWeight > 0 ? (weightedSum / totalWeight).toFixed(2) : null;

      return {
        ...st,
        scores: studentScores,
        weightedAverage: weightedAverage ? parseFloat(weightedAverage) : null,
      };
    });

    res.json({
      success: true,
      data: {
        class: cls,
        categories,
        students: studentMatrix,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/gradebook/categories
 * Creates an evaluation category with weight (defaults to 1.0)
 */
router.post('/categories', authorize('teacher', 'admin', 'manager'), async (req, res, next) => {
  try {
    const { class_id, title, weight, max_score, term } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'عنوان آزمون الزامی است' });
    }
    if (!class_id) {
      return res.status(400).json({ success: false, message: 'شناسه کلاس الزامی است' });
    }

    await assertOwnsClass(req.user, class_id);

    const parsedWeight = parseFloat(weight);
    const parsedMax = parseFloat(max_score);
    const id = uuidv4();
    const newCat = {
      id,
      class_id,
      title: title.trim(),
      weight: !isNaN(parsedWeight) && parsedWeight > 0 ? parsedWeight : 1.0,
      max_score: !isNaN(parsedMax) && parsedMax > 0 ? parsedMax : 20.0,
      term: term || 'term1',
    };

    await db('gradebook_categories').insert(newCat);
    await logAudit(req, 'CREATE_GRADEBOOK_CATEGORY', 'gradebook_category', id, newCat);

    res.status(201).json({ success: true, message: 'آیتم ارزشیابی با موفقیت ثبت شد', data: { category: newCat } });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/gradebook/categories/:id
 * Deletes an evaluation category and its scores
 */
router.delete('/categories/:id', authorize('teacher', 'admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const category = await db('gradebook_categories').where('id', id).first();
    if (!category) {
      return res.status(404).json({ success: false, message: 'آیتم ارزشیابی یافت نشد' });
    }

    await assertOwnsClass(req.user, category.class_id);

    await db('gradebook_scores').where('category_id', id).del();
    await db('gradebook_categories').where('id', id).del();
    await logAudit(req, 'DELETE_GRADEBOOK_CATEGORY', 'gradebook_category', id, { class_id: category.class_id, title: category.title });

    res.json({ success: true, message: 'آیتم ارزشیابی با موفقیت حذف شد' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/gradebook/scores
 * Upserts or deletes a score for a student in a category with Persian digit support
 */
router.post('/scores', authorize('teacher', 'admin', 'manager'), async (req, res, next) => {
  try {
    const { category_id, student_id, score, teacher_comment } = req.body;
    if (!category_id || !student_id) {
      return res.status(400).json({ success: false, message: 'شناسه دانش‌آموز و آزمون الزامی است' });
    }

    const category = await db('gradebook_categories').where({ id: category_id }).first();
    if (!category) {
      return res.status(404).json({ success: false, message: 'آیتم ارزشیابی یافت نشد' });
    }

    await assertOwnsClass(req.user, category.class_id);
    await assertTeacherOfStudent(req.user, student_id);

    // Handle score clearance/deletion
    if (score === '' || score === null || score === undefined) {
      await db('gradebook_scores')
        .where({ category_id, student_id })
        .del();
      await logAudit(req, 'DELETE_GRADEBOOK_SCORE', 'gradebook_score', `${category_id}:${student_id}`, { category_id, student_id });
      return res.json({ success: true, message: 'نمره با موفقیت حذف شد' });
    }

    const maxScore = category.max_score || 20;
    const numericScore = parsePersianScore(score);
    if (numericScore === null || numericScore < 0 || numericScore > maxScore) {
      return res.status(400).json({ success: false, message: `نمره باید عددی بین ۰ تا ${maxScore} باشد` });
    }

    const existing = await db('gradebook_scores')
      .where({ category_id, student_id })
      .first();

    if (existing) {
      await db('gradebook_scores')
        .where('id', existing.id)
        .update({
          score: numericScore,
          teacher_comment: teacher_comment || '',
          graded_at: new Date().toISOString(),
        });
    } else {
      await db('gradebook_scores').insert({
        id: uuidv4(),
        category_id,
        student_id,
        score: numericScore,
        teacher_comment: teacher_comment || '',
      });
    }

    await logAudit(req, 'UPSERT_GRADEBOOK_SCORE', 'gradebook_score', `${category_id}:${student_id}`, {
      category_id,
      student_id,
      score: numericScore,
      previous_score: existing ? existing.score : null,
    });

    res.json({ success: true, message: 'نمره با موفقیت ذخیره شد', data: { score: numericScore } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/gradebook/scores/batch
 * Batch saves multiple scores in a single request
 */
router.post('/scores/batch', authorize('teacher', 'admin', 'manager'), async (req, res, next) => {
  try {
    const { scores } = req.body;
    if (!Array.isArray(scores)) {
      return res.status(400).json({ success: false, message: 'لیست نمرات نامعتبر است' });
    }

    for (const item of scores) {
      const { category_id, student_id } = item;
      if (!category_id || !student_id) continue;
      const category = await db('gradebook_categories').where({ id: category_id }).first();
      if (!category) {
        return res.status(404).json({ success: false, message: 'آیتم ارزشیابی یافت نشد' });
      }
      await assertOwnsClass(req.user, category.class_id);
      await assertTeacherOfStudent(req.user, student_id);
      item._maxScore = category.max_score || 20;
    }

    await db.transaction(async (trx) => {
      for (const item of scores) {
        const { category_id, student_id, score, teacher_comment, _maxScore } = item;
        if (!category_id || !student_id) continue;

        if (score === '' || score === null || score === undefined) {
          await trx('gradebook_scores').where({ category_id, student_id }).del();
          continue;
        }

        const maxScore = _maxScore || 20;
        const numericScore = parsePersianScore(score);
        if (numericScore === null || numericScore < 0 || numericScore > maxScore) continue;

        const existing = await trx('gradebook_scores').where({ category_id, student_id }).first();
        if (existing) {
          await trx('gradebook_scores').where('id', existing.id).update({
            score: numericScore,
            teacher_comment: teacher_comment || '',
            graded_at: new Date().toISOString(),
          });
        } else {
          await trx('gradebook_scores').insert({
            id: uuidv4(),
            category_id,
            student_id,
            score: numericScore,
            teacher_comment: teacher_comment || '',
          });
        }
      }
    });

    await logAudit(req, 'BATCH_UPSERT_GRADEBOOK_SCORES', 'gradebook_score', req.user.id, { count: scores.length });
    res.json({ success: true, message: 'تمام نمرات با موفقیت ذخیره شدند ✓' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/gradebook/shared-reports
 * Teacher shares class gradebook & statistics with school management
 */
router.post('/shared-reports', authorize('teacher', 'admin', 'manager'), async (req, res, next) => {
  try {
    const {
      class_id,
      class_name,
      subject,
      grade,
      students_count,
      class_average,
      top_score,
      pass_rate,
      categories,
      failing_students,
      students,
      teacher_note,
    } = req.body;

    if (class_id) {
      await assertOwnsClass(req.user, class_id);
    }

    const currentTeacherName = req.user?.display_name || 'دبیر محترم';
    const currentTeacherCode = req.user?.personnel_code || 'TCH-101';
    const reportId = `gb-${Date.now()}`;
    const now = new Date();

    const reportRow = {
      id: reportId,
      class_id: class_id || null,
      teacher_id: req.user.id,
      teacher_name: currentTeacherName,
      teacher_code: currentTeacherCode,
      class_name: class_name || 'کلاس انتخابی',
      subject: subject || 'عمومی',
      grade: grade || 'پایه دهم',
      date: now.toLocaleDateString('fa-IR'),
      time: now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      students_count: parseInt(students_count, 10) || 0,
      class_average: parseFloat(class_average) || 0,
      top_score: parseFloat(top_score) || 0,
      pass_rate: parseFloat(pass_rate) || 0,
      categories: typeof categories === 'string' ? categories : JSON.stringify(categories || []),
      failing_students: typeof failing_students === 'string' ? failing_students : JSON.stringify(failing_students || []),
      students: typeof students === 'string' ? students : JSON.stringify(students || []),
      teacher_note: (teacher_note || '').trim() || 'کارنامه و لیست نمرات کلاس توسط دبیر تایید و برای دفتر مدیریت ارسال شد.',
      status: 'submitted',
      created_at: now.toISOString(),
    };

    await db('gradebook_shared_reports').insert(reportRow);

    // Send notifications only to admins and managers of the same school
    let adminQuery = db('users').whereIn('role', ['admin', 'manager']);
    if (req.user.school_id) {
      adminQuery = adminQuery.andWhere({ school_id: req.user.school_id });
    } else {
      adminQuery = adminQuery.whereRaw('1 = 0');
    }
    const adminUsers = await adminQuery.select('id');

    for (const adm of adminUsers) {
      try {
        await db('notifications').insert({
          id: uuidv4(),
          user_id: adm.id,
          type: 'academic',
          title: `📊 کارنامه و لیست نمرات: ${reportRow.class_name}`,
          body: `دبیر محترم ${reportRow.teacher_name} لیست نمرات کلاس ${reportRow.class_name} را با میانگین ${reportRow.class_average} برای مدیریت ارسال کرد.`,
          data: JSON.stringify({
            report_id: reportId,
            class_id: reportRow.class_id,
            teacher_name: reportRow.teacher_name,
            class_name: reportRow.class_name,
            average: reportRow.class_average,
            pass_rate: reportRow.pass_rate,
          }),
          is_read: false,
          created_at: now.toISOString(),
        });
      } catch (e) {}
    }

    const parsedReport = {
      ...reportRow,
      categories: JSON.parse(reportRow.categories || '[]'),
      failing_students: JSON.parse(reportRow.failing_students || '[]'),
      students: JSON.parse(reportRow.students || '[]'),
    };

    res.status(201).json({
      success: true,
      message: `لیست نمرات کلاس «${reportRow.class_name}» با موفقیت برای مدیریت ارسال شد`,
      data: { report: parsedReport },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/gradebook/shared-reports
 * Fetches shared gradebook reports scoped to the caller's school
 */
router.get('/shared-reports', authorize('teacher', 'admin', 'manager'), async (req, res, next) => {
  try {
    let query = db('gradebook_shared_reports')
      .join('users as author', 'author.id', 'gradebook_shared_reports.teacher_id')
      .where('author.school_id', req.user.school_id)
      .select('gradebook_shared_reports.*')
      .orderBy('gradebook_shared_reports.created_at', 'desc');

    if (req.user.role === 'teacher') {
      query = query.andWhere('gradebook_shared_reports.teacher_id', req.user.id);
    }

    const rows = await query;
    const reports = rows.map((r) => {
      let cats = [];
      let failing = [];
      let sts = [];
      try { cats = typeof r.categories === 'string' ? JSON.parse(r.categories) : r.categories; } catch (e) {}
      try { failing = typeof r.failing_students === 'string' ? JSON.parse(r.failing_students) : r.failing_students; } catch (e) {}
      try { sts = typeof r.students === 'string' ? JSON.parse(r.students) : r.students; } catch (e) {}
      return {
        ...r,
        categories: cats || [],
        failing_students: failing || [],
        students: sts || [],
      };
    });

    res.json({
      success: true,
      data: { reports },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/gradebook/shared-reports/:id/acknowledge
 * Management approves / acknowledges a shared gradebook report
 */
router.put('/shared-reports/:id/acknowledge', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const report = await db('gradebook_shared_reports').where({ id }).first();
    if (!report) {
      return res.status(404).json({ success: false, message: 'گزارش کارنامه یافت نشد' });
    }

    const reportAuthor = report.teacher_id
      ? await db('users').where({ id: report.teacher_id }).first()
      : null;
    assertSameSchool(req.user, reportAuthor || { school_id: null });

    const now = new Date().toISOString();
    await db('gradebook_shared_reports').where({ id }).update({
      status: 'acknowledged',
      acknowledged_at: now,
    });

    if (report.teacher_id) {
      try {
        await db('notifications').insert({
          id: uuidv4(),
          user_id: report.teacher_id,
          type: 'academic',
          title: `✓ رویت و تایید کارنامه: ${report.class_name}`,
          body: `مدیریت مدرسه گزارش و کارنامه کلاسی «${report.class_name}» را رویت و مورد تایید قرار داد.`,
          data: JSON.stringify({ report_id: id }),
          is_read: false,
          created_at: now,
        });
      } catch (e) {}
    }

    res.json({
      success: true,
      message: 'رویت و تایید کارنامه کلاسی توسط مدیریت با موفقیت ثبت شد ✓',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/gradebook/report-card
 * GET /api/v1/gradebook/report-card/:studentId
 * Generates an official report card with all classes, weighted averages, and discipline summary
 */
async function handleGetReportCard(req, res, next) {
  try {
    let studentId = req.params.studentId || req.query.student_id;
    let availableChildren = [];

    if (req.user.role === 'student') {
      if (studentId && studentId !== 'me' && studentId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'دسترسی به کارنامه سایر دانش‌آموزان مجاز نیست',
        });
      }
      studentId = req.user.id;
    } else if (req.user.role === 'parent') {
      let children = await db('parent_student_links')
        .join('users', 'users.id', 'parent_student_links.student_id')
        .where({ 'parent_student_links.parent_id': req.user.id })
        .select('users.id', 'users.display_name', 'users.student_code', 'users.avatar_url', 'users.school_id', 'parent_student_links.relation');

      if (!children.length && req.user.student_code) {
        const child = await db('users')
          .where({ student_code: req.user.student_code, role: 'student', school_id: req.user.school_id })
          .first();
        if (child) {
          children = [{
            id: child.id,
            display_name: child.display_name,
            student_code: child.student_code,
            avatar_url: child.avatar_url,
            school_id: child.school_id,
            relation: 'فرزند',
          }];
        }
      }

      availableChildren = children;

      if (studentId && studentId !== 'me') {
        const isChildOfParent = children.some((c) => c.id === studentId);
        if (!isChildOfParent) {
          return res.status(403).json({ success: false, message: 'دسترسی به کارنامه این دانش‌آموز برای شما مجاز نیست' });
        }
      } else {
        if (!children.length) {
          return res.status(404).json({ success: false, message: 'هیچ پرونده دانش‌آموزی به حساب شما متصل نیست' });
        }
        studentId = children[0].id;
      }
    } else {
      // Admin, Manager or Teacher
      if (!studentId || studentId === 'me') {
        if (req.user.role === 'teacher') {
          const teacherClass = await db('classes')
            .where({ teacher_id: req.user.id, school_id: req.user.school_id })
            .first();

          if (teacherClass) {
            const firstStudent = await db('class_members')
              .where({ class_id: teacherClass.id, role: 'student' })
              .first();
            if (firstStudent) {
              studentId = firstStudent.user_id;
            }
          }
        }

        if (!studentId || studentId === 'me') {
          return res.status(400).json({ success: false, message: 'شناسه دانش‌آموز مشخص نشده است' });
        }
      }
    }

    let student;
    if (req.user.role === 'student' || req.user.role === 'parent') {
      student = await db('users').where({ id: studentId }).first();
      if (!student) {
        return res.status(404).json({ success: false, message: 'دانش‌آموز یافت نشد' });
      }
      assertSameSchool(req.user, student);
    } else {
      student = await assertTeacherOfStudent(req.user, studentId);
      assertSameSchool(req.user, student);
    }

    const classes = await db('class_members')
      .join('classes', 'classes.id', 'class_members.class_id')
      .leftJoin('users as teachers', 'teachers.id', 'classes.teacher_id')
      .where({
        'class_members.user_id': studentId,
        'class_members.role': 'student',
        'classes.school_id': student.school_id,
      })
      .select('classes.id', 'classes.name', 'classes.subject', 'classes.grade', 'teachers.display_name as teacher_name');

    const reportCards = [];
    let overallWeightedSum = 0;
    let overallCredits = 0;

    for (const c of classes) {
      const categories = await db('gradebook_categories').where('class_id', c.id);
      const categoryIds = categories.map((cat) => cat.id);

      let scores = [];
      if (categoryIds.length > 0) {
        scores = await db('gradebook_scores')
          .whereIn('category_id', categoryIds)
          .where('student_id', studentId);
      }

      const scoreLookup = {};
      scores.forEach((s) => { scoreLookup[s.category_id] = s.score; });

      let classWeightedSum = 0;
      let classWeightTotal = 0;
      const breakdowns = [];

      for (const cat of categories) {
        const sc = scoreLookup[cat.id];
        if (sc != null) {
          classWeightedSum += sc * cat.weight;
          classWeightTotal += cat.weight;
          breakdowns.push({ title: cat.title, weight: cat.weight, score: sc });
        }
      }

      const classFinalAverage = classWeightTotal > 0 ? (classWeightedSum / classWeightTotal).toFixed(2) : null;
      const credits = 3;

      if (classFinalAverage) {
        overallWeightedSum += parseFloat(classFinalAverage) * credits;
        overallCredits += credits;
      }

      reportCards.push({
        class_id: c.id,
        class_name: c.name,
        subject: c.subject,
        grade: c.grade,
        teacher_name: c.teacher_name,
        breakdowns,
        final_average: classFinalAverage ? parseFloat(classFinalAverage) : null,
        status: classFinalAverage && parseFloat(classFinalAverage) >= 12 ? 'قبول' : (classFinalAverage ? 'نیاز به تلاش' : 'نامشخص'),
      });
    }

    const disciplineRecords = await db('discipline_records').where('student_id', studentId);
    let disciplineScore = 20.0;
    for (const d of disciplineRecords) {
      disciplineScore += d.points;
    }
    disciplineScore = Math.max(0, Math.min(20, disciplineScore));

    const overallGPA = overallCredits > 0 ? (overallWeightedSum / overallCredits).toFixed(2) : null;
    const schoolRow = student.school_id
      ? await db('schools').where({ id: student.school_id }).select('name').first()
      : null;

    res.json({
      success: true,
      data: {
        student: {
          id: student.id,
          display_name: student.display_name,
          username: student.username || null,
          student_code: student.student_code || 'STD-140301',
          email: student.email,
          department: student.department || 'دوره دوم متوسطه',
        },
        availableChildren: req.user.role === 'parent' ? availableChildren : undefined,
        reportCards,
        summary: {
          overall_gpa: overallGPA ? parseFloat(overallGPA) : null,
          discipline_score: parseFloat(disciplineScore.toFixed(1)),
          academic_standing: overallGPA && parseFloat(overallGPA) >= 18 ? 'رتبه الف (ممتاز)' : (overallGPA && parseFloat(overallGPA) >= 15 ? 'رتبه ب (بسیار خوب)' : 'عادی'),
          total_courses: classes.length,
          passed_courses: reportCards.filter((r) => r.status === 'قبول').length,
          failed_courses: reportCards.filter((r) => r.status === 'نیاز به تلاش').length,
          term: 'نوبت اول (دی ماه ۱۴۰۳)',
          academic_year: 'سال تحصیلی ۱۴۰۳ - ۱۴۰۴',
          school_name: schoolRow?.name || 'مدرسه هوشمند',
          generated_at: new Date().toLocaleDateString('fa-IR'),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

router.get('/report-card', handleGetReportCard);
router.get('/report-card/:studentId', handleGetReportCard);

module.exports = router;
