const db = require('../../config/database');
const { generateId, now, parsePagination, paginatedResponse } = require('../../utils/dbHelpers');
const { isSchoolAdmin, forbiddenError, notFoundError } = require('../../middleware/auth');

class NotificationService {
  async create({ user_id, title, body, type, priority, reference_id, reference_type, data }) {
    const id = generateId();
    const timestamp = now();
    const payloadData = typeof data === 'string'
      ? data
      : JSON.stringify({
          ...(data && typeof data === 'object' ? data : {}),
          priority: priority || 'normal',
          reference_id: reference_id || null,
          reference_type: reference_type || null,
        });

    await db('notifications').insert({
      id,
      user_id,
      title,
      body: body || '',
      type: type || 'general',
      data: payloadData,
      is_read: false,
      created_at: timestamp,
    });
    return db('notifications').where({ id }).first();
  }

  async notifyTeachers({ sender, sender_id, sender_name, teacher_ids, title, body, priority = 'high', category = 'administrative' }) {
    const result = await this.sendBroadcast({
      sender,
      sender_id,
      sender_name,
      target_audience: 'teachers',
      teacher_ids,
      title,
      body,
      priority,
      category,
      is_mandatory: true,
    });
    return {
      recipients_count: result.recipients_count,
      teachers: result.recipients,
      announcement_id: result.announcement_id,
    };
  }

  async sendBroadcast({
    sender,
    sender_id,
    sender_name,
    target_audience = 'students',
    target_grades = ['*'],
    teacher_ids = null,
    title,
    body,
    priority = 'high',
    category = 'administrative',
    is_mandatory = true,
    is_pinned = false,
  }) {
    if (!title || !body) {
      const err = new Error('عنوان و متن اعلان الزامی است');
      err.statusCode = 400;
      throw err;
    }

    const senderUser = sender || await db('users').where({ id: sender_id }).first();
    if (!senderUser || !senderUser.school_id) {
      throw notFoundError('فرستنده معتبر یافت نشد');
    }

    // Only school admins/managers may broadcast to the whole school ('all') or to teachers/parents (#14/A5)
    if (!isSchoolAdmin(senderUser) && target_audience !== 'students') {
      throw forbiddenError('ارسال اعلان سراسری فقط برای مدیران مدرسه مجاز است');
    }

    let targetRoles = ['student'];
    if (target_audience === 'teachers') targetRoles = ['teacher'];
    else if (target_audience === 'students') targetRoles = ['student'];
    else if (target_audience === 'parents') targetRoles = ['parent'];
    else if (target_audience === 'students_parents') targetRoles = ['student', 'parent'];
    else if (target_audience === 'all') targetRoles = ['student', 'teacher', 'parent'];

    let query = db('users')
      .where({ school_id: senderUser.school_id })
      .whereIn('role', targetRoles)
      .whereNot('id', senderUser.id);

    if (target_audience === 'teachers' && Array.isArray(teacher_ids) && teacher_ids.length > 0 && !teacher_ids.includes('all')) {
      query = query.whereIn('id', teacher_ids);
    }

    const normalizedGrades = Array.isArray(target_grades) && target_grades.length > 0
      ? target_grades
      : ['*'];

    const targetUsers = await query.select('id', 'display_name', 'email', 'role', 'department', 'job_title');

    const timestamp = now();
    const announcementId = generateId();

    const authorLabel = isSchoolAdmin(senderUser)
      ? `مدیریت مدرسه (${sender_name || senderUser.display_name || 'مدیر'})`
      : (sender_name || senderUser.display_name || 'دبیر');

    await db.transaction(async (trx) => {
      try {
        await trx('announcements').insert({
          id: announcementId,
          teacher_id: senderUser.id,
          class_id: null,
          title: `🏛️ ${title}`,
          content: `${body}\n\n— ارسال شده توسط: ${authorLabel}`,
          priority: priority === 'urgent' ? 'urgent' : (priority === 'high' ? 'important' : 'normal'),
          is_pinned: Boolean(is_pinned || priority === 'urgent'),
          is_mandatory: Boolean(is_mandatory),
          target_audience: target_audience || 'all',
          target_class_ids: JSON.stringify(['*']),
          target_grades: JSON.stringify(normalizedGrades),
          target_subjects: JSON.stringify(['*']),
          attachments: JSON.stringify([]),
          created_at: timestamp,
        });
      } catch (err) {
        console.warn('Could not mirror broadcast to announcements table:', err.message);
      }

      if (targetUsers.length > 0) {
        const notifRows = targetUsers.map((u) => ({
          id: generateId(),
          user_id: u.id,
          title: `📢 پیام (${authorLabel}): ${title}`,
          body,
          type: 'announcement',
          data: JSON.stringify({
            priority: priority || 'high',
            category,
            reference_id: announcementId,
            reference_type: is_mandatory ? 'announcement' : 'admin_directive',
          }),
          is_read: false,
          created_at: timestamp,
        }));

        for (let i = 0; i < notifRows.length; i += 100) {
          await trx('notifications').insert(notifRows.slice(i, i + 100));
        }
      }
    });

    return {
      announcement_id: announcementId,
      recipients_count: targetUsers.length,
      recipients: targetUsers.map((u) => ({ id: u.id, name: u.display_name, role: u.role })),
    };
  }

  async getByUser(userId, page = 1, limit = 30) {
    const { offset } = parsePagination({ page, limit });
    const baseQuery = db('notifications').where({ user_id: userId });
    const [{ count }] = await baseQuery.clone().count('id as count');
    const [{ unread }] = await db('notifications')
      .where({ user_id: userId, is_read: false })
      .count('id as unread');

    const notifications = await baseQuery
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return {
      ...paginatedResponse(notifications, count, page, limit),
      unread_count: Number(unread),
    };
  }

  async markAsRead(notificationId, userId) {
    await db('notifications')
      .where({ id: notificationId, user_id: userId })
      .update({ is_read: true });
  }

  async markAllAsRead(userId) {
    await db('notifications')
      .where({ user_id: userId, is_read: false })
      .update({ is_read: true });
  }
}

module.exports = new NotificationService();
