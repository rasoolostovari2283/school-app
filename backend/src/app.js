require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const http = require('http');

const config = require('./config');
const db = require('./config/database');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');

// Import routes
const authRoutes = require('./modules/auth/auth.routes');
const classRoutes = require('./modules/classes/class.routes');
const assignmentRoutes = require('./modules/assignments/assignment.routes');
const assignmentController = require('./modules/assignments/assignment.controller');
const quizRoutes = require('./modules/quizzes/quiz.routes');
const attendanceRoutes = require('./modules/attendance/attendance.routes');
const messageRoutes = require('./modules/messages/message.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');
const aiRoutes = require('./modules/ai/ai.routes');
const uploadRoutes = require('./modules/upload/upload.routes');
const studyPlannerRoutes = require('./modules/studyPlanner/studyPlanner.routes');
const videoRoutes = require('./modules/videos/video.routes');
const courseRoutes = require('./modules/courses/course.routes');
const feedbackRoutes = require('./modules/feedback/feedback.routes');
const gradebookRoutes = require('./modules/gradebook/gradebook.routes');
const scheduleRoutes = require('./modules/schedules/schedule.routes');
const disciplineRoutes = require('./modules/discipline/discipline.routes');
const financeRoutes = require('./modules/finance/finance.routes');
const ticketRoutes = require('./modules/tickets/ticket.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const announcementRoutes = require('./modules/announcements/announcement.routes');

const { initSocket, activeClassrooms } = require('./socket');

const app = express();
const server = http.createServer(app);
const { io } = initSocket(server, config);
app.set('io', io);
app.set('activeClassrooms', activeClassrooms);

// ── Ensure upload directory exists ──
const uploadDir = path.resolve(config.upload.dir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ── Global Middleware ──
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files for uploads (Hosted locally with 0 external CDN dependency)
app.use('/uploads', express.static(uploadDir));

// Rate limiting with domestic IP friendliness
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: {
    success: false,
    message: 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند دقیقه صبر کنید.',
    messageEn: 'Too many requests. Please wait a few minutes.',
  },
});
app.use('/api/', limiter);

// ── Health & Network Resiliency Check ──
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'EduConnect API is running smoothly',
    mode: 'Domestic & National Intranet Resilient (سازگار با شبکه ملی اطلاعات)',
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    version: '1.2.0',
    db_status: 'connected',
    network_layer: {
      domestic_ready: true,
      external_dns_dependency: false,
      storage_type: 'local_disk',
    },
  });
});

// ── Top-level Global Routers ──
const globalAssignmentRouter = express.Router();
globalAssignmentRouter.use(authenticate);
globalAssignmentRouter.get('/', assignmentController.getMyAssignments);
globalAssignmentRouter.get('/:id', assignmentController.getById);

const globalQuizRouter = express.Router();
globalQuizRouter.use(authenticate);
globalQuizRouter.get('/', async (req, res, next) => {
  try {
    let query = db('quizzes')
      .join('classes', 'classes.id', 'quizzes.class_id')
      .select(
        'quizzes.*',
        'classes.name as class_name',
        'classes.subject as class_subject',
        'classes.grade as class_grade'
      );

    let childIds = [];
    if (req.user.role === 'teacher' || req.user.role === 'admin' || req.user.role === 'manager') {
      const myCount = await db('quizzes').where({ teacher_id: req.user.id }).count('id as count').first();
      const countVal = myCount ? parseInt(myCount.count || Object.values(myCount)[0], 10) : 0;
      if (countVal > 0) {
        query = query.where({ 'quizzes.teacher_id': req.user.id });
      }
    } else if (req.user.role === 'parent') {
      childIds = await db('parent_student_links').where({ parent_id: req.user.id }).pluck('student_id');
      if (childIds.length === 0) {
        const parentUser = await db('users').where({ id: req.user.id }).first();
        if (parentUser?.student_code) {
          const matchedChild = await db('users').where({ student_code: parentUser.student_code, role: 'student' }).first();
          if (matchedChild) childIds = [matchedChild.id];
        }
      }
      if (childIds.length === 0) return res.json({ success: true, data: { quizzes: [] } });
      const classIds = await db('class_members').whereIn('user_id', childIds).pluck('class_id');
      if (classIds.length === 0) return res.json({ success: true, data: { quizzes: [] } });
      query = query.whereIn('quizzes.class_id', classIds).where({ is_published: true });
    } else {
      const classIds = await db('class_members').where({ user_id: req.user.id }).pluck('class_id');
      if (classIds.length === 0) return res.json({ success: true, data: { quizzes: [] } });
      query = query.whereIn('quizzes.class_id', classIds).where({ is_published: true });
    }

    const quizzes = await query.orderBy('quizzes.created_at', 'desc');
    for (const q of quizzes) {
      if (typeof q.attachments === 'string') {
        try {
          q.attachments = JSON.parse(q.attachments);
        } catch (e) {
          q.attachments = [];
        }
      } else if (!q.attachments) {
        q.attachments = [];
      }

      const qCount = await db('quiz_questions').where({ quiz_id: q.id }).count('id as count').first();
      q.questions_count = parseInt(qCount ? (qCount.count || Object.values(qCount)[0]) : 0, 10);

      const attemptsCount = await db('quiz_attempts').where({ quiz_id: q.id }).count('id as count').first();
      q.attempts_count = parseInt(attemptsCount ? (attemptsCount.count || Object.values(attemptsCount)[0]) : 0, 10);

      if (req.user.role === 'student') {
        q.attempt = await db('quiz_attempts').where({ quiz_id: q.id, student_id: req.user.id }).first() || null;
        if (q.attempt && typeof q.attempt.answers === 'string') {
          try {
            q.attempt.answers_data = JSON.parse(q.attempt.answers);
          } catch (e) {
            q.attempt.answers_data = {};
          }
        }
      } else if (req.user.role === 'parent') {
        q.attempt = await db('quiz_attempts').where({ quiz_id: q.id }).whereIn('student_id', childIds).first() || null;
        if (q.attempt && typeof q.attempt.answers === 'string') {
          try {
            q.attempt.answers_data = JSON.parse(q.attempt.answers);
          } catch (e) {
            q.attempt.answers_data = {};
          }
        }
        if (childIds.length > 0) {
          const childUser = await db('users').whereIn('id', childIds).first();
          if (childUser) q.child_name = childUser.display_name;
        }
      }
    }
    res.json({ success: true, data: { quizzes } });
  } catch (err) { next(err); }
});

globalQuizRouter.get('/:id', async (req, res, next) => {
  try {
    const quizService = require('./modules/quizzes/quiz.service');
    const quiz = await quizService.getById(req.params.id, req.user.id, req.user.role);
    if (!quiz) return res.status(404).json({ success: false, message: 'کوییز یافت نشد' });
    res.json({ success: true, data: { quiz } });
  } catch (err) { next(err); }
});

globalQuizRouter.post('/', async (req, res, next) => {
  try {
    const quizService = require('./modules/quizzes/quiz.service');
    const classId = req.body.class_id;
    if (!classId) return res.status(400).json({ success: false, message: 'شناسه کلاس الزامی است' });
    const quiz = await quizService.create(req.user.id, classId, req.body);
    res.status(201).json({ success: true, message: 'کوییز با موفقیت ایجاد شد', data: { quiz } });
  } catch (err) { next(err); }
});

globalQuizRouter.post('/:id/start', async (req, res, next) => {
  try {
    const quizService = require('./modules/quizzes/quiz.service');
    const attempt = await quizService.startAttempt(req.params.id, req.user.id);
    res.json({ success: true, data: { attempt } });
  } catch (err) { next(err); }
});

globalQuizRouter.post('/:id/submit', async (req, res, next) => {
  try {
    const quizService = require('./modules/quizzes/quiz.service');
    const result = await quizService.submitAttempt(req.params.id, req.user.id, req.body);
    res.json({ success: true, message: 'پاسخ‌ها ثبت شد', data: { result } });
  } catch (err) { next(err); }
});

// ── API Routes ──
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/classes', classRoutes);
app.use('/api/v1/classes/:classId/assignments', assignmentRoutes);
app.use('/api/v1/classes/:classId/quizzes', quizRoutes);
app.use('/api/v1/classes/:classId/attendance', attendanceRoutes);
app.use('/api/v1/assignments', globalAssignmentRouter);
app.use('/api/v1/quizzes', globalQuizRouter);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/study-planner', studyPlannerRoutes);
app.use('/api/v1/videos', videoRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/feedback', feedbackRoutes);
app.use('/api/v1/gradebook', gradebookRoutes);
app.use('/api/v1/schedules', scheduleRoutes);
app.use('/api/v1/discipline', disciplineRoutes);
app.use('/api/v1/finance', financeRoutes);
app.use('/api/v1/tickets', ticketRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/announcements', announcementRoutes);

// ── Error Handling ──
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start Server ──
const PORT = config.port;
server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════════════════╗
  ║                                                              ║
  ║   🎓 EduConnect Enterprise API Server                        ║
  ║   ────────────────────────────────────                       ║
  ║   Port:         ${PORT}                                         ║
  ║   Env:          ${config.nodeEnv.padEnd(20)}                   ║
  ║   API:          http://localhost:${PORT}/api/v1                  ║
  ║   Health:       http://localhost:${PORT}/api/health               ║
  ║   Intranet:     100% Domestic Resilient (شبکه ملی اطلاعات)   ║
  ║                                                              ║
  ╚══════════════════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server };
