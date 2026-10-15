const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

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

    // 1. Fetch class details
    const cls = await db('classes').where('id', classId).first();
    if (!cls) {
      return res.status(404).json({ success: false, message: 'کلاس یافت نشد' });
    }

    // 2. Fetch categories (auto-seed if empty so teacher always has evaluation columns)
    let categories = await db('gradebook_categories')
      .where('class_id', classId)
      .orderBy('created_at', 'asc');

    if (categories.length === 0) {
      const defaultCats = [
        { id: uuidv4(), class_id: classId, title: 'ارزشیابی مستمر کلاسی', weight: 1.0, max_score: 20.0, term: 'term1' },
        { id: uuidv4(), class_id: classId, title: 'آزمون میان‌ترم', weight: 1.0, max_score: 20.0, term: 'term1' },
        { id: uuidv4(), class_id: classId, title: 'امتحان نوبت اول', weight: 1.0, max_score: 20.0, term: 'term1' },
      ];
      await db('gradebook_categories').insert(defaultCats);
      categories = await db('gradebook_categories')
        .where('class_id', classId)
        .orderBy('created_at', 'asc');
    }

    // 3. Fetch students in class (auto-enroll if empty)
    let students = await db('class_members')
      .join('users', 'users.id', 'class_members.user_id')
      .where({ 'class_members.class_id': classId, 'class_members.role': 'student' })
      .select('users.id', 'users.display_name', 'users.student_code', 'users.email')
      .orderBy('users.display_name', 'asc');

    if (students.length === 0) {
      const defaultStudentUsers = await db('users').where({ role: 'student' }).select('id');
      if (defaultStudentUsers.length > 0) {
        const enrollments = defaultStudentUsers.map((st) => ({
          id: uuidv4(),
          class_id: classId,
          user_id: st.id,
          role: 'student',
          joined_at: new Date().toISOString(),
        }));
        await db('class_members').insert(enrollments);
        students = await db('class_members')
          .join('users', 'users.id', 'class_members.user_id')
          .where({ 'class_members.class_id': classId, 'class_members.role': 'student' })
          .select('users.id', 'users.display_name', 'users.student_code', 'users.email')
          .orderBy('users.display_name', 'asc');
      }
    }

    // 4. Fetch all scores for these categories
    const categoryIds = categories.map((c) => c.id);
    let scores = [];
    if (categoryIds.length > 0) {
      scores = await db('gradebook_scores')
        .whereIn('category_id', categoryIds);
    }

    // 5. Build student score matrix & calculate weighted averages
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
router.post('/categories', async (req, res, next) => {
  try {
    const { class_id, title, weight, max_score, term } = req.body;
    if (!class_id || !title) {
      return res.status(400).json({ success: false, message: 'کلاس و عنوان آیتم نمره الزامی است' });
    }

    const id = uuidv4();
    const newCat = {
      id,
      class_id,
      title,
      weight: parseFloat(weight) || 1.0,
      max_score: parseFloat(max_score) || 20.0,
      term: term || 'term1',
    };

    await db('gradebook_categories').insert(newCat);
    res.status(201).json({ success: true, message: 'آیتم ارزشیابی با موفقیت ثبت شد', data: { category: newCat } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/gradebook/scores
 * Upserts or deletes a score for a student in a category with Persian digit support
 */
router.post('/scores', async (req, res, next) => {
  try {
    const { category_id, student_id, score, teacher_comment } = req.body;
    if (!category_id || !student_id) {
      return res.status(400).json({ success: false, message: 'شناسه دانش‌آموز و آزمون الزامی است' });
    }

    // Handle score clearance/deletion
    if (score === '' || score === null || score === undefined) {
      await db('gradebook_scores')
        .where({ category_id, student_id })
        .del();
      return res.json({ success: true, message: 'نمره با موفقیت حذف شد' });
    }

    const numericScore = parsePersianScore(score);
    if (numericScore === null || numericScore < 0 || numericScore > 20) {
      return res.status(400).json({ success: false, message: 'نمره باید عددی بین ۰ تا ۲۰ باشد' });
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

    res.json({ success: true, message: 'نمره با موفقیت ذخیره شد', data: { score: numericScore } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/gradebook/scores/batch
 * Batch saves multiple scores in a single request
 */
router.post('/scores/batch', async (req, res, next) => {
  try {
    const { scores } = req.body;
    if (!Array.isArray(scores)) {
      return res.status(400).json({ success: false, message: 'لیست نمرات نامعتبر است' });
    }

    for (const item of scores) {
      const { category_id, student_id, score, teacher_comment } = item;
      if (!category_id || !student_id) continue;

      if (score === '' || score === null || score === undefined) {
        await db('gradebook_scores').where({ category_id, student_id }).del();
        continue;
      }

      const numericScore = parsePersianScore(score);
      if (numericScore === null || numericScore < 0 || numericScore > 20) continue;

      const existing = await db('gradebook_scores').where({ category_id, student_id }).first();
      if (existing) {
        await db('gradebook_scores').where('id', existing.id).update({
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
    }

    res.json({ success: true, message: 'تمام نمرات با موفقیت ذخیره شدند ✓' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/gradebook/report-card
 * GET /api/v1/gradebook/report-card/:studentId
 * Generates an official report card with all classes, weighted averages, and discipline summary
 */
const getReportCardHandler = async (req, res, next) => {
  try {
    let studentId = req.params.studentId || req.query.student_id;
    let availableChildren = [];

    if (req.user.role === 'student') {
      studentId = req.user.id;
    } else if (req.user.role === 'parent') {
      // Find parent's children
      let children = await db('parent_student_links')
        .join('users', 'users.id', 'parent_student_links.student_id')
        .where({ 'parent_student_links.parent_id': req.user.id })
        .select('users.id', 'users.display_name', 'users.student_code', 'users.avatar_url', 'parent_student_links.relation');

      if (!children.length && req.user.student_code) {
        const child = await db('users').where({ student_code: req.user.student_code }).first();
        if (child) {
          children = [{
            id: child.id,
            display_name: child.display_name,
            student_code: child.student_code,
            avatar_url: child.avatar_url,
            relation: 'فرزند',
          }];
        }
      }

      availableChildren = children;

      if (!children.length) {
        return res.status(404).json({ success: false, message: 'هیچ پرونده دانش‌آموزی به حساب شما متصل نیست' });
      }

      // If studentId was requested, verify parent has access to this student
      if (studentId && studentId !== 'me') {
        const isChildOfParent = children.some((c) => c.id === studentId);
        if (!isChildOfParent) {
          return res.status(403).json({ success: false, message: 'دسترسی به کارنامه این دانش‌آموز برای شما مجاز نیست' });
        }
      } else {
        studentId = children[0].id;
      }
    } else {
      // Admin, Manager or Teacher
      if (!studentId || studentId === 'me') {
        if (req.user.role === 'teacher') {
          const teacherMember = await db('class_members')
            .where({ user_id: req.user.id, role: 'teacher' })
            .first();

          if (teacherMember) {
            const firstStudent = await db('class_members')
              .where({ class_id: teacherMember.class_id, role: 'student' })
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

    const student = await db('users').where('id', studentId).first();
    if (!student) {
      return res.status(404).json({ success: false, message: 'دانش‌آموز یافت نشد' });
    }

    // Classes student belongs to
    const classes = await db('class_members')
      .join('classes', 'classes.id', 'class_members.class_id')
      .leftJoin('users as teachers', 'teachers.id', 'classes.teacher_id')
      .where({ 'class_members.user_id': studentId, 'class_members.role': 'student' })
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
      const credits = 3; // standard course coefficient

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

    // Discipline points
    const disciplineRecords = await db('discipline_records').where('student_id', studentId);
    let disciplineScore = 20.0;
    for (const d of disciplineRecords) {
      disciplineScore += d.points;
    }
    disciplineScore = Math.max(0, Math.min(20, disciplineScore));

    const overallGPA = overallCredits > 0 ? (overallWeightedSum / overallCredits).toFixed(2) : null;

    res.json({
      success: true,
      data: {
        student: {
          id: student.id,
          display_name: student.display_name,
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
          school_name: 'مجتمع آموزشی هوشمند ادیبان',
          generated_at: new Date().toLocaleDateString('fa-IR'),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

router.get('/report-card', getReportCardHandler);
router.get('/report-card/:studentId', getReportCardHandler);

module.exports = router;
