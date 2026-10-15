const express = require('express');
const router = express.Router();
const notificationController = require('./notification.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

router.get('/', notificationController.getAll);
router.post('/broadcast', authorize('admin', 'manager', 'teacher'), notificationController.sendBroadcast);
router.post('/send-to-students', authorize('admin', 'manager', 'teacher'), notificationController.sendBroadcast);
router.post('/send-to-teachers', authorize('admin', 'manager', 'teacher'), notificationController.sendToTeachers);
router.put('/:id/read', notificationController.markRead);
router.put('/read-all', notificationController.markAllRead);

module.exports = router;
