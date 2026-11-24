const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticate, optionalAuth } = require('../../middleware/auth');
const localCaptcha = require('../../utils/localCaptcha');

router.post('/quick-entry', authController.quickEntry);
router.post('/register', authController.register);
router.post('/register-school', authController.registerSchool);
router.post('/register-student', authController.registerStudent);
router.post('/register-teacher', authController.registerTeacher);
router.post('/register-parent', authController.registerParent);
router.get('/schools', authController.getPublicSchoolsList);
router.get('/schools/by-username/:username', authController.getSchoolByUsername);
router.get('/students/by-username/:username', authController.getStudentByUsername);
router.post('/login', authController.login);
router.post('/demo-login', authController.demoLogin);
router.post('/parent-login', authController.parentLogin);
router.post('/refresh', authController.refresh);
router.get('/me', authenticate, authController.getMe);
router.get('/profile', authenticate, authController.getMe);
router.put('/profile', authenticate, authController.updateProfile);
router.post('/change-password', authenticate, authController.changePassword);
router.post('/logout', authController.logout);
router.post('/revoke-sessions', authenticate, authController.revokeSessions);
router.get('/student-setup-options', optionalAuth, authController.getStudentSetupOptions);
router.post('/student-setup', authenticate, authController.saveStudentSetup);
router.get('/teacher-setup-options', optionalAuth, authController.getTeacherSetupOptions);
router.post('/teacher-setup', authenticate, authController.saveTeacherSetup);

// Domestic Offline-Safe Captcha (never returns plaintext solution to the client)
router.get('/captcha', (req, res) => {
  const captcha = localCaptcha.generate();
  res.json({
    success: true,
    data: {
      id: captcha.id,
      svg: captcha.svg,
    },
  });
});

module.exports = router;
