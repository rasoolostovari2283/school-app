const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const {
  authenticate,
  authorize,
  assertSameSchool,
  assertTeacherOfStudent,
} = require('../../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

/**
 * GET /api/v1/discipline
 * Fetch discipline records scoped to the requester's school
 */
router.get('/', async (req, res, next) => {
  try {
    if (['financial_officer', 'accountant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'مسئول امور مالی مجاز به مشاهده پرونده‌های انضباطی دانش‌آموزان نیست',
      });
    }

    const { student_id } = req.query;
    let query = db('discipline_records')
      .join('users as students', 'students.id', 'discipline_records.student_id')
      .leftJoin('users as issuers', 'issuers.id', 'discipline_records.issuer_id')
      .where('students.school_id', req.user.school_id)
      .select(
        'discipline_records.*',
        'students.display_name as student_name',
        'students.student_code',
        'issuers.display_name as issuer_name'
      );

    let targetStudentId = student_id;

    if (req.user.role === 'student') {
      targetStudentId = req.user.id;
      query = query.where('discipline_records.student_id', targetStudentId);
    } else if (req.user.role === 'parent') {
      const childIds = await db('parent_student_links')
        .where('parent_id', req.user.id)
        .pluck('student_id');
      query = query.whereIn('discipline_records.student_id', childIds).where('discipline_records.is_parent_viewable', true);
    } else if (targetStudentId) {
      await assertTeacherOfStudent(req.user, targetStudentId);
      query = query.where('discipline_records.student_id', targetStudentId);
    } else if (req.user.role === 'teacher') {
      const taughtStudentIds = await db('class_members')
        .join('classes', 'classes.id', 'class_members.class_id')
        .where({
          'classes.teacher_id': req.user.id,
          'classes.school_id': req.user.school_id,
          'class_members.role': 'student',
        })
        .pluck('class_members.user_id');
      query = query.whereIn('discipline_records.student_id', taughtStudentIds);
    }

    const records = await query.orderBy('discipline_records.created_at', 'desc');

    let baselineScore = 20.0;
    records.forEach((r) => {
      baselineScore += r.points;
    });
    baselineScore = Math.max(0, Math.min(20, baselineScore));

    res.json({
      success: true,
      data: {
        records,
        summary: {
          discipline_score: parseFloat(baselineScore.toFixed(1)),
          rewards_count: records.filter((r) => r.type === 'reward').length,
          warnings_count: records.filter((r) => r.type === 'warning').length,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/discipline
 * Add a reward or warning card (same-school teacher/counselor/admin only)
 */
router.post('/', authorize('teacher', 'counselor', 'admin', 'manager'), async (req, res, next) => {
  try {
    const { student_id, type, category, title, description, points, date, is_parent_viewable } = req.body;
    if (!student_id || !type || !title) {
      return res.status(400).json({ success: false, message: 'فیلدهای اجباری را تکمیل فرمایید' });
    }

    const student = await assertTeacherOfStudent(req.user, student_id);
    assertSameSchool(req.user, student);

    const newRecord = {
      id: uuidv4(),
      student_id,
      issuer_id: req.user.id,
      type: type || 'reward',
      category: category || 'general',
      title,
      description: description || '',
      points: parseFloat(points) || (type === 'reward' ? 1.0 : -1.0),
      date: date || new Date().toISOString().split('T')[0],
      is_parent_viewable: is_parent_viewable !== false,
    };

    await db('discipline_records').insert(newRecord);

    res.status(201).json({
      success: true,
      message: `${type === 'reward' ? 'کارت تشویق' : 'کارت تذکر'} با موفقیت ثبت شد`,
      data: { record: newRecord },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/discipline/counseling
 * Fetch counseling sessions scoped to the requester's school
 */
router.get('/counseling', async (req, res, next) => {
  try {
    if (['financial_officer', 'accountant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'مسئول امور مالی مجاز به مشاهده پرونده‌های مشاوره دانش‌آموزان نیست',
      });
    }

    const { student_id } = req.query;
    let query = db('counseling_cases')
      .join('users as students', 'students.id', 'counseling_cases.student_id')
      .leftJoin('users as counselors', 'counselors.id', 'counseling_cases.counselor_id')
      .where('students.school_id', req.user.school_id)
      .select(
        'counseling_cases.*',
        'students.display_name as student_name',
        'counselors.display_name as counselor_name'
      );

    if (req.user.role === 'student') {
      query = query.where('counseling_cases.student_id', req.user.id);
    } else if (req.user.role === 'parent') {
      const childIds = await db('parent_student_links').where('parent_id', req.user.id).pluck('student_id');
      query = query.whereIn('counseling_cases.student_id', childIds).where('counseling_cases.shared_with_parent', true);
    } else if (student_id) {
      await assertTeacherOfStudent(req.user, student_id);
      query = query.where('counseling_cases.student_id', student_id);
    } else if (req.user.role === 'teacher') {
      const taughtStudentIds = await db('class_members')
        .join('classes', 'classes.id', 'class_members.class_id')
        .where({
          'classes.teacher_id': req.user.id,
          'classes.school_id': req.user.school_id,
          'class_members.role': 'student',
        })
        .pluck('class_members.user_id');
      query = query.whereIn('counseling_cases.student_id', taughtStudentIds);
    }

    const sessions = await query.orderBy('counseling_cases.created_at', 'desc');
    res.json({ success: true, data: { sessions } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/discipline/counseling
 * Add new counseling log (same-school teacher/counselor/admin only)
 */
router.post('/counseling', authorize('teacher', 'counselor', 'admin', 'manager'), async (req, res, next) => {
  try {
    const { student_id, session_title, session_date, student_concerns, counselor_notes, recommendations, follow_up_date, shared_with_parent } = req.body;
    if (!student_id || !session_title) {
      return res.status(400).json({ success: false, message: 'دانش‌آموز و عنوان جلسه الزامی است' });
    }

    const student = await assertTeacherOfStudent(req.user, student_id);
    assertSameSchool(req.user, student);

    const newCase = {
      id: uuidv4(),
      student_id,
      counselor_id: req.user.id,
      session_title,
      session_date: session_date || new Date().toISOString().split('T')[0],
      student_concerns: student_concerns || '',
      counselor_notes: counselor_notes || '',
      recommendations: recommendations || '',
      follow_up_date: follow_up_date || null,
      status: 'completed',
      shared_with_parent: shared_with_parent !== false,
    };

    await db('counseling_cases').insert(newCase);
    res.status(201).json({ success: true, message: 'جلسه مشاوره با موفقیت در پرونده ثبت شد', data: { session: newCase } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
