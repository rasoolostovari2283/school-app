const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');
const localCaptcha = require('../../utils/localCaptcha');

router.post('/quick-entry', authController.quickEntry);
router.post('/register', authController.register);
router.post('/register-school', authController.registerSchool);
router.post('/login', authController.login);
router.post('/parent-login', authController.parentLogin);
router.post('/refresh', authController.refresh);
router.get('/me', authenticate, authController.getMe);
router.put('/profile', authenticate, authController.updateProfile);
router.get('/student-setup-options', authenticate, authController.getStudentSetupOptions);
router.post('/student-setup', authenticate, authController.saveStudentSetup);
router.get('/teacher-setup-options', authenticate, authController.getTeacherSetupOptions);
router.post('/teacher-setup', authenticate, authController.saveTeacherSetup);

// Domestic Offline-Safe Captcha
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
