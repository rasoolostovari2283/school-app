const express = require('express');
const router = express.Router({ mergeParams: true });
const quizController = require('./quiz.controller');
const { authenticate, authorize, requireClassMember } = require('../../middleware/auth');

router.use(authenticate);

router.post('/', requireClassMember, authorize('teacher', 'admin', 'manager'), quizController.create);
router.get('/', requireClassMember, quizController.getAll);
router.get('/:id', quizController.getById);
router.put('/:id/publish', requireClassMember, authorize('teacher', 'admin', 'manager'), quizController.publish);
router.post('/:id/share', requireClassMember, authorize('teacher', 'admin', 'manager'), quizController.share);
router.post('/:id/start', requireClassMember, authorize('student'), quizController.start);
router.post('/:id/submit', requireClassMember, authorize('student'), quizController.submit);

module.exports = router;
