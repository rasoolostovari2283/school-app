const messageService = require('./message.service');

class MessageController {
  async send(req, res, next) {
    try {
      const io = req.app?.get?.('io') || null;
      const msg = await messageService.send(req.user, req.body, io);
      res.status(201).json({ success: true, message: 'پیام ارسال شد', data: { message: msg } });
    } catch (err) { next(err); }
  }

  async getConversations(req, res, next) {
    try {
      const conversations = await messageService.getConversations(req.user);
      res.json({ success: true, data: { conversations } });
    } catch (err) { next(err); }
  }

  async getMessages(req, res, next) {
    try {
      const result = await messageService.getConversationMessages(
        req.user, req.params.id, req.query.page, req.query.limit
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async editMessage(req, res, next) {
    try {
      const messageId = req.params.id || req.params.messageId;
      const msg = await messageService.editMessage(req.user.id, messageId, req.body.content);
      res.json({ success: true, message: 'پیام ویرایش شد', data: { message: msg } });
    } catch (err) { next(err); }
  }

  async deleteMessage(req, res, next) {
    try {
      const messageId = req.params.id || req.params.messageId;
      const result = await messageService.deleteMessage(req.user.id, messageId);
      res.json({ success: true, message: 'پیام حذف شد', data: result });
    } catch (err) { next(err); }
  }

  async getDirectory(req, res, next) {
    try {
      const directory = await messageService.getDirectory(req.user);
      res.json({ success: true, data: directory });
    } catch (err) { next(err); }
  }

  async searchUsers(req, res, next) {
    try {
      const users = await messageService.searchUserByIdentifier(req.query.q || req.query.query, req.user);
      res.json({ success: true, data: { users } });
    } catch (err) { next(err); }
  }

  async searchUserByIdentifier(req, res, next) {
    try {
      const users = await messageService.searchUserByIdentifier(req.query.q || req.query.query || req.query.identifier, req.user);
      res.json({ success: true, data: { users } });
    } catch (err) { next(err); }
  }

  // ─── GROUPS (Soroush-Style Channels/Groups) ───

  async getGroups(req, res, next) {
    try {
      const groups = await messageService.getGroups(req.user);
      res.json({ success: true, data: { groups } });
    } catch (err) { next(err); }
  }

  async searchGroups(req, res, next) {
    try {
      const q = req.query.q || req.query.query || req.query.handle || '';
      const groups = await messageService.searchGroups(q, req.user);
      res.json({ success: true, data: { groups } });
    } catch (err) { next(err); }
  }

  async createGroup(req, res, next) {
    try {
      const group = await messageService.createGroup(req.user, req.body);
      res.status(201).json({ success: true, message: 'گروه با موفقیت ساخته شد', data: { group } });
    } catch (err) { next(err); }
  }

  async deleteGroup(req, res, next) {
    try {
      const result = await messageService.deleteGroup(req.params.groupId, req.user);
      res.json({ success: true, message: 'گروه حذف شد', data: result });
    } catch (err) { next(err); }
  }

  async getGroupMembers(req, res, next) {
    try {
      const members = await messageService.getGroupMembers(req.params.groupId, req.user);
      res.json({ success: true, data: { members } });
    } catch (err) { next(err); }
  }

  async addGroupMember(req, res, next) {
    try {
      const result = await messageService.addMemberToGroup(
        req.params.groupId,
        req.body.identifier || req.body.user_id || req.body.username || req.body.phone,
        req.user
      );
      res.json({ success: true, message: 'عضو جدید به گروه اضافه شد', data: result });
    } catch (err) { next(err); }
  }

  async addMemberToGroup(req, res, next) {
    try {
      const result = await messageService.addMemberToGroup(
        req.params.groupId,
        req.body.identifier || req.body.user_id || req.body.username || req.body.phone,
        req.user
      );
      res.json({ success: true, message: 'عضو جدید به گروه اضافه شد', data: result });
    } catch (err) { next(err); }
  }

  async removeGroupMember(req, res, next) {
    try {
      const result = await messageService.removeMemberFromGroup(req.params.groupId, req.params.userId, req.user);
      res.json({ success: true, message: 'عضو از گروه حذف شد', data: result });
    } catch (err) { next(err); }
  }

  async getGroupInviteLink(req, res, next) {
    try {
      const result = await messageService.getGroupInviteLink(req.params.groupId, req.user);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async joinGroupByInvite(req, res, next) {
    try {
      const token =
        req.body.invite_code ||
        req.body.code ||
        req.body.group_handle ||
        req.body.handle ||
        req.body.link ||
        req.body.identifier;
      const result = await messageService.joinGroupByLinkOrCode(req.user, token);
      res.json({ success: true, message: 'شما عضو گروه شدید', data: result });
    } catch (err) { next(err); }
  }

  async joinGroupByLinkOrCode(req, res, next) {
    try {
      const token =
        req.body.invite_code ||
        req.body.code ||
        req.body.group_handle ||
        req.body.handle ||
        req.body.link ||
        req.body.identifier;
      const result = await messageService.joinGroupByLinkOrCode(req.user, token);
      res.json({ success: true, message: 'شما عضو گروه شدید', data: result });
    } catch (err) { next(err); }
  }

  async initiateCall(req, res, next) {
    try {
      const call = await messageService.initiateCall(req.user, req.body);
      res.status(201).json({ success: true, data: { call } });
    } catch (err) { next(err); }
  }

  async endCall(req, res, next) {
    try {
      const call = await messageService.endCall(req.user, req.params.id, req.body);
      res.json({ success: true, data: { call } });
    } catch (err) { next(err); }
  }

  async getGroupMessages(req, res, next) {
    try {
      const result = await messageService.getGroupMessages(req.params.groupId, req.user, req.query.limit);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async sendGroupMessage(req, res, next) {
    try {
      const io = req.app?.get?.('io') || null;
      const msg = await messageService.sendGroupMessage(req.user, req.params.groupId, req.body, io);
      res.status(201).json({ success: true, message: 'پیام در گروه ارسال شد', data: { message: msg } });
    } catch (err) { next(err); }
  }

  async editGroupMessage(req, res, next) {
    try {
      const msg = await messageService.editGroupMessage(req.user, req.params.groupId, req.params.messageId, req.body.content);
      res.json({ success: true, message: 'پیام گروه ویرایش شد', data: { message: msg } });
    } catch (err) { next(err); }
  }

  async deleteGroupMessage(req, res, next) {
    try {
      const result = await messageService.deleteGroupMessage(req.user, req.params.groupId, req.params.messageId);
      res.json({ success: true, message: 'پیام گروه حذف شد', data: result });
    } catch (err) { next(err); }
  }

  async broadcast(req, res, next) {
    try {
      const result = await messageService.broadcast(req.user, req.body.class_id, req.body);
      res.status(201).json({
        success: true,
        message: `پیام به ${result.recipients_count} نفر ارسال شد`,
        data: result,
      });
    } catch (err) { next(err); }
  }

  async getAnnouncements(req, res, next) {
    try {
      const classId = req.params.classId || req.params.id;
      const result = await messageService.getAnnouncements(
        classId,
        req.user,
        req.query.page,
        req.query.limit
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async createAnnouncement(req, res, next) {
    try {
      const classId = req.params.classId || req.params.id;
      const announcement = await messageService.createAnnouncement(req.user, classId, req.body);
      res.status(201).json({
        success: true,
        message: 'اطلاعیه کلاس ثبت شد',
        data: { announcement },
      });
    } catch (err) { next(err); }
  }
}

module.exports = new MessageController();
