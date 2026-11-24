const express = require('express');
const router = express.Router();
const announcementController = require('./announcement.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { cacheMiddleware, cache } = require('../../utils/cache');

router.use(authenticate);

// Invalidate announcement cache on mutations (scoped to caller's school)
const invalidateAnnouncementCache = (req, res, next) => {
  if (req.user?.school_id) {
    cache.delBySchool(req.user.school_id, '*announcement*');
  } else {
    cache.delByPattern('*announcement*');
  }
  next();
};

// Get pending mandatory announcements (for the popup overlay on login)
router.get('/pending-mandatory', announcementController.getPendingMandatory);

// Get available targeting options (always live DB classes owned by teacher / school)
router.get('/targeting-options', authorize('teacher', 'admin', 'manager'), announcementController.getTargetingOptions);

// Get all announcements for current user
router.get('/', announcementController.getAll);

// Create announcement (teacher/admin)
router.post('/', authorize('teacher', 'admin', 'manager'), invalidateAnnouncementCache, announcementController.create);

// Acknowledge announcement (student/parent confirms they read it)
router.post('/:id/acknowledge', invalidateAnnouncementCache, announcementController.acknowledge);

// Get stats of who acknowledged (teacher/admin)
router.get('/:id/stats', authorize('teacher', 'admin', 'manager'), announcementController.getStats);

// Delete announcement
router.delete('/:id', authorize('teacher', 'admin', 'manager'), invalidateAnnouncementCache, announcementController.delete);

module.exports = router;
