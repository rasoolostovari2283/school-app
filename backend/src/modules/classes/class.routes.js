const express = require('express');
const router = express.Router();
const classController = require('./class.controller');
const messageController = require('../messages/message.controller');
const { authenticate, authorize, requireClassMember } = require('../../middleware/auth');

// All routes require authentication
router.use(authenticate);

router.post('/', authorize('teacher', 'admin', 'manager'), classController.createClass);
router.put('/:id', authorize('teacher', 'admin', 'manager'), classController.updateClass);
router.get('/', classController.getClasses);
router.get('/parent/children', classController.getParentChildren);
router.post('/join', authorize('student', 'parent'), classController.joinClass);
router.get('/:id', requireClassMember, classController.getClassById);
router.get('/:id/members', requireClassMember, classController.getMembers);
router.post('/:id/invite', authorize('teacher'), classController.createInvite);
router.put('/:id/quiet-hours', authorize('teacher'), classController.updateQuietHours);
router.delete('/:id', authorize('teacher', 'admin', 'manager'), classController.deleteClass);
router.get('/:id/live-status', requireClassMember, classController.getLiveStatus);
router.put('/:id/live-settings', authorize('teacher', 'admin', 'manager'), classController.updateLiveSettings);
router.get('/:id/live-launch', requireClassMember, classController.getLiveLaunchUrl);
router.post('/:id/sync-external-recording', authorize('teacher', 'admin', 'manager'), classController.syncExternalRecording);

// Class Rosters & Student Database Management
router.get('/:id/roster', authorize('teacher', 'admin', 'manager'), classController.getClassRoster);
router.get('/:id/students/search', authorize('teacher', 'admin', 'manager'), classController.searchSchoolStudents);
router.post('/:id/roster/add-students', authorize('teacher', 'admin', 'manager'), classController.addRegisteredStudentsToRoster);
router.post('/:id/students', authorize('teacher', 'admin', 'manager'), classController.addStudentToClass);
router.post('/:id/students/batch', authorize('teacher', 'admin', 'manager'), classController.batchAddStudents);
router.delete('/:id/students/:studentId', authorize('teacher', 'admin', 'manager'), classController.removeStudentFromClass);
router.put('/:id/students/:studentId', authorize('teacher', 'admin', 'manager'), classController.updateStudentInRoster);

// Class Announcements
router.get('/:classId/announcements', requireClassMember, messageController.getAnnouncements);
router.post('/:classId/announcements', requireClassMember, authorize('teacher'), messageController.createAnnouncement);

module.exports = router;
