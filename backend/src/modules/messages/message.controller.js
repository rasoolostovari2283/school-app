const messageService = require('./message.service');

class MessageController {
  async send(req, res, next) {
    try {
      const message = await messageService.send(req.user.id, req.body);
      res.status(201).json({
        success: true,
        message: 'پیام ارسال شد',
        data: { message },
      });
    } catch (err) { next(err); }
  }

  async broadcast(req, res, next) {
    try {
      const announcement = await messageService.broadcast(
        req.user.id, req.body.class_id, req.body
      );
      res.status(201).json({
        success: true,
        message: 'اطلاعیه ارسال شد',
        data: { announcement },
      });
    } catch (err) { next(err); }
  }

  async getConversations(req, res, next) {
    try {
      const conversations = await messageService.getConversations(req.user.id);
      res.json({ success: true, data: { conversations } });
    } catch (err) { next(err); }
  }

  async getMessages(req, res, next) {
    try {
      const messages = await messageService.getConversationMessages(
        req.user.id, req.params.id, req.query.page, req.query.limit
      );
      res.json({ success: true, data: { messages } });
    } catch (err) { next(err); }
  }

  async getDirectory(req, res, next) {
    try {
      const directory = await messageService.getDirectory({
        query: req.query.q || req.query.query,
        role: req.query.role,
        grade: req.query.grade,
        currentUser: req.user,
      });
      res.json({ success: true, data: directory });
    } catch (err) { next(err); }
  }

  async getGroups(req, res, next) {
    try {
      const groups = await messageService.getGroups(req.user.id);
      res.json({ success: true, data: { groups } });
    } catch (err) { next(err); }
  }

  async createGroup(req, res, next) {
    try {
      const group = await messageService.createGroup(req.user.id, req.body);
      res.status(201).json({
        success: true,
        message: 'گروه با موفقیت ایجاد شد',
        data: { group },
      });
    } catch (err) { next(err); }
  }

  async getGroupMessages(req, res, next) {
    try {
      const messages = await messageService.getGroupMessages(
        req.params.groupId, req.query.page, req.query.limit
      );
      res.json({ success: true, data: { messages } });
    } catch (err) { next(err); }
  }

  async sendGroupMessage(req, res, next) {
    try {
      const message = await messageService.sendGroupMessage(
        req.user.id, req.params.groupId, req.body
      );
      res.status(201).json({
        success: true,
        message: 'پیام در گروه ثبت شد',
        data: { message },
      });
    } catch (err) { next(err); }
  }

  async initiateCall(req, res, next) {
    try {
      const call = await messageService.initiateCall(req.user.id, req.body);
      res.status(201).json({
        success: true,
        message: 'تماس برقرار شد',
        data: { call },
      });
    } catch (err) { next(err); }
  }

  async endCall(req, res, next) {
    try {
      await messageService.endCall(req.params.id, req.body.duration_seconds);
      res.json({
        success: true,
        message: 'تماس به پایان رسید',
      });
    } catch (err) { next(err); }
  }

  async getAnnouncements(req, res, next) {
    try {
      const announcements = await messageService.getAnnouncements(req.params.classId);
      res.json({ success: true, data: { announcements } });
    } catch (err) { next(err); }
  }

  async createAnnouncement(req, res, next) {
    try {
      const announcement = await messageService.createAnnouncement(
        req.user.id, req.params.classId, req.body
      );
      res.status(201).json({
        success: true,
        message: 'اطلاعیه با موفقیت ثبت شد',
        data: { announcement },
      });
    } catch (err) { next(err); }
  }

  async editMessage(req, res, next) {
    try {
      const message = await messageService.editMessage(
        req.user.id, req.params.id, req.body
      );
      res.json({
        success: true,
        message: 'پیام با موفقیت ویرایش شد',
        data: { message },
      });
    } catch (err) { next(err); }
  }

  async deleteMessage(req, res, next) {
    try {
      const result = await messageService.deleteMessage(
        req.user.id, req.user.role, req.params.id
      );
      res.json({
        success: true,
        message: 'پیام با موفقیت حذف شد',
        data: result,
      });
    } catch (err) { next(err); }
  }

  async editGroupMessage(req, res, next) {
    try {
      const message = await messageService.editGroupMessage(
        req.user.id, req.params.groupId, req.params.messageId, req.body
      );
      res.json({
        success: true,
        message: 'پیام گروه با موفقیت ویرایش شد',
        data: { message },
      });
    } catch (err) { next(err); }
  }

  async deleteGroupMessage(req, res, next) {
    try {
      const result = await messageService.deleteGroupMessage(
        req.user.id, req.user.role, req.params.groupId, req.params.messageId
      );
      res.json({
        success: true,
        message: 'پیام از گروه حذف شد',
        data: result,
      });
    } catch (err) { next(err); }
  }

  async searchUserByIdentifier(req, res, next) {
    try {
      const users = await messageService.searchUserByIdentifier(req.query.q || req.query.query || req.query.identifier);
      res.json({ success: true, data: { users } });
    } catch (err) { next(err); }
  }

  async getGroupMembers(req, res, next) {
    try {
      const members = await messageService.getGroupMembers(req.params.groupId);
      res.json({ success: true, data: { members } });
    } catch (err) { next(err); }
  }

  async addMemberToGroup(req, res, next) {
    try {
      const { identifier } = req.body;
      const result = await messageService.addMemberToGroup(
        req.params.groupId, identifier, req.user.id
      );
      res.status(201).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (err) { next(err); }
  }

  async getGroupInviteLink(req, res, next) {
    try {
      const inviteData = await messageService.getGroupInviteLink(req.params.groupId);
      res.json({ success: true, data: inviteData });
    } catch (err) { next(err); }
  }

  async joinGroupByLinkOrCode(req, res, next) {
    try {
      const { invite_code } = req.body;
      const result = await messageService.joinGroupByLinkOrCode(req.user.id, invite_code);
      res.json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (err) { next(err); }
  }
}

module.exports = new MessageController();
