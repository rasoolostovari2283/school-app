const studyPlannerService = require('./studyPlanner.service');

class StudyPlannerController {
  async getLogs(req, res, next) {
    try {
      const logs = await studyPlannerService.getLogs(
        req.user.id,
        req.user.role,
        req.query.student_id
      );
      res.json({ success: true, data: { logs } });
    } catch (err) { next(err); }
  }

  async createLog(req, res, next) {
    try {
      const log = await studyPlannerService.createLog(req.user.id, req.body);
      res.status(201).json({
        success: true,
        message: 'گزارش مطالعه روزانه با موفقیت ثبت شد',
        data: { log },
      });
    } catch (err) { next(err); }
  }

  async addAdvisorFeedback(req, res, next) {
    try {
      const log = await studyPlannerService.addAdvisorFeedback(
        req.user.id,
        req.params.id,
        req.body
      );
      res.json({
        success: true,
        message: 'بازخورد مشاور تحصیلی با موفقیت ثبت شد',
        data: { log },
      });
    } catch (err) { next(err); }
  }

  async getStats(req, res, next) {
    try {
      const stats = await studyPlannerService.getStats(
        req.user.id,
        req.user.role,
        req.query.student_id
      );
      res.json({ success: true, data: { stats } });
    } catch (err) { next(err); }
  }

  async getTeacherPlans(req, res, next) {
    try {
      const plans = await studyPlannerService.getTeacherPlans(req.user.id);
      res.json({ success: true, data: { plans } });
    } catch (err) { next(err); }
  }

  async createTeacherPlan(req, res, next) {
    try {
      const plan = await studyPlannerService.createTeacherPlan(req.user.id, req.body);
      res.status(201).json({
        success: true,
        message: 'برنامه کلاسی و جلسه تدریس با موفقیت ثبت شد 🎉',
        data: { plan },
      });
    } catch (err) { next(err); }
  }

  async updateTeacherPlan(req, res, next) {
    try {
      const plan = await studyPlannerService.updateTeacherPlan(req.user.id, req.params.id, req.body);
      res.json({
        success: true,
        message: 'برنامه کلاسی به‌روزرسانی شد ✅',
        data: { plan },
      });
    } catch (err) { next(err); }
  }

  async deleteTeacherPlan(req, res, next) {
    try {
      await studyPlannerService.deleteTeacherPlan(req.user.id, req.params.id);
      res.json({
        success: true,
        message: 'برنامه کلاسی از تقویم تدریس حذف شد',
      });
    } catch (err) { next(err); }
  }

  async getTeacherDocuments(req, res, next) {
    try {
      const documents = await studyPlannerService.getTeacherDocuments(req.user.id);
      res.json({ success: true, data: { documents } });
    } catch (err) { next(err); }
  }

  async createTeacherDocument(req, res, next) {
    try {
      const document = await studyPlannerService.createTeacherDocument(req.user.id, req.body);
      res.status(201).json({
        success: true,
        message: 'سند طرح درس / تقویم محتوایی با موفقیت ذخیره شد 📁',
        data: { document },
      });
    } catch (err) { next(err); }
  }

  async deleteTeacherDocument(req, res, next) {
    try {
      await studyPlannerService.deleteTeacherDocument(req.user.id, req.params.id);
      res.json({
        success: true,
        message: 'سند مورد نظر با موفقیت حذف شد',
      });
    } catch (err) { next(err); }
  }

  async getNotes(req, res, next) {
    try {
      const studentId = (req.user.role === 'teacher' && req.query.student_id) ? req.query.student_id : req.user.id;
      const notes = await studyPlannerService.getStudentNotes(studentId);
      res.json({ success: true, data: { notes } });
    } catch (err) { next(err); }
  }

  async createNote(req, res, next) {
    try {
      const note = await studyPlannerService.createStudentNote(req.user.id, req.body);
      res.status(201).json({
        success: true,
        message: 'یادداشت با موفقیت ثبت شد 📝',
        data: { note },
      });
    } catch (err) { next(err); }
  }

  async updateNote(req, res, next) {
    try {
      const note = await studyPlannerService.updateStudentNote(req.user.id, req.params.id, req.body);
      res.json({
        success: true,
        message: 'یادداشت به‌روزرسانی شد ✓',
        data: { note },
      });
    } catch (err) { next(err); }
  }

  async deleteNote(req, res, next) {
    try {
      await studyPlannerService.deleteStudentNote(req.user.id, req.params.id);
      res.json({
        success: true,
        message: 'یادداشت حذف شد',
      });
    } catch (err) { next(err); }
  }
}

module.exports = new StudyPlannerController();
