const express = require('express');
const router = express.Router({ mergeParams: true });
const quizController = require('./quiz.controller');
const { authenticate, authorize, requireClassMember } = require('../../middleware/auth');

router.use(authenticate);
router.use(requireClassMember);

router.post('/', authorize('teacher'), quizController.create);
router.get('/', quizController.getAll);
router.get('/:id', quizController.getById);
router.put('/:id/publish', authorize('teacher'), quizController.publish);
router.post('/:id/start', authorize('student'), quizController.start);
router.post('/:id/submit', authorize('student'), quizController.submit);

module.exports = router;
