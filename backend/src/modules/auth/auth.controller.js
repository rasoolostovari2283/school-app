const authService = require('./auth.service');
const { registerSchema, loginSchema, quickEntrySchema } = require('./auth.validators');
const config = require('../../config');

function setAuthCookies(res, accessToken, refreshToken) {
  if (!accessToken) return;
  const isProd = config.nodeEnv === 'production';
  const secureFlag = isProd ? '; Secure' : '';
  const cookies = [
    `accessToken=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secureFlag}`,
    `access_token=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secureFlag}`,
  ];
  if (refreshToken) {
    cookies.push(
      `refreshToken=${encodeURIComponent(refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secureFlag}`
    );
  }
  res.setHeader('Set-Cookie', cookies);
}

function clearAuthCookies(res) {
  res.setHeader('Set-Cookie', [
    'accessToken=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    'access_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    'refreshToken=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
  ]);
}

function extractRefreshTokenFromCookie(req) {
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';').map((c) => c.trim());
  for (const prefix of ['refreshToken=', 'refresh_token=']) {
    const match = parts.find((c) => c.startsWith(prefix));
    if (match) {
      const val = decodeURIComponent(match.slice(prefix.length)).trim();
      if (val) return val;
    }
  }
  return null;
}

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
      setAuthCookies(res, result.accessToken, result.refreshToken);

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
      setAuthCookies(res, result.accessToken, result.refreshToken);

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
      setAuthCookies(res, result.accessToken, result.refreshToken);
      res.status(201).json({
        success: true,
        message: `مدرسه «${result.school.name}» با موفقیت ثبت شد! نام کاربری اختصاصی شما: @${result.school.username} | کد مدرسه: ${result.school.school_code}`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/register-student
   */
  async registerStudent(req, res, next) {
    try {
      const result = await authService.registerStudent(req.body || {});
      setAuthCookies(res, result.accessToken, result.refreshToken);
      res.status(201).json({
        success: true,
        message: `ثبت‌نام شما با موفقیت انجام شد! نام کاربری انحصاری شما: @${result.user.username}`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/register-teacher
   */
  async registerTeacher(req, res, next) {
    try {
      const result = await authService.registerTeacher(req.body || {});
      setAuthCookies(res, result.accessToken, result.refreshToken);
      res.status(201).json({
        success: true,
        message: `ثبت‌نام معلم زیرشاخه مدرسه «${result.school.name}» با موفقیت انجام شد! آیدی اختصاصی شما: @${result.user.username}`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/register-parent
   */
  async registerParent(req, res, next) {
    try {
      const result = await authService.registerParent(req.body || {});
      setAuthCookies(res, result.accessToken, result.refreshToken);
      res.status(201).json({
        success: true,
        message: `ثبت‌نام اولیای «${result.student.full_name}» با موفقیت انجام شد! آیدی اختصاصی شما: @${result.user.username}`,
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

      const result = await authService.login(
        value.identifier,
        value.password,
        value.captcha_id || value.captchaId || null,
        value.captcha_answer ?? value.captchaAnswer ?? null,
        {
          school_id: value.school_id || null,
          school_code: value.school_code || null,
        }
      );

      setAuthCookies(res, result.accessToken, result.refreshToken);

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
   * POST /api/v1/auth/demo-login
   */
  async demoLogin(req, res, next) {
    try {
      const role = req.body?.role || 'admin';
      const result = await authService.demoLogin(role);
      setAuthCookies(res, result.accessToken, result.refreshToken);

      res.json({
        success: true,
        message: 'ورود به حساب آزمایشی با موفقیت انجام شد',
        messageEn: 'Demo login successful',
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
      const {
        student_code,
        student_identifier,
        parent_name,
        phone,
        parent_phone,
        school_id,
        school_code,
        school_name,
      } = req.body || {};

      const resolvedStudentCode = student_code || student_identifier || '';
      const resolvedPhone = phone || parent_phone || '';

      const result = await authService.parentLoginByStudentCode(
        resolvedStudentCode,
        parent_name,
        resolvedPhone,
        { school_id, school_code, school_name }
      );

      setAuthCookies(res, result.accessToken, result.refreshToken);

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
      const refreshToken = req.body?.refreshToken || extractRefreshTokenFromCookie(req);
      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'توکن بازنشانی الزامی است',
          messageEn: 'Refresh token is required',
        });
      }

      const tokens = await authService.refreshToken(refreshToken);
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

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
   * GET /api/v1/auth/me & GET /api/v1/auth/profile
   */
  async getMe(req, res) {
    res.json({
      success: true,
      data: { ...req.user, user: req.user },
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
        data: { ...user, user },
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
      const options = await authService.getStudentSetupOptions(req.user);
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
      const { school_name, grade, major, education_level, teacher_ids } = req.body || {};
      const result = await authService.saveStudentSetup(req.user.id, {
        school_name,
        grade,
        major,
        education_level,
        teacher_ids,
      });
      res.json({
        success: true,
        message: 'معلمان انتخاب‌شده ثبت شدند و شما در لیست کلاسی آن‌ها قرار گرفتید',
        data: {
          user: result.user,
          linked_teachers: result.linked_teachers,
          enrolled_classes: result.enrolled_classes,
        },
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
      const options = await authService.getTeacherSetupOptions(req.user?.id);
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

  /**
   * POST /api/v1/auth/change-password
   */
  async changePassword(req, res, next) {
    try {
      const { current_password, new_password } = req.body;
      await authService.changePassword(req.user.id, current_password, new_password);
      res.json({
        success: true,
        message: 'رمز عبور با موفقیت تغییر یافت',
        messageEn: 'Password changed successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/logout
   */
  async logout(req, res) {
    try {
      const jwt = require('jsonwebtoken');
      const config = require('../../config');
      const { extractTokenFromRequest } = require('../../middleware/auth');

      const accessToken = extractTokenFromRequest(req);
      if (accessToken) {
        try {
          const decoded = jwt.verify(accessToken, config.jwt.secret);
          if (decoded?.jti) {
            await authService.revokeTokenByJti(
              decoded.jti,
              decoded.userId || null,
              'access',
              'logout',
              decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
            );
          }
          if (req.body?.all_devices && decoded?.userId) {
            await authService.revokeAllUserSessions(decoded.userId, 'logout_all');
          }
        } catch (_e) {}
      }

      const refreshToken =
        req.body?.refreshToken ||
        req.body?.refresh_token ||
        extractRefreshTokenFromCookie(req);
      if (refreshToken) {
        try {
          const decodedRefresh = jwt.verify(refreshToken, config.jwt.refreshSecret);
          if (decodedRefresh?.jti) {
            await authService.revokeTokenByJti(
              decodedRefresh.jti,
              decodedRefresh.userId || null,
              'refresh',
              'logout',
              decodedRefresh.exp ? new Date(decodedRefresh.exp * 1000).toISOString() : null,
            );
          }
        } catch (_e) {}
      }
    } catch (_err) {}

    clearAuthCookies(res);
    res.json({
      success: true,
      message: 'خروج با موفقیت انجام شد و نشست فعلی ابطال گردید',
      messageEn: 'Logged out successfully',
    });
  }

  /**
   * POST /api/v1/auth/revoke-sessions
   * Immediately revokes all active access & refresh tokens for the authenticated user
   */
  async revokeSessions(req, res, next) {
    try {
      const result = await authService.revokeAllUserSessions(
        req.user.id,
        'revoke_sessions',
        req.tokenPayload?.jti || null,
      );
      clearAuthCookies(res);
      res.json({
        success: true,
        message: 'تمامی نشست‌های فعال شما با موفقیت ابطال شدند',
        messageEn: 'All active sessions have been revoked',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/auth/schools
   * Public list of registered schools for login page and dropdowns
   */
  async getPublicSchoolsList(req, res, next) {
    try {
      const q = req.query?.q || req.query?.search || '';
      const schools = await authService.getPublicSchoolsList(q);
      res.json({
        success: true,
        data: schools,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/auth/schools/by-username/:username
   * Lookup a registered school in the database by its unique username
   */
  async getSchoolByUsername(req, res, next) {
    try {
      const school = await authService.getSchoolByUsername(req.params.username);
      res.json({
        success: true,
        data: school,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/auth/students/by-username/:username
   * Lookup a registered student in the database by their exclusive username (optionally scoped to school_id)
   */
  async getStudentByUsername(req, res, next) {
    try {
      const student = await authService.getStudentByUsername(req.params.username, {
        school_id: req.query?.school_id || null,
      });
      res.json({
        success: true,
        data: student,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AuthController();
