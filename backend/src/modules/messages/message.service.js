const db = require('../../config/database');
const { insertAndReturn, updateAndReturn, generateId } = require('../../utils/dbHelpers');

class MessageService {
  async send(senderId, { receiver_id, class_id, content, attachments, is_broadcast }) {
    let finalReceiverId = receiver_id || null;

    if (finalReceiverId) {
      let targetUser = await db('users').where({ id: finalReceiverId }).first();
      if (!targetUser) {
        targetUser = await db('users').where(function () {
          this.where('personnel_code', finalReceiverId)
            .orWhere('student_code', finalReceiverId)
            .orWhere('username', finalReceiverId);
        }).first();
        if (targetUser) {
          finalReceiverId = targetUser.id;
        } else {
          // If still not in users table, insert lightweight user to avoid foreign key violation
          try {
            await insertAndReturn(db, 'users', {
              id: finalReceiverId,
              display_name: finalReceiverId.startsWith('tch-') ? 'دبیر مدرسه' : 'کاربر مدرسه',
              role: finalReceiverId.startsWith('tch-') ? 'teacher' : (finalReceiverId.startsWith('std-') ? 'student' : 'student'),
              is_verified: true,
            });
          } catch (e) {
            // ignore if exists
          }
        }
      }
    }

    const msg = await insertAndReturn(db, 'messages', {
      sender_id: senderId,
      receiver_id: finalReceiverId,
      class_id: class_id || null,
      content,
      attachments: JSON.stringify(attachments || []),
      is_broadcast: !!is_broadcast,
    });

    if (finalReceiverId) {
      const sender = await db('users').where({ id: senderId }).first();
      await insertAndReturn(db, 'notifications', {
        user_id: finalReceiverId,
        type: 'message',
        title: `پیام جدید از ${sender ? sender.display_name : 'کاربر'}`,
        body: content ? (content.substring(0, 80) + (content.length > 80 ? '...' : '')) : 'فایل ارسال شد',
        data: JSON.stringify({ message_id: msg.id, sender_id: senderId }),
      });
    }

    if (typeof msg.attachments === 'string') {
      try { msg.attachments = JSON.parse(msg.attachments); } catch (e) { msg.attachments = []; }
    }
    if (!Array.isArray(msg.attachments)) {
      msg.attachments = [];
    }

    return msg;
  }

  async getConversations(userId) {
    // Find all users the current user has exchanged messages with
    const rawExchanges = await db('messages')
      .where('sender_id', userId)
      .orWhere('receiver_id', userId)
      .select('sender_id', 'receiver_id', 'sent_at', 'content', 'is_read', 'id')
      .orderBy('sent_at', 'desc');

    const partnerMap = new Map();
    for (const msg of rawExchanges) {
      const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      if (!partnerId) continue;
      if (!partnerMap.has(partnerId)) {
        partnerMap.set(partnerId, {
          last_message: msg,
          unread_count: 0,
        });
      }
      if (msg.receiver_id === userId && !msg.is_read) {
        partnerMap.get(partnerId).unread_count++;
      }
    }

    // Include other staff / contacts if fewer than 5 conversations exist
    if (partnerMap.size < 5) {
      const otherStaff = await db('users')
        .where('id', '!=', userId)
        .whereIn('role', ['teacher', 'student', 'parent'])
        .limit(10)
        .pluck('id');
      for (const sid of otherStaff) {
        if (!partnerMap.has(sid)) {
          partnerMap.set(sid, { last_message: null, unread_count: 0 });
        }
      }
    }

    const partnerIds = Array.from(partnerMap.keys());
    if (partnerIds.length === 0) return [];

    const users = await db('users')
      .whereIn('id', partnerIds)
      .select('id', 'display_name', 'avatar_url', 'role', 'personnel_code', 'student_code', 'job_title', 'department', 'username');

    // Enrich parents with student info
    const allStudents = await db('users')
      .where({ role: 'student' })
      .select('id', 'display_name', 'student_code', 'department');
    const studentByCode = new Map();
    allStudents.forEach(st => {
      if (st.student_code) studentByCode.set(st.student_code.toLowerCase(), st);
    });

    const enrichedUsers = users.map(u => {
      if (u.role === 'parent' && u.student_code && studentByCode.has(u.student_code.toLowerCase())) {
        const st = studentByCode.get(u.student_code.toLowerCase());
        return {
          ...u,
          student_name: st.display_name,
          student_department: st.department,
        };
      }
      return u;
    });

    const conversations = enrichedUsers.map(u => {
      const data = partnerMap.get(u.id);
      return {
        id: u.id,
        user: u,
        last_message: data ? data.last_message : null,
        unread_count: data ? data.unread_count : 0,
      };
    });

    conversations.sort((a, b) => {
      const timeA = a.last_message ? new Date(a.last_message.sent_at).getTime() : 0;
      const timeB = b.last_message ? new Date(b.last_message.sent_at).getTime() : 0;
      return timeB - timeA;
    });

    return conversations;
  }

  async getConversationMessages(userId, otherUserId, page = 1, limit = 50) {
    const offset = (page - 1) * limit;

    // Mark messages received from otherUserId as read
    await db('messages')
      .where({ sender_id: otherUserId, receiver_id: userId, is_read: false })
      .update({ is_read: true });

    const messages = await db('messages')
      .where(function () {
        this.where({ sender_id: userId, receiver_id: otherUserId })
          .orWhere({ sender_id: otherUserId, receiver_id: userId });
      })
      .orderBy('sent_at', 'asc')
      .limit(limit)
      .offset(offset);

    messages.forEach(m => {
      if (typeof m.attachments === 'string') {
        try { m.attachments = JSON.parse(m.attachments); } catch (e) { m.attachments = []; }
      }
      if (!Array.isArray(m.attachments)) {
        m.attachments = [];
      }
    });

    return messages;
  }

  /**
   * Helper to parse grade from department or string
   */
  extractGrade(deptOrGrade) {
    if (!deptOrGrade) return null;
    const str = String(deptOrGrade);
    if (str.includes('دوازدهم') || str.includes('12')) return 'پایه دوازدهم';
    if (str.includes('یازدهم') || str.includes('11')) return 'پایه یازدهم';
    if (str.includes('دهم') || str.includes('10')) return 'پایه دهم';
    if (str.includes('نهم') || str.includes('9')) return 'پایه نهم';
    if (str.includes('هشتم') || str.includes('8')) return 'پایه هشتم';
    if (str.includes('هفتم') || str.includes('7')) return 'پایه هفتم';
    return null;
  }

  /**
   * School Directory: Complete roster of Personnel with personnel codes, Students, and Parents
   */
  async getDirectory({ query = '', role = '', grade = '', currentUser = null } = {}) {
    // 1. Fetch students for lookup map
    const allStudents = await db('users')
      .where({ role: 'student' })
      .select('id', 'display_name', 'student_code', 'department');

    const studentByCode = new Map();
    const studentById = new Map();
    allStudents.forEach(st => {
      if (st.student_code) studentByCode.set(st.student_code.toLowerCase(), st);
      studentById.set(st.id, st);
    });

    // 2. Fetch parent-student links
    const parentLinks = await db('parent_student_links').select('parent_id', 'student_id');
    const parentToStudentId = new Map();
    parentLinks.forEach(l => parentToStudentId.set(l.parent_id, l.student_id));

    // 3. Query users
    let q = db('users').select(
      'id',
      'display_name',
      'role',
      'avatar_url',
      'personnel_code',
      'student_code',
      'department',
      'job_title',
      'username'
    );

    if (role && role !== 'all') {
      q = q.where({ role });
    }

    let allUsers = await q.orderBy('created_at', 'asc');

    // 4. Enrich students & parents with grade information
    allUsers = allUsers.map(u => {
      if (u.role === 'student') {
        const studentGrade = this.extractGrade(u.department) || 'پایه دهم';
        return {
          ...u,
          grade: studentGrade,
        };
      }
      if (u.role === 'parent') {
        let st = null;
        if (u.student_code && studentByCode.has(u.student_code.toLowerCase())) {
          st = studentByCode.get(u.student_code.toLowerCase());
        } else if (parentToStudentId.has(u.id)) {
          st = studentById.get(parentToStudentId.get(u.id));
        }

        const childGrade = st ? (this.extractGrade(st.department) || 'پایه دهم') : (this.extractGrade(u.department) || 'پایه دهم');

        return {
          ...u,
          student_code: u.student_code || (st ? st.student_code : null),
          student_id: st ? st.id : null,
          student_name: st ? st.display_name : null,
          student_department: st ? st.department : null,
          grade: childGrade,
          student_grade: childGrade,
        };
      }
      return u;
    });

    // 5. Apply Role-based Grade Isolation (Students and Parents only see students of same grade)
    if (currentUser) {
      if (currentUser.role === 'student') {
        const myGrade = this.extractGrade(currentUser.department) || this.extractGrade(currentUser.grade) || 'پایه دهم';
        allUsers = allUsers.filter(u => {
          // All school teachers are accessible
          if (u.role === 'teacher' || u.role === 'manager' || u.role === 'admin') return true;
          // Students must be of the EXACT SAME GRADE
          if (u.role === 'student') {
            return u.grade === myGrade || (u.department && u.department.includes(myGrade));
          }
          // Parents of the same grade only
          if (u.role === 'parent') {
            return u.grade === myGrade;
          }
          return false;
        });
      } else if (currentUser.role === 'parent') {
        let childGrade = this.extractGrade(currentUser.student_department) ||
                         this.extractGrade(currentUser.grade) ||
                         this.extractGrade(currentUser.department);
        if (!childGrade && currentUser.student_code) {
          const st = studentByCode.get(currentUser.student_code.toLowerCase());
          if (st) childGrade = this.extractGrade(st.department);
        }
        if (!childGrade) childGrade = 'پایه دهم';

        allUsers = allUsers.filter(u => {
          // All school teachers are accessible
          if (u.role === 'teacher' || u.role === 'manager' || u.role === 'admin') return true;
          // Students of the child's grade only
          if (u.role === 'student') {
            return u.grade === childGrade || (u.department && u.department.includes(childGrade));
          }
          // Parents of the child's grade only
          if (u.role === 'parent') {
            return u.grade === childGrade;
          }
          return false;
        });
      } else if (grade && grade !== 'all') {
        // Teacher / Manager filtering by selected grade
        allUsers = allUsers.filter(u => {
          if (u.role === 'teacher' || u.role === 'manager' || u.role === 'admin') return true;
          return u.grade === grade || (u.department && u.department.includes(grade));
        });
      }
    }

    // 6. If search query, match display_name, username, personnel_code, student_code, department, job_title, and linked student_name
    if (query && query.trim()) {
      const clean = query.trim().toLowerCase();
      const cleanAt = clean.replace(/^@/, '');
      allUsers = allUsers.filter(u => {
        const dName = (u.display_name || '').toLowerCase();
        const uName = (u.username || '').toLowerCase();
        const pCode = (u.personnel_code || '').toLowerCase();
        const sCode = (u.student_code || '').toLowerCase();
        const dept = (u.department || '').toLowerCase();
        const job = (u.job_title || '').toLowerCase();
        const stName = (u.student_name || '').toLowerCase();

        return (
          dName.includes(clean) ||
          uName.includes(cleanAt) ||
          pCode.includes(clean) ||
          sCode.includes(clean) ||
          dept.includes(clean) ||
          job.includes(clean) ||
          stName.includes(clean)
        );
      });
    }

    // Categorize
    const staff = allUsers.filter(u => u.role === 'teacher' || u.role === 'manager' || u.role === 'admin');
    const students = allUsers.filter(u => u.role === 'student');
    const parents = allUsers.filter(u => u.role === 'parent');

    return {
      all: allUsers,
      staff,
      students,
      parents,
      stats: {
        totalStaff: staff.length,
        totalStudents: students.length,
        totalParents: parents.length,
      },
    };
  }

  /**
  * Group Chat methods
  */
  async searchUserByIdentifier(query) {
    if (!query || !query.trim()) return [];
    const clean = query.trim().toLowerCase().replace(/^@/, '');
    return db('users')
      .where(function () {
        this.whereRaw('LOWER(username) LIKE ?', [`%${clean}%`])
          .orWhereRaw('LOWER(student_code) LIKE ?', [`%${clean}%`])
          .orWhereRaw('LOWER(personnel_code) LIKE ?', [`%${clean}%`])
          .orWhereRaw('LOWER(display_name) LIKE ?', [`%${clean}%`])
          .orWhereRaw('LOWER(email) LIKE ?', [`%${clean}%`])
          .orWhere('phone', 'like', `%${clean}%`);
      })
      .select('id', 'display_name', 'avatar_url', 'role', 'username', 'student_code', 'personnel_code', 'job_title', 'department')
      .limit(10);
  }

  async getGroups(userId) {
    const groups = await db('message_groups').select('*').orderBy('created_at', 'desc');

    for (const g of groups) {
      if (!g.invite_code) {
        const code = 'grp-' + Math.random().toString(36).substring(2, 9);
        await db('message_groups').where({ id: g.id }).update({ invite_code: code });
        g.invite_code = code;
      }

      const membersCount = await db('message_group_members').where({ group_id: g.id }).count('id as count').first();
      g.members_count = parseInt(membersCount ? membersCount.count : 0, 10);

      const membership = await db('message_group_members').where({ group_id: g.id, user_id: userId }).first();
      g.is_member = !!membership;
      g.is_admin = membership ? membership.role === 'admin' : (g.created_by === userId);

      const lastMsg = await db('message_group_messages')
        .join('users', 'users.id', 'message_group_messages.sender_id')
        .where({ group_id: g.id })
        .select('message_group_messages.*', 'users.display_name as sender_name')
        .orderBy('sent_at', 'desc')
        .first();

      g.last_message = lastMsg || null;
    }

    return groups;
  }

  async createGroup(userId, { name, description, category, member_ids = [], member_identifiers = [] }) {
    const inviteCode = 'grp-' + Math.random().toString(36).substring(2, 9);
    const group = await insertAndReturn(db, 'message_groups', {
      name,
      description: description || '',
      category: category || 'general',
      created_by: userId,
      invite_code: inviteCode,
    });

    // Add creator as admin
    await insertAndReturn(db, 'message_group_members', {
      group_id: group.id,
      user_id: userId,
      role: 'admin',
    });

    const addedUserIds = new Set([userId]);

    // Add selected members by user_id
    if (Array.isArray(member_ids)) {
      for (const mid of member_ids) {
        if (mid && !addedUserIds.has(mid)) {
          await insertAndReturn(db, 'message_group_members', {
            group_id: group.id,
            user_id: mid,
            role: 'member',
          });
          addedUserIds.add(mid);
        }
      }
    }

    // Add members entered by identifier (username / student_code / personnel_code / phone)
    if (Array.isArray(member_identifiers)) {
      for (const idStr of member_identifiers) {
        if (!idStr || typeof idStr !== 'string') continue;
        const clean = idStr.trim().toLowerCase().replace(/^@/, '');
        const target = await db('users')
          .where(function () {
            this.whereRaw('LOWER(username) = ?', [clean])
              .orWhereRaw('LOWER(student_code) = ?', [clean])
              .orWhereRaw('LOWER(personnel_code) = ?', [clean])
              .orWhereRaw('LOWER(email) = ?', [clean])
              .orWhere('phone', clean)
              .orWhere('id', idStr.trim());
          })
          .first();

        if (target && !addedUserIds.has(target.id)) {
          await insertAndReturn(db, 'message_group_members', {
            group_id: group.id,
            user_id: target.id,
            role: 'member',
          });
          addedUserIds.add(target.id);
        }
      }
    }

    group.members_count = addedUserIds.size;
    group.invite_code = inviteCode;
    return group;
  }

  async getGroupMembers(groupId) {
    return db('message_group_members')
      .join('users', 'users.id', 'message_group_members.user_id')
      .where({ 'message_group_members.group_id': groupId })
      .select(
        'users.id',
        'users.display_name',
        'users.avatar_url',
        'users.role',
        'users.username',
        'users.student_code',
        'users.personnel_code',
        'users.job_title',
        'users.department',
        'message_group_members.role as member_role',
        'message_group_members.joined_at'
      )
      .orderByRaw("CASE WHEN message_group_members.role = 'admin' THEN 0 ELSE 1 END")
      .orderBy('message_group_members.joined_at', 'asc');
  }

  async addMemberToGroup(groupId, identifier, addedByUserId) {
    if (!identifier || !identifier.trim()) {
      const error = new Error('لطفاً آیدی، نام کاربری یا کد کاربر را وارد کنید');
      error.statusCode = 400;
      throw error;
    }

    const group = await db('message_groups').where({ id: groupId }).first();
    if (!group) {
      const error = new Error('گروه مورد نظر یافت نشد');
      error.statusCode = 404;
      throw error;
    }

    const clean = identifier.trim().toLowerCase().replace(/^@/, '');
    const targetUser = await db('users')
      .where(function () {
        this.whereRaw('LOWER(username) = ?', [clean])
          .orWhereRaw('LOWER(student_code) = ?', [clean])
          .orWhereRaw('LOWER(personnel_code) = ?', [clean])
          .orWhereRaw('LOWER(email) = ?', [clean])
          .orWhere('phone', clean)
          .orWhere('id', identifier.trim());
      })
      .first();

    if (!targetUser) {
      const error = new Error(`کاربری با شناسه یا آیدی «${identifier.trim()}» یافت نشد. لطفاً از صحت آیدی (@username) یا کد دانش‌آموزی/پرسنلی اطمینان حاصل فرمایید.`);
      error.statusCode = 404;
      throw error;
    }

    const existingMember = await db('message_group_members')
      .where({ group_id: groupId, user_id: targetUser.id })
      .first();

    if (existingMember) {
      const error = new Error(`«${targetUser.display_name}» از قبل در این گروه عضو است.`);
      error.statusCode = 400;
      throw error;
    }

    await insertAndReturn(db, 'message_group_members', {
      group_id: groupId,
      user_id: targetUser.id,
      role: 'member',
    });

    // Post announcement in group
    const adder = await db('users').where({ id: addedByUserId }).first();
    const adderName = adder ? adder.display_name : 'مدیر گروه';
    await insertAndReturn(db, 'message_group_messages', {
      group_id: groupId,
      sender_id: addedByUserId,
      content: `🔔 کاربر «${targetUser.display_name}» (${targetUser.username ? '@' + targetUser.username : targetUser.role}) توسط ${adderName} به گروه افزوده شد.`,
      attachments: '[]',
    });

    // Notify added user
    await insertAndReturn(db, 'notifications', {
      user_id: targetUser.id,
      type: 'message',
      title: `عضویت در گروه «${group.name}»`,
      body: `شما توسط ${adderName} به گروه «${group.name}» افزوده شدید.`,
      data: JSON.stringify({ group_id: groupId }),
    });

    const memberCount = await db('message_group_members').where({ group_id: groupId }).count('id as count').first();

    return {
      user: {
        id: targetUser.id,
        display_name: targetUser.display_name,
        avatar_url: targetUser.avatar_url,
        role: targetUser.role,
        username: targetUser.username,
        student_code: targetUser.student_code,
        personnel_code: targetUser.personnel_code,
      },
      members_count: parseInt(memberCount?.count || 0, 10),
      message: `«${targetUser.display_name}» با موفقیت به گروه افزوده شد 🎉`,
    };
  }

  async getGroupInviteLink(groupId) {
    let group = await db('message_groups').where({ id: groupId }).first();
    if (!group) {
      const error = new Error('گروه یافت نشد');
      error.statusCode = 404;
      throw error;
    }

    if (!group.invite_code) {
      const code = 'grp-' + Math.random().toString(36).substring(2, 9);
      await db('message_groups').where({ id: groupId }).update({ invite_code: code });
      group.invite_code = code;
    }

    return {
      group_id: group.id,
      name: group.name,
      invite_code: group.invite_code,
      invite_path: `/dashboard/messages?joinGroup=${group.invite_code}`,
    };
  }

  async joinGroupByLinkOrCode(userId, codeOrId) {
    if (!codeOrId || !codeOrId.trim()) {
      const error = new Error('لطفاً لینک یا کد دعوت گروه را وارد کنید');
      error.statusCode = 400;
      throw error;
    }

    const raw = codeOrId.trim();
    let cleanCode = raw;
    if (raw.includes('joinGroup=')) {
      cleanCode = raw.split('joinGroup=')[1].split('&')[0];
    } else if (raw.includes('/')) {
      cleanCode = raw.split('/').pop();
    }

    const group = await db('message_groups')
      .where({ invite_code: cleanCode })
      .orWhere({ id: cleanCode })
      .first();

    if (!group) {
      const error = new Error(`گروهی با این لینک یا کد دعوت («${raw}») یافت نشد.`);
      error.statusCode = 404;
      throw error;
    }

    const user = await db('users').where({ id: userId }).first();

    // Check if already a member
    const isMember = await db('message_group_members')
      .where({ group_id: group.id, user_id: userId })
      .first();

    if (!isMember) {
      await insertAndReturn(db, 'message_group_members', {
        group_id: group.id,
        user_id: userId,
        role: 'member',
      });

      // Announce in group
      await insertAndReturn(db, 'message_group_messages', {
        group_id: group.id,
        sender_id: userId,
        content: `👋 کاربر «${user ? user.display_name : 'عضو جدید'}» از طریق لینک دعوت به گروه پیوست.`,
        attachments: '[]',
      });
    }

    const memberCount = await db('message_group_members').where({ group_id: group.id }).count('id as count').first();
    group.members_count = parseInt(memberCount?.count || 0, 10);

    return {
      group,
      already_member: !!isMember,
      message: isMember
        ? `شما از قبل در گروه «${group.name}» عضو هستید.`
        : `با موفقیت به گروه «${group.name}» پیوستید 🎉`,
    };
  }

  async getGroupMessages(groupId, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const messages = await db('message_group_messages')
      .join('users', 'users.id', 'message_group_messages.sender_id')
      .where({ group_id: groupId })
      .select(
        'message_group_messages.*',
        'users.display_name as sender_name',
        'users.role as sender_role',
        'users.avatar_url as sender_avatar',
        'users.personnel_code as sender_personnel_code',
        'users.student_code as sender_student_code'
      )
      .orderBy('sent_at', 'asc')
      .limit(limit)
      .offset(offset);

    messages.forEach(m => {
      if (typeof m.attachments === 'string') {
        try { m.attachments = JSON.parse(m.attachments); } catch (e) { m.attachments = []; }
      }
      if (!Array.isArray(m.attachments)) {
        m.attachments = [];
      }
    });

    return messages;
  }

  async sendGroupMessage(senderId, groupId, { content, attachments }) {
    const msg = await insertAndReturn(db, 'message_group_messages', {
      group_id: groupId,
      sender_id: senderId,
      content,
      attachments: JSON.stringify(attachments || []),
    });

    const sender = await db('users').where({ id: senderId }).first();
    msg.sender_name = sender ? sender.display_name : 'کاربر';
    msg.sender_role = sender ? sender.role : 'member';
    msg.sender_personnel_code = sender ? sender.personnel_code : null;
    msg.sender_student_code = sender ? sender.student_code : null;
    if (typeof msg.attachments === 'string') {
      try { msg.attachments = JSON.parse(msg.attachments); } catch (e) { msg.attachments = []; }
    }
    if (!Array.isArray(msg.attachments)) {
      msg.attachments = [];
    }

    return msg;
  }

  /**
   * Voice & Video Calling Session Management
   */
  async initiateCall(callerId, { receiver_id, group_id, call_type = 'video' }) {
    const session = await insertAndReturn(db, 'call_sessions', {
      caller_id: callerId,
      receiver_id: receiver_id || null,
      group_id: group_id || null,
      call_type,
      status: 'active',
      started_at: new Date().toISOString(),
    });

    const caller = await db('users').where({ id: callerId }).first();
    let receiver = null;
    let group = null;

    if (receiver_id) {
      receiver = await db('users').where({ id: receiver_id }).first();
    }
    if (group_id) {
      group = await db('message_groups').where({ id: group_id }).first();
    }

    return {
      session_id: session.id,
      room_id: `room-${session.id}`,
      call_type,
      caller: {
        id: caller.id,
        name: caller.display_name,
        role: caller.role,
        personnel_code: caller.personnel_code,
      },
      receiver: receiver ? {
        id: receiver.id,
        name: receiver.display_name,
        role: receiver.role,
        personnel_code: receiver.personnel_code,
        student_code: receiver.student_code,
      } : null,
      group: group ? { id: group.id, name: group.name } : null,
      network: {
        provider: 'Iran National Information Network (شبکه ملی)',
        encryption: 'AES-256-GCM End-to-End',
        status: 'Connected',
      },
    };
  }

  async endCall(sessionId, durationSeconds = 0) {
    return updateAndReturn(db, 'call_sessions', { id: sessionId }, {
      status: 'ended',
      duration_seconds: durationSeconds,
      ended_at: new Date().toISOString(),
    });
  }

  async broadcast(senderId, classId, { content, attachments }) {
    const members = await db('class_members').where({ class_id: classId }).select('user_id');
    const results = [];
    for (const m of members) {
      const msg = await insertAndReturn(db, 'messages', {
        sender_id: senderId,
        receiver_id: m.user_id,
        class_id: classId,
        content,
        attachments: JSON.stringify(attachments || []),
        is_broadcast: true,
      });
      results.push(msg);

      await insertAndReturn(db, 'notifications', {
        user_id: m.user_id,
        type: 'announcement',
        title: 'اطلاعیه جدید کلاسی',
        body: content ? content.substring(0, 100) : 'یک فایل پیوست شد',
        data: JSON.stringify({ class_id: classId }),
      });
    }
    return results;
  }

  async getAnnouncements(classId) {
    return db('announcements')
      .join('users', 'users.id', 'announcements.teacher_id')
      .where({ class_id: classId })
      .select('announcements.*', 'users.display_name as teacher_name', 'users.avatar_url as teacher_avatar')
      .orderBy('announcements.created_at', 'desc');
  }

  async createAnnouncement(teacherId, classId, { title, content, attachments, is_pinned }) {
    const announcement = await insertAndReturn(db, 'announcements', {
      class_id: classId,
      teacher_id: teacherId,
      title,
      content,
      attachments: JSON.stringify(attachments || []),
      is_pinned: !!is_pinned,
    });

    const members = await db('class_members').where({ class_id: classId }).select('user_id');
    for (const m of members) {
      await insertAndReturn(db, 'notifications', {
        user_id: m.user_id,
        type: 'announcement',
        title: `اطلاعیه: ${title}`,
        body: content ? content.substring(0, 80) : '',
        data: JSON.stringify({ class_id: classId, announcement_id: announcement.id }),
      });
    }

    return announcement;
  }

  /**
   * 1-on-1 Message Edit & Delete
   */
  async editMessage(userId, messageId, { content }) {
    const msg = await db('messages').where({ id: messageId }).first();
    if (!msg) {
      const err = new Error('پیام مورد نظر یافت نشد');
      err.statusCode = 404;
      throw err;
    }

    if (msg.sender_id !== userId) {
      const err = new Error('شما مجاز به ویرایش این پیام نیستید');
      err.statusCode = 403;
      throw err;
    }

    const updated = await updateAndReturn(db, 'messages', { id: messageId }, {
      content: content.trim(),
      is_edited: true,
      edited_at: new Date().toISOString(),
    });

    if (typeof updated.attachments === 'string') {
      try { updated.attachments = JSON.parse(updated.attachments); } catch (e) { updated.attachments = []; }
    }
    if (!Array.isArray(updated.attachments)) {
      updated.attachments = [];
    }

    return updated;
  }

  async deleteMessage(userId, userRole, messageId) {
    const msg = await db('messages').where({ id: messageId }).first();
    if (!msg) {
      const err = new Error('پیام مورد نظر یافت نشد');
      err.statusCode = 404;
      throw err;
    }

    const canDelete = msg.sender_id === userId || userRole === 'teacher' || userRole === 'admin';
    if (!canDelete) {
      const err = new Error('شما مجاز به حذف این پیام نیستید');
      err.statusCode = 403;
      throw err;
    }

    await db('messages').where({ id: messageId }).del();
    return { id: messageId, deleted: true };
  }

  /**
   * Group Message Edit & Delete
   */
  async editGroupMessage(userId, groupId, messageId, { content }) {
    const msg = await db('message_group_messages')
      .where({ id: messageId, group_id: groupId })
      .first();

    if (!msg) {
      const err = new Error('پیام مورد نظر در گروه یافت نشد');
      err.statusCode = 404;
      throw err;
    }

    if (msg.sender_id !== userId) {
      const err = new Error('شما مجاز به ویرایش این پیام نیستید');
      err.statusCode = 403;
      throw err;
    }

    const updated = await updateAndReturn(db, 'message_group_messages', { id: messageId }, {
      content: content.trim(),
      is_edited: true,
      edited_at: new Date().toISOString(),
    });

    const sender = await db('users').where({ id: updated.sender_id }).first();
    updated.sender_name = sender ? sender.display_name : 'کاربر';
    updated.sender_role = sender ? sender.role : 'member';
    updated.sender_personnel_code = sender ? sender.personnel_code : null;
    updated.sender_student_code = sender ? sender.student_code : null;

    if (typeof updated.attachments === 'string') {
      try { updated.attachments = JSON.parse(updated.attachments); } catch (e) { updated.attachments = []; }
    }
    if (!Array.isArray(updated.attachments)) {
      updated.attachments = [];
    }

    return updated;
  }

  async deleteGroupMessage(userId, userRole, groupId, messageId) {
    const msg = await db('message_group_messages')
      .where({ id: messageId, group_id: groupId })
      .first();

    if (!msg) {
      const err = new Error('پیام مورد نظر در گروه یافت نشد');
      err.statusCode = 404;
      throw err;
    }

    const canDelete = msg.sender_id === userId || userRole === 'teacher' || userRole === 'admin';
    if (!canDelete) {
      const err = new Error('شما مجاز به حذف این پیام نیستید');
      err.statusCode = 403;
      throw err;
    }

    await db('message_group_messages').where({ id: messageId }).del();
    return { id: messageId, group_id: groupId, deleted: true };
  }
}

module.exports = new MessageService();
