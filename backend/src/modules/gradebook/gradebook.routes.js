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
  REPORT_CARD_STATUS_OPTIONS,
  POSITIVE_REPORT_STATUSES,
  NEGATIVE_REPORT_STATUSES,
  parseScoreValue,
  rankStudentSuggestions,
  validateManualClassPayload,
  getGradeSortOrder,
  sortClassesByGradeAscending,
  computeThreePartAverage,
  validateReportStatus,
  computeClassGradeStats,
} = require('../../utils/gradebookClassHelper');
const { buildRosterGroupSnapshot } = require('../../utils/classRosterHelper');
const { v4: uuidv4 } = require('uuid');

function matchThreePartCategoryKey(rawTitle) {
  const title = String(rawTitle || '').replace(/\s+/g, ' ').trim();
  if (!title) return null;
  if (title.includes('مستمر')) return 'continuous_score';
  if (title.includes('میانسال') || title.includes('میان‌ترم') || title.includes('میان ترم')) return 'midterm_score';
  if (title.includes('پایان') || title.includes('نوبت')) return 'final_score';
  return null;
}

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

/**
 * GET /api/v1/gradebook/classes-by-grade
 * Returns all classes owned by the teacher (or all school classes for admin/manager)
 * strictly ordered from smallest grade to largest grade, with each class's enrolled students,
 * 3-part scores (continuous, midterm, final), auto-calculated average, teacher-selected status,
 * and hierarchically linked parents.
 */
router.get('/classes-by-grade', authorize('teacher', 'admin', 'manager'), async (req, res, next) => {
  try {
    if (!req.user.school_id) {
      return res.json({
        success: true,
        data: {
          grade_groups: [],
          classes: [],
          status_options: REPORT_CARD_STATUS_OPTIONS,
          summary: { total_grades: 0, total_classes: 0, total_students: 0, graded_students: 0 },
        },
      });
    }

    let classesQuery = db('classes')
      .leftJoin('users as teachers', 'teachers.id', 'classes.teacher_id')
      .where({
        'classes.school_id': req.user.school_id,
        'classes.is_active': true,
      });

    if (req.user.role === 'teacher') {
      const memberClassRows = await db('class_members')
        .where({ user_id: req.user.id, role: 'teacher' })
        .select('class_id');
      const memberClassIds = memberClassRows.map((r) => r.class_id);

      classesQuery = classesQuery.andWhere(function () {
        this.where('classes.teacher_id', req.user.id);
        if (memberClassIds.length > 0) {
          this.orWhereIn('classes.id', memberClassIds);
        }
      });
    }

    const rawClasses = await classesQuery.select(
      'classes.id',
      'classes.school_id',
      'classes.teacher_id',
      'classes.name',
      'classes.subject',
      'classes.grade',
      'classes.join_code',
      'classes.created_at',
      'teachers.display_name as teacher_name'
    );

    const sortedClasses = sortClassesByGradeAscending(rawClasses);
    const classIds = sortedClasses.map((c) => c.id);

    if (classIds.length === 0) {
      return res.json({
        success: true,
        data: {
          grade_groups: [],
          classes: [],
          status_options: REPORT_CARD_STATUS_OPTIONS,
          summary: { total_grades: 0, total_classes: 0, total_students: 0, graded_students: 0 },
        },
      });
    }

    // Load all enrolled students strictly scoped to the same school
    const enrolledRows = await db('class_members')
      .join('users', 'users.id', 'class_members.user_id')
      .leftJoin('students', 'students.user_id', 'users.id')
      .whereIn('class_members.class_id', classIds)
      .andWhere({
        'class_members.role': 'student',
        'users.school_id': req.user.school_id,
      })
      .select(
        'class_members.class_id',
        'users.id',
        'users.display_name',
        'users.username',
        'users.student_code',
        'students.grade as student_grade',
        'students.major as student_major'
      )
      .orderBy('users.display_name', 'asc');

    const studentIds = [...new Set(enrolledRows.map((r) => r.id))];

    // Load hierarchically linked parents (from both `parents` and `parent_student_links`)
    const parentMapByStudent = {};
    if (studentIds.length > 0) {
      const hasParentsTable = await db.schema.hasTable('parents');
      if (hasParentsTable) {
        const parentRows = await db('parents')
          .whereIn('student_user_id', studentIds)
          .andWhere('school_id', req.user.school_id)
          .select('user_id', 'student_user_id', 'full_name', 'relation', 'username');

        for (const p of parentRows) {
          if (!parentMapByStudent[p.student_user_id]) parentMapByStudent[p.student_user_id] = [];
          if (!parentMapByStudent[p.student_user_id].some((x) => x.user_id === p.user_id)) {
            parentMapByStudent[p.student_user_id].push({
              user_id: p.user_id,
              full_name: p.full_name,
              relation: p.relation || 'ولی دانش‌آموز',
              username: p.username || null,
            });
          }
        }
      }

      const linkRows = await db('parent_student_links')
        .join('users as pu', 'pu.id', 'parent_student_links.parent_id')
        .whereIn('parent_student_links.student_id', studentIds)
        .andWhere('pu.school_id', req.user.school_id)
        .select(
          'pu.id as user_id',
          'parent_student_links.student_id as student_user_id',
          'pu.display_name as full_name',
          'parent_student_links.relation',
          'pu.username'
        );

      for (const p of linkRows) {
        if (!parentMapByStudent[p.student_user_id]) parentMapByStudent[p.student_user_id] = [];
        if (!parentMapByStudent[p.student_user_id].some((x) => x.user_id === p.user_id)) {
          parentMapByStudent[p.student_user_id].push({
            user_id: p.user_id,
            full_name: p.full_name,
            relation: p.relation || 'ولی دانش‌آموز',
            username: p.username || null,
          });
        }
      }
    }

    // Load saved structured report entries
    const hasEntriesTable = await db.schema.hasTable('student_report_entries');
    const entryLookup = {};
    if (hasEntriesTable) {
      const entryRows = await db('student_report_entries')
        .whereIn('class_id', classIds)
        .andWhere('school_id', req.user.school_id);

      for (const row of entryRows) {
        entryLookup[`${row.class_id}:${row.student_id}`] = row;
      }
    }

    // Load legacy gradebook categories + scores as fallback when no structured entry exists yet
    const categories = await db('gradebook_categories').whereIn('class_id', classIds);
    const catById = {};
    const catIds = [];
    for (const cat of categories) {
      catById[cat.id] = cat;
      catIds.push(cat.id);
    }

    const legacyScoreLookup = {};
    if (catIds.length > 0 && studentIds.length > 0) {
      const legacyScores = await db('gradebook_scores')
        .whereIn('category_id', catIds)
        .whereIn('student_id', studentIds);

      for (const sc of legacyScores) {
        const cat = catById[sc.category_id];
        if (!cat) continue;
        const partKey = matchThreePartCategoryKey(cat.title);
        if (!partKey) continue;
        const mapKey = `${cat.class_id}:${sc.student_id}`;
        if (!legacyScoreLookup[mapKey]) legacyScoreLookup[mapKey] = {};
        if (legacyScoreLookup[mapKey][partKey] === undefined) {
          legacyScoreLookup[mapKey][partKey] = sc.score != null ? Number(sc.score) : null;
        }
      }
    }

    // Group enrolled students by class
    const studentsByClass = {};
    for (const row of enrolledRows) {
      if (!studentsByClass[row.class_id]) studentsByClass[row.class_id] = [];
      const key = `${row.class_id}:${row.id}`;
      const saved = entryLookup[key];
      const legacy = legacyScoreLookup[key] || {};

      const continuousScore = saved
        ? (saved.continuous_score != null ? Number(saved.continuous_score) : null)
        : (legacy.continuous_score ?? null);
      const midtermScore = saved
        ? (saved.midterm_score != null ? Number(saved.midterm_score) : null)
        : (legacy.midterm_score ?? null);
      const finalScore = saved
        ? (saved.final_score != null ? Number(saved.final_score) : null)
        : (legacy.final_score ?? null);

      const computedAvg = computeThreePartAverage({
        continuous_score: continuousScore,
        midterm_score: midtermScore,
        final_score: finalScore,
      });

      const averageScore = saved && saved.average_score != null
        ? Number(saved.average_score)
        : computedAvg;

      studentsByClass[row.class_id].push({
        id: row.id,
        display_name: row.display_name,
        username: row.username || null,
        student_code: row.student_code || null,
        grade: row.student_grade || null,
        major: row.student_major || null,
        continuous_score: continuousScore,
        midterm_score: midtermScore,
        final_score: finalScore,
        average_score: averageScore,
        status: saved?.status || '',
        teacher_note: saved?.teacher_note || '',
        updated_at: saved?.updated_at || null,
        linked_parents: parentMapByStudent[row.id] || [],
      });
    }

    let totalStudentsCount = 0;
    let gradedStudentsCount = 0;
    const enrichedClasses = sortedClasses.map((cls) => {
      const classStudents = studentsByClass[cls.id] || [];
      totalStudentsCount += classStudents.length;
      gradedStudentsCount += classStudents.filter(
        (s) => s.average_score != null || Boolean(s.status)
      ).length;

      return {
        ...cls,
        grade_label: (cls.grade || '').trim() || 'عمومی',
        grade_rank: getGradeSortOrder(cls.grade),
        student_count: classStudents.length,
        students: classStudents,
      };
    });

    // Group strictly ascending by grade
    const groupMap = new Map();
    for (const cls of enrichedClasses) {
      const gKey = cls.grade_label;
      if (!groupMap.has(gKey)) {
        groupMap.set(gKey, {
          grade: gKey,
          grade_rank: cls.grade_rank,
          class_count: 0,
          student_count: 0,
          classes: [],
        });
      }
      const grp = groupMap.get(gKey);
      grp.classes.push(cls);
      grp.class_count += 1;
      grp.student_count += cls.student_count;
    }

    const gradeGroups = Array.from(groupMap.values()).sort((a, b) => {
      if (a.grade_rank !== b.grade_rank) return a.grade_rank - b.grade_rank;
      return String(a.grade || '').localeCompare(String(b.grade || ''), 'fa');
    });

    res.json({
      success: true,
      data: {
        grade_groups: gradeGroups,
        classes: enrichedClasses,
        status_options: REPORT_CARD_STATUS_OPTIONS,
        summary: {
          total_grades: gradeGroups.length,
          total_classes: enrichedClasses.length,
          total_students: totalStudentsCount,
          graded_students: gradedStudentsCount,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/gradebook/report-entries
 * Atomically saves 3-part scores (ارزشیابی مستمر، آزمون میانسالی، آزمون پایان سال),
 * server-calculated average, and teacher-selected status (from the 6 official options)
 * for students of a verified class, synchronizing both `student_report_entries` and
 * `gradebook_scores` so Student & Parent report card panels reflect them immediately.
 */
router.put('/report-entries', authorize('teacher', 'admin', 'manager'), async (req, res, next) => {
  try {
    const { class_id, entries } = req.body || {};

    if (!class_id || typeof class_id !== 'string') {
      return res.status(400).json({ success: false, message: 'شناسه کلاس الزامی است' });
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ success: false, message: 'لیست نمرات برای ذخیره‌سازی خالی است' });
    }

    // Verify class exists, belongs to caller's school, and teacher owns it
    const cls = await assertOwnsClass(req.user, class_id);

    // Fetch strictly enrolled students of this class within the same school
    const enrolledStudents = await db('class_members')
      .join('users', 'users.id', 'class_members.user_id')
      .where({
        'class_members.class_id': class_id,
        'class_members.role': 'student',
        'users.school_id': req.user.school_id,
      })
      .select('users.id');

    const enrolledIdSet = new Set(enrolledStudents.map((s) => s.id));
    const validatedEntries = [];
    const seenStudentIds = new Set();

    for (let i = 0; i < entries.length; i += 1) {
      const item = entries[i] || {};
      const studentId = String(item.student_id || '').trim();
      if (!studentId) {
        return res.status(400).json({ success: false, message: `ردیف ${i + 1}: شناسه دانش‌آموز نامعتبر است` });
      }
      if (!enrolledIdSet.has(studentId)) {
        return res.status(403).json({
          success: false,
          message: 'یک یا چند دانش‌آموز انتخاب‌شده عضو این کلاس در مدرسه شما نیستند',
        });
      }
      if (seenStudentIds.has(studentId)) continue;
      seenStudentIds.add(studentId);

      const contCheck = parseScoreValue(item.continuous_score, 20);
      if (!contCheck.valid) {
        return res.status(400).json({
          success: false,
          message: `ردیف ${i + 1} (ارزشیابی مستمر): ${contCheck.error}`,
        });
      }

      const midCheck = parseScoreValue(item.midterm_score, 20);
      if (!midCheck.valid) {
        return res.status(400).json({
          success: false,
          message: `ردیف ${i + 1} (آزمون میانسالی): ${midCheck.error}`,
        });
      }

      const finCheck = parseScoreValue(item.final_score, 20);
      if (!finCheck.valid) {
        return res.status(400).json({
          success: false,
          message: `ردیف ${i + 1} (آزمون پایان سال): ${finCheck.error}`,
        });
      }

      const statusCheck = validateReportStatus(item.status);
      if (!statusCheck.valid) {
        return res.status(400).json({
          success: false,
          message: `ردیف ${i + 1}: ${statusCheck.error}`,
        });
      }

      const avg = computeThreePartAverage({
        continuous_score: contCheck.value,
        midterm_score: midCheck.value,
        final_score: finCheck.value,
      });

      validatedEntries.push({
        student_id: studentId,
        continuous_score: contCheck.value,
        midterm_score: midCheck.value,
        final_score: finCheck.value,
        average_score: avg,
        status: statusCheck.value,
        teacher_note: String(item.teacher_note || '').trim().slice(0, 300),
      });
    }

    const nowIso = new Date().toISOString();
    const ownerTeacherId = cls.teacher_id || req.user.id;
    const hasLinksTable = await db.schema.hasTable('student_teacher_links');
    const savedResults = [];

    await db.transaction(async (trx) => {
      // Ensure standard 3 evaluation categories exist so single-class matrix stays synced
      const existingCats = await trx('gradebook_categories')
        .where({ class_id })
        .orderBy('created_at', 'asc');

      const categoryMap = {
        continuous_score: existingCats.find((c) => matchThreePartCategoryKey(c.title) === 'continuous_score') || null,
        midterm_score: existingCats.find((c) => matchThreePartCategoryKey(c.title) === 'midterm_score') || null,
        final_score: existingCats.find((c) => matchThreePartCategoryKey(c.title) === 'final_score') || null,
      };

      const defaultTitles = {
        continuous_score: 'ارزشیابی مستمر',
        midterm_score: 'آزمون میانسالی',
        final_score: 'آزمون پایان سال',
      };

      for (const partKey of ['continuous_score', 'midterm_score', 'final_score']) {
        if (!categoryMap[partKey]) {
          const newCat = {
            id: uuidv4(),
            class_id,
            title: defaultTitles[partKey],
            weight: 1.0,
            max_score: 20.0,
            term: 'term1',
          };
          await trx('gradebook_categories').insert(newCat);
          categoryMap[partKey] = newCat;
        }
      }

      for (const entry of validatedEntries) {
        const existingRow = await trx('student_report_entries')
          .where({ class_id, student_id: entry.student_id })
          .first();

        if (existingRow) {
          await trx('student_report_entries')
            .where({ id: existingRow.id })
            .update({
              school_id: cls.school_id,
              teacher_id: ownerTeacherId,
              continuous_score: entry.continuous_score,
              midterm_score: entry.midterm_score,
              final_score: entry.final_score,
              average_score: entry.average_score,
              status: entry.status,
              teacher_note: entry.teacher_note,
              updated_by: req.user.id,
              updated_at: nowIso,
            });
        } else {
          await trx('student_report_entries').insert({
            id: uuidv4(),
            school_id: cls.school_id,
            teacher_id: ownerTeacherId,
            class_id,
            student_id: entry.student_id,
            continuous_score: entry.continuous_score,
            midterm_score: entry.midterm_score,
            final_score: entry.final_score,
            average_score: entry.average_score,
            status: entry.status,
            teacher_note: entry.teacher_note,
            updated_by: req.user.id,
            created_at: nowIso,
            updated_at: nowIso,
          });
        }

        // Sync individual scores into `gradebook_scores`
        for (const partKey of ['continuous_score', 'midterm_score', 'final_score']) {
          const cat = categoryMap[partKey];
          const val = entry[partKey];
          if (!cat) continue;

          if (val === null || val === undefined) {
            await trx('gradebook_scores')
              .where({ category_id: cat.id, student_id: entry.student_id })
              .del();
          } else {
            const existingScore = await trx('gradebook_scores')
              .where({ category_id: cat.id, student_id: entry.student_id })
              .first();
            if (existingScore) {
              await trx('gradebook_scores')
                .where({ id: existingScore.id })
                .update({
                  score: val,
                  teacher_comment: entry.teacher_note || existingScore.teacher_comment || '',
                  graded_at: nowIso,
                });
            } else {
              await trx('gradebook_scores').insert({
                id: uuidv4(),
                category_id: cat.id,
                student_id: entry.student_id,
                score: val,
                teacher_comment: entry.teacher_note || '',
                graded_at: nowIso,
              });
            }
          }
        }

        // Ensure hierarchical teacher <-> student link exists
        if (hasLinksTable) {
          const existingLink = await trx('student_teacher_links')
            .where({ student_user_id: entry.student_id, teacher_user_id: ownerTeacherId })
            .first();
          if (!existingLink) {
            await trx('student_teacher_links').insert({
              id: uuidv4(),
              school_id: cls.school_id,
              student_user_id: entry.student_id,
              teacher_user_id: ownerTeacherId,
              class_id,
              grade: cls.grade || null,
              created_at: nowIso,
              updated_at: nowIso,
            });
          }
        }

        savedResults.push({
          ...entry,
          class_id,
          updated_at: nowIso,
        });
      }
    });

    try {
      cache.delBySchool(req.user.school_id);
    } catch (_e) {}

    await logAudit(req, 'UPSERT_REPORT_CARD_ENTRIES', 'student_report_entry', class_id, {
      class_id,
      class_name: cls.name,
      grade: cls.grade,
      updated_count: savedResults.length,
    });

    res.json({
      success: true,
      message: `نمرات و وضعیت ${savedResults.length} دانش‌آموز در کلاس «${cls.name}» با موفقیت ذخیره شد و در پنل دانش‌آموزان و اولیا نمایش داده می‌شود`,
      data: {
        class_id,
        entries: savedResults,
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
      const childMap = new Map();

      // 1. Hierarchical `parents` table (populated on parent registration)
      const hasParentsTable = await db.schema.hasTable('parents');
      if (hasParentsTable && req.user.school_id) {
        const hierarchicalChildren = await db('parents')
          .join('users', 'users.id', 'parents.student_user_id')
          .where({
            'parents.user_id': req.user.id,
            'parents.school_id': req.user.school_id,
            'users.school_id': req.user.school_id,
          })
          .select(
            'users.id',
            'users.display_name',
            'users.username',
            'users.student_code',
            'users.avatar_url',
            'users.school_id',
            'parents.relation'
          );

        for (const ch of hierarchicalChildren) {
          childMap.set(ch.id, ch);
        }
      }

      // 2. Legacy/additional `parent_student_links` table (strictly scoped to same school)
      if (req.user.school_id) {
        const linkedChildren = await db('parent_student_links')
          .join('users', 'users.id', 'parent_student_links.student_id')
          .where({
            'parent_student_links.parent_id': req.user.id,
            'users.school_id': req.user.school_id,
          })
          .select(
            'users.id',
            'users.display_name',
            'users.username',
            'users.student_code',
            'users.avatar_url',
            'users.school_id',
            'parent_student_links.relation'
          );

        for (const ch of linkedChildren) {
          if (!childMap.has(ch.id)) {
            childMap.set(ch.id, ch);
          }
        }
      }

      // 3. Fallback by student_code strictly within same school
      if (childMap.size === 0 && req.user.student_code && req.user.school_id) {
        const child = await db('users')
          .where({ student_code: req.user.student_code, role: 'student', school_id: req.user.school_id })
          .first();
        if (child) {
          childMap.set(child.id, {
            id: child.id,
            display_name: child.display_name,
            username: child.username || null,
            student_code: child.student_code,
            avatar_url: child.avatar_url,
            school_id: child.school_id,
            relation: 'فرزند',
          });
        }
      }

      const children = Array.from(childMap.values());
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

    const studentProfile = await db('students')
      .where({ user_id: studentId, school_id: student.school_id })
      .first();

    const rawClasses = await db('class_members')
      .join('classes', 'classes.id', 'class_members.class_id')
      .leftJoin('users as teachers', 'teachers.id', 'classes.teacher_id')
      .where({
        'class_members.user_id': studentId,
        'class_members.role': 'student',
        'classes.school_id': student.school_id,
      })
      .select('classes.id', 'classes.name', 'classes.subject', 'classes.grade', 'teachers.display_name as teacher_name');

    const classes = sortClassesByGradeAscending(rawClasses);

    // Load structured report entries for this student across all enrolled classes
    const reportEntryByClass = {};
    const hasEntriesTable = await db.schema.hasTable('student_report_entries');
    if (hasEntriesTable && classes.length > 0) {
      const entryRows = await db('student_report_entries')
        .where({ student_id: studentId, school_id: student.school_id })
        .whereIn('class_id', classes.map((c) => c.id));
      for (const row of entryRows) {
        reportEntryByClass[row.class_id] = row;
      }
    }

    // Load linked parents for hierarchical transparency
    const linkedParents = [];
    const hasParentsTable = await db.schema.hasTable('parents');
    if (hasParentsTable && student.school_id) {
      const pRows = await db('parents')
        .where({ student_user_id: studentId, school_id: student.school_id })
        .select('user_id', 'full_name', 'relation', 'username');
      for (const p of pRows) {
        linkedParents.push({
          user_id: p.user_id,
          full_name: p.full_name,
          relation: p.relation || 'ولی دانش‌آموز',
          username: p.username || null,
        });
      }
    }
    if (student.school_id) {
      const legacyLinks = await db('parent_student_links')
        .join('users as pu', 'pu.id', 'parent_student_links.parent_id')
        .where({ 'parent_student_links.student_id': studentId, 'pu.school_id': student.school_id })
        .select('pu.id as user_id', 'pu.display_name as full_name', 'parent_student_links.relation', 'pu.username');
      for (const p of legacyLinks) {
        if (!linkedParents.some((x) => x.user_id === p.user_id)) {
          linkedParents.push({
            user_id: p.user_id,
            full_name: p.full_name,
            relation: p.relation || 'ولی دانش‌آموز',
            username: p.username || null,
          });
        }
      }
    }

    const reportCards = [];
    const examScores = [];
    let overallWeightedSum = 0;
    let overallCredits = 0;

    for (const c of classes) {
      const categories = await db('gradebook_categories')
        .where('class_id', c.id)
        .orderBy('created_at', 'desc');
      const categoryIds = categories.map((cat) => cat.id);

      let scores = [];
      if (categoryIds.length > 0) {
        scores = await db('gradebook_scores')
          .whereIn('category_id', categoryIds)
          .where('student_id', studentId);
      }

      const scoreLookup = {};
      const scoreRecordLookup = {};
      scores.forEach((s) => {
        scoreLookup[s.category_id] = s.score;
        scoreRecordLookup[s.category_id] = s;
      });

      let classWeightedSum = 0;
      let classWeightTotal = 0;
      const breakdowns = [];
      let legacyCont = null;
      let legacyMid = null;
      let legacyFin = null;

      for (const cat of categories) {
        const sc = scoreLookup[cat.id];
        if (sc != null) {
          const numScore = Number(sc);
          const rec = scoreRecordLookup[cat.id];
          classWeightedSum += numScore * (cat.weight || 1.0);
          classWeightTotal += (cat.weight || 1.0);
          breakdowns.push({
            category_id: cat.id,
            title: cat.title,
            weight: cat.weight || 1.0,
            max_score: cat.max_score || 20,
            score: numScore,
            teacher_comment: rec?.teacher_comment || '',
            graded_at: rec?.graded_at || cat.created_at || null,
          });

          examScores.push({
            score_id: rec?.id || `${cat.id}-${studentId}`,
            category_id: cat.id,
            exam_title: cat.title,
            title: cat.title,
            class_id: c.id,
            class_name: c.name,
            subject: c.subject,
            grade: c.grade,
            teacher_name: c.teacher_name,
            score: numScore,
            max_score: cat.max_score || 20,
            weight: cat.weight || 1.0,
            teacher_comment: rec?.teacher_comment || '',
            graded_at: rec?.graded_at || cat.created_at || null,
          });

          const partKey = matchThreePartCategoryKey(cat.title);
          if (partKey === 'continuous_score' && legacyCont === null) legacyCont = numScore;
          if (partKey === 'midterm_score' && legacyMid === null) legacyMid = numScore;
          if (partKey === 'final_score' && legacyFin === null) legacyFin = numScore;
        }
      }

      const reportEntry = reportEntryByClass[c.id] || null;
      const continuousScore = reportEntry
        ? (reportEntry.continuous_score != null ? Number(reportEntry.continuous_score) : null)
        : legacyCont;
      const midtermScore = reportEntry
        ? (reportEntry.midterm_score != null ? Number(reportEntry.midterm_score) : null)
        : legacyMid;
      const finalScore = reportEntry
        ? (reportEntry.final_score != null ? Number(reportEntry.final_score) : null)
        : legacyFin;

      // Ensure 3-part breakdowns are represented cleanly when saved in reportEntry
      const ensureBreakdown = (label, matcherKey, value) => {
        if (value == null) return;
        const existsIdx = breakdowns.findIndex((b) => matchThreePartCategoryKey(b.title) === matcherKey);
        if (existsIdx >= 0) {
          breakdowns[existsIdx] = { ...breakdowns[existsIdx], title: label, score: value };
        } else {
          breakdowns.push({ title: label, weight: 1.0, score: value });
        }
      };

      if (reportEntry) {
        ensureBreakdown('ارزشیابی مستمر', 'continuous_score', continuousScore);
        ensureBreakdown('آزمون میانسالی', 'midterm_score', midtermScore);
        ensureBreakdown('آزمون پایان سال', 'final_score', finalScore);
      }

      const structuredAverage = reportEntry
        ? (reportEntry.average_score != null
            ? Number(reportEntry.average_score)
            : computeThreePartAverage({
                continuous_score: continuousScore,
                midterm_score: midtermScore,
                final_score: finalScore,
              }))
        : null;

      const legacyWeightedAvg = classWeightTotal > 0
        ? Math.round((classWeightedSum / classWeightTotal) * 100) / 100
        : null;

      const classFinalAverage = legacyWeightedAvg != null ? legacyWeightedAvg : structuredAverage;
      const credits = 3;

      if (classFinalAverage != null) {
        overallWeightedSum += classFinalAverage * credits;
        overallCredits += credits;
      }

      const resolvedStatus = reportEntry?.status
        ? reportEntry.status
        : (classFinalAverage != null
            ? (classFinalAverage >= 12 ? 'قبول' : 'نیازمند تلاش بیشتر')
            : 'نامشخص');

      reportCards.push({
        class_id: c.id,
        class_name: c.name,
        subject: c.subject,
        grade: c.grade,
        teacher_name: c.teacher_name,
        continuous_score: continuousScore,
        midterm_score: midtermScore,
        final_score: finalScore,
        breakdowns,
        final_average: classFinalAverage,
        teacher_status: reportEntry?.status || null,
        status: resolvedStatus,
        teacher_note: reportEntry?.teacher_note || '',
        updated_at: reportEntry?.updated_at || null,
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
          grade: studentProfile?.grade || null,
          department: studentProfile?.grade || student.department || 'دوره دوم متوسطه',
          linked_parents: linkedParents,
        },
        availableChildren: req.user.role === 'parent' ? availableChildren : undefined,
        reportCards,
        examScores,
        summary: {
          overall_gpa: overallGPA ? parseFloat(overallGPA) : null,
          discipline_score: parseFloat(disciplineScore.toFixed(1)),
          academic_standing: overallGPA && parseFloat(overallGPA) >= 18 ? 'رتبه الف (ممتاز)' : (overallGPA && parseFloat(overallGPA) >= 15 ? 'رتبه ب (بسیار خوب)' : 'عادی'),
          total_courses: classes.length,
          passed_courses: reportCards.filter((r) => POSITIVE_REPORT_STATUSES.has(r.status)).length,
          failed_courses: reportCards.filter((r) => NEGATIVE_REPORT_STATUSES.has(r.status)).length,
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

/**
 * POST /api/v1/gradebook/exams-with-scores
 * Teacher adds a new exam (topic/title) for a chosen DB class, enters each student's
 * score, and submits once. Scores are persisted atomically and immediately visible to
 * each student, their parents, and the school manager. Returns the 4 auto-calculated stats.
 */
router.post('/exams-with-scores', authorize('teacher', 'admin', 'manager'), async (req, res, next) => {
  try {
    const { class_id, title, weight, max_score, term, entries } = req.body || {};

    const cleanTitle = String(title || '').trim();
    if (!cleanTitle || cleanTitle.length < 2) {
      return res.status(400).json({ success: false, message: 'لطفاً موضوع یا عنوان آزمون را وارد کنید' });
    }
    if (!class_id || typeof class_id !== 'string') {
      return res.status(400).json({ success: false, message: 'لطفاً کلاس مد نظر را انتخاب کنید' });
    }

    const cls = await assertOwnsClass(req.user, class_id);

    const parsedWeight = parseFloat(weight);
    const parsedMax = parseFloat(max_score);
    const safeWeight = !Number.isNaN(parsedWeight) && parsedWeight > 0 && parsedWeight <= 10 ? parsedWeight : 1.0;
    const safeMaxScore = !Number.isNaN(parsedMax) && parsedMax > 0 && parsedMax <= 100 ? parsedMax : 20.0;

    // Fetch strictly enrolled students in this class within the same school
    const enrolledStudents = await db('class_members')
      .join('users', 'users.id', 'class_members.user_id')
      .where({
        'class_members.class_id': class_id,
        'class_members.role': 'student',
        'users.school_id': req.user.school_id,
      })
      .select('users.id', 'users.display_name');

    const enrolledIdSet = new Set(enrolledStudents.map((s) => s.id));
    const rawEntries = Array.isArray(entries) ? entries : [];
    const seenIds = new Set();
    const validatedEntries = [];

    for (let i = 0; i < rawEntries.length; i += 1) {
      const item = rawEntries[i] || {};
      const studentId = String(item.student_id || '').trim();
      if (!studentId) continue;
      if (!enrolledIdSet.has(studentId)) {
        return res.status(403).json({
          success: false,
          message: 'یک یا چند دانش‌آموز انتخاب‌شده عضو این کلاس در مدرسه شما نیستند',
        });
      }
      if (seenIds.has(studentId)) continue;
      seenIds.add(studentId);

      const scoreCheck = parseScoreValue(item.score, safeMaxScore);
      if (!scoreCheck.valid) {
        return res.status(400).json({
          success: false,
          message: `ردیف ${i + 1}: ${scoreCheck.error}`,
        });
      }
      if (scoreCheck.value !== null) {
        validatedEntries.push({
          student_id: studentId,
          score: scoreCheck.value,
          teacher_comment: String(item.teacher_comment || '').trim().slice(0, 300),
        });
      }
    }

    const categoryId = uuidv4();
    const nowIso = new Date().toISOString();
    const categoryRow = {
      id: categoryId,
      class_id,
      title: cleanTitle,
      weight: safeWeight,
      max_score: safeMaxScore,
      term: term || 'term1',
    };

    const partKey = matchThreePartCategoryKey(cleanTitle);
    const hasEntriesTable = await db.schema.hasTable('student_report_entries');
    const ownerTeacherId = cls.teacher_id || req.user.id;

    await db.transaction(async (trx) => {
      await trx('gradebook_categories').insert(categoryRow);

      for (const entry of validatedEntries) {
        await trx('gradebook_scores').insert({
          id: uuidv4(),
          category_id: categoryId,
          student_id: entry.student_id,
          score: entry.score,
          teacher_comment: entry.teacher_comment,
          graded_at: nowIso,
        });

        // If exam title matches a 3-part report column (مستمر / میانسالی / پایان سال), sync report entry too
        if (partKey && hasEntriesTable && safeMaxScore === 20) {
          const existingReport = await trx('student_report_entries')
            .where({ class_id, student_id: entry.student_id })
            .first();

          if (existingReport) {
            const nextCont = partKey === 'continuous_score' ? entry.score : existingReport.continuous_score;
            const nextMid = partKey === 'midterm_score' ? entry.score : existingReport.midterm_score;
            const nextFin = partKey === 'final_score' ? entry.score : existingReport.final_score;
            const nextAvg = computeThreePartAverage({
              continuous_score: nextCont,
              midterm_score: nextMid,
              final_score: nextFin,
            });
            await trx('student_report_entries')
              .where({ id: existingReport.id })
              .update({
                [partKey]: entry.score,
                average_score: nextAvg,
                updated_by: req.user.id,
                updated_at: nowIso,
              });
          } else {
            const nextVals = {
              continuous_score: partKey === 'continuous_score' ? entry.score : null,
              midterm_score: partKey === 'midterm_score' ? entry.score : null,
              final_score: partKey === 'final_score' ? entry.score : null,
            };
            await trx('student_report_entries').insert({
              id: uuidv4(),
              school_id: cls.school_id,
              teacher_id: ownerTeacherId,
              class_id,
              student_id: entry.student_id,
              ...nextVals,
              average_score: computeThreePartAverage(nextVals),
              status: null,
              teacher_note: entry.teacher_comment || '',
              updated_by: req.user.id,
              created_at: nowIso,
              updated_at: nowIso,
            });
          }
        }
      }
    });

    const passThreshold = safeMaxScore === 20 ? 12 : Math.round(safeMaxScore * 0.6 * 100) / 100;
    const stats = computeClassGradeStats(
      validatedEntries.map((e) => e.score),
      { totalStudents: enrolledStudents.length, passThreshold }
    );

    // Notify each graded student and their hierarchically linked parents (strictly same school)
    if (validatedEntries.length > 0) {
      try {
        const hasNotificationsTable = await db.schema.hasTable('notifications');
        if (hasNotificationsTable) {
          const gradedStudentIds = validatedEntries.map((e) => e.student_id);
          const studentNameMap = new Map(enrolledStudents.map((s) => [s.id, s.display_name]));

          // Collect linked parents per student from both `parents` and `parent_student_links`
          const parentsByStudent = new Map();
          const addParentLink = (studentId, parentUserId) => {
            if (!studentId || !parentUserId) return;
            if (!parentsByStudent.has(studentId)) parentsByStudent.set(studentId, new Set());
            parentsByStudent.get(studentId).add(parentUserId);
          };

          const hasParentsTable = await db.schema.hasTable('parents');
          if (hasParentsTable && cls.school_id) {
            const pRows = await db('parents')
              .whereIn('student_user_id', gradedStudentIds)
              .andWhere({ school_id: cls.school_id })
              .select('user_id', 'student_user_id');
            for (const pr of pRows) {
              addParentLink(pr.student_user_id, pr.user_id);
            }
          }

          if (cls.school_id) {
            const linkRows = await db('parent_student_links')
              .join('users as pu', 'pu.id', 'parent_student_links.parent_id')
              .whereIn('parent_student_links.student_id', gradedStudentIds)
              .andWhere({ 'pu.school_id': cls.school_id })
              .select('pu.id as user_id', 'parent_student_links.student_id as student_user_id');
            for (const lr of linkRows) {
              addParentLink(lr.student_user_id, lr.user_id);
            }
          }

          const notificationRows = [];
          for (const entry of validatedEntries) {
            const stName = studentNameMap.get(entry.student_id) || 'دانش‌آموز';
            notificationRows.push({
              id: uuidv4(),
              user_id: entry.student_id,
              type: 'academic',
              title: `ثبت نمره آزمون: ${cleanTitle}`,
              body: `نمره شما در آزمون «${cleanTitle}» کلاس «${cls.name}»: ${entry.score} از ${safeMaxScore}`,
              data: JSON.stringify({
                class_id,
                category_id: categoryId,
                exam_title: cleanTitle,
                score: entry.score,
                max_score: safeMaxScore,
              }),
              is_read: false,
              created_at: nowIso,
            });

            const linkedParentIds = parentsByStudent.get(entry.student_id);
            if (linkedParentIds) {
              for (const parentUserId of linkedParentIds) {
                notificationRows.push({
                  id: uuidv4(),
                  user_id: parentUserId,
                  type: 'academic',
                  title: `نمره آزمون فرزند شما (${stName}): ${cleanTitle}`,
                  body: `نمره ${stName} در آزمون «${cleanTitle}» کلاس «${cls.name}»: ${entry.score} از ${safeMaxScore}`,
                  data: JSON.stringify({
                    class_id,
                    category_id: categoryId,
                    student_id: entry.student_id,
                    exam_title: cleanTitle,
                    score: entry.score,
                    max_score: safeMaxScore,
                  }),
                  is_read: false,
                  created_at: nowIso,
                });
              }
            }
          }

          if (notificationRows.length > 0) {
            await db('notifications').insert(notificationRows);
          }
        }
      } catch (_notifErr) {
        // Non-blocking: exam scores are already atomically persisted
      }
    }

    try {
      cache.delBySchool(req.user.school_id);
    } catch (_e) {}

    await logAudit(req, 'CREATE_EXAM_WITH_SCORES', 'gradebook_category', categoryId, {
      class_id,
      class_name: cls.name,
      title: cleanTitle,
      scores_saved: validatedEntries.length,
    });

    res.status(201).json({
      success: true,
      message: `آزمون «${cleanTitle}» با ${validatedEntries.length} نمره ثبت شد و در پنل دانش‌آموزان، اولیا و مدیریت نمایش داده می‌شود`,
      data: {
        category: categoryRow,
        scores_saved: validatedEntries.length,
        stats,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/gradebook/manager-overview
 * Direct, real-time hierarchical classification of EVERY teacher's recorded grades
 * within the school manager's exact school (`school_id`), grouped by:
 *   Teacher -> Grade (smallest to largest) -> Class -> Exams & Students + 4 Stats.
 */
router.get('/manager-overview', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    if (!req.user.school_id) {
      return res.json({
        success: true,
        data: {
          school_name: '',
          summary: {
            total_teachers: 0,
            total_classes: 0,
            total_students: 0,
            school_average: null,
            school_highest_score: null,
            school_pass_rate: 0,
          },
          grades: [],
          teachers: [],
        },
      });
    }

    const schoolRow = await db('schools').where({ id: req.user.school_id }).select('name').first();

    const rawClasses = await db('classes')
      .leftJoin('users as teachers', 'teachers.id', 'classes.teacher_id')
      .where({
        'classes.school_id': req.user.school_id,
        'classes.is_active': true,
      })
      .select(
        'classes.id',
        'classes.school_id',
        'classes.teacher_id',
        'classes.name',
        'classes.subject',
        'classes.grade',
        'classes.join_code',
        'classes.created_at',
        'teachers.display_name as teacher_name',
        'teachers.username as teacher_username',
        'teachers.personnel_code as teacher_code'
      );

    const sortedClasses = sortClassesByGradeAscending(rawClasses);
    const classIds = sortedClasses.map((c) => c.id);

    if (classIds.length === 0) {
      return res.json({
        success: true,
        data: {
          school_name: schoolRow?.name || 'مدرسه هوشمند',
          summary: {
            total_teachers: 0,
            total_classes: 0,
            total_students: 0,
            school_average: null,
            school_highest_score: null,
            school_pass_rate: 0,
          },
          grades: [],
          teachers: [],
        },
      });
    }

    const enrolledRows = await db('class_members')
      .join('users', 'users.id', 'class_members.user_id')
      .whereIn('class_members.class_id', classIds)
      .andWhere({
        'class_members.role': 'student',
        'users.school_id': req.user.school_id,
      })
      .select(
        'class_members.class_id',
        'users.id',
        'users.display_name',
        'users.username',
        'users.student_code'
      )
      .orderBy('users.display_name', 'asc');

    const categories = await db('gradebook_categories')
      .whereIn('class_id', classIds)
      .orderBy('created_at', 'asc');

    const categoryIds = categories.map((c) => c.id);
    const allScores = categoryIds.length > 0
      ? await db('gradebook_scores').whereIn('category_id', categoryIds)
      : [];

    const hasEntriesTable = await db.schema.hasTable('student_report_entries');
    const reportEntries = hasEntriesTable
      ? await db('student_report_entries')
          .whereIn('class_id', classIds)
          .andWhere('school_id', req.user.school_id)
      : [];

    const catsByClass = {};
    for (const cat of categories) {
      if (!catsByClass[cat.class_id]) catsByClass[cat.class_id] = [];
      catsByClass[cat.class_id].push(cat);
    }

    const scoreLookup = {};
    for (const s of allScores) {
      scoreLookup[`${s.student_id}:${s.category_id}`] = {
        score: s.score != null ? Number(s.score) : null,
        teacher_comment: s.teacher_comment || '',
        graded_at: s.graded_at || null,
      };
    }

    const entryLookup = {};
    for (const e of reportEntries) {
      entryLookup[`${e.class_id}:${e.student_id}`] = e;
    }

    const studentsByClass = {};
    for (const st of enrolledRows) {
      if (!studentsByClass[st.class_id]) studentsByClass[st.class_id] = [];
      studentsByClass[st.class_id].push(st);
    }

    const allSchoolStudentAverages = [];
    const distinctStudentIds = new Set();
    const teacherGroupsMap = new Map();
    const gradeSet = new Set();

    for (const cls of sortedClasses) {
      const classCats = catsByClass[cls.id] || [];
      const classMembers = studentsByClass[cls.id] || [];
      const gradeLabel = (cls.grade || '').trim() || 'عمومی';
      gradeSet.add(gradeLabel);

      const enrichedStudents = classMembers.map((st) => {
        distinctStudentIds.add(st.id);
        const scoresByCat = {};
        let weightedSum = 0;
        let totalWeight = 0;

        for (const cat of classCats) {
          const rec = scoreLookup[`${st.id}:${cat.id}`];
          if (rec && rec.score != null) {
            scoresByCat[cat.id] = rec.score;
            weightedSum += rec.score * (cat.weight || 1.0);
            totalWeight += (cat.weight || 1.0);
          }
        }

        const reportEntry = entryLookup[`${cls.id}:${st.id}`] || null;
        const legacyAvg = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : null;
        const structuredAvg = reportEntry && reportEntry.average_score != null
          ? Number(reportEntry.average_score)
          : null;
        const finalAvg = legacyAvg != null ? legacyAvg : structuredAvg;

        if (finalAvg != null) {
          allSchoolStudentAverages.push(finalAvg);
        }

        const status = reportEntry?.status
          ? reportEntry.status
          : (finalAvg != null ? (finalAvg >= 12 ? 'قبول' : 'نیازمند تلاش بیشتر') : 'در انتظار نمره');

        return {
          id: st.id,
          display_name: st.display_name,
          username: st.username || null,
          student_code: st.student_code || null,
          scores: scoresByCat,
          continuous_score: reportEntry?.continuous_score != null ? Number(reportEntry.continuous_score) : null,
          midterm_score: reportEntry?.midterm_score != null ? Number(reportEntry.midterm_score) : null,
          final_score: reportEntry?.final_score != null ? Number(reportEntry.final_score) : null,
          average_score: finalAvg,
          status,
        };
      });

      const classStats = computeClassGradeStats(
        enrichedStudents.map((s) => s.average_score),
        { totalStudents: enrichedStudents.length, passThreshold: 12 }
      );

      // Compute per-exam stats for every category recorded in this class
      const enrichedCategories = classCats.map((cat) => {
        const catMax = Number(cat.max_score) || 20;
        const catPassThreshold = catMax === 20 ? 12 : Math.round(catMax * 0.6 * 100) / 100;
        const catScores = enrichedStudents.map((s) => s.scores[cat.id] ?? null);
        return {
          id: cat.id,
          title: cat.title,
          weight: cat.weight || 1.0,
          max_score: catMax,
          created_at: cat.created_at || null,
          stats: computeClassGradeStats(catScores, {
            totalStudents: enrichedStudents.length,
            passThreshold: catPassThreshold,
          }),
        };
      });

      const teacherKey = cls.teacher_id || 'unassigned';
      if (!teacherGroupsMap.has(teacherKey)) {
        teacherGroupsMap.set(teacherKey, {
          teacher_id: cls.teacher_id || null,
          teacher_name: cls.teacher_name || 'دبیر نامشخص',
          teacher_username: cls.teacher_username || null,
          teacher_code: cls.teacher_code || null,
          class_count: 0,
          student_count: 0,
          graded_entries_count: 0,
          classes: [],
        });
      }

      const tGroup = teacherGroupsMap.get(teacherKey);
      tGroup.classes.push({
        id: cls.id,
        name: cls.name,
        subject: cls.subject || 'عمومی',
        grade: gradeLabel,
        grade_rank: getGradeSortOrder(cls.grade),
        teacher_name: cls.teacher_name || 'دبیر نامشخص',
        categories: enrichedCategories,
        students: enrichedStudents,
        stats: classStats,
      });
      tGroup.class_count += 1;
      tGroup.student_count += enrichedStudents.length;
      tGroup.graded_entries_count += classStats.graded_count;
    }

    const teachers = Array.from(teacherGroupsMap.values()).sort((a, b) =>
      String(a.teacher_name || '').localeCompare(String(b.teacher_name || ''), 'fa')
    );

    const schoolStats = computeClassGradeStats(allSchoolStudentAverages, {
      totalStudents: distinctStudentIds.size,
      passThreshold: 12,
    });

    const sortedGrades = Array.from(gradeSet).sort(
      (a, b) => getGradeSortOrder(a) - getGradeSortOrder(b)
    );

    res.json({
      success: true,
      data: {
        school_name: schoolRow?.name || 'مدرسه هوشمند',
        summary: {
          total_teachers: teachers.length,
          total_classes: sortedClasses.length,
          total_students: distinctStudentIds.size,
          school_average: schoolStats.class_average,
          school_highest_score: schoolStats.highest_score,
          school_pass_rate: schoolStats.pass_rate,
        },
        grades: sortedGrades,
        teachers,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/report-card', handleGetReportCard);
router.get('/report-card/:studentId', handleGetReportCard);

module.exports = router;
