const { v4: uuidv4 } = require('uuid');
const db = require('../../config/database');
const { generateId, now, parsePagination, paginatedResponse } = require('../../utils/dbHelpers');
const { ensureUserHasUsername } = require('../../utils/usernameHelper');
const {
  isSchoolAdmin,
  assertSameSchool,
  assertOwnsClass,
  forbiddenError,
  notFoundError,
} = require('../../middleware/auth');

class MessageService {
  normalizeTeacherRecord(row) {
    return {
      id: row.id,
      display_name: row.display_name || row.name || 'دبیر',
      role: row.role || 'teacher',
      subject: row.department || row.job_title || 'عمومی',
      email: row.email || '',
      phone: row.phone || '',
      username: row.username || '',
      grade_level: '',
    };
  }

  async assertGroupAccess(user, groupId, { requireMember = true } = {}) {
    const group = await db('message_groups').where({ id: groupId }).first();
    if (!group) {
      throw notFoundError('گروه یافت نشد');
    }

    if (group.created_by) {
      const creator = await db('users').where({ id: group.created_by }).first();
      if (creator) {
        assertSameSchool(user, creator, 'دسترسی به گروه مدرسه دیگر مجاز نیست');
      }
    } else {
      const memberWithSchool = await db('message_group_members as gm')
        .join('users as u', 'u.id', 'gm.user_id')
        .where({ 'gm.group_id': groupId })
        .whereNotNull('u.school_id')
        .select('u.school_id')
        .first();
      if (memberWithSchool) {
        assertSameSchool(user, memberWithSchool, 'دسترسی به گروه مدرسه دیگر مجاز نیست');
      }
    }

    if (requireMember && !isSchoolAdmin(user) && group.created_by !== user.id) {
      const membership = await db('message_group_members')
        .where({ group_id: groupId, user_id: user.id })
        .first();
      if (!membership) {
        throw forbiddenError('شما عضو این گروه نیستید');
      }
    }

    return group;
  }

  async getDirectory(currentUser) {
    const userId = currentUser.id;
    const schoolId = currentUser.school_id;

    if (!schoolId) {
      return {
        all: [],
        staff: [],
        teachers: [],
        students: [],
        parents: [],
        classes: [],
        studentsByGrade: {},
        grades: [],
        stats: { totalStudents: 0, totalStaff: 0, totalParents: 0, totalClasses: 0 },
      };
    }

    const isStaffCaller = ['admin', 'manager', 'teacher', 'counselor', 'financial_officer', 'accountant'].includes(currentUser.role);

    const teacherRows = await db('users')
      .where({ school_id: schoolId })
      .whereIn('role', ['teacher', 'counselor', 'financial_officer', 'accountant', 'admin', 'manager'])
      .whereNot('id', userId)
      .select('id', 'display_name', 'role', 'department', 'job_title', 'email', 'phone', 'username', 'avatar_url')
      .orderBy('display_name', 'asc');

    for (const r of teacherRows) {
      if (!r.username) {
        r.username = await ensureUserHasUsername(r.id);
      }
    }
    const teachers = teacherRows.map((r) => {
      const normalized = this.normalizeTeacherRecord(r);
      if (!isStaffCaller) {
        normalized.phone = '';
        normalized.email = '';
      }
      return normalized;
    });

    const classRows = await db('classes')
      .leftJoin('users as t', 't.id', 'classes.teacher_id')
      .where({ 'classes.is_active': true, 'classes.school_id': schoolId })
      .select(
        'classes.id',
        'classes.name',
        'classes.join_code as class_code',
        'classes.grade as grade_level',
        'classes.subject',
        'classes.teacher_id',
        't.display_name as teacher_name'
      );

    const allStudents = await db('users')
      .where({ role: 'student', school_id: schoolId })
      .whereNot('id', userId)
      .select('id', 'display_name', 'email', 'phone', 'username', 'student_code', 'avatar_url')
      .orderBy('display_name', 'asc');

    for (const s of allStudents) {
      if (!s.username) {
        s.username = await ensureUserHasUsername(s.id);
      }
    }

    let memberships = [];
    try {
      const schoolClassIds = classRows.map((c) => c.id);
      if (schoolClassIds.length > 0) {
        memberships = await db('class_members as cm')
          .join('classes as c', 'c.id', 'cm.class_id')
          .whereIn('cm.class_id', schoolClassIds)
          .select('cm.user_id', 'cm.class_id', 'c.name as class_name', 'c.grade as grade_level', 'c.subject');
      }
    } catch (_e) { /* ignore */ }

    const studentClassMap = {};
    memberships.forEach((m) => {
      if (!studentClassMap[m.user_id]) studentClassMap[m.user_id] = [];
      studentClassMap[m.user_id].push(m);
    });

    const students = allStudents.map((s) => {
      const mList = studentClassMap[s.id] || [];
      const firstClass = mList[0];
      return {
        id: s.id,
        display_name: s.display_name || 'دانش‌آموز',
        role: 'student',
        grade_level: firstClass?.grade_level || 'عمومی',
        class_name: firstClass?.class_name || `پایه ${firstClass?.grade_level || 'عمومی'}`,
        class_id: firstClass?.class_id || null,
        student_code: isStaffCaller ? (s.student_code || '') : '',
        phone: isStaffCaller ? (s.phone || '') : '',
        username: s.username || '',
      };
    });

    const rawParentRows = await db('users')
      .where({ role: 'parent', school_id: schoolId })
      .whereNot('id', userId)
      .select('id', 'display_name', 'email', 'phone', 'username', 'student_code', 'avatar_url')
      .orderBy('display_name', 'asc');

    for (const p of rawParentRows) {
      if (!p.username) {
        p.username = await ensureUserHasUsername(p.id);
      }
    }

    const parentRows = rawParentRows.map((p) => ({
      ...p,
      email: isStaffCaller ? (p.email || '') : '',
      phone: isStaffCaller ? (p.phone || '') : '',
      student_code: isStaffCaller ? (p.student_code || '') : '',
    }));

    const studentsByGrade = {};
    students.forEach((s) => {
      const g = s.grade_level || 'سایر';
      if (!studentsByGrade[g]) studentsByGrade[g] = [];
      studentsByGrade[g].push(s);
    });

    const all = [...teachers, ...students, ...parentRows];

    return {
      all,
      staff: teachers,
      teachers,
      students,
      parents: parentRows,
      classes: classRows,
      studentsByGrade,
      grades: Object.keys(studentsByGrade),
      stats: {
        totalStudents: students.length,
        totalStaff: teachers.length,
        totalParents: parentRows.length,
        totalClasses: classRows.length,
      },
    };
  }

  async searchUserByIdentifier(query, currentUser) {
    if (!query || !String(query).trim() || !currentUser?.school_id) return [];
    const clean = String(query).trim().replace(/^@/, '').toLowerCase();

    const rows = await db('users')
      .where({ school_id: currentUser.school_id })
      .where(function () {
        this.whereRaw('LOWER(username) LIKE ?', [`%${clean}%`])
          .orWhereRaw('LOWER(display_name) LIKE ?', [`%${clean}%`])
          .orWhere('phone', 'like', `%${clean}%`)
          .orWhere('student_code', 'like', `%${clean}%`);
      })
      .select('id', 'display_name', 'username', 'role', 'department', 'phone', 'student_code', 'avatar_url')
      .limit(20);

    for (const r of rows) {
      if (!r.username) {
        r.username = await ensureUserHasUsername(r.id);
      }
    }
    return rows;
  }

  async ensureUserExists(uIdOrObj, schoolId = null) {
    const id = typeof uIdOrObj === 'string' ? uIdOrObj : uIdOrObj?.id;
    if (!id) return null;

    const query = db('users').where({ id });
    if (schoolId) {
      query.andWhere({ school_id: schoolId });
    }
    const existing = await query.first();
    if (existing) {
      if (!existing.username) {
        await ensureUserHasUsername(existing.id);
      }
      return existing.id;
    }

    if (typeof uIdOrObj === 'string') {
      const clean = uIdOrObj.trim().replace(/^@/, '').toLowerCase();
      const byUsernameQuery = db('users').whereRaw('LOWER(username) = ?', [clean]);
      if (schoolId) {
        byUsernameQuery.andWhere({ school_id: schoolId });
      }
      const byUsername = await byUsernameQuery.first();
      if (byUsername) return byUsername.id;
    }

    return null;
  }

  async checkQuietHours(senderId, receiverId, classId) {
    let cls = null;
    if (classId) {
      cls = await db('classes').where({ id: classId }).first();
    } else if (receiverId) {
      cls = await db('classes').where({ teacher_id: receiverId }).first();
    }

    if (!cls || !cls.quiet_hours) return { allowed: true };

    const sender = await db('users').where({ id: senderId }).first();
    if (sender && ['teacher', 'admin', 'manager'].includes(sender.role)) return { allowed: true };

    return { allowed: true, delayed_for_quiet_hours: false };
  }

  async send(senderOrId, { receiver_id, receiver_username, class_id, content, attachments }) {
    const sender = typeof senderOrId === 'object' && senderOrId !== null
      ? senderOrId
      : await db('users').where({ id: senderOrId }).first();

    if (!sender) {
      throw notFoundError('فرستنده یافت نشد');
    }

    if (!content || !String(content).trim()) {
      const err = new Error('متن پیام نمی‌تواند خالی باشد');
      err.statusCode = 400;
      throw err;
    }

    if (class_id) {
      await assertOwnsClass(sender, class_id, { allowEnrolled: true });
    }

    let finalReceiverId = receiver_id || null;
    if (!finalReceiverId && receiver_username) {
      const clean = String(receiver_username).trim().replace(/^@/, '').toLowerCase();
      const targetUser = await db('users')
        .where({ school_id: sender.school_id })
        .whereRaw('LOWER(username) = ?', [clean])
        .first();
      if (!targetUser) {
        throw notFoundError(`کاربری با نام کاربری @${clean} یافت نشد`);
      }
      finalReceiverId = targetUser.id;
    }

    if (finalReceiverId) {
      const targetUser = await db('users').where({ id: finalReceiverId }).first();
      if (!targetUser) {
        throw notFoundError('مخاطب مورد نظر یافت نشد');
      }
      assertSameSchool(sender, targetUser, 'ارسال پیام به کاربران مدرسه دیگر مجاز نیست');
      finalReceiverId = targetUser.id;
    }

    const qhCheck = await this.checkQuietHours(sender.id, finalReceiverId, class_id);

    const id = generateId();
    const timestamp = now();
    await db('messages').insert({
      id,
      sender_id: sender.id,
      receiver_id: finalReceiverId || null,
      class_id: class_id || null,
      content: String(content).trim(),
      attachments: JSON.stringify(attachments || []),
      is_broadcast: false,
      is_read: false,
      is_edited: false,
      sent_at: timestamp,
    });

    if (finalReceiverId && finalReceiverId !== sender.id) {
      try {
        await db('notifications').insert({
          id: generateId(),
          user_id: finalReceiverId,
          title: `💬 پیام جدید از ${sender?.display_name || 'کاربر'}`,
          body: String(content).trim().slice(0, 120),
          type: 'message',
          data: JSON.stringify({ sender_id: sender.id, message_id: id }),
          is_read: false,
          created_at: timestamp,
        });
      } catch (_e) { /* ignore notification table failures */ }
    }

    const msg = await db('messages').where({ id }).first();
    return {
      ...msg,
      sender_name: sender?.display_name || 'کاربر',
      sender_role: sender?.role || 'student',
      sender_username: sender?.username || '',
      quiet_hours_delayed: qhCheck.delayed_for_quiet_hours || false,
    };
  }

  async editMessage(userId, messageId, newContent) {
    if (!newContent || !String(newContent).trim()) {
      const err = new Error('متن پیام نمی‌تواند خالی باشد');
      err.statusCode = 400;
      throw err;
    }

    const msg = await db('messages').where({ id: messageId }).first();
    if (!msg) {
      throw notFoundError('پیام مورد نظر یافت نشد');
    }
    if (msg.sender_id !== userId) {
      throw forbiddenError('شما فقط می‌توانید پیام‌های خودتان را ویرایش کنید');
    }

    const timestamp = now();
    await db('messages').where({ id: messageId }).update({
      content: String(newContent).trim(),
      is_edited: true,
      edited_at: timestamp,
    });

    return db('messages').where({ id: messageId }).first();
  }

  async deleteMessage(userId, messageId) {
    const msg = await db('messages').where({ id: messageId }).first();
    if (!msg) {
      throw notFoundError('پیام یافت نشد');
    }

    const user = await db('users').where({ id: userId }).first();
    const isAdmin = user && ['admin', 'manager'].includes(user.role);
    if (msg.sender_id !== userId && !isAdmin) {
      throw forbiddenError('شما فقط می‌توانید پیام‌های خودتان را حذف کنید');
    }

    if (msg.sender_id !== userId && isAdmin) {
      const sender = await db('users').where({ id: msg.sender_id }).first();
      if (sender) {
        assertSameSchool(user, sender);
      }
    }

    await db('messages').where({ id: messageId }).del();
    return { deleted: true, id: messageId };
  }

  async getConversations(userOrId) {
    const currentUser = typeof userOrId === 'object' && userOrId !== null
      ? userOrId
      : await db('users').where({ id: userOrId }).first();
    if (!currentUser) return [];

    const userId = currentUser.id;
    const schoolId = currentUser.school_id;

    const sent = await db('messages')
      .where({ sender_id: userId })
      .whereNotNull('receiver_id')
      .select('receiver_id as other_id')
      .groupBy('receiver_id');

    const received = await db('messages')
      .where({ receiver_id: userId })
      .select('sender_id as other_id')
      .groupBy('sender_id');

    const otherIds = [...new Set([...sent.map((r) => r.other_id), ...received.map((r) => r.other_id)])];

    let otherUsers = [];
    if (otherIds.length > 0) {
      const userQuery = db('users')
        .whereIn('id', otherIds)
        .select('id', 'display_name', 'avatar_url', 'role', 'department', 'username', 'phone', 'school_id');
      if (schoolId) {
        userQuery.andWhere({ school_id: schoolId });
      }
      otherUsers = await userQuery;
    }
    const usersById = new Map(otherUsers.map((u) => [u.id, u]));

    let pairMessages = [];
    const validOtherIds = Array.from(usersById.keys());
    if (validOtherIds.length > 0) {
      pairMessages = await db('messages')
        .where(function () {
          this.where({ sender_id: userId }).whereIn('receiver_id', validOtherIds)
            .orWhere({ receiver_id: userId }).whereIn('sender_id', validOtherIds);
        })
        .orderBy('sent_at', 'desc');
    }

    const lastMessageByOther = new Map();
    const unreadCountByOther = new Map();
    for (const msg of pairMessages) {
      const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      if (!lastMessageByOther.has(otherId)) {
        lastMessageByOther.set(otherId, msg);
      }
      if (msg.sender_id === otherId && msg.receiver_id === userId && !msg.is_read) {
        unreadCountByOther.set(otherId, (unreadCountByOther.get(otherId) || 0) + 1);
      }
    }

    const conversations = [];
    for (const otherId of validOtherIds) {
      const otherUser = usersById.get(otherId);
      if (!otherUser) continue;

      if (!otherUser.username) {
        otherUser.username = await ensureUserHasUsername(otherUser.id);
      }

      conversations.push({
        user: otherUser,
        last_message: lastMessageByOther.get(otherId) || null,
        unread_count: unreadCountByOther.get(otherId) || 0,
      });
    }

    if (conversations.length < 3 && schoolId) {
      const existingIds = new Set(conversations.map((c) => c.user.id));
      existingIds.add(userId);

      const otherStaff = await db('users')
        .where({ school_id: schoolId })
        .whereIn('role', ['teacher', 'counselor', 'financial_officer', 'accountant', 'admin', 'manager'])
        .whereNotIn('id', Array.from(existingIds))
        .select('id', 'display_name', 'avatar_url', 'role', 'department', 'username', 'phone')
        .limit(8);

      for (const staff of otherStaff) {
        if (!staff.username) {
          staff.username = await ensureUserHasUsername(staff.id);
        }
        conversations.push({
          user: staff,
          last_message: null,
          unread_count: 0,
        });
      }
    }

    return conversations.sort((a, b) => {
      const timeA = a.last_message?.sent_at || a.last_message?.created_at || '';
      const timeB = b.last_message?.sent_at || b.last_message?.created_at || '';
      return timeB.localeCompare(timeA);
    });
  }

  async getConversationMessages(userOrId, otherUserId, page = 1, limit = 100) {
    const currentUser = typeof userOrId === 'object' && userOrId !== null
      ? userOrId
      : await db('users').where({ id: userOrId }).first();
    if (!currentUser) {
      throw notFoundError('کاربر یافت نشد');
    }

    const otherUser = await db('users').where({ id: otherUserId }).first();
    if (!otherUser) {
      throw notFoundError('مخاطب یافت نشد');
    }
    assertSameSchool(currentUser, otherUser, 'مشاهده پیام‌های مدرسه دیگر مجاز نیست');

    const userId = currentUser.id;
    const { offset } = parsePagination({ page, limit });

    await db('messages')
      .where({ sender_id: otherUserId, receiver_id: userId, is_read: false })
      .update({ is_read: true });

    const baseQuery = db('messages')
      .where(function () {
        this.where({ sender_id: userId, receiver_id: otherUserId })
          .orWhere({ sender_id: otherUserId, receiver_id: userId });
      });

    const [{ count }] = await baseQuery.clone().count('id as count');
    const messages = await baseQuery
      .leftJoin('users as s', 's.id', 'messages.sender_id')
      .select(
        'messages.*',
        's.display_name as sender_name',
        's.role as sender_role',
        's.username as sender_username'
      )
      .orderBy('messages.sent_at', 'asc')
      .limit(limit)
      .offset(offset);

    return paginatedResponse(messages, count, page, limit);
  }

  generateInviteCode() {
    return uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();
  }

  async getGroups(user) {
    const allGroups = await db('message_groups')
      .join('users as creator', 'creator.id', 'message_groups.created_by')
      .where('creator.school_id', user.school_id)
      .select('message_groups.*')
      .orderBy('message_groups.created_at', 'desc');

    const myMemberships = await db('message_group_members')
      .where({ user_id: user.id })
      .select('group_id', 'role');
    const myGroupMap = {};
    myMemberships.forEach((m) => { myGroupMap[m.group_id] = m.role; });

    const visibleGroups = allGroups.filter((g) => {
      if (isSchoolAdmin(user)) return true;
      if (g.created_by === user.id) return true;
      if (myGroupMap[g.id]) return true;
      return false;
    });

    const visibleGroupIds = visibleGroups.map((g) => g.id);
    const lastMessagesByGroup = new Map();
    const memberCountsByGroup = new Map();

    if (visibleGroupIds.length > 0) {
      const groupMsgs = await db('message_group_messages')
        .whereIn('group_id', visibleGroupIds)
        .orderBy('sent_at', 'desc');
      for (const m of groupMsgs) {
        if (!lastMessagesByGroup.has(m.group_id)) {
          lastMessagesByGroup.set(m.group_id, m);
        }
      }

      const memberCounts = await db('message_group_members')
        .whereIn('group_id', visibleGroupIds)
        .groupBy('group_id')
        .select('group_id')
        .count('id as cnt');
      for (const row of memberCounts) {
        memberCountsByGroup.set(row.group_id, Number(row.cnt || 0));
      }
    }

    const enriched = [];
    for (const g of visibleGroups) {
      const lastMsg = lastMessagesByGroup.get(g.id) || null;
      const memberCount = memberCountsByGroup.get(g.id) || 1;

      enriched.push({
        ...g,
        last_message: lastMsg,
        members_count: Math.max(Number(memberCount), 1),
        my_role: myGroupMap[g.id] || (['admin', 'manager', 'teacher'].includes(user.role) ? 'admin' : 'member'),
      });
    }

    return enriched;
  }

  async createGroup(user, { name, description, avatar_url, category, member_ids }) {
    if (!name || !String(name).trim()) {
      const err = new Error('نام گروه الزامی است');
      err.statusCode = 400;
      throw err;
    }

    const id = generateId();
    const timestamp = now();

    const validMemberIds = [];
    if (Array.isArray(member_ids) && member_ids.length > 0) {
      for (const mId of member_ids) {
        if (mId && mId !== user.id) {
          const validMemberId = await this.ensureUserExists(mId, user.school_id);
          if (validMemberId && !validMemberIds.includes(validMemberId)) {
            validMemberIds.push(validMemberId);
          }
        }
      }
    }

    await db.transaction(async (trx) => {
      await trx('message_groups').insert({
        id,
        name: String(name).trim(),
        description: description || '',
        category: category || 'general',
        avatar_url: avatar_url || null,
        created_by: user.id,
        created_at: timestamp,
      });

      await trx('message_group_members').insert({
        id: generateId(),
        group_id: id,
        user_id: user.id,
        role: 'admin',
        joined_at: timestamp,
      });

      for (const validMemberId of validMemberIds) {
        await trx('message_group_members').insert({
          id: generateId(),
          group_id: id,
          user_id: validMemberId,
          role: 'member',
          joined_at: timestamp,
        });
      }
    });

    return db('message_groups').where({ id }).first();
  }

  async getGroupMembers(groupId, currentUser) {
    await this.assertGroupAccess(currentUser, groupId);

    const rows = await db('message_group_members as gm')
      .join('users as u', 'u.id', 'gm.user_id')
      .where({ 'gm.group_id': groupId, 'u.school_id': currentUser.school_id })
      .select(
        'u.id',
        'u.display_name',
        'u.username',
        'u.role as user_role',
        'u.department',
        'u.phone',
        'gm.role as group_role',
        'gm.joined_at'
      )
      .orderBy('gm.joined_at', 'asc');

    for (const r of rows) {
      if (!r.username) {
        r.username = await ensureUserHasUsername(r.id);
      }
    }
    return rows;
  }

  async addMemberToGroup(groupId, identifier, adderUser) {
    const group = await this.assertGroupAccess(adderUser, groupId);

    if (!identifier || !String(identifier).trim()) {
      const err = new Error('لطفاً نام کاربری، شماره تلفن یا شناسه کاربر را وارد کنید');
      err.statusCode = 400;
      throw err;
    }

    const clean = String(identifier).trim().replace(/^@/, '').toLowerCase();
    const targetUser = await db('users')
      .where({ school_id: adderUser.school_id })
      .where(function () {
        this.where({ id: identifier })
          .orWhereRaw('LOWER(username) = ?', [clean])
          .orWhere({ phone: clean })
          .orWhere({ student_code: clean })
          .orWhereRaw('LOWER(display_name) = ?', [clean]);
      })
      .first();

    if (!targetUser) {
      throw notFoundError(`کاربری با مشخصات «${identifier}» در سامانه یافت نشد`);
    }

    const exists = await db('message_group_members')
      .where({ group_id: groupId, user_id: targetUser.id })
      .first();

    if (exists) {
      return { already_member: true, user: targetUser };
    }

    const timestamp = now();
    await db('message_group_members').insert({
      id: generateId(),
      group_id: groupId,
      user_id: targetUser.id,
      role: 'member',
      joined_at: timestamp,
    });

    try {
      await db('notifications').insert({
        id: generateId(),
        user_id: targetUser.id,
        title: `👥 عضویت در گروه «${group.name}»`,
        body: `${adderUser.display_name || 'مدیر گروه'} شما را به گروه «${group.name}» اضافه کرد.`,
        type: 'group_invite',
        data: JSON.stringify({ group_id: groupId }),
        is_read: false,
        created_at: timestamp,
      });
    } catch (_e) { /* ignore */ }

    return { added: true, user: targetUser };
  }

  async removeMemberFromGroup(groupId, targetUserId, requester) {
    const group = await this.assertGroupAccess(requester, groupId);

    const isOwnerOrAdmin = group.created_by === requester.id || ['admin', 'manager', 'teacher'].includes(requester.role);
    if (!isOwnerOrAdmin && requester.id !== targetUserId) {
      throw forbiddenError('شما مجوز حذف عضو از این گروه را ندارید');
    }

    await db('message_group_members').where({ group_id: groupId, user_id: targetUserId }).del();
    return { removed: true, user_id: targetUserId };
  }

  async getGroupInviteLink(groupId, currentUser) {
    const group = await this.assertGroupAccess(currentUser, groupId);

    if (!group.invite_code) {
      const code = this.generateInviteCode();
      try {
        await db('message_groups').where({ id: groupId }).update({ invite_code: code });
      } catch (_e) { /* ignore */ }
      group.invite_code = code;
    }

    return {
      group_id: group.id,
      group_name: group.name,
      invite_code: group.invite_code,
      invite_link: `https://educonnect.ir/join/${group.invite_code}`,
    };
  }

  async joinGroupByLinkOrCode(user, codeOrLink) {
    if (!codeOrLink || !String(codeOrLink).trim()) {
      const err = new Error('کد دعوت یا لینک گروه الزامی است');
      err.statusCode = 400;
      throw err;
    }

    const raw = String(codeOrLink).trim();
    const code = raw.includes('/join/') ? raw.split('/join/').pop().trim() : raw;

    const group = await db('message_groups')
      .where({ invite_code: code.toUpperCase() })
      .orWhere({ id: code })
      .first();

    if (!group) {
      throw notFoundError('گروهی با این لینک یا کد دعوت یافت نشد');
    }

    await this.assertGroupAccess(user, group.id, { requireMember: false });

    const exists = await db('message_group_members')
      .where({ group_id: group.id, user_id: user.id })
      .first();

    const timestamp = now();
    if (!exists) {
      await db('message_group_members').insert({
        id: generateId(),
        group_id: group.id,
        user_id: user.id,
        role: 'member',
        joined_at: timestamp,
      });
    }

    return { joined: true, group };
  }

  async deleteGroup(groupId, user) {
    const group = await this.assertGroupAccess(user, groupId, { requireMember: false });
    if (group.created_by !== user.id && !['admin', 'manager'].includes(user.role)) {
      throw forbiddenError('فقط سازنده گروه یا مدیر مدرسه می‌تواند گروه را حذف کند');
    }

    await db.transaction(async (trx) => {
      await trx('message_group_messages').where({ group_id: groupId }).del();
      await trx('message_group_members').where({ group_id: groupId }).del();
      await trx('message_groups').where({ id: groupId }).del();
    });
    return { deleted: true };
  }

  async getGroupMessages(groupId, currentUser, limit = 100) {
    const group = await this.assertGroupAccess(currentUser, groupId);
    const messages = await db('message_group_messages as gm')
      .leftJoin('users as u', 'u.id', 'gm.sender_id')
      .where({ 'gm.group_id': groupId })
      .select(
        'gm.*',
        'u.display_name as sender_name',
        'u.role as sender_role'
      )
      .orderBy('gm.sent_at', 'asc')
      .limit(Number(limit) || 100);

    return { group, messages };
  }

  async sendGroupMessage(user, groupId, { content, attachments }) {
    const group = await this.assertGroupAccess(user, groupId);

    if (!content || !String(content).trim()) {
      const err = new Error('متن پیام نمی‌تواند خالی باشد');
      err.statusCode = 400;
      throw err;
    }

    const id = generateId();
    const timestamp = now();
    await db('message_group_messages').insert({
      id,
      group_id: groupId,
      sender_id: user.id,
      content: String(content).trim(),
      attachments: JSON.stringify(attachments || []),
      is_edited: false,
      sent_at: timestamp,
    });

    const msg = await db('message_group_messages').where({ id }).first();
    return {
      ...msg,
      sender_name: user.display_name || 'کاربر',
      sender_role: user.role || 'student',
    };
  }

  async editGroupMessage(userOrId, groupId, messageId, newContent) {
    const user = typeof userOrId === 'object' && userOrId !== null
      ? userOrId
      : await db('users').where({ id: userOrId }).first();
    if (!user) throw notFoundError('کاربر یافت نشد');

    await this.assertGroupAccess(user, groupId);

    if (!newContent || !String(newContent).trim()) {
      const err = new Error('متن پیام نمی‌تواند خالی باشد');
      err.statusCode = 400;
      throw err;
    }

    const msg = await db('message_group_messages').where({ id: messageId, group_id: groupId }).first();
    if (!msg) {
      throw notFoundError('پیام گروه یافت نشد');
    }
    if (msg.sender_id !== user.id) {
      throw forbiddenError('فقط فرستنده پیام می‌تواند آن را ویرایش کند');
    }

    const timestamp = now();
    await db('message_group_messages').where({ id: messageId }).update({
      content: String(newContent).trim(),
      is_edited: true,
      edited_at: timestamp,
    });

    return db('message_group_messages').where({ id: messageId }).first();
  }

  async deleteGroupMessage(userOrId, groupId, messageId) {
    const user = typeof userOrId === 'object' && userOrId !== null
      ? userOrId
      : await db('users').where({ id: userOrId }).first();
    if (!user) throw notFoundError('کاربر یافت نشد');

    await this.assertGroupAccess(user, groupId);

    const msg = await db('message_group_messages').where({ id: messageId, group_id: groupId }).first();
    if (!msg) {
      throw notFoundError('پیام گروه یافت نشد');
    }

    const isAdmin = ['admin', 'manager', 'teacher'].includes(user.role);
    if (msg.sender_id !== user.id && !isAdmin) {
      throw forbiddenError('شما مجوز حذف این پیام را ندارید');
    }

    await db('message_group_messages').where({ id: messageId }).del();
    return { deleted: true, id: messageId };
  }

  async broadcast(senderOrId, classId, { content, title }) {
    const sender = typeof senderOrId === 'object' && senderOrId !== null
      ? senderOrId
      : await db('users').where({ id: senderOrId }).first();
    if (!sender) {
      throw notFoundError('فرستنده یافت نشد');
    }

    await assertOwnsClass(sender, classId);

    const members = await db('class_members')
      .join('users', 'users.id', 'class_members.user_id')
      .where({
        'class_members.class_id': classId,
        'class_members.role': 'student',
        'users.school_id': sender.school_id,
      })
      .select('class_members.user_id');

    const timestamp = now();
    const messageRows = members.map((m) => ({
      id: generateId(),
      sender_id: sender.id,
      receiver_id: m.user_id,
      class_id: classId,
      content,
      is_broadcast: true,
      is_read: false,
      sent_at: timestamp,
    }));

    const notifRows = members.map((m) => ({
      id: generateId(),
      user_id: m.user_id,
      title: title || 'پیام جدید از معلم',
      body: content.substring(0, 100),
      type: 'broadcast',
      data: JSON.stringify({ class_id: classId }),
      is_read: false,
      created_at: timestamp,
    }));

    await db.transaction(async (trx) => {
      if (messageRows.length) await trx('messages').insert(messageRows);
      if (notifRows.length) await trx('notifications').insert(notifRows);
    });

    return { recipients_count: members.length };
  }

  async getAnnouncements(classId, user, page = 1, limit = 50) {
    await assertOwnsClass(user, classId, { allowEnrolled: true });
    const { offset } = parsePagination({ page, limit });

    const baseQuery = db('announcements').where({ class_id: classId });
    const [{ count }] = await baseQuery.clone().count('id as count');
    const rows = await baseQuery
      .leftJoin('users as u', 'u.id', 'announcements.teacher_id')
      .select('announcements.*', 'u.display_name as teacher_name')
      .orderBy('announcements.is_pinned', 'desc')
      .orderBy('announcements.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const paged = paginatedResponse(rows, count, page, limit);
    return {
      announcements: paged.items,
      pagination: paged.pagination,
    };
  }

  async createAnnouncement(user, classId, { title, content, attachments, is_pinned }) {
    await assertOwnsClass(user, classId);
    const id = generateId();
    const timestamp = now();

    await db('announcements').insert({
      id,
      class_id: classId,
      teacher_id: user.id,
      title,
      content: content || '',
      attachments: JSON.stringify(attachments || []),
      is_pinned: Boolean(is_pinned),
      created_at: timestamp,
    });

    return db('announcements').where({ id }).first();
  }

  async initiateCall(user, { receiver_id, call_type = 'audio' }) {
    if (receiver_id) {
      const target = await db('users').where({ id: receiver_id }).first();
      if (!target) throw notFoundError('مخاطب تماس یافت نشد');
      assertSameSchool(user, target, 'برقراری تماس با کاربران مدرسه دیگر مجاز نیست');
    }
    return {
      id: generateId(),
      caller_id: user.id,
      receiver_id: receiver_id || null,
      call_type,
      status: 'ringing',
      started_at: now(),
    };
  }

  async endCall(user, callId, { duration_seconds = 0 } = {}) {
    return {
      id: callId,
      ended_by: user.id,
      duration_seconds,
      status: 'ended',
      ended_at: now(),
    };
  }
}

module.exports = new MessageService();
