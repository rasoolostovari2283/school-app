const express = require('express');
const router = express.Router({ mergeParams: true });
const attendanceController = require('./attendance.controller');
const { authenticate, authorize, requireClassMember } = require('../../middleware/auth');

router.use(authenticate);
router.use(requireClassMember);

router.post('/sessions', authorize('teacher'), attendanceController.createSession);
router.get('/sessions', attendanceController.getSessions);
router.post('/sessions/:id/check-in', authorize('student'), attendanceController.checkIn);
router.post('/sessions/:id/record', authorize('teacher'), attendanceController.recordStudent);
router.get('/sessions/:id/report', authorize('teacher', 'parent'), attendanceController.getReport);
router.put('/sessions/:id/close', authorize('teacher'), attendanceController.closeSession);
router.get('/history', attendanceController.getHistory);

module.exports = router;
