const express = require('express');
const router = express.Router();
const announcementController = require('./announcement.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

// Get pending mandatory announcements (for the popup overlay on login)
router.get('/pending-mandatory', announcementController.getPendingMandatory);

// Get available targeting options (grades, subjects, classes)
router.get('/targeting-options', authorize('teacher', 'admin', 'manager'), announcementController.getTargetingOptions);

// Get all announcements for current user
router.get('/', announcementController.getAll);

// Create announcement (teacher/admin)
router.post('/', authorize('teacher', 'admin', 'manager'), announcementController.create);

// Acknowledge announcement (student/parent confirms they read it)
router.post('/:id/acknowledge', announcementController.acknowledge);

// Get stats of who acknowledged (teacher/admin)
router.get('/:id/stats', authorize('teacher', 'admin', 'manager'), announcementController.getStats);

// Delete announcement
router.delete('/:id', authorize('teacher', 'admin', 'manager'), announcementController.delete);

module.exports = router;
