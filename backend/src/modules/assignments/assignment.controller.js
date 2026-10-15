const assignmentService = require('./assignment.service');

class AssignmentController {
  async create(req, res, next) {
    try {
      const assignment = await assignmentService.create(
        req.user.id,
        req.params.classId,
        req.body
      );
      res.status(201).json({
        success: true,
        message: 'تکلیف با موفقیت ایجاد شد',
        messageEn: 'Assignment created successfully',
        data: { assignment },
      });
    } catch (err) {
      next(err);
    }
  }

  async getAll(req, res, next) {
    try {
      const assignments = await assignmentService.getByClass(
        req.params.classId,
        req.user.id,
        req.user.role
      );
      res.json({ success: true, data: { assignments } });
    } catch (err) {
      next(err);
    }
  }

  async getMyAssignments(req, res, next) {
    try {
      const assignments = await assignmentService.getAllUserAssignments(
        req.user.id,
        req.user.role
      );
      res.json({ success: true, data: { assignments } });
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const assignment = await assignmentService.getById(
        req.params.id,
        req.user.id,
        req.user.role
      );
      if (!assignment) {
        return res.status(404).json({ success: false, message: 'تکلیف یافت نشد' });
      }
      res.json({ success: true, data: { assignment } });
    } catch (err) {
      next(err);
    }
  }

  async submit(req, res, next) {
    try {
      const submission = await assignmentService.submit(
        req.params.id,
        req.user.id,
        req.body
      );
      res.json({
        success: true,
        message: 'تکلیف با موفقیت ارسال شد',
        messageEn: 'Assignment submitted successfully',
        data: { submission },
      });
    } catch (err) {
      next(err);
    }
  }

  async grade(req, res, next) {
    try {
      const submission = await assignmentService.grade(req.params.subId, req.body);
      res.json({
        success: true,
        message: 'نمره با موفقیت ثبت شد',
        messageEn: 'Grade recorded successfully',
        data: { submission },
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AssignmentController();
