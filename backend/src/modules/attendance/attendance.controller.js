const attendanceService = require('./attendance.service');

class AttendanceController {
  async createSession(req, res, next) {
    try {
      const session = await attendanceService.createSession(
        req.user.id, req.params.classId, req.body
      );
      res.status(201).json({
        success: true,
        message: 'جلسه حضور و غیاب فعال شد',
        data: { session },
      });
    } catch (err) { next(err); }
  }

  async getSessions(req, res, next) {
    try {
      const sessions = await attendanceService.getSessionsByClass(req.params.classId);
      res.json({ success: true, data: { sessions } });
    } catch (err) { next(err); }
  }

  async checkIn(req, res, next) {
    try {
      const record = await attendanceService.checkIn(
        req.params.id, req.user.id
      );
      res.json({
        success: true,
        message: record.status === 'late' ? 'حضور شما با تاخیر ثبت شد ⏰' : 'حضور شما با موفقیت ثبت شد ✅',
        data: { record },
      });
    } catch (err) { next(err); }
  }

  async recordStudent(req, res, next) {
    try {
      const record = await attendanceService.recordStudentAttendance(
        req.params.id,
        req.body.student_id,
        req.body.status
      );
      res.json({
        success: true,
        message: 'وضعیت حضور با موفقیت ثبت شد',
        data: { record },
      });
    } catch (err) { next(err); }
  }

  async getReport(req, res, next) {
    try {
      const report = await attendanceService.getSessionReport(
        req.params.id, req.params.classId
      );
      if (!report) return res.status(404).json({ success: false, message: 'جلسه یافت نشد' });
      res.json({ success: true, data: report });
    } catch (err) { next(err); }
  }

  async getHistory(req, res, next) {
    try {
      const studentId = req.user.role === 'student' ? req.user.id : req.query.student_id;
      const history = await attendanceService.getHistory(req.params.classId, studentId);
      res.json({ success: true, data: { sessions: history } });
    } catch (err) { next(err); }
  }

  async closeSession(req, res, next) {
    try {
      const session = await attendanceService.closeSession(req.params.id);
      res.json({
        success: true,
        message: 'جلسه حضور و غیاب بسته شد',
        data: { session },
      });
    } catch (err) { next(err); }
  }
}

module.exports = new AttendanceController();
