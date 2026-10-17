const express = require('express');
const router = express.Router();
const studyPlannerController = require('./studyPlanner.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

router.get('/logs', studyPlannerController.getLogs);
router.post('/logs', studyPlannerController.createLog);
router.post('/logs/:id/feedback', authorize('teacher'), studyPlannerController.addAdvisorFeedback);
router.get('/stats', studyPlannerController.getStats);

// Teacher Lesson & Class Planning routes
router.get('/teacher-plans', studyPlannerController.getTeacherPlans);
router.post('/teacher-plans', authorize('teacher', 'admin', 'manager'), studyPlannerController.createTeacherPlan);
router.put('/teacher-plans/:id', authorize('teacher', 'admin', 'manager'), studyPlannerController.updateTeacherPlan);
router.delete('/teacher-plans/:id', authorize('teacher', 'admin', 'manager'), studyPlannerController.deleteTeacherPlan);

// Teacher Curriculum & Content Calendar Documents routes
router.get('/teacher-documents', studyPlannerController.getTeacherDocuments);
router.post('/teacher-documents', authorize('teacher', 'admin', 'manager'), studyPlannerController.createTeacherDocument);
router.delete('/teacher-documents/:id', authorize('teacher', 'admin', 'manager'), studyPlannerController.deleteTeacherDocument);

// Student Study Notepad & Personal Planner Notes
router.get('/notes', studyPlannerController.getNotes);
router.post('/notes', studyPlannerController.createNote);
router.put('/notes/:id', studyPlannerController.updateNote);
router.delete('/notes/:id', studyPlannerController.deleteNote);

module.exports = router;
