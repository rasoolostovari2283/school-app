const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

/**
 * GET /api/v1/analytics/overview
 * Returns high-level performance metrics, class comparisons, and exportable datasets
 * Strictly scoped to req.user.school_id (finding A6)
 */
router.get('/overview', authorize('admin', 'manager', 'teacher'), async (req, res, next) => {
  try {
    const schoolId = req.user.school_id;
    if (!schoolId) {
      return res.json({
        success: true,
        data: {
          classes: [],
          gradeDistribution: [],
          topStudents: [],
          schoolSummary: {
            total_students: 0,
            total_teachers: 0,
            overall_school_gpa: '--',
            overall_attendance: '--',
            active_olympiad_teams: 0,
          },
        },
      });
    }

    // 1. Classes summary (scoped to caller's school)
    const classes = await db('classes')
      .leftJoin('users as teachers', 'teachers.id', 'classes.teacher_id')
      .where('classes.school_id', schoolId)
      .select('classes.*', 'teachers.display_name as teacher_name');

    const classStats = [];
    const schoolClassIds = classes.map((c) => c.id);

    // Batch queries across all school classes to eliminate N+1 queries
    const studentCountsRaw = schoolClassIds.length > 0
      ? await db('class_members')
          .whereIn('class_id', schoolClassIds)
          .where({ role: 'student' })
          .select('class_id')
          .count('id as count')
          .groupBy('class_id')
      : [];
    const studentCountByClass = new Map(studentCountsRaw.map((r) => [r.class_id, parseInt(r.count || 0, 10)]));

    const categoryRows = schoolClassIds.length > 0
      ? await db('gradebook_categories').whereIn('class_id', schoolClassIds).select('id', 'class_id')
      : [];
    const schoolCategoryIds = categoryRows.map((c) => c.id);
    const categoryToClass = new Map(categoryRows.map((c) => [c.id, c.class_id]));

    const scoreRows = schoolCategoryIds.length > 0
      ? await db('gradebook_scores').whereIn('category_id', schoolCategoryIds).select('category_id', 'student_id', 'score')
      : [];
    const allScores = scoreRows.map((s) => Number(s.score)).filter((n) => !Number.isNaN(n));

    const classScoresMap = new Map();
    const studentScoresMap = new Map();
    for (const s of scoreRows) {
      const val = Number(s.score);
      if (Number.isNaN(val)) continue;
      const cid = categoryToClass.get(s.category_id);
      if (cid) {
        if (!classScoresMap.has(cid)) classScoresMap.set(cid, []);
        classScoresMap.get(cid).push(val);
      }
      if (s.student_id) {
        if (!studentScoresMap.has(s.student_id)) studentScoresMap.set(s.student_id, []);
        studentScoresMap.get(s.student_id).push(val);
      }
    }

    const sessionRows = schoolClassIds.length > 0
      ? await db('attendance_sessions').whereIn('class_id', schoolClassIds).select('id', 'class_id')
      : [];
    const sessionIds = sessionRows.map((s) => s.id);
    const sessionToClass = new Map(sessionRows.map((s) => [s.id, s.class_id]));

    const attendanceRecords = sessionIds.length > 0
      ? await db('attendance_records').whereIn('session_id', sessionIds).select('session_id', 'status')
      : [];
    const classAttendanceMap = new Map();
    for (const rec of attendanceRecords) {
      const cid = sessionToClass.get(rec.session_id);
      if (!cid) continue;
      if (!classAttendanceMap.has(cid)) classAttendanceMap.set(cid, { total: 0, present: 0 });
      const entry = classAttendanceMap.get(cid);
      entry.total += 1;
      if (rec.status === 'present') entry.present += 1;
    }

    for (const c of classes) {
      const studentCount = studentCountByClass.get(c.id) || 0;
      const cScores = classScoresMap.get(c.id) || [];
      const avgScore = cScores.length > 0
        ? parseFloat((cScores.reduce((a, b) => a + b, 0) / cScores.length).toFixed(2))
        : 0;

      const att = classAttendanceMap.get(c.id) || { total: 0, present: 0 };
      const attendancePct = att.total > 0
        ? parseFloat(((att.present / att.total) * 100).toFixed(1))
        : 0;

      classStats.push({
        id: c.id,
        name: c.name,
        subject: c.subject,
        grade: c.grade,
        teacher: c.teacher_name,
        students_count: studentCount,
        average_grade: avgScore,
        attendance_percentage: attendancePct,
        pass_rate: avgScore >= 12 ? 100 : (avgScore > 0 ? 75 : 0),
      });
    }

    // 2. Grade distribution in school (scoped to school's classes)
    let gradeDistribution = [];
    if (allScores.length > 0) {
      const topCount = allScores.filter((s) => s >= 19).length;
      const goodCount = allScores.filter((s) => s >= 16 && s < 19).length;
      const midCount = allScores.filter((s) => s >= 12 && s < 16).length;
      const lowCount = allScores.filter((s) => s < 12).length;
      const totalS = allScores.length;
      gradeDistribution = [
        { range: '۱۹ - ۲۰ (نخبه / ممتاز)', count: topCount, percentage: Math.round((topCount / totalS) * 100) },
        { range: '۱۶ - ۱۸.۹۹ (خیلی خوب)', count: goodCount, percentage: Math.round((goodCount / totalS) * 100) },
        { range: '۱۲ - ۱۵.۹۹ (خوب)', count: midCount, percentage: Math.round((midCount / totalS) * 100) },
        { range: 'زیر ۱۲ (نیاز به پیگیری)', count: lowCount, percentage: Math.round((lowCount / totalS) * 100) },
      ];
    } else {
      gradeDistribution = [
        { range: '۱۹ - ۲۰ (نخبه / ممتاز)', count: 0, percentage: 0 },
        { range: '۱۶ - ۱۸.۹۹ (خیلی خوب)', count: 0, percentage: 0 },
        { range: '۱۲ - ۱۵.۹۹ (خوب)', count: 0, percentage: 0 },
        { range: 'زیر ۱۲ (نیاز به پیگیری)', count: 0, percentage: 0 },
      ];
    }

    // 3. Real students count & teachers count in this school only
    const totalStudentsRes = await db('users')
      .where({ role: 'student', school_id: schoolId })
      .count('id as count')
      .first();
    const totalTeachersRes = await db('users')
      .where({ role: 'teacher', school_id: schoolId })
      .count('id as count')
      .first();
    const totalStudents = parseInt(totalStudentsRes?.count || 0, 10);
    const totalTeachers = parseInt(totalTeachersRes?.count || 0, 10);

    // 4. Top-ranked students in this school computed from real gradebook_scores
    const schoolStudents = await db('users')
      .where({ role: 'student', school_id: schoolId })
      .select('id', 'display_name', 'student_code');

    const studentsWithRealGpa = schoolStudents.map((st) => {
      const stScores = studentScoresMap.get(st.id) || [];
      const realAvg = stScores.length > 0
        ? stScores.reduce((a, b) => a + b, 0) / stScores.length
        : null;
      return {
        ...st,
        realAvg,
      };
    });

    studentsWithRealGpa.sort((a, b) => {
      if (a.realAvg === null && b.realAvg === null) return 0;
      if (a.realAvg === null) return 1;
      if (b.realAvg === null) return -1;
      return b.realAvg - a.realAvg;
    });

    const rankings = studentsWithRealGpa.slice(0, 5).map((st, i) => ({
      id: st.id,
      rank: i + 1,
      name: st.display_name,
      student_code: st.student_code || `STD-${i + 1}`,
      gpa: st.realAvg !== null ? st.realAvg.toFixed(2) : '--',
      olympiad_status: 'دانش‌آموز فعال',
    }));

    res.json({
      success: true,
      data: {
        classes: classStats,
        gradeDistribution,
        topStudents: rankings,
        schoolSummary: {
          total_students: totalStudents,
          total_teachers: totalTeachers,
          overall_school_gpa: allScores.length > 0 ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(2) : '--',
          overall_attendance: classStats.length > 0 ? `${(classStats.reduce((a, c) => a + c.attendance_percentage, 0) / classStats.length).toFixed(1)}%` : '--',
          active_olympiad_teams: 0,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
