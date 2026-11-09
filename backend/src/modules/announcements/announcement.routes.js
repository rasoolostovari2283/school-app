const express = require('express');
const router = express.Router();
const announcementController = require('./announcement.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { cacheMiddleware, cache } = require('../../utils/cache');

router.use(authenticate);

// Invalidate announcement cache on mutations (scoped to caller's school)
const invalidateAnnouncementCache = (req, res, next) => {
  const schoolPrefix = req.user?.school_id ? `${req.user.school_id}:` : '*';
  cache.delByPattern(`${schoolPrefix}*announcement*`);
  next();
};

// Get pending mandatory announcements (for the popup overlay on login)
router.get('/pending-mandatory', announcementController.getPendingMandatory);

// Get available targeting options (grades, subjects, classes)
router.get('/targeting-options', authorize('teacher', 'admin', 'manager'), cacheMiddleware(120), announcementController.getTargetingOptions);

// Get all announcements for current user (cached for 45 seconds for ultra-fast dashboard loading)
router.get('/', cacheMiddleware(45), announcementController.getAll);

// Create announcement (teacher/admin)
router.post('/', authorize('teacher', 'admin', 'manager'), invalidateAnnouncementCache, announcementController.create);

// Acknowledge announcement (student/parent confirms they read it)
router.post('/:id/acknowledge', invalidateAnnouncementCache, announcementController.acknowledge);

// Get stats of who acknowledged (teacher/admin)
router.get('/:id/stats', authorize('teacher', 'admin', 'manager'), announcementController.getStats);

// Delete announcement
router.delete('/:id', authorize('teacher', 'admin', 'manager'), invalidateAnnouncementCache, announcementController.delete);

module.exports = router;
