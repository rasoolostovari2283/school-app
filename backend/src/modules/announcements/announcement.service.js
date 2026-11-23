const db = require('../../config/database');
const { generateId, now } = require('../../utils/dbHelpers');
const {
  assertSameSchool,
  assertOwnsClass,
  assertOwnsResource,
  notFoundError,
} = require('../../middleware/auth');
const { sortClassesByGradeAscending } = require('../../utils/gradebookClassHelper');

const ALLOWED_PRIORITIES = new Set(['normal', 'important', 'urgent']);

function normalizeAudience(raw) {
  const val = String(raw || 'all').trim().toLowerCase();
  if (val === 'student' || val === 'students') return 'students';
  if (val === 'parent' || val === 'parents') return 'parents';
  if (val === 'teacher' || val === 'teachers') return 'teachers';
  return 'all';
}

function badRequestError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

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

  async getTeacherOwnedClassIds(user) {
    if (!user?.school_id) return [];
    const memberRows = await db('class_members')
      .where({ user_id: user.id, role: 'teacher' })
      .select('class_id');
    const memberIds = memberRows.map((r) => r.class_id);

    const rows = await db('classes')
      .where({ is_active: true, school_id: user.school_id })
      .andWhere(function () {
        this.where('teacher_id', user.id);
        if (memberIds.length > 0) {
          this.orWhereIn('id', memberIds);
        }
      })
      .select('id');

    return rows.map((r) => r.id);
  }

  async getParentLinkedStudentIds(parentUser) {
    if (!parentUser?.school_id) return [];
    const ids = new Set();

    const hasParentsTable = await db.schema.hasTable('parents');
    if (hasParentsTable) {
      const pRows = await db('parents')
        .where({ user_id: parentUser.id, school_id: parentUser.school_id })
        .select('student_user_id');
      pRows.forEach((r) => {
        if (r.student_user_id) ids.add(r.student_user_id);
      });
    }

    const linkRows = await db('parent_student_links')
      .join('users', 'users.id', 'parent_student_links.student_id')
      .where({
        'parent_student_links.parent_id': parentUser.id,
        'users.school_id': parentUser.school_id,
      })
      .select('users.id');
    linkRows.forEach((r) => ids.add(r.id));

    if (ids.size === 0 && parentUser.student_code) {
      const child = await db('users')
        .where({
          student_code: parentUser.student_code,
          role: 'student',
          school_id: parentUser.school_id,
        })
        .select('id')
        .first();
      if (child) ids.add(child.id);
    }

    return Array.from(ids);
  }

  async create(teacherOrId, data) {
    const teacher = typeof teacherOrId === 'object' && teacherOrId !== null
      ? teacherOrId
      : await db('users').where({ id: teacherOrId }).first();
    if (!teacher) {
      throw notFoundError('کاربر یافت نشد');
    }

    const cleanTitle = String(data?.title || '').trim();
    const cleanContent = String(data?.content || '').trim();
    if (!cleanTitle || cleanTitle.length < 2) {
      throw badRequestError('لطفاً عنوان اطلاعیه را وارد کنید');
    }
    if (!cleanContent) {
      throw badRequestError('لطفاً متن پیام اطلاعیه را وارد کنید');
    }

    const priority = ALLOWED_PRIORITIES.has(String(data.priority || '').trim())
      ? String(data.priority).trim()
      : 'normal';

    const targetAudience = normalizeAudience(
      data.target_audience ||
      (Array.isArray(data.target_roles) && data.target_roles.length === 1 ? data.target_roles[0] : 'all')
    );

    let explicitClasses = [];
    if (Array.isArray(data.target_class_ids) && data.target_class_ids.length > 0) {
      explicitClasses = data.target_class_ids
        .map((c) => String(c || '').trim())
        .filter((c) => c && c !== '*');
    } else if (Array.isArray(data.target_classes) && data.target_classes.length > 0) {
      explicitClasses = data.target_classes
        .map((c) => String(c || '').trim())
        .filter((c) => c && c !== '*');
    } else if (data.class_id && data.class_id !== '*') {
      explicitClasses = [String(data.class_id).trim()];
    }

    explicitClasses = Array.from(new Set(explicitClasses));

    // Verify ownership & school scope for every explicitly selected class
    for (const cId of explicitClasses) {
      await assertOwnsClass(teacher, cId);
    }

    // If a teacher didn't pick specific classes (selected "all my classes"),
    // scope strictly to that teacher's own DB classes so other classes aren't targeted unintentionally.
    let finalClassIds = explicitClasses;
    if (finalClassIds.length === 0 && teacher.role === 'teacher') {
      finalClassIds = await this.getTeacherOwnedClassIds(teacher);
    }

    const primaryClassId = finalClassIds.length === 1 ? finalClassIds[0] : null;
    const id = generateId();
    const timestamp = now();

    await db('announcements').insert({
      id,
      teacher_id: teacher.id,
      class_id: primaryClassId,
      title: cleanTitle,
      content: cleanContent,
      priority,
      is_pinned: Boolean(data.is_pinned),
      is_mandatory: data.is_mandatory !== undefined ? Boolean(data.is_mandatory) : false,
      target_audience: targetAudience,
      target_class_ids: JSON.stringify(finalClassIds.length > 0 ? finalClassIds : ['*']),
      target_grades: JSON.stringify(['*']),
      target_subjects: JSON.stringify(['*']),
      attachments: JSON.stringify(data.attachments || []),
      created_at: timestamp,
    });

    // Fan-out notifications strictly to matched recipients in the same school
    try {
      const recipientIds = new Set();

      if (finalClassIds.length > 0) {
        const enrolledStudents = await db('class_members')
          .join('users', 'users.id', 'class_members.user_id')
          .whereIn('class_members.class_id', finalClassIds)
          .andWhere({
            'class_members.role': 'student',
            'users.school_id': teacher.school_id,
          })
          .select('users.id');

        const studentIds = Array.from(new Set(enrolledStudents.map((s) => s.id)));

        if (targetAudience === 'students' || targetAudience === 'all') {
          studentIds.forEach((sid) => recipientIds.add(sid));
        }

        if ((targetAudience === 'parents' || targetAudience === 'all') && studentIds.length > 0) {
          const hasParentsTable = await db.schema.hasTable('parents');
          if (hasParentsTable) {
            const pRows = await db('parents')
              .whereIn('student_user_id', studentIds)
              .andWhere('school_id', teacher.school_id)
              .select('user_id');
            pRows.forEach((p) => {
              if (p.user_id) recipientIds.add(p.user_id);
            });
          }

          const linkRows = await db('parent_student_links')
            .join('users as pu', 'pu.id', 'parent_student_links.parent_id')
            .whereIn('parent_student_links.student_id', studentIds)
            .andWhere('pu.school_id', teacher.school_id)
            .select('pu.id');
          linkRows.forEach((p) => recipientIds.add(p.id));
        }
      } else if (teacher.school_id) {
        const roles = targetAudience === 'students'
          ? ['student']
          : targetAudience === 'parents'
            ? ['parent']
            : ['student', 'parent'];

        const schoolUsers = await db('users')
          .where({ school_id: teacher.school_id })
          .whereIn('role', roles)
          .whereNot('id', teacher.id)
          .select('id');
        schoolUsers.forEach((u) => recipientIds.add(u.id));
      }

      recipientIds.delete(teacher.id);

      const matchedIds = Array.from(recipientIds);
      if (matchedIds.length > 0) {
        const notifRows = matchedIds.map((uid) => ({
          id: generateId(),
          user_id: uid,
          title: `اطلاعیه جدید: ${cleanTitle}`,
          body: cleanContent.slice(0, 140),
          type: 'announcement',
          data: JSON.stringify({
            priority: priority === 'urgent' ? 'urgent' : 'high',
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

    const enriched = this.enrichAnnouncement(item);
    const explicitClassIds = enriched.target_class_ids.filter((c) => c && c !== '*');
    let targetClassNames = [];
    if (explicitClassIds.length > 0 && item.author_school_id) {
      const clsRows = await db('classes')
        .whereIn('id', explicitClassIds)
        .andWhere('school_id', item.author_school_id)
        .select('id', 'name', 'grade');
      targetClassNames = clsRows.map((c) => (c.grade ? `${c.name} (${c.grade})` : c.name));
    }

    return {
      ...enriched,
      teacher_name: item.author_name || 'معلم',
      teacher_role: item.author_role || 'teacher',
      target_class_names: targetClassNames,
      acknowledged_count: 0,
      is_acknowledged: false,
      acknowledged: false,
    };
  }

  enrichAnnouncement(a) {
    return {
      ...a,
      teacher_name: a.teacher_name || a.author_name || 'معلم',
      teacher_role: a.teacher_role || a.author_role || 'teacher',
      target_class_ids: this.safeParseArray(a.target_class_ids),
      target_grades: this.safeParseArray(a.target_grades),
      target_subjects: this.safeParseArray(a.target_subjects),
      attachments: this.safeParseArray(a.attachments),
    };
  }

  matchesUser(announcement, user, userClassIds = new Set()) {
    if (['admin', 'manager'].includes(user.role)) return true;
    if (announcement.teacher_id === user.id) return true;

    const audience = normalizeAudience(announcement.target_audience || 'all');
    if (audience === 'students' && user.role !== 'student') return false;
    if (audience === 'parents' && user.role !== 'parent') return false;
    if (audience === 'teachers' && user.role !== 'teacher') return false;

    const targetClassIds = Array.isArray(announcement.target_class_ids)
      ? announcement.target_class_ids.filter((c) => c && c !== '*')
      : [];

    if (targetClassIds.length > 0) {
      const hasClassMatch = targetClassIds.some((cid) => userClassIds.has(cid));
      if (!hasClassMatch) return false;
    } else if (announcement.class_id && !userClassIds.has(announcement.class_id)) {
      return false;
    }

    return true;
  }

  async getAll(user) {
    if (!user?.school_id) return [];

    const fullUser = (await db('users').where({ id: user.id }).first()) || user;
    const userClassIds = new Set();

    if (fullUser.role === 'student') {
      const memberships = await db('class_members')
        .join('classes', 'classes.id', 'class_members.class_id')
        .where({
          'class_members.user_id': fullUser.id,
          'classes.school_id': fullUser.school_id,
        })
        .select('classes.id');
      memberships.forEach((m) => userClassIds.add(m.id));
    } else if (fullUser.role === 'parent') {
      // Resolve every linked child's classes hierarchically (from `parents` AND `parent_student_links`)
      const childIds = await this.getParentLinkedStudentIds(fullUser);
      if (childIds.length > 0) {
        const childMemberships = await db('class_members')
          .join('classes', 'classes.id', 'class_members.class_id')
          .whereIn('class_members.user_id', childIds)
          .andWhere({
            'class_members.role': 'student',
            'classes.school_id': fullUser.school_id,
          })
          .select('classes.id');
        childMemberships.forEach((m) => userClassIds.add(m.id));
      }
    } else if (fullUser.role === 'teacher') {
      const ownedIds = await this.getTeacherOwnedClassIds(fullUser);
      ownedIds.forEach((cid) => userClassIds.add(cid));
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
    const ackCountMap = {};
    const announcementIds = rows.map((r) => r.id);
    if (announcementIds.length > 0) {
      try {
        const acks = await db('announcement_acknowledgements')
          .whereIn('announcement_id', announcementIds)
          .select('announcement_id', 'user_id');
        for (const a of acks) {
          ackCountMap[a.announcement_id] = (ackCountMap[a.announcement_id] || 0) + 1;
          if (a.user_id === fullUser.id) {
            ackSet.add(a.announcement_id);
          }
        }
      } catch {
        // Table might not exist yet
      }
    }

    // Load school class names map so announcements display exact selected class labels
    const schoolClasses = await db('classes')
      .where({ school_id: fullUser.school_id })
      .select('id', 'name', 'grade');
    const classNameLookup = {};
    schoolClasses.forEach((c) => {
      classNameLookup[c.id] = c.grade ? `${c.name} (${c.grade})` : c.name;
    });

    const enriched = rows
      .map((r) => {
        const base = this.enrichAnnouncement(r);
        const explicitClassIds = base.target_class_ids.filter((c) => c && c !== '*');
        const targetClassNames = explicitClassIds
          .map((cid) => classNameLookup[cid])
          .filter(Boolean);
        if (targetClassNames.length === 0 && r.class_name) {
          targetClassNames.push(r.class_grade_level ? `${r.class_name} (${r.class_grade_level})` : r.class_name);
        }

        const isAck = ackSet.has(r.id);
        return {
          ...base,
          target_class_names: targetClassNames,
          acknowledged: isAck,
          is_acknowledged: isAck,
          acknowledged_count: ackCountMap[r.id] || 0,
        };
      })
      .filter((a) => this.matchesUser(a, fullUser, userClassIds));

    return enriched;
  }

  async getPendingMandatory(user) {
    const all = await this.getAll(user);
    return all.filter((a) => a.is_mandatory && !a.acknowledged && a.teacher_id !== user.id);
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
        'users.display_name as user_name',
        'users.display_name',
        'users.role as user_role',
        'users.role',
        'users.student_code',
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

    let query = db('classes').where({ is_active: true, school_id: schoolId });

    if (user.role === 'teacher') {
      const ownedIds = await this.getTeacherOwnedClassIds(user);
      if (ownedIds.length === 0) {
        return { grades: [], subjects: [], classes: [] };
      }
      query = query.whereIn('id', ownedIds);
    }

    const rawClasses = await query.select(
      'id',
      'name',
      'grade',
      'grade as grade_level',
      'subject',
      'join_code as class_code'
    );

    const sortedClasses = sortClassesByGradeAscending(rawClasses);
    const classIds = sortedClasses.map((c) => c.id);

    const studentCountMap = {};
    if (classIds.length > 0) {
      const countRows = await db('class_members')
        .whereIn('class_id', classIds)
        .andWhere({ role: 'student' })
        .groupBy('class_id')
        .select('class_id')
        .count('id as cnt');
      countRows.forEach((r) => {
        studentCountMap[r.class_id] = Number(r.cnt) || 0;
      });
    }

    const classes = sortedClasses.map((c) => ({
      ...c,
      student_count: studentCountMap[c.id] || 0,
    }));

    const grades = Array.from(new Set(classes.map((c) => c.grade).filter(Boolean)));
    const subjects = Array.from(new Set(classes.map((c) => c.subject).filter(Boolean)));

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
