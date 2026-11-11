const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const {
  authenticate,
  assertSameSchool,
  assertTeacherOfStudent,
  forbiddenError,
} = require('../../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

/**
 * GET /api/v1/courses — list available courses in the requester's school
 */
router.get('/', async (req, res, next) => {
  try {
    const courses = await db('courses')
      .leftJoin('users', 'users.id', 'courses.teacher_id')
      .select('courses.*', 'users.display_name as teacher_name')
      .where('courses.is_active', true)
      .andWhere(function () {
        this.where('users.school_id', req.user.school_id).orWhereNull('courses.teacher_id');
      })
      .orderBy('courses.code', 'asc');

    if (req.user.role === 'student' && courses.length > 0) {
      const courseIds = courses.map((c) => c.id);
      const enrollments = await db('course_enrollments')
        .whereIn('course_id', courseIds)
        .andWhere({ student_id: req.user.id });
      const enrollmentByCourse = new Map(enrollments.map((e) => [e.course_id, e]));
      for (const c of courses) {
        c.enrollment = enrollmentByCourse.get(c.id) || null;
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

    const initialCourse = await db('courses').where({ id: req.params.id, is_active: true }).first();
    if (!initialCourse) {
      return res.status(404).json({ success: false, message: 'درس یافت نشد' });
    }

    const enrollment = await db.transaction(async (trx) => {
      const course = await trx('courses').where({ id: req.params.id, is_active: true }).first();
      if (!course) {
        const err = new Error('درس یافت نشد');
        err.statusCode = 404;
        throw err;
      }

      if (course.teacher_id) {
        const teacher = await trx('users').where({ id: course.teacher_id }).first();
        if (teacher && teacher.school_id && req.user.school_id && teacher.school_id !== req.user.school_id) {
          const err = new Error('دسترسی به درس مدرسه دیگر مجاز نیست');
          err.statusCode = 403;
          throw err;
        }
      }

      if (course.enrolled_count >= course.capacity) {
        const err = new Error('ظرفیت درس تکمیل شده است');
        err.statusCode = 400;
        throw err;
      }

      const existing = await trx('course_enrollments')
        .where({ course_id: req.params.id, student_id: req.user.id })
        .first();
      if (existing && existing.status === 'enrolled') {
        const err = new Error('قبلاً در این درس ثبت‌نام کرده‌اید');
        err.statusCode = 400;
        throw err;
      }

      let record;
      if (existing) {
        await trx('course_enrollments')
          .where({ id: existing.id })
          .update({ status: 'enrolled', dropped_at: null, enrolled_at: new Date().toISOString() });
        record = { ...existing, status: 'enrolled', dropped_at: null };
      } else {
        record = {
          id: uuidv4(),
          course_id: req.params.id,
          student_id: req.user.id,
          status: 'enrolled',
        };
        await trx('course_enrollments').insert(record);
      }

      await trx('courses').where('id', req.params.id).increment('enrolled_count', 1);
      return record;
    });

    res.status(201).json({ success: true, message: 'انتخاب واحد با موفقیت انجام شد', data: { enrollment } });
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/courses/:id/drop — drop a course (حذف واحد)
 */
router.post('/:id/drop', async (req, res, next) => {
  try {
    await db.transaction(async (trx) => {
      const enrollment = await trx('course_enrollments')
        .where({ course_id: req.params.id, student_id: req.user.id, status: 'enrolled' })
        .first();
      if (!enrollment) {
        const err = new Error('ثبت‌نامی یافت نشد');
        err.statusCode = 404;
        throw err;
      }

      const course = await trx('courses').where({ id: req.params.id }).first();
      if (course && course.teacher_id) {
        const teacher = await trx('users').where({ id: course.teacher_id }).first();
        if (teacher) {
          assertSameSchool(req.user, teacher);
        }
      }

      await trx('course_enrollments')
        .where('id', enrollment.id)
        .update({ status: 'dropped', dropped_at: new Date().toISOString() });
      if (course && course.enrolled_count > 0) {
        await trx('courses').where('id', req.params.id).decrement('enrolled_count', 1);
      }
    });

    res.json({ success: true, message: 'درس با موفقیت حذف شد' });
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/courses/transcript — student transcript (کارنامه)
 */
router.get('/transcript', async (req, res, next) => {
  try {
    let studentId = req.user.id;

    if (req.user.role === 'student') {
      if (req.query.student_id && req.query.student_id !== req.user.id) {
        throw forbiddenError('شما فقط مجاز به مشاهده کارنامه خودتان هستید');
      }
      studentId = req.user.id;
    } else if (req.user.role === 'parent') {
      const childIds = await db('parent_student_links').where({ parent_id: req.user.id }).pluck('student_id');
      if (req.user.student_code) {
        const byCode = await db('users')
          .where({ student_code: req.user.student_code, role: 'student', school_id: req.user.school_id })
          .first();
        if (byCode && !childIds.includes(byCode.id)) {
          childIds.push(byCode.id);
        }
      }
      const requestedId = req.query.student_id || childIds[0];
      if (!requestedId || !childIds.includes(requestedId)) {
        throw forbiddenError('شما فقط مجاز به مشاهده کارنامه فرزند خود هستید');
      }
      const childUser = await db('users').where({ id: requestedId }).first();
      if (childUser) {
        assertSameSchool(req.user, childUser);
      }
      studentId = requestedId;
    } else if (req.query.student_id && req.query.student_id !== req.user.id) {
      const student = await assertTeacherOfStudent(req.user, req.query.student_id);
      assertSameSchool(req.user, student);
      studentId = student.id;
    }

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

    const completed = enrollments.filter((e) => e.status === 'completed' && e.grade_point != null);
    let totalCredits = 0;
    let totalWeighted = 0;
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
