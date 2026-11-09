const express = require('express');
const router = express.Router();
const notificationController = require('./notification.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

router.get('/', notificationController.getAll);
router.put('/:id/read', notificationController.markRead);
router.put('/read-all', notificationController.markAllRead);

// Admin/Manager only: send notification to specific teachers in the same school
router.post('/send-to-teachers', authorize('admin', 'manager'), notificationController.sendToTeachers);

// Broadcast notifications (teachers may only broadcast to students in their school; admin/manager may broadcast to school audiences)
router.post('/broadcast', authorize('admin', 'manager', 'teacher'), notificationController.sendBroadcast);
router.post('/send-to-students', authorize('admin', 'manager', 'teacher'), notificationController.sendBroadcast);

module.exports = router;
