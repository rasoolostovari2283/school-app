const notificationService = require('./notification.service');

class NotificationController {
  async getAll(req, res, next) {
    try {
      const result = await notificationService.getByUser(
        req.user.id, req.query.page, req.query.limit
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async markRead(req, res, next) {
    try {
      await notificationService.markAsRead(req.params.id, req.user.id);
      res.json({ success: true, message: 'خوانده شد' });
    } catch (err) { next(err); }
  }

  async markAllRead(req, res, next) {
    try {
      await notificationService.markAllAsRead(req.user.id);
      res.json({ success: true, message: 'همه خوانده شدند' });
    } catch (err) { next(err); }
  }

  async sendToTeachers(req, res, next) {
    try {
      const { teacher_ids, title, body, priority, category } = req.body;
      const result = await notificationService.notifyTeachers({
        sender: req.user,
        sender_id: req.user.id,
        sender_name: req.user.display_name,
        teacher_ids,
        title,
        body,
        priority,
        category,
      });
      res.status(201).json({
        success: true,
        message: `اعلان مدیریت با موفقیت برای ${result.recipients_count} دبیر ارسال شد`,
        data: result,
      });
    } catch (err) { next(err); }
  }

  async sendBroadcast(req, res, next) {
    try {
      const {
        target_audience,
        target_grades,
        teacher_ids,
        title,
        body,
        priority,
        category,
        is_mandatory,
        is_pinned,
      } = req.body;

      const result = await notificationService.sendBroadcast({
        sender: req.user,
        sender_id: req.user.id,
        sender_name: req.user.display_name,
        target_audience: target_audience || 'students',
        target_grades: target_grades || ['*'],
        teacher_ids,
        title,
        body,
        priority,
        category,
        is_mandatory: is_mandatory !== false,
        is_pinned: Boolean(is_pinned),
      });

      res.status(201).json({
        success: true,
        message: `پیام مدیریت با موفقیت برای ${result.recipients_count} مخاطب ارسال شد`,
        data: result,
      });
    } catch (err) { next(err); }
  }
}

module.exports = new NotificationController();
