const announcementService = require('./announcement.service');

class AnnouncementController {
  async getAll(req, res, next) {
    try {
      const announcements = await announcementService.getAll(req.user);
      res.json({
        success: true,
        data: { announcements },
      });
    } catch (err) {
      next(err);
    }
  }

  async getPendingMandatory(req, res, next) {
    try {
      const pending = await announcementService.getPendingMandatory(req.user);
      res.json({
        success: true,
        data: { pending },
      });
    } catch (err) {
      next(err);
    }
  }

  async getTargetingOptions(req, res, next) {
    try {
      const options = await announcementService.getTargetingOptions();
      res.json({
        success: true,
        data: options,
      });
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const announcement = await announcementService.create(req.user.id, req.body);
      res.status(201).json({
        success: true,
        message: 'اطلاعیه با موفقیت صادر و ارسال شد',
        data: { announcement },
      });
    } catch (err) {
      next(err);
    }
  }

  async acknowledge(req, res, next) {
    try {
      const result = await announcementService.acknowledge(req.params.id, req.user);
      res.json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getStats(req, res, next) {
    try {
      const stats = await announcementService.getStats(req.params.id);
      res.json({
        success: true,
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  }

  async delete(req, res, next) {
    try {
      const result = await announcementService.delete(req.params.id, req.user);
      res.json({
        success: true,
        message: result.message,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AnnouncementController();
