const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه'];
const PERIOD_TIMES = [
  { period: 1, start: '07:45', end: '09:15' },
  { period: 2, start: '09:30', end: '11:00' },
  { period: 3, start: '11:15', end: '12:45' },
  { period: 4, start: '13:30', end: '15:00' },
  { period: 5, start: '15:15', end: '16:45' },
];

/**
 * GET /api/v1/schedules
 * Fetch schedules:
 * - If teacher: fetches schedule for this teacher
 * - If student: fetches schedule for their enrolled classes
 * - Query param ?class_id=...: fetches schedule for specific class
 */
router.get('/', async (req, res, next) => {
  try {
    const { class_id } = req.query;
    let query = db('weekly_schedules')
      .join('classes', 'classes.id', 'weekly_schedules.class_id')
      .join('users as teachers', 'teachers.id', 'weekly_schedules.teacher_id')
      .select(
        'weekly_schedules.*',
        'classes.name as class_name',
        'classes.grade as class_grade',
        'teachers.display_name as teacher_name'
      );

    if (class_id) {
      query = query.where('weekly_schedules.class_id', class_id);
    } else if (req.user.role === 'teacher') {
      query = query.where('weekly_schedules.teacher_id', req.user.id);
    } else if (req.user.role === 'student') {
      const studentClassIds = await db('class_members')
        .where({ user_id: req.user.id, role: 'student' })
        .pluck('class_id');
      query = query.whereIn('weekly_schedules.class_id', studentClassIds);
    } else if (req.user.role === 'parent') {
      const childLinks = await db('parent_student_links')
        .where('parent_id', req.user.id)
        .pluck('student_id');
      const childClassIds = await db('class_members')
        .whereIn('user_id', childLinks)
        .pluck('class_id');
      query = query.whereIn('weekly_schedules.class_id', childClassIds);
    }

    const items = await query.orderBy([
      { column: 'day_of_week', order: 'asc' },
      { column: 'period_number', order: 'asc' },
    ]);

    res.json({
      success: true,
      data: {
        schedules: items,
        dayNames: DAY_NAMES,
        periodTimes: PERIOD_TIMES,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/schedules
 * Add period with AUTOMATIC CLASH DETECTION
 */
router.post('/', async (req, res, next) => {
  try {
    const { class_id, teacher_id, subject, day_of_week, period_number, start_time, end_time, room } = req.body;

    const dayNum = parseInt(day_of_week, 10);
    const periodNum = parseInt(period_number, 10);
    const targetTeacherId = teacher_id || req.user.id;

    if (isNaN(dayNum) || isNaN(periodNum) || !class_id || !subject) {
      return res.status(400).json({ success: false, message: 'اطلاعات زنگ کلاسی ناقص است' });
    }

    // ── CLASH CHECK 1: Teacher Conflict ──
    const teacherClash = await db('weekly_schedules')
      .join('classes', 'classes.id', 'weekly_schedules.class_id')
      .where({
        'weekly_schedules.teacher_id': targetTeacherId,
        'weekly_schedules.day_of_week': dayNum,
        'weekly_schedules.period_number': periodNum,
      })
      .select('classes.name as conflicting_class', 'weekly_schedules.subject as conflicting_subject')
      .first();

    if (teacherClash) {
      return res.status(409).json({
        success: false,
        code: 'TEACHER_SCHEDULE_CLASH',
        message: `تداخل برنامه استاد! این دبیر در روز ${DAY_NAMES[dayNum]} زنگ ${periodNum} در کلاس «${teacherClash.conflicting_class}» درس «${teacherClash.conflicting_subject}» دارد.`,
      });
    }

    // ── CLASH CHECK 2: Class Conflict ──
    const classClash = await db('weekly_schedules')
      .join('users as teachers', 'teachers.id', 'weekly_schedules.teacher_id')
      .where({
        'weekly_schedules.class_id': class_id,
        'weekly_schedules.day_of_week': dayNum,
        'weekly_schedules.period_number': periodNum,
      })
      .select('weekly_schedules.subject as existing_subject', 'teachers.display_name as existing_teacher')
      .first();

    if (classClash) {
      return res.status(409).json({
        success: false,
        code: 'CLASS_PERIOD_CLASH',
        message: `تداخل برنامه کلاس! در روز ${DAY_NAMES[dayNum]} زنگ ${periodNum}، درس «${classClash.existing_subject}» با تدریس استاد «${classClash.existing_teacher}» از قبل ثبت شده است.`,
      });
    }

    // ── CLASH CHECK 3: Room/Lab Conflict ──
    if (room && room !== 'کلاس اصلی') {
      const roomClash = await db('weekly_schedules')
        .join('classes', 'classes.id', 'weekly_schedules.class_id')
        .where({
          'weekly_schedules.room': room,
          'weekly_schedules.day_of_week': dayNum,
          'weekly_schedules.period_number': periodNum,
        })
        .select('classes.name as room_class')
        .first();

      if (roomClash) {
        return res.status(409).json({
          success: false,
          code: 'ROOM_SCHEDULE_CLASH',
          message: `تداخل فضا! مکان «${room}» در روز ${DAY_NAMES[dayNum]} زنگ ${periodNum} توسط کلاس «${roomClash.room_class}» رزرو شده است.`,
        });
      }
    }

    const defaultTime = PERIOD_TIMES.find((p) => p.period === periodNum);
    const newEntry = {
      id: uuidv4(),
      class_id,
      teacher_id: targetTeacherId,
      subject,
      day_of_week: dayNum,
      period_number: periodNum,
      start_time: start_time || defaultTime?.start || '08:00',
      end_time: end_time || defaultTime?.end || '09:30',
      room: room || 'کلاس اصلی',
    };

    await db('weekly_schedules').insert(newEntry);
    res.status(201).json({
      success: true,
      message: 'زنگ کلاسی با موفقیت و بدون هیچ‌گونه تداخل ثبت شد! ✅',
      data: { schedule: newEntry },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/schedules/:id
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await db('weekly_schedules').where('id', req.params.id).del();
    res.json({ success: true, message: 'زنگ درسی حذف گردید.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
