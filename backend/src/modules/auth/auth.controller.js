const authService = require('./auth.service');
const { registerSchema, loginSchema, quickEntrySchema } = require('./auth.validators');

class AuthController {
  /**
   * POST /api/v1/auth/quick-entry
   * Quick entry by Full Name and Phone, auto-generating unique ID
   */
  async quickEntry(req, res, next) {
    try {
      const { error, value } = quickEntrySchema.validate(req.body);
      if (error) {
        error.isJoi = true;
        return next(error);
      }

      const result = await authService.quickEntry(value);

      res.status(200).json({
        success: true,
        message: result.isNew 
          ? `حساب کاربری شما با موفقیت ایجاد شد! آیدی شما: @${result.user.username}`
          : `ورود با موفقیت انجام شد! خوش آمدید @${result.user.username}`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/register
   */
  async register(req, res, next) {
    try {
      const { error, value } = registerSchema.validate(req.body);
      if (error) {
        error.isJoi = true;
        return next(error);
      }

      const result = await authService.register(value);

      res.status(201).json({
        success: true,
        message: 'ثبت‌نام با موفقیت انجام شد',
        messageEn: 'Registration successful',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/register-school
   */
  async registerSchool(req, res, next) {
    try {
      const result = await authService.registerSchool(req.body);
      res.status(201).json({
        success: true,
        message: `مدرسه «${result.school.name}» با موفقیت ثبت شد! کد اختصاصی مدرسه: ${result.school.school_code}`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/login
   */
  async login(req, res, next) {
    try {
      const { error, value } = loginSchema.validate(req.body);
      if (error) {
        error.isJoi = true;
        return next(error);
      }

      const result = await authService.login(value.identifier, value.password);

      res.json({
        success: true,
        message: 'ورود موفقیت‌آمیز',
        messageEn: 'Login successful',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/parent-login
   */
  async parentLogin(req, res, next) {
    try {
      const { student_code, parent_name, phone } = req.body;
      const result = await authService.parentLoginByStudentCode(student_code, parent_name, phone);

      res.json({
        success: true,
        message: `ورود با موفقیت انجام شد. خوش آمدید به پنل اولیای ${result.student.display_name}`,
        messageEn: 'Parent login successful',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/refresh
   */
  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'توکن بازنشانی الزامی است',
          messageEn: 'Refresh token is required',
        });
      }

      const tokens = await authService.refreshToken(refreshToken);

      res.json({
        success: true,
        message: 'توکن با موفقیت تمدید شد',
        messageEn: 'Token refreshed successfully',
        data: tokens,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/auth/me
   */
  async getMe(req, res) {
    res.json({
      success: true,
      data: { user: req.user },
    });
  }

  /**
   * PUT /api/v1/auth/profile
   */
  async updateProfile(req, res, next) {
    try {
      const user = await authService.updateProfile(req.user.id, req.body);
      res.json({
        success: true,
        message: 'مشخصات با موفقیت به‌روزرسانی شد',
        messageEn: 'Profile updated successfully',
        data: { user },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/auth/student-setup-options
   */
  async getStudentSetupOptions(req, res, next) {
    try {
      const options = await authService.getStudentSetupOptions();
      res.json({
        success: true,
        data: options,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/student-setup
   */
  async saveStudentSetup(req, res, next) {
    try {
      const { school_name, grade, teacher_ids } = req.body;
      const user = await authService.saveStudentSetup(req.user.id, {
        school_name,
        grade,
        teacher_ids,
      });
      res.json({
        success: true,
        message: 'مشخصات مدرسه، پایه تحصیلی و معلمان منتخب با موفقیت ثبت شد 🎉',
        data: { user },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/auth/teacher-setup-options
   */
  async getTeacherSetupOptions(req, res, next) {
    try {
      const options = await authService.getTeacherSetupOptions(req.user.id);
      res.json({
        success: true,
        data: options,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/teacher-setup
   */
  async saveTeacherSetup(req, res, next) {
    try {
      const { school_name, schools, grades, subject } = req.body;
      const result = await authService.saveTeacherSetup(req.user.id, {
        school_name,
        schools,
        grades,
        subject,
      });
      res.json({
        success: true,
        message: `مدرسه و پایه‌های تدریس ثبت شد و اتصال شما با ${result.connectedCount} دانش‌آموز برقرار گردید 🎉`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AuthController();
