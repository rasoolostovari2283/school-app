const db = require('../../config/database');
const { generateId, insertAndReturn, updateAndReturn } = require('../../utils/dbHelpers');

class AnnouncementService {
  /**
   * Helper to parse JSON safely
   */
  _safeParse(val, fallback = []) {
    if (!val) return fallback;
    if (typeof val !== 'string') return val;
    try {
      return JSON.parse(val);
    } catch (e) {
      return fallback;
    }
  }

  /**
   * Create a new announcement (Teacher or Admin)
   */
  async create(teacherId, data) {
    const {
      title,
      content,
      target_audience = 'all', // 'all' | 'students' | 'parents'
      target_grades = ['*'], // Array of grade names or ['*']
      target_subjects = ['*'], // Array of subjects or ['*']
      target_class_ids = ['*'], // Array of class UUIDs or ['*']
      is_mandatory = true,
      priority = 'important', // 'normal' | 'important' | 'urgent'
      attachments = [],
      is_pinned = false,
    } = data;

    if (!title || !title.trim()) {
      const error = new Error('عنوان اطلاعیه الزامی است');
      error.statusCode = 400;
      throw error;
    }

    if (!content || !content.trim()) {
      const error = new Error('متن پیام اطلاعیه الزامی است');
      error.statusCode = 400;
      throw error;
    }

    const classIdsArray = Array.isArray(target_class_ids) ? target_class_ids : [target_class_ids];
    const gradesArray = Array.isArray(target_grades) ? target_grades : [target_grades];
    const subjectsArray = Array.isArray(target_subjects) ? target_subjects : [target_subjects];

    const primaryClassId = classIdsArray.length === 1 && classIdsArray[0] !== '*' ? classIdsArray[0] : null;

    const announcement = await insertAndReturn(db, 'announcements', {
      teacher_id: teacherId,
      class_id: primaryClassId,
      title: title.trim(),
      content: content.trim(),
      target_audience,
      target_grades: JSON.stringify(gradesArray),
      target_subjects: JSON.stringify(subjectsArray),
      target_class_ids: JSON.stringify(classIdsArray),
      is_mandatory: is_mandatory ? 1 : 0,
      priority,
      attachments: JSON.stringify(attachments || []),
      is_pinned: is_pinned ? 1 : 0,
    });

    return announcement;
  }

  /**
   * Get available targeting options (distinct grades, subjects, and classes)
   */
  async getTargetingOptions() {
    const allClasses = await db('classes')
      .where({ is_active: true })
      .select('id', 'name', 'grade', 'subject')
      .orderBy('name');

    const gradeSet = new Set();
    const subjectSet = new Set();

    allClasses.forEach(c => {
      if (c.grade && c.grade.trim()) {
        gradeSet.add(c.grade.trim());
      }
      if (c.subject && c.subject.trim()) {
        subjectSet.add(c.subject.trim());
      }
    });

    // Add standard Iranian K-12 grades if not yet in database so teachers can always pick them
    const standardGrades = [
      'پایه دهم',
      'پایه یازدهم',
      'پایه دوازدهم',
      'پایه هفتم',
      'پایه هشتم',
      'پایه نهم',
      'دوره دوم متوسطه',
      'دوره اول متوسطه',
      'پایه کنکور',
    ];
    standardGrades.forEach(g => gradeSet.add(g));

    // Add standard subjects
    const standardSubjects = [
      'ریاضی و هندسه',
      'فیزیک',
      'شیمی',
      'زیست‌شناسی',
      'ادبیات و فارسی',
      'زبان انگلیسی',
      'عربی',
      'دین و زندگی',
      'مشاوره و هدایت تحصیلی',
    ];
    standardSubjects.forEach(s => subjectSet.add(s));

    return {
      grades: Array.from(gradeSet),
      subjects: Array.from(subjectSet),
      classes: allClasses,
    };
  }

  /**
   * Get all announcements matching user role, grades, subjects & classes
   */
  async getAll(user) {
    if (user.role === 'teacher' || user.role === 'admin' || user.role === 'manager') {
      let query = db('announcements')
        .join('users as teacher', 'teacher.id', 'announcements.teacher_id')
        .leftJoin('classes', 'classes.id', 'announcements.class_id')
        .select(
          'announcements.*',
          'teacher.display_name as teacher_name',
          'teacher.avatar_url as teacher_avatar',
          'classes.name as class_name'
        );

      if (user.role === 'teacher') {
        query = query.where({ 'announcements.teacher_id': user.id });
      }

      const list = await query.orderBy('announcements.created_at', 'desc');

      for (const item of list) {
        item.target_grades = this._safeParse(item.target_grades, ['*']);
        item.target_subjects = this._safeParse(item.target_subjects, ['*']);
        item.target_class_ids = this._safeParse(item.target_class_ids, ['*']);
        item.attachments = this._safeParse(item.attachments, []);
        item.is_mandatory = Boolean(item.is_mandatory);
        item.is_pinned = Boolean(item.is_pinned);

        const acks = await db('announcement_acknowledgements')
          .join('users', 'users.id', 'announcement_acknowledgements.user_id')
          .where({ announcement_id: item.id })
          .select(
            'announcement_acknowledgements.*',
            'users.display_name as user_name',
            'users.role as user_role',
            'users.student_code'
          );

        item.acknowledged_count = acks.length;
        item.acknowledgements = acks;
      }

      return list;
    }

    // For Students and Parents:
    let enrolledClasses = [];
    if (user.role === 'student') {
      enrolledClasses = await db('class_members')
        .join('classes', 'classes.id', 'class_members.class_id')
        .where({ 'class_members.user_id': user.id })
        .select('classes.id', 'classes.name', 'classes.grade', 'classes.subject');
    } else if (user.role === 'parent') {
      const linkedStudentIds = await db('parent_student_links')
        .where({ parent_id: user.id })
        .pluck('student_id');

      if (user.student_code) {
        const matchingStudents = await db('users')
          .where({ role: 'student' })
          .andWhereRaw('LOWER(student_code) = ?', [user.student_code.toLowerCase()])
          .pluck('id');
        linkedStudentIds.push(...matchingStudents);
      }

      if (linkedStudentIds.length > 0) {
        enrolledClasses = await db('class_members')
          .join('classes', 'classes.id', 'class_members.class_id')
          .whereIn('class_members.user_id', linkedStudentIds)
          .select('classes.id', 'classes.name', 'classes.grade', 'classes.subject');
      }
    }

    const allAnnouncements = await db('announcements')
      .join('users as teacher', 'teacher.id', 'announcements.teacher_id')
      .leftJoin('classes', 'classes.id', 'announcements.class_id')
      .select(
        'announcements.*',
        'teacher.display_name as teacher_name',
        'teacher.avatar_url as teacher_avatar',
        'teacher.role as teacher_role',
        'teacher.job_title as teacher_job_title',
        'classes.name as class_name'
      )
      .orderBy('announcements.created_at', 'desc');

    const userAcks = await db('announcement_acknowledgements')
      .where({ user_id: user.id })
      .pluck('announcement_id');
    const ackSet = new Set(userAcks);

    const relevant = allAnnouncements.filter((ann) => {
      // 1. Audience Check
      if (ann.target_audience !== 'all') {
        if (user.role === 'student' && ann.target_audience !== 'students') return false;
        if (user.role === 'parent' && ann.target_audience !== 'parents') return false;
      }

      const targetGrades = this._safeParse(ann.target_grades, ['*']);
      const targetSubjects = this._safeParse(ann.target_subjects, ['*']);
      const targetClasses = this._safeParse(ann.target_class_ids, ['*']);

      const allGrades = targetGrades.includes('*') || targetGrades.length === 0;
      const allSubjects = targetSubjects.includes('*') || targetSubjects.length === 0;
      const allClasses = targetClasses.includes('*') || targetClasses.length === 0;

      // If everything is wildcard, it is a school-wide announcement
      if (allGrades && allSubjects && allClasses) {
        return true;
      }

      // Helper for flexible matching (e.g. "دهم" matching "پایه دهم ریاضی" or "ریاضی" matching "ریاضی ۱ و هندسه")
      const matchesTarget = (targetList, text) => {
        if (!text) return false;
        const t = text.toLowerCase().trim();
        return targetList.some((target) => {
          if (!target || target === '*') return true;
          const tgt = target.toLowerCase().trim();
          if (t.includes(tgt) || tgt.includes(t)) return true;
          const words = tgt.split(/[\s،,]+/).filter((w) => w.length > 1 && !['پایه', 'درس', 'کلاس', 'و', 'یا'].includes(w));
          if (words.length > 0 && words.some((w) => t.includes(w))) return true;
          return false;
        });
      };

      // Check if student's profile department/grade matches (e.g. 'پایه دهم ریاضی - کلاس ۱۰۱')
      const userDept = (user.department || '').toLowerCase();
      const userDeptMatches = allGrades || matchesTarget(targetGrades, userDept);
      if (allSubjects && allClasses && userDeptMatches) {
        return true;
      }

      // Check if ANY of the student's/child's enrolled classes matches the criteria
      const hasMatchingClass = enrolledClasses.some((cls) => {
        // Grade check
        let gradeMatches = allGrades || matchesTarget(targetGrades, cls.grade);

        // Subject check
        let subjectMatches = allSubjects || matchesTarget(targetSubjects, cls.subject);

        // Class check
        let classMatches = allClasses || targetClasses.includes(cls.id) || ann.class_id === cls.id;

        return gradeMatches && subjectMatches && classMatches;
      });

      return hasMatchingClass;
    });

    return relevant.map((item) => ({
      ...item,
      target_grades: this._safeParse(item.target_grades, ['*']),
      target_subjects: this._safeParse(item.target_subjects, ['*']),
      target_class_ids: this._safeParse(item.target_class_ids, ['*']),
      attachments: this._safeParse(item.attachments, []),
      is_mandatory: Boolean(item.is_mandatory),
      is_pinned: Boolean(item.is_pinned),
      is_acknowledged: ackSet.has(item.id),
      is_management: Boolean(
        item.teacher_role === 'admin' ||
        item.teacher_role === 'manager' ||
        (item.teacher_name || '').includes('مدیر')
      ),
    }));
  }



  /**
   * Get pending mandatory announcements for the user (Blocking modal on login/dashboard entry)
   */
  async getPendingMandatory(user) {
    if (user.role === 'teacher' || user.role === 'admin' || user.role === 'manager') {
      return []; // Teachers and admins don't get blocked by their own announcements
    }

    const announcements = await this.getAll(user);
    // Return all mandatory announcements that have NOT been acknowledged
    return announcements.filter((a) => a.is_mandatory && !a.is_acknowledged);
  }

  /**
   * Acknowledge an announcement (Student or Parent confirms reading it)
   */
  async acknowledge(announcementId, user) {
    const announcement = await db('announcements').where({ id: announcementId }).first();
    if (!announcement) {
      const error = new Error('اطلاعیه مورد نظر یافت نشد');
      error.statusCode = 404;
      throw error;
    }

    const existing = await db('announcement_acknowledgements')
      .where({ announcement_id: announcementId, user_id: user.id })
      .first();

    if (existing) {
      return { success: true, message: 'این اطلاعیه قبلاً توسط شما تایید شده است', already_acknowledged: true };
    }

    await insertAndReturn(db, 'announcement_acknowledgements', {
      announcement_id: announcementId,
      user_id: user.id,
      role: user.role,
    });

    return {
      success: true,
      message: 'پیام تایید شد و دسترسی به پنل باز گردید',
      announcement_id: announcementId,
    };
  }

  /**
   * Get detailed acknowledgement stats for teacher/admin
   */
  async getStats(announcementId) {
    const announcement = await db('announcements').where({ id: announcementId }).first();
    if (!announcement) {
      const error = new Error('اطلاعیه مورد نظر یافت نشد');
      error.statusCode = 404;
      throw error;
    }

    const acknowledgements = await db('announcement_acknowledgements')
      .join('users', 'users.id', 'announcement_acknowledgements.user_id')
      .where({ announcement_id: announcementId })
      .select(
        'announcement_acknowledgements.*',
        'users.display_name as user_name',
        'users.role as user_role',
        'users.student_code',
        'users.phone'
      )
      .orderBy('announcement_acknowledgements.acknowledged_at', 'desc');

    return {
      announcement_id: announcementId,
      total_acknowledged: acknowledgements.length,
      acknowledgements,
    };
  }

  /**
   * Delete announcement
   */
  async delete(announcementId, user) {
    const announcement = await db('announcements').where({ id: announcementId }).first();
    if (!announcement) {
      const error = new Error('اطلاعیه یافت نشد');
      error.statusCode = 404;
      throw error;
    }

    if (user.role !== 'admin' && announcement.teacher_id !== user.id) {
      const error = new Error('شما مجاز به حذف این اطلاعیه نیستید');
      error.statusCode = 403;
      throw error;
    }

    await db('announcements').where({ id: announcementId }).del();
    return { success: true, message: 'اطلاعیه با موفقیت حذف گردید' };
  }
}

module.exports = new AnnouncementService();
