const db = require('../../config/database');
const { insertAndReturn, updateAndReturn } = require('../../utils/dbHelpers');

class NotificationService {
  async getByUser(userId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const notifications = await db('notifications')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const unread = await db('notifications').where({ user_id: userId, is_read: false }).count('id as count').first();
    return { notifications, unread_count: parseInt(unread.count, 10) };
  }

  async markAsRead(notificationId, userId) {
    return updateAndReturn(db, 'notifications', { id: notificationId, user_id: userId }, { is_read: true });
  }

  async markAllAsRead(userId) {
    await db('notifications').where({ user_id: userId, is_read: false }).update({ is_read: true });
    return { success: true };
  }

  async create({ user_id, type, title, body, data }) {
    return insertAndReturn(db, 'notifications', {
      user_id,
      type,
      title,
      body,
      data: JSON.stringify(data || {}),
    });
  }

  async notifyTeachers({ sender_id, sender_name, teacher_ids, title, body, priority = 'important', category = 'administrative' }) {
    return this.sendBroadcast({
      sender_id,
      sender_name,
      target_audience: 'teachers',
      teacher_ids,
      title,
      body,
      priority,
      category,
      is_mandatory: false,
    });
  }

  async sendBroadcast({
    sender_id,
    sender_name,
    target_audience = 'students', // 'students' | 'teachers' | 'parents' | 'all'
    target_grades = ['*'], // ['*'] or ['پایه دهم', ...]
    teacher_ids = ['*'],
    title,
    body,
    priority = 'important',
    category = 'administrative',
    is_mandatory = true,
    is_pinned = false,
  }) {
    if (!title || !title.trim()) {
      const error = new Error('عنوان پیام یا بخشنامه مدیریت الزامی است');
      error.statusCode = 400;
      throw error;
    }
    if (!body || !body.trim()) {
      const error = new Error('متن پیام مدیریت الزامی است');
      error.statusCode = 400;
      throw error;
    }

    const gradesArray = Array.isArray(target_grades) ? target_grades : [target_grades];
    const hasWildcardGrade = gradesArray.includes('*') || gradesArray.length === 0;

    // 1. Determine target recipients
    let targetUsers = [];

    if (target_audience === 'teachers') {
      if (!teacher_ids || teacher_ids.includes('*') || teacher_ids.length === 0) {
        targetUsers = await db('users').where({ role: 'teacher' }).select('id', 'display_name');
      } else {
        targetUsers = await db('users').whereIn('id', teacher_ids).select('id', 'display_name');
      }
    } else if (target_audience === 'students') {
      let query = db('users').where({ role: 'student' });
      if (!hasWildcardGrade) {
        query = query.where((qb) => {
          gradesArray.forEach((g) => {
            const cleanG = g.replace('پایه ', '').trim();
            qb.orWhere('department', 'like', `%${cleanG}%`);
            qb.orWhere('department', 'like', `%${g}%`);
          });
        });
      }
      targetUsers = await query.select('id', 'display_name', 'department');
      if (targetUsers.length === 0) {
        targetUsers = await db('users').where({ role: 'student' }).select('id', 'display_name', 'department');
      }
    } else if (target_audience === 'parents') {
      targetUsers = await db('users').where({ role: 'parent' }).select('id', 'display_name');
    } else {
      // 'all'
      let query = db('users').whereIn('role', ['student', 'teacher', 'parent']);
      targetUsers = await query.select('id', 'display_name', 'role');
    }

    // 2. Create an announcement so it shows up in /dashboard/announcements
    let announcement = null;
    try {
      announcement = await insertAndReturn(db, 'announcements', {
        teacher_id: sender_id,
        class_id: null,
        title: title.trim(),
        content: body.trim(),
        target_audience: target_audience === 'teachers' ? 'all' : target_audience,
        target_grades: JSON.stringify(gradesArray),
        target_subjects: JSON.stringify(['*']),
        target_class_ids: JSON.stringify(['*']),
        is_mandatory: is_mandatory ? 1 : 0,
        priority,
        attachments: JSON.stringify([]),
        is_pinned: is_pinned ? 1 : 0,
      });
    } catch (e) {
      console.error('Error inserting management announcement:', e);
    }

    // 3. Create notifications for all target users
    const createdNotifications = [];
    for (const u of targetUsers) {
      try {
        const notif = await insertAndReturn(db, 'notifications', {
          user_id: u.id,
          type: 'management',
          title: `پیام مدیر مدرسه: ${title.trim()}`,
          body: body.trim(),
          data: JSON.stringify({
            sender_id,
            sender_name: sender_name || 'مدیریت مجتمع آموزشی',
            priority,
            category,
            is_management: true,
            announcement_id: announcement?.id || null,
            sent_at: new Date().toISOString(),
          }),
        });
        createdNotifications.push(notif);
      } catch (err) {
        console.error('Error creating notification for user', u.id, err);
      }
    }

    return {
      success: true,
      recipients_count: targetUsers.length,
      target_audience,
      announcement_id: announcement?.id || null,
      notifications_count: createdNotifications.length,
    };
  }
}

module.exports = new NotificationService();
