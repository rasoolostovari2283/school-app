const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

/**
 * GET /api/v1/courses — list available courses
 */
router.get('/', async (req, res, next) => {
  try {
    const courses = await db('courses')
      .leftJoin('users', 'users.id', 'courses.teacher_id')
      .select('courses.*', 'users.display_name as teacher_name')
      .where('courses.is_active', true)
      .orderBy('courses.code', 'asc');

    // If student, attach enrollment status
    if (req.user.role === 'student') {
      for (const c of courses) {
        const enrollment = await db('course_enrollments')
          .where({ course_id: c.id, student_id: req.user.id })
          .first();
        c.enrollment = enrollment || null;
      }
    }

    res.json({ success: true, data: { courses } });
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/courses/:id/enroll — student course enrollment (انتخاب واحد)
 */
router.post('/:id/enroll', async (req, res, next) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'فقط دانش‌آموزان مجاز به انتخاب واحد هستند' });
    }

    const course = await db('courses').where({ id: req.params.id, is_active: true }).first();
    if (!course) {
      return res.status(404).json({ success: false, message: 'درس یافت نشد' });
    }

    if (course.enrolled_count >= course.capacity) {
      return res.status(400).json({ success: false, message: 'ظرفیت درس تکمیل شده است' });
    }

    const existing = await db('course_enrollments')
      .where({ course_id: req.params.id, student_id: req.user.id })
      .first();
    if (existing && existing.status === 'enrolled') {
      return res.status(400).json({ success: false, message: 'قبلاً در این درس ثبت‌نام کرده‌اید' });
    }

    const enrollment = {
      id: uuidv4(),
      course_id: req.params.id,
      student_id: req.user.id,
      status: 'enrolled',
    };

    await db('course_enrollments').insert(enrollment);
    await db('courses').where('id', req.params.id).increment('enrolled_count', 1);

    res.status(201).json({ success: true, message: 'انتخاب واحد با موفقیت انجام شد', data: { enrollment } });
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/courses/:id/drop — drop a course (حذف واحد)
 */
router.post('/:id/drop', async (req, res, next) => {
  try {
    const enrollment = await db('course_enrollments')
      .where({ course_id: req.params.id, student_id: req.user.id, status: 'enrolled' })
      .first();
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'ثبت‌نامی یافت نشد' });
    }

    await db('course_enrollments')
      .where('id', enrollment.id)
      .update({ status: 'dropped', dropped_at: new Date().toISOString() });
    await db('courses').where('id', req.params.id).decrement('enrolled_count', 1);

    res.json({ success: true, message: 'درس با موفقیت حذف شد' });
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/courses/transcript — student transcript (کارنامه)
 */
router.get('/transcript', async (req, res, next) => {
  try {
    const studentId = req.query.student_id || req.user.id;

    const enrollments = await db('course_enrollments')
      .join('courses', 'courses.id', 'course_enrollments.course_id')
      .leftJoin('users', 'users.id', 'courses.teacher_id')
      .select(
        'courses.code', 'courses.name', 'courses.credits', 'courses.semester', 'courses.department',
        'course_enrollments.status', 'course_enrollments.grade', 'course_enrollments.grade_point',
        'course_enrollments.enrolled_at',
        'users.display_name as teacher_name'
      )
      .where('course_enrollments.student_id', studentId)
      .orderBy('courses.semester', 'desc');

    // Calculate GPA
    const completed = enrollments.filter(e => e.status === 'completed' && e.grade_point != null);
    let totalCredits = 0, totalWeighted = 0;
    for (const e of completed) {
      totalCredits += e.credits;
      totalWeighted += e.grade_point * e.credits;
    }
    const gpa = totalCredits > 0 ? (totalWeighted / totalCredits).toFixed(2) : null;

    res.json({
      success: true,
      data: {
        enrollments,
        summary: {
          total_courses: enrollments.length,
          completed: completed.length,
          total_credits: totalCredits,
          gpa,
        },
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
