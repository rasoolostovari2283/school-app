const db = require('../../config/database');
const { generateId, insertAndReturn, updateAndReturn } = require('../../utils/dbHelpers');
const {
  assertOwnsClass,
  assertSameSchool,
  forbiddenError,
  notFoundError,
} = require('../../middleware/auth');

class AttendanceService {
  async assertSessionBelongsToClass(sessionId, classId, currentUser = null, { allowEnrolled = false } = {}) {
    const session = await db('attendance_sessions').where({ id: sessionId }).first();
    if (!session) {
      throw notFoundError('جلسه حضور و غیاب یافت نشد');
    }
    if (classId && session.class_id !== classId) {
      throw forbiddenError('این جلسه حضور و غیاب متعلق به کلاس انتخاب‌شده نیست');
    }
    if (currentUser) {
      await assertOwnsClass(currentUser, session.class_id, { allowEnrolled });
    }
    return session;
  }

  async createSession(teacherId, classId, data = {}, currentUser = null) {
    if (currentUser) {
      await assertOwnsClass(currentUser, classId);
    }

    const durationMinutes = Number(data.duration_minutes) || 15;
    const now = new Date();
    const opensAt = now.toISOString();
    const closesAt = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString();
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const activeSessions = await db('attendance_sessions')
      .where({ class_id: classId, status: 'active' });
    for (const prev of activeSessions) {
      await this.closeSession(prev.id, classId);
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

  async getSessionsByClass(classId) {
    const sessions = await db('attendance_sessions')
      .where({ class_id: classId })
      .orderBy('created_at', 'desc');

    const now = new Date();
    for (const s of sessions) {
      if (s.status === 'active' && s.closes_at && new Date(s.closes_at) <= now) {
        await this.closeSession(s.id, classId);
        s.status = 'closed';
      }
    }

    return sessions;
  }

  async checkIn(sessionId, studentId, classId = null, currentUser = null) {
    const session = await this.assertSessionBelongsToClass(sessionId, classId, currentUser, { allowEnrolled: true });

    const now = new Date();

    if (session.status !== 'active' || (session.closes_at && new Date(session.closes_at) <= now)) {
      if (session.status === 'active') {
        await this.closeSession(session.id, session.class_id);
      }
      const e = new Error('مهلت ربع ساعت (۱۵ دقیقه) برای اعلام حضور به پایان رسیده است');
      e.statusCode = 400;
      throw e;
    }

    // Require existing class membership — never auto-enroll students on check-in (#20/A26)
    const membership = await db('class_members')
      .where({ class_id: session.class_id, user_id: studentId })
      .first();
    if (!membership) {
      throw forbiddenError('شما عضو این کلاس نیستید');
    }

    const existing = await db('attendance_records')
      .where({ session_id: sessionId, student_id: studentId })
      .first();

    const recordedAt = now.toISOString();

    if (existing) {
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

  async recordStudentAttendance(sessionId, studentId, status, classId = null, currentUser = null) {
    const session = await this.assertSessionBelongsToClass(sessionId, classId, currentUser);

    const student = await db('users').where({ id: studentId }).first();
    if (!student || student.role !== 'student') {
      throw notFoundError('دانش‌آموز یافت نشد');
    }
    if (currentUser) {
      assertSameSchool(currentUser, student);
    }

    const membership = await db('class_members')
      .where({ class_id: session.class_id, user_id: studentId })
      .first();
    if (!membership) {
      throw forbiddenError('این دانش‌آموز عضو کلاس مورد نظر نیست');
    }

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

  async closeSession(sessionId, classId = null, currentUser = null) {
    if (currentUser || classId) {
      await this.assertSessionBelongsToClass(sessionId, classId, currentUser);
    }

    let session = null;
    let absentStudentIds = [];

    await db.transaction(async (trx) => {
      session = await updateAndReturn(trx, 'attendance_sessions', { id: sessionId }, { status: 'closed' });
      if (!session) return;

      const classMembers = await trx('class_members')
        .where({ class_id: session.class_id, role: 'student' })
        .select('user_id');

      const checkedIn = await trx('attendance_records')
        .where({ session_id: sessionId })
        .select('student_id');

      const checkedInIds = new Set(checkedIn.map((r) => r.student_id));

      absentStudentIds = classMembers
        .map((m) => m.user_id)
        .filter((userId) => !checkedInIds.has(userId));

      if (absentStudentIds.length > 0) {
        const absentRecords = absentStudentIds.map((studentId) => ({
          id: generateId(),
          session_id: sessionId,
          student_id: studentId,
          status: 'absent',
          recorded_at: null,
        }));
        await trx('attendance_records')
          .insert(absentRecords)
          .onConflict(['session_id', 'student_id'])
          .ignore();
      }
    });

    if (!session) return null;

    if (absentStudentIds.length > 0) {

      const parentLinks = await db('parent_student_links')
        .whereIn('student_id', absentStudentIds)
        .select('parent_id', 'student_id');

      if (parentLinks.length > 0) {
        const nowIso = new Date().toISOString();
        const notificationRows = parentLinks.map((link) => ({
          id: generateId(),
          user_id: link.parent_id,
          type: 'attendance',
          title: 'غیبت در حضور و غیاب کلاسی',
          body: 'فرزند شما در مهلت ربع ساعت حضور و غیاب حاضر نشد و غایب ثبت گردید',
          data: JSON.stringify({ session_id: sessionId, class_id: session.class_id }),
          is_read: false,
          created_at: nowIso,
        }));
        await db('notifications').insert(notificationRows).catch(() => {});
      }

      try {
        const smsGateway = require('../../services/smsGateway');
        const [clsInfo, absentStudents] = await Promise.all([
          db('classes').where({ id: session.class_id }).select('id', 'name', 'school_id').first(),
          db('users').whereIn('id', absentStudentIds).select('id', 'display_name', 'phone', 'settings', 'school_id'),
        ]);
        for (const st of absentStudents) {
          let stSettings = {};
          try { stSettings = typeof st.settings === 'string' ? JSON.parse(st.settings) : (st.settings || {}); } catch (_e) {}
          const parentPhone = stSettings.parent_phone || st.phone;
          if (parentPhone) {
            await smsGateway.sendAbsenceAlert({
              schoolId: clsInfo?.school_id || st.school_id,
              parentPhone,
              studentName: st.display_name,
              className: clsInfo?.name || 'کلاس درسی',
            });
          }
        }
      } catch (_smsErr) {}
    }

    return session;
  }

  async getSessionReport(sessionId, classId, currentUser = null) {
    let session = await db('attendance_sessions').where({ id: sessionId }).first();
    if (!session) return null;

    if (classId && session.class_id !== classId) {
      throw forbiddenError('این جلسه حضور و غیاب متعلق به کلاس انتخاب‌شده نیست');
    }
    if (currentUser) {
      await assertOwnsClass(currentUser, session.class_id, { allowEnrolled: true });
    }

    const now = new Date();
    if (session.status === 'active' && session.closes_at && new Date(session.closes_at) <= now) {
      await this.closeSession(session.id, session.class_id);
      session = await db('attendance_sessions').where({ id: sessionId }).first();
    }

    const isParent = currentUser && currentUser.role === 'parent';
    let allowedParentChildIds = null;
    if (isParent) {
      const links = await db('parent_student_links').where({ parent_id: currentUser.id }).pluck('student_id');
      allowedParentChildIds = new Set(links);
      if (currentUser.student_code) {
        const byCode = await db('users')
          .where({ student_code: currentUser.student_code, role: 'student', school_id: currentUser.school_id })
          .first();
        if (byCode) allowedParentChildIds.add(byCode.id);
      }
    }

    let studentsQuery = db('class_members')
      .join('users', 'users.id', 'class_members.user_id')
      .where({ 'class_members.class_id': classId || session.class_id, 'class_members.role': 'student' });

    if (isParent && allowedParentChildIds) {
      studentsQuery = studentsQuery.whereIn('users.id', Array.from(allowedParentChildIds));
    }

    const students = await studentsQuery
      .select('users.id', 'users.display_name', 'users.avatar_url', 'users.phone', 'users.email')
      .orderBy('users.display_name', 'asc');

    const records = await db('attendance_records')
      .where({ session_id: sessionId });

    const recordMap = {};
    records.forEach((r) => { recordMap[r.student_id] = r; });

    const opensAtTime = new Date(session.opens_at || session.created_at).getTime();

    const studentList = students.map((s) => {
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

      const item = {
        student_id: s.id,
        display_name: s.display_name,
        avatar_url: s.avatar_url,
        status,
        recorded_at: recordedAt,
        elapsed_minutes: elapsedMinutes,
      };

      if (!isParent) {
        item.phone = s.phone;
        item.email = s.email;
      }

      return item;
    });

    const presentStudents = studentList
      .filter((s) => s.status === 'present' || s.status === 'late' || s.status === 'excused')
      .sort((a, b) => {
        if (!a.recorded_at) return 1;
        if (!b.recorded_at) return -1;
        return new Date(a.recorded_at) - new Date(b.recorded_at);
      });

    const absentStudents = studentList
      .filter((s) => s.status === 'absent' || s.status === 'unrecorded')
      .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || '', 'fa'));

    const counts = {
      total: students.length,
      present: presentStudents.filter((s) => s.status === 'present').length,
      late: presentStudents.filter((s) => s.status === 'late').length,
      excused: presentStudents.filter((s) => s.status === 'excused').length,
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

  async getHistory(classId, studentId, currentUser = null) {
    if (currentUser) {
      await assertOwnsClass(currentUser, classId, { allowEnrolled: true });
    }

    const sessions = await db('attendance_sessions')
      .where({ class_id: classId })
      .orderBy('created_at', 'desc')
      .limit(30);

    if (sessions.length === 0) {
      return [];
    }

    const sessionIds = sessions.map((s) => s.id);

    if (studentId) {
      const records = await db('attendance_records')
        .whereIn('session_id', sessionIds)
        .andWhere({ student_id: studentId });

      const recBySession = new Map();
      for (const rec of records) {
        recBySession.set(rec.session_id, rec);
      }

      return sessions.map((session) => {
        const rec = recBySession.get(session.id);
        return {
          ...session,
          student_status: rec ? rec.status : 'absent',
          recorded_at: rec ? rec.recorded_at : null,
        };
      });
    }

    const statsRows = await db('attendance_records')
      .whereIn('session_id', sessionIds)
      .groupBy('session_id')
      .select(
        'session_id',
        db.raw('COUNT(*) as total_recorded'),
        db.raw("COUNT(CASE WHEN status = 'present' THEN 1 END) as present_count"),
        db.raw("COUNT(CASE WHEN status = 'late' THEN 1 END) as late_count"),
        db.raw("COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent_count")
      );

    const statsBySession = new Map();
    for (const row of statsRows) {
      statsBySession.set(row.session_id, {
        total_recorded: parseInt(row.total_recorded || 0, 10),
        present: parseInt(row.present_count || 0, 10),
        late: parseInt(row.late_count || 0, 10),
        absent: parseInt(row.absent_count || 0, 10),
      });
    }

    return sessions.map((session) => ({
      ...session,
      stats: statsBySession.get(session.id) || {
        total_recorded: 0,
        present: 0,
        late: 0,
        absent: 0,
      },
    }));
  }
}

module.exports = new AttendanceService();
