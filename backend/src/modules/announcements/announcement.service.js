const db = require('../../config/database');
const { generateId, now } = require('../../utils/dbHelpers');
const {
  assertSameSchool,
  assertOwnsClass,
  assertOwnsResource,
  notFoundError,
} = require('../../middleware/auth');

class AnnouncementService {
  safeParseArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async create(teacherOrId, data) {
    const teacher = typeof teacherOrId === 'object' && teacherOrId !== null
      ? teacherOrId
      : await db('users').where({ id: teacherOrId }).first();
    if (!teacher) {
      throw notFoundError('کاربر یافت نشد');
    }

    const id = generateId();
    const timestamp = now();

    const targetRoles = Array.isArray(data.target_roles) && data.target_roles.length > 0
      ? data.target_roles
      : ['*'];
    const targetGrades = Array.isArray(data.target_grades) && data.target_grades.length > 0
      ? data.target_grades
      : ['*'];
    const targetSubjects = Array.isArray(data.target_subjects) && data.target_subjects.length > 0
      ? data.target_subjects
      : ['*'];
    const targetClasses = Array.isArray(data.target_classes) && data.target_classes.length > 0
      ? data.target_classes
      : (Array.isArray(data.target_class_ids) && data.target_class_ids.length > 0
        ? data.target_class_ids.filter((c) => c !== '*')
        : (data.class_id ? [data.class_id] : []));

    const primaryClassId = data.class_id || (targetClasses.length === 1 ? targetClasses[0] : null);
    if (primaryClassId) {
      await assertOwnsClass(teacher, primaryClassId);
    }
    for (const cId of targetClasses) {
      await assertOwnsClass(teacher, cId);
    }

    const targetAudience = data.target_audience || (targetRoles.includes('*') ? 'all' : targetRoles[0] || 'all');

    await db('announcements').insert({
      id,
      teacher_id: teacher.id,
      class_id: primaryClassId,
      title: data.title,
      content: data.content || '',
      priority: data.priority || 'normal',
      is_pinned: Boolean(data.is_pinned),
      is_mandatory: data.is_mandatory !== undefined ? Boolean(data.is_mandatory) : true,
      target_audience: targetAudience,
      target_class_ids: JSON.stringify(targetClasses.length > 0 ? targetClasses : ['*']),
      target_grades: JSON.stringify(targetGrades),
      target_subjects: JSON.stringify(targetSubjects),
      attachments: JSON.stringify(data.attachments || []),
      created_at: timestamp,
    });

    try {
      let targetUserQuery = db('users')
        .where({ school_id: teacher.school_id })
        .whereNot('id', teacher.id);

      if (!targetRoles.includes('*')) {
        targetUserQuery = targetUserQuery.whereIn('role', targetRoles);
      }

      const candidateUsers = await targetUserQuery.select('id', 'role', 'department');

      let classStudentIds = null;
      if (targetClasses.length > 0) {
        const members = await db('class_members')
          .whereIn('class_id', targetClasses)
          .select('user_id');
        classStudentIds = new Set(members.map((m) => m.user_id));
      }

      const matchedUsers = candidateUsers.filter((u) => {
        if (classStudentIds && !classStudentIds.has(u.id)) {
          return false;
        }
        return true;
      });

      if (matchedUsers.length > 0) {
        const notifRows = matchedUsers.map((u) => ({
          id: generateId(),
          user_id: u.id,
          title: `📢 اطلاعیه جدید: ${data.title}`,
          body: (data.content || '').slice(0, 140),
          type: 'announcement',
          data: JSON.stringify({
            priority: data.priority === 'urgent' ? 'urgent' : 'high',
            reference_id: id,
            reference_type: 'announcement',
          }),
          is_read: false,
          created_at: timestamp,
        }));

        for (let i = 0; i < notifRows.length; i += 100) {
          await db('notifications').insert(notifRows.slice(i, i + 100));
        }
      }
    } catch (err) {
      console.warn('Warning: could not fan-out announcement notifications:', err.message);
    }

    return this.getById(id, teacher);
  }

  async getById(id, currentUser = null) {
    const item = await db('announcements')
      .leftJoin('users as teacher', 'teacher.id', 'announcements.teacher_id')
      .leftJoin('classes', 'classes.id', 'announcements.class_id')
      .where('announcements.id', id)
      .select(
        'announcements.*',
        'teacher.display_name as author_name',
        'teacher.role as author_role',
        'teacher.school_id as author_school_id',
        'classes.name as class_name',
        'classes.grade as class_grade_level',
        'classes.subject as class_subject'
      )
      .first();

    if (!item) return null;
    if (currentUser && item.author_school_id) {
      assertSameSchool(currentUser, { school_id: item.author_school_id });
    }
    return this.enrichAnnouncement(item);
  }

  enrichAnnouncement(a) {
    return {
      ...a,
      target_class_ids: this.safeParseArray(a.target_class_ids),
      target_grades: this.safeParseArray(a.target_grades),
      target_subjects: this.safeParseArray(a.target_subjects),
      attachments: this.safeParseArray(a.attachments),
    };
  }

  matchesUser(announcement, user, userClassIds = new Set(), userGrades = new Set()) {
    if (['admin', 'manager'].includes(user.role)) return true;
    if (announcement.teacher_id === user.id) return true;

    const audience = announcement.target_audience || 'all';
    if (audience === 'students' && user.role !== 'student') return false;
    if (audience === 'parents' && user.role !== 'parent') return false;
    if (audience === 'teachers' && user.role !== 'teacher') return false;

    if (announcement.class_id && !userClassIds.has(announcement.class_id)) {
      return false;
    }

    const grades = announcement.target_grades || [];
    if (grades.length > 0 && !grades.includes('*') && (user.role === 'student' || user.role === 'parent')) {
      if (userGrades.size > 0) {
        const hasGradeMatch = grades.some((g) => userGrades.has(String(g).trim()));
        if (!hasGradeMatch) return false;
      }
    }

    return true;
  }

  async getAll(user) {
    if (!user?.school_id) return [];

    const fullUser = await db('users').where({ id: user.id }).first() || user;

    const userClassIds = new Set();
    const userGrades = new Set();

    if (fullUser.role === 'student' || fullUser.role === 'parent') {
      const memberships = await db('class_members')
        .join('classes', 'classes.id', 'class_members.class_id')
        .where({
          'class_members.user_id': fullUser.id,
          'classes.school_id': fullUser.school_id,
        })
        .select('classes.id', 'classes.grade');
      memberships.forEach((m) => {
        userClassIds.add(m.id);
        if (m.grade) userGrades.add(String(m.grade).trim());
      });
    } else if (fullUser.role === 'teacher') {
      const teacherClasses = await db('classes')
        .where({ teacher_id: fullUser.id, is_active: true, school_id: fullUser.school_id })
        .select('id', 'grade');
      teacherClasses.forEach((c) => {
        userClassIds.add(c.id);
        if (c.grade) userGrades.add(String(c.grade).trim());
      });
    }

    const rows = await db('announcements')
      .join('users as teacher', 'teacher.id', 'announcements.teacher_id')
      .leftJoin('classes', 'classes.id', 'announcements.class_id')
      .where('teacher.school_id', fullUser.school_id)
      .select(
        'announcements.*',
        'teacher.display_name as author_name',
        'teacher.role as author_role',
        'classes.name as class_name',
        'classes.grade as class_grade_level',
        'classes.subject as class_subject'
      )
      .orderBy('announcements.is_pinned', 'desc')
      .orderBy('announcements.created_at', 'desc')
      .limit(100);

    let ackSet = new Set();
    try {
      const acks = await db('announcement_acknowledgements')
        .where({ user_id: fullUser.id })
        .select('announcement_id');
      ackSet = new Set(acks.map((a) => a.announcement_id));
    } catch {
      // Table might not exist yet if migration hasn't run
    }

    const enriched = rows
      .map((r) => ({
        ...this.enrichAnnouncement(r),
        acknowledged: ackSet.has(r.id),
      }))
      .filter((a) => this.matchesUser(a, fullUser, userClassIds, userGrades));

    return enriched;
  }

  async getPendingMandatory(user) {
    const all = await this.getAll(user);
    return all.filter((a) => !a.acknowledged && a.teacher_id !== user.id);
  }

  async acknowledge(announcementId, user) {
    const announcement = await db('announcements').where({ id: announcementId }).first();
    if (!announcement) {
      throw notFoundError('اطلاعیه مورد نظر یافت نشد');
    }

    const author = await db('users').where({ id: announcement.teacher_id }).first();
    if (author) {
      assertSameSchool(user, author);
    }

    const existing = await db('announcement_acknowledgements')
      .where({ announcement_id: announcementId, user_id: user.id })
      .first();

    if (existing) {
      return { already_acknowledged: true, acknowledged_at: existing.acknowledged_at, message: 'قبلاً تأیید شده است' };
    }

    const timestamp = now();
    await db('announcement_acknowledgements').insert({
      id: generateId(),
      announcement_id: announcementId,
      user_id: user.id,
      role: user.role,
      acknowledged_at: timestamp,
    });

    return {
      already_acknowledged: false,
      acknowledged_at: timestamp,
      message: 'مطالعه اطلاعیه با موفقیت ثبت و تأیید شد',
    };
  }

  async getStats(announcementId, user) {
    const announcement = await db('announcements').where({ id: announcementId }).first();
    if (!announcement) {
      throw notFoundError('اطلاعیه یافت نشد');
    }

    if (user) {
      const author = await db('users').where({ id: announcement.teacher_id }).first();
      if (author) {
        assertSameSchool(user, author);
      }
    }

    const acks = await db('announcement_acknowledgements as ack')
      .join('users', 'users.id', 'ack.user_id')
      .where('ack.announcement_id', announcementId)
      .select(
        'ack.id',
        'ack.user_id',
        'ack.acknowledged_at',
        'users.display_name',
        'users.role',
        'users.department'
      )
      .orderBy('ack.acknowledged_at', 'desc');

    return {
      total_acknowledged: acks.length,
      acknowledgements: acks,
    };
  }

  async getTargetingOptions(user) {
    const schoolId = user?.school_id;
    if (!schoolId) {
      return { grades: [], subjects: [], classes: [] };
    }

    const classes = await db('classes')
      .where({ is_active: true, school_id: schoolId })
      .select('id', 'name', 'grade as grade_level', 'subject', 'join_code as class_code')
      .orderBy('grade', 'asc');

    const classGrades = classes.map((c) => c.grade_level).filter(Boolean);
    const defaultGrades = ['هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم'];
    const grades = Array.from(new Set([...defaultGrades, ...classGrades]));

    const userSpecs = await db('users')
      .where({ role: 'teacher', school_id: schoolId })
      .whereNotNull('department')
      .andWhere('department', '!=', '')
      .distinct('department')
      .pluck('department');

    const classSubjects = classes.map((c) => c.subject).filter(Boolean);
    const defaultSubjects = ['ریاضی', 'فیزیک', 'شیمی', 'زیست‌شناسی', 'ادبیات فارسی', 'زبان انگلیسی', 'عربی', 'قرآن و معارف', 'علوم تجربی', 'مطالعات اجتماعی', 'هنر', 'ورزش'];
    const subjects = Array.from(new Set([...defaultSubjects, ...userSpecs, ...classSubjects]));

    return {
      grades,
      subjects,
      classes,
    };
  }

  async delete(id, user) {
    const announcement = await db('announcements').where({ id }).first();
    if (!announcement) {
      throw notFoundError('اطلاعیه یافت نشد');
    }

    const author = await db('users').where({ id: announcement.teacher_id }).first();
    if (author) {
      assertSameSchool(user, author);
    }
    assertOwnsResource(user, announcement, 'teacher_id', 'شما مجاز به حذف این اطلاعیه نیستید');

    await db('announcements').where({ id }).del();
    return { message: 'اطلاعیه حذف شد' };
  }
}

module.exports = new AnnouncementService();
