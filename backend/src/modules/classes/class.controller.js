const classService = require('./class.service');

class ClassController {
  /**
   * POST /api/v1/classes — Create a new class
   */
  async createClass(req, res, next) {
    try {
      const cls = await classService.createClass(req.user, req.body);
      res.status(201).json({
        success: true,
        message: 'کلاس با موفقیت ایجاد شد',
        messageEn: 'Class created successfully',
        data: { class: cls },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/v1/classes/:id — Update a class
   */
  async updateClass(req, res, next) {
    try {
      const cls = await classService.updateClass(req.params.id, req.user, req.body);
      res.json({
        success: true,
        message: 'کلاس با موفقیت به‌روزرسانی شد',
        messageEn: 'Class updated successfully',
        data: { class: cls },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/classes — Get user's classes
   */
  async getClasses(req, res, next) {
    try {
      const classes = await classService.getUserClasses(req.user.id, req.user.role);
      res.json({
        success: true,
        data: { classes },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/classes/parent/children — Get parent's linked children
   */
  async getParentChildren(req, res, next) {
    try {
      const children = await classService.getParentChildren(req.user.id);
      res.json({
        success: true,
        data: { children },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/classes/:id — Get class details
   */
  async getClassById(req, res, next) {
    try {
      const cls = await classService.getClassById(req.params.id);
      if (!cls) {
        return res.status(404).json({
          success: false,
          message: 'کلاس یافت نشد',
          messageEn: 'Class not found',
        });
      }
      res.json({
        success: true,
        data: { class: cls },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/classes/join — Join a class with code
   */
  async joinClass(req, res, next) {
    try {
      const { join_code } = req.body;
      if (!join_code) {
        return res.status(400).json({
          success: false,
          message: 'کد کلاس الزامی است',
          messageEn: 'Class code is required',
        });
      }

      const cls = await classService.joinClass(req.user, req.user.role, join_code);
      res.json({
        success: true,
        message: 'با موفقیت به کلاس پیوستید',
        messageEn: 'Successfully joined the class',
        data: { class: cls },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/classes/:id/members — Get class members
   */
  async getMembers(req, res, next) {
    try {
      const members = await classService.getClassMembers(req.params.id);
      res.json({
        success: true,
        data: { members },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/classes/:id/invite — Create invite link
   */
  async createInvite(req, res, next) {
    try {
      const { target_role, max_uses, expires_in_hours } = req.body;
      const invite = await classService.createInviteLink(
        req.params.id,
        req.user,
        target_role || 'student',
        max_uses,
        expires_in_hours
      );
      res.status(201).json({
        success: true,
        message: 'لینک دعوت ایجاد شد',
        messageEn: 'Invite link created',
        data: { invite },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/v1/classes/:id/quiet-hours — Update quiet hours
   */
  async updateQuietHours(req, res, next) {
    try {
      const cls = await classService.updateQuietHours(req.params.id, req.user, req.body);
      res.json({
        success: true,
        message: 'ساعات بی‌صدا بروزرسانی شد',
        messageEn: 'Quiet hours updated',
        data: { class: cls },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/classes/:id — Delete a class
   */
  async deleteClass(req, res, next) {
    try {
      const cls = await classService.deleteClass(req.params.id, req.user);
      res.json({
        success: true,
        message: `کلاس «${cls.name}» با موفقیت حذف شد`,
        messageEn: 'Class deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/classes/:id/live-status — Get live session status
   */
  async getLiveStatus(req, res, next) {
    try {
      const activeClassrooms = req.app.get('activeClassrooms');
      const room = activeClassrooms ? activeClassrooms.get(req.params.id) : null;
      if (!room || !room.isLive) {
        return res.json({
          success: true,
          data: {
            is_live: false,
            participants_count: room ? room.participants.size : 0,
          },
        });
      }
      res.json({
        success: true,
        data: {
          is_live: true,
          started_at: room.startedAt,
          title: room.title,
          teacher_name: room.teacherName,
          teacher_id: room.teacherId,
          participants_count: room.participants.size,
          board_type: room.boardType,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/v1/classes/:id/live-settings — Configure live provider
   */
  async updateLiveSettings(req, res, next) {
    try {
      const externalLiveService = require('./externalLive.service');
      const updatedClass = await externalLiveService.updateLiveSettings(req.params.id, req.user, req.body);
      res.json({
        success: true,
        message: 'تنظیمات بستر کلاس آنلاین با موفقیت ذخیره شد',
        messageEn: 'Live settings saved successfully',
        data: { class: updatedClass },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/classes/:id/live-launch — Generate join/launch URL
   */
  async getLiveLaunchUrl(req, res, next) {
    try {
      const externalLiveService = require('./externalLive.service');
      const launchData = await externalLiveService.generateJoinUrl(req.params.id, req.user);
      res.json({
        success: true,
        data: launchData,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/classes/:id/sync-external-recording — Save recorded video from Skyroom/BBB to class archive
   */
  async syncExternalRecording(req, res, next) {
    try {
      const externalLiveService = require('./externalLive.service');
      const video = await externalLiveService.syncExternalRecording(req.params.id, req.user, req.body);
      res.status(201).json({
        success: true,
        message: 'جلسه ضبط‌شده با موفقیت به آرشیو ویدیوهای کلاس اضافه شد 🎬',
        messageEn: 'Recording synced to class archive',
        data: { video },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * ── Class Rosters Endpoints ──
   */
  async getClassRoster(req, res, next) {
    try {
      const roster = await classService.getClassRoster(req.params.id, req.user);
      res.json({
        success: true,
        data: roster,
      });
    } catch (err) {
      next(err);
    }
  }

  async searchSchoolStudents(req, res, next) {
    try {
      const result = await classService.searchSchoolStudentsForClass(
        req.params.id,
        req.user,
        req.query.q || ''
      );
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async addRegisteredStudentsToRoster(req, res, next) {
    try {
      const result = await classService.addRegisteredStudentsToRoster(
        req.params.id,
        req.user,
        req.body || {}
      );
      res.status(201).json({
        success: true,
        message: result.added_students.length > 0
          ? `${result.added_students.length} دانش‌آموز در لیست کلاسی ثبت و در دیتابیس ذخیره شد`
          : 'این دانش‌آموزان قبلاً در لیست این کلاس ثبت شده‌اند و گروه کلاسی به‌روزرسانی شد',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async addStudentToClass(req, res, next) {
    try {
      const student = await classService.addStudentToClass(req.params.id, req.user, req.body);
      res.status(201).json({
        success: true,
        message: 'دانش‌آموز با موفقیت به لیست کلاس اضافه شد',
        data: { student },
      });
    } catch (err) {
      next(err);
    }
  }

  async batchAddStudents(req, res, next) {
    try {
      const result = await classService.batchAddStudents(req.params.id, req.user, req.body);
      res.status(201).json({
        success: true,
        message: `${result.added_count} دانش‌آموز با موفقیت به کلاس اضافه شدند`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async removeStudentFromClass(req, res, next) {
    try {
      const result = await classService.removeStudentFromClass(req.params.id, req.params.studentId, req.user);
      res.json({
        success: true,
        message: 'دانش‌آموز با موفقیت از لیست کلاس حذف شد',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateStudentInRoster(req, res, next) {
    try {
      const student = await classService.updateStudentInRoster(req.params.id, req.params.studentId, req.user, req.body);
      res.json({
        success: true,
        message: 'مشخصات دانش‌آموز با موفقیت ویرایش شد',
        data: { student },
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ClassController();
