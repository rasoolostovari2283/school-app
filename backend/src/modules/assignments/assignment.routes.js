const express = require('express');
const router = express.Router({ mergeParams: true });
const assignmentController = require('./assignment.controller');
const { authenticate, authorize, requireClassMember } = require('../../middleware/auth');

router.use(authenticate);
router.use(requireClassMember);

router.post('/', authorize('teacher'), assignmentController.create);
router.get('/', assignmentController.getAll);
router.get('/:id', assignmentController.getById);
router.post('/:id/submit', authorize('student'), assignmentController.submit);
router.put('/:id/submissions/:subId/grade', authorize('teacher'), assignmentController.grade);

module.exports = router;
