const db = require('../../config/database');
const { generateId, insertAndReturn, updateAndReturn } = require('../../utils/dbHelpers');

class AttendanceService {
  /**
   * Create an on-demand attendance session for a class
   * Default duration is 15 minutes (ربع ساعت)
   */
  async createSession(teacherId, classId, data = {}) {
    const durationMinutes = Number(data.duration_minutes) || 15;
    const now = new Date();
    const opensAt = now.toISOString();
    const closesAt = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString();
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Close any previous active sessions for this class to prevent conflicts
    const activeSessions = await db('attendance_sessions')
      .where({ class_id: classId, status: 'active' });
    for (const prev of activeSessions) {
      await this.closeSession(prev.id);
    }

    const session = await insertAndReturn(db, 'attendance_sessions', {
      class_id: classId,
      teacher_id: teacherId,
      session_code: code,
      opens_at: opensAt,
      closes_at: closesAt,
      status: 'active',
    });

    return session;
  }

  /**
   * Get all sessions for a class with auto-closing of expired sessions
   */
  async getSessionsByClass(classId) {
    const sessions = await db('attendance_sessions')
      .where({ class_id: classId })
      .orderBy('created_at', 'desc');

    const now = new Date();
    for (const s of sessions) {
      if (s.status === 'active' && s.closes_at && new Date(s.closes_at) <= now) {
        await this.closeSession(s.id);
        s.status = 'closed';
      }
    }

    return sessions;
  }

  /**
   * Single-click check-in for students: No session code required!
   * Automatically records exact timestamp (hour, minute, second).
   */
  async checkIn(sessionId, studentId) {
    const session = await db('attendance_sessions').where({ id: sessionId }).first();
    if (!session) {
      const e = new Error('جلسه حضور و غیاب یافت نشد');
      e.statusCode = 404;
      throw e;
    }

    const now = new Date();

    // If 15 minutes have passed, auto-close and inform student
    if (session.status !== 'active' || (session.closes_at && new Date(session.closes_at) <= now)) {
      if (session.status === 'active') {
        await this.closeSession(session.id);
      }
      const e = new Error('مهلت ربع ساعت (۱۵ دقیقه) برای اعلام حضور به پایان رسیده است');
      e.statusCode = 400;
      throw e;
    }

    // Ensure student is member of class
    const membership = await db('class_members')
      .where({ class_id: session.class_id, user_id: studentId })
      .first();
    if (!membership) {
      await db('class_members').insert({
        id: generateId(),
        class_id: session.class_id,
        user_id: studentId,
        role: 'student',
      }).catch(() => {});
    }

    const existing = await db('attendance_records')
      .where({ session_id: sessionId, student_id: studentId })
      .first();

    const recordedAt = now.toISOString();

    if (existing) {
      // If already present or late, return smoothly without throwing error
      if (existing.status === 'present' || existing.status === 'late') {
        return existing;
      }
      return updateAndReturn(db, 'attendance_records', { id: existing.id }, {
        status: 'present',
        recorded_at: recordedAt,
      });
    }

    const opensAt = new Date(session.opens_at || session.created_at);
    const elapsedMinutes = (now - opensAt) / (60 * 1000);
    const isLate = elapsedMinutes > 10;

    return insertAndReturn(db, 'attendance_records', {
      session_id: sessionId,
      student_id: studentId,
      status: isLate ? 'late' : 'present',
      recorded_at: recordedAt,
    });
  }

  /**
   * Teacher manual status override (present, late, absent, excused)
   */
  async recordStudentAttendance(sessionId, studentId, status) {
    const existing = await db('attendance_records')
      .where({ session_id: sessionId, student_id: studentId })
      .first();

    const recordedAt = status === 'absent' ? null : new Date().toISOString();

    if (existing) {
      return updateAndReturn(db, 'attendance_records', { id: existing.id }, {
        status,
        recorded_at: recordedAt,
      });
    }

    return insertAndReturn(db, 'attendance_records', {
      session_id: sessionId,
      student_id: studentId,
      status,
      recorded_at: recordedAt,
    });
  }

  /**
   * Close session: Mark any student in class roster who didn't check in as 'absent'
   */
  async closeSession(sessionId) {
    const session = await updateAndReturn(db, 'attendance_sessions', { id: sessionId }, { status: 'closed' });
    if (!session) return null;

    // Get class members who are students
    const classMembers = await db('class_members')
      .where({ class_id: session.class_id, role: 'student' })
      .select('user_id');

    const checkedIn = await db('attendance_records')
      .where({ session_id: sessionId })
      .select('student_id');

    const checkedInIds = new Set(checkedIn.map(r => r.student_id));

    for (const member of classMembers) {
      if (!checkedInIds.has(member.user_id)) {
        await insertAndReturn(db, 'attendance_records', {
          session_id: sessionId,
          student_id: member.user_id,
          status: 'absent',
          recorded_at: null,
        }).catch(() => {});

        // Notify parent about absence if linked
        const parentLinks = await db('parent_student_links').where({ student_id: member.user_id });
        for (const link of parentLinks) {
          await insertAndReturn(db, 'notifications', {
            user_id: link.parent_id,
            type: 'attendance',
            title: 'غیبت در حضور و غیاب کلاسی',
            body: 'فرزند شما در مهلت ربع ساعت حضور و غیاب حاضر نشد و غایب ثبت گردید',
            data: JSON.stringify({ session_id: sessionId, class_id: session.class_id }),
          }).catch(() => {});
        }
      }
    }

    return session;
  }

  /**
   * Get detailed session report separated into:
   * 1. present_students: with exact recorded check-in clock time
   * 2. absent_students: students who failed to check in after 15 minutes
   */
  async getSessionReport(sessionId, classId) {
    let session = await db('attendance_sessions').where({ id: sessionId }).first();
    if (!session) return null;

    const now = new Date();
    // Auto-close if 15 minutes expired
    if (session.status === 'active' && session.closes_at && new Date(session.closes_at) <= now) {
      await this.closeSession(session.id);
      session = await db('attendance_sessions').where({ id: sessionId }).first();
    }

    const students = await db('class_members')
      .join('users', 'users.id', 'class_members.user_id')
      .where({ 'class_members.class_id': classId || session.class_id, 'class_members.role': 'student' })
      .select('users.id', 'users.display_name', 'users.avatar_url', 'users.phone', 'users.email')
      .orderBy('users.display_name', 'asc');

    const records = await db('attendance_records')
      .where({ session_id: sessionId });

    const recordMap = {};
    records.forEach(r => { recordMap[r.student_id] = r; });

    const opensAtTime = new Date(session.opens_at || session.created_at).getTime();

    const studentList = students.map(s => {
      const rec = recordMap[s.id];
      let status = 'unrecorded';
      let recordedAt = null;

      if (rec) {
        status = rec.status;
        recordedAt = rec.recorded_at;
      } else if (session.status === 'closed') {
        status = 'absent';
      }

      let elapsedMinutes = null;
      if (recordedAt) {
        const recTime = new Date(recordedAt).getTime();
        elapsedMinutes = Math.max(0, Math.round((recTime - opensAtTime) / 60000));
      }

      return {
        student_id: s.id,
        display_name: s.display_name,
        avatar_url: s.avatar_url,
        phone: s.phone,
        email: s.email,
        status,
        recorded_at: recordedAt,
        elapsed_minutes: elapsedMinutes,
      };
    });

    // تفکیک دقیق به دو لیست مجزا طبق خواسته کاربر:
    // ۱. لیست حاضرین (Present List) همراه با ساعت ثبت حضور
    const presentStudents = studentList
      .filter(s => s.status === 'present' || s.status === 'late' || s.status === 'excused')
      .sort((a, b) => {
        if (!a.recorded_at) return 1;
        if (!b.recorded_at) return -1;
        return new Date(a.recorded_at) - new Date(b.recorded_at);
      });

    // ۲. لیست غایبین (Absent List) دانش‌آموزانی که حاضر زده نشدند
    const absentStudents = studentList
      .filter(s => s.status === 'absent' || s.status === 'unrecorded')
      .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || '', 'fa'));

    const counts = {
      total: students.length,
      present: presentStudents.filter(s => s.status === 'present').length,
      late: presentStudents.filter(s => s.status === 'late').length,
      excused: presentStudents.filter(s => s.status === 'excused').length,
      total_attended: presentStudents.length,
      absent: absentStudents.length,
      attendance_percentage: students.length > 0
        ? Math.round((presentStudents.length / students.length) * 100)
        : 0,
      is_expired: session.status === 'closed' || (session.closes_at && new Date(session.closes_at) <= now),
      remaining_seconds: Math.max(0, Math.floor((new Date(session.closes_at) - now) / 1000)),
    };

    return {
      session,
      students: studentList,
      present_students: presentStudents,
      absent_students: absentStudents,
      summary: counts,
    };
  }

  async getHistory(classId, studentId) {
    const sessions = await db('attendance_sessions')
      .where({ class_id: classId })
      .orderBy('created_at', 'desc')
      .limit(30);

    const sessionList = [];
    for (const session of sessions) {
      if (studentId) {
        const rec = await db('attendance_records')
          .where({ session_id: session.id, student_id: studentId })
          .first();
        sessionList.push({
          ...session,
          student_status: rec ? rec.status : 'absent',
          recorded_at: rec ? rec.recorded_at : null,
        });
      } else {
        const stats = await db('attendance_records')
          .where({ session_id: session.id })
          .select(
            db.raw('COUNT(*) as total_recorded'),
            db.raw("COUNT(CASE WHEN status = 'present' THEN 1 END) as present_count"),
            db.raw("COUNT(CASE WHEN status = 'late' THEN 1 END) as late_count"),
            db.raw("COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent_count")
          )
          .first();

        sessionList.push({
          ...session,
          stats: {
            total_recorded: parseInt(stats.total_recorded || 0, 10),
            present: parseInt(stats.present_count || 0, 10),
            late: parseInt(stats.late_count || 0, 10),
            absent: parseInt(stats.absent_count || 0, 10),
          },
        });
      }
    }

    return sessionList;
  }
}

module.exports = new AttendanceService();
