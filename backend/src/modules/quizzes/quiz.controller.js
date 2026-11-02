const quizService = require('./quiz.service');

class QuizController {
  async create(req, res, next) {
    try {
      const quiz = await quizService.create(req.user.id, req.params.classId, req.body);
      res.status(201).json({
        success: true,
        message: 'کوییز با موفقیت ایجاد شد',
        data: { quiz },
      });
    } catch (err) { next(err); }
  }

  async getAll(req, res, next) {
    try {
      const quizzes = await quizService.getByClass(req.params.classId, req.user.role);
      res.json({ success: true, data: { quizzes } });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const quiz = await quizService.getById(req.params.id, req.user.id, req.user.role);
      if (!quiz) return res.status(404).json({ success: false, message: 'کوییز یافت نشد' });
      res.json({ success: true, data: { quiz } });
    } catch (err) { next(err); }
  }

  async publish(req, res, next) {
    try {
      const quiz = await quizService.publish(req.params.id);
      res.json({ success: true, message: 'کوییز منتشر شد', data: { quiz } });
    } catch (err) { next(err); }
  }

  async share(req, res, next) {
    try {
      const result = await quizService.shareQuiz(req.params.id, req.user.id, req.body);
      res.json({
        success: true,
        message: 'آزمون با موفقیت با دانش‌آموزان به اشتراک گذاشته شد 📢',
        data: result,
      });
    } catch (err) { next(err); }
  }

  async start(req, res, next) {
    try {
      const attempt = await quizService.startAttempt(req.params.id, req.user.id);
      res.json({ success: true, data: { attempt } });
    } catch (err) { next(err); }
  }

  async submit(req, res, next) {
    try {
      const result = await quizService.submitAttempt(req.params.id, req.user.id, req.body);
      res.json({
        success: true,
        message: 'پاسخ‌ها ثبت شد',
        data: { result },
      });
    } catch (err) { next(err); }
  }
}

module.exports = new QuizController();
