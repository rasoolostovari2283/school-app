require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const http = require('http');
const compression = require('compression');

const config = require('./config');

if (!config.nodeEnvIsSet) {
  console.error(
    '[EduConnect] NODE_ENV is not set. Refusing to start. ' +
    'Set NODE_ENV=production for a deployment (NODE_ENV=test is used by the test suite).',
  );
  process.exit(1);
}

const db = require('./config/database');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authenticate, authorize } = require('./middleware/auth');

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
const schoolRoutes = require('./modules/school/school.routes');

const { initSocket, activeClassrooms } = require('./socket');
const { startScheduledMaintenance, listBackups, createBackup, BACKUP_DIR } = require('./services/dbMaintenance');
const { getAuditLogs, logAudit } = require('./utils/auditLogger');

const app = express();

app.set('trust proxy', 1);
const server = http.createServer(app);
const { io } = initSocket(server, config);
app.set('io', io);
app.set('activeClassrooms', activeClassrooms);

const uploadDir = path.resolve(config.upload.dir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  frameguard: false,
  xssFilter: true,
  noSniff: true,
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  dnsPrefetchControl: { allow: false },
}));

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Pinggy-No-Screen'],
  maxAge: 86400,
}));

if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const { persianNormalizer } = require('./middleware/persianNormalizer');
app.use(persianNormalizer);

// Authenticated static files for uploads (#15/F9)
app.use('/uploads', authenticate, express.static(uploadDir, {
  maxAge: '7d',
  etag: true,
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html' || ext === '.htm' || ext === '.svg' || ext === '.xml') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
  },
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    message: 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند دقیقه صبر کنید.',
    messageEn: 'Too many requests. Please wait a few minutes.',
  },
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    message: 'تعداد تلاش‌های ورود بیش از حد مجاز است. لطفاً ۱۵ دقیقه دیگر تلاش فرمایید.',
    messageEn: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
});
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/quick-entry', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1/auth/register-school', authLimiter);

// ── Health & Sync Status Check (#36/A19) ──
const getSyncStatusData = () => {
  try {
    const syncFile = path.join(__dirname, '..', 'sync_status.json');
    if (fs.existsSync(syncFile)) {
      const parsed = JSON.parse(fs.readFileSync(syncFile, 'utf8'));
      if (parsed && parsed.commit_hash) {
        return {
          status: parsed.status || 'active',
          commit_hash: parsed.commit_hash,
          last_sync: parsed.last_sync || new Date().toISOString(),
        };
      }
    }
  } catch (_e) {}

  return {
    status: 'active',
    last_sync: new Date().toISOString(),
  };
};

const healthHandler = (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    message: 'EduConnect API is running smoothly',
    timestamp: new Date().toISOString(),
    version: '1.2.0',
  });
};

const syncStatusHandler = (_req, res) => {
  res.json({
    success: true,
    server_time: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    auto_sync: getSyncStatusData(),
  });
};

app.get('/', healthHandler);
app.get('/api', healthHandler);
app.get('/api/health', healthHandler);
app.get('/api/v1', healthHandler);
app.get('/api/v1/', healthHandler);
app.get('/api/sync-status', authenticate, authorize('admin', 'manager'), syncStatusHandler);
app.get('/api/v1/system/sync-status', authenticate, authorize('admin', 'manager'), syncStatusHandler);

const getActiveTunnelUrl = () => {
  if (process.env.TUNNEL_URL && process.env.TUNNEL_URL.startsWith('http')) {
    return process.env.TUNNEL_URL.trim().replace(/\/+$/, '');
  }
  return config.frontendUrl || 'http://localhost:3000';
};

const appUpdateHandler = (_req, res) => {
  const syncData = getSyncStatusData();
  res.json({
    success: true,
    version: '1.2.0',
    build: syncData?.commit_hash || '1.2.0',
    last_sync: syncData?.last_sync || new Date().toISOString(),
    live_url: config.frontendUrl || 'http://localhost:3000',
    tunnel_url: getActiveTunnelUrl(),
    ota_mode: 'hybrid_live_switch',
    apk_download_url: '/api/v1/system/download-apk',
  });
};

app.get('/api/v1/system/app-version', appUpdateHandler);
app.get('/api/app-version', appUpdateHandler);

app.get('/api/v1/system/download-apk', (_req, res) => {
  const apkPath = path.join(__dirname, '..', '..', 'EduConnect.apk');
  const fallbackApk = path.join(__dirname, '..', 'EduConnect.apk');
  if (fs.existsSync(apkPath)) {
    res.download(apkPath, 'EduConnect.apk');
  } else if (fs.existsSync(fallbackApk)) {
    res.download(fallbackApk, 'EduConnect.apk');
  } else {
    res.status(404).json({ success: false, message: 'فایل نصبی یافت نشد' });
  }
});

// ── System Database Backups API ──
app.get('/api/v1/system/backups', authenticate, (req, res) => {
  if (!['admin', 'manager', 'school_admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'دسترسی فقط برای مدیران سامانه مجاز است' });
  }
  const backups = listBackups();
  res.json({ success: true, data: { backups } });
});

app.post('/api/v1/system/backup-now', authenticate, async (req, res) => {
  if (!['admin', 'manager', 'school_admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'دسترسی فقط برای مدیران سامانه مجاز است' });
  }
  const result = await createBackup('manual');
  if (result.success) {
    logAudit({
      userId: req.user.id,
      userName: req.user.display_name,
      userRole: req.user.role,
      action: 'CREATE_BACKUP',
      module: 'SYSTEM',
      details: `پشتیبان‌گیری دستی ایجاد شد: ${result.filename}`,
      ip: req.ip,
    });
    return res.json({ success: true, message: 'نسخه پشتیبان با موفقیت ایجاد شد', data: result });
  }
  res.status(500).json({ success: false, message: 'خطا در ایجاد نسخه پشتیبان', error: result.error });
});

app.get('/api/v1/system/download-backup/:filename', authenticate, (req, res) => {
  if (!['admin', 'manager', 'school_admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'دسترسی فقط برای مدیران سامانه مجاز است' });
  }
  const cleanName = path.basename(req.params.filename);
  const filePath = path.join(BACKUP_DIR, cleanName);
  if (fs.existsSync(filePath)) {
    res.download(filePath, cleanName);
  } else {
    res.status(404).json({ success: false, message: 'فایل پشتیبان یافت نشد' });
  }
});

// ── System Audit Logs API (#31/A23) ──
app.get('/api/v1/system/audit-logs', authenticate, async (req, res, next) => {
  try {
    if (!['admin', 'manager', 'school_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'دسترسی فقط برای مدیران سامانه مجاز است' });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const moduleFilter = req.query.module || null;
    const actionFilter = req.query.action || null;

    const data = await getAuditLogs({
      limit,
      offset,
      module: moduleFilter,
      action: actionFilter,
      schoolId: req.user.school_id,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
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
    if (!req.user.school_id) {
      return res.json({ success: true, data: { quizzes: [] } });
    }

    let query = db('quizzes')
      .join('classes', 'classes.id', 'quizzes.class_id')
      .where('classes.school_id', req.user.school_id)
      .select(
        'quizzes.*',
        'classes.name as class_name',
        'classes.subject as class_subject',
        'classes.grade as class_grade'
      );

    let childIds = [];
    if (req.user.role === 'teacher') {
      query = query.where({ 'quizzes.teacher_id': req.user.id });
    } else if (req.user.role === 'admin' || req.user.role === 'manager') {
      // School admins see quizzes within their own school
    } else if (req.user.role === 'parent') {
      childIds = await db('parent_student_links').where({ parent_id: req.user.id }).pluck('student_id');
      if (childIds.length === 0) {
        const parentUser = await db('users').where({ id: req.user.id }).first();
        if (parentUser?.student_code) {
          const matchedChild = await db('users')
            .where({ student_code: parentUser.student_code, role: 'student', school_id: req.user.school_id })
            .first();
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
        } catch (_e) {
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
          } catch (_e) {
            q.attempt.answers_data = {};
          }
        }
      } else if (req.user.role === 'parent') {
        q.attempt = await db('quiz_attempts').where({ quiz_id: q.id }).whereIn('student_id', childIds).first() || null;
        if (q.attempt && typeof q.attempt.answers === 'string') {
          try {
            q.attempt.answers_data = JSON.parse(q.attempt.answers);
          } catch (_e) {
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
    const quiz = await quizService.getById(req.params.id, req.user.id, req.user.role, null, req.user);
    if (!quiz) return res.status(404).json({ success: false, message: 'کوییز یافت نشد' });
    res.json({ success: true, data: { quiz } });
  } catch (err) { next(err); }
});

globalQuizRouter.post('/', authorize('teacher', 'admin', 'manager'), async (req, res, next) => {
  try {
    const quizService = require('./modules/quizzes/quiz.service');
    const classId = req.body.class_id;
    if (!classId) return res.status(400).json({ success: false, message: 'شناسه کلاس الزامی است' });
    const quiz = await quizService.create(req.user.id, classId, req.body, req.user);
    res.status(201).json({ success: true, message: 'کوییز با موفقیت ایجاد شد', data: { quiz } });
  } catch (err) { next(err); }
});

globalQuizRouter.post('/:id/start', authorize('student'), async (req, res, next) => {
  try {
    const quizService = require('./modules/quizzes/quiz.service');
    const attempt = await quizService.startAttempt(req.params.id, req.user.id, null, req.user);
    res.json({ success: true, data: { attempt } });
  } catch (err) { next(err); }
});

globalQuizRouter.post('/:id/share', authorize('teacher', 'admin', 'manager'), async (req, res, next) => {
  try {
    const quizService = require('./modules/quizzes/quiz.service');
    const result = await quizService.shareQuiz(req.params.id, req.user.id, req.body, null, req.user);
    res.json({ success: true, message: 'آزمون با موفقیت با دانش‌آموزان به اشتراک گذاشته شد 📢', data: result });
  } catch (err) { next(err); }
});

globalQuizRouter.post('/:id/submit', authorize('student'), async (req, res, next) => {
  try {
    const quizService = require('./modules/quizzes/quiz.service');
    const result = await quizService.submitAttempt(req.params.id, req.user.id, req.body, null, req.user);
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
app.use('/api/v1/school', schoolRoutes);

// ── Error Handling ──
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start Server ──
const PORT = config.port;
server.listen(PORT, () => {
  if (config.nodeEnv !== 'test') {
    startScheduledMaintenance();
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
  }
});

if (config.nodeEnv !== 'test') {
  setInterval(() => {
    try {
      if (db && typeof db.raw === 'function') {
        db.raw('PRAGMA wal_checkpoint(PASSIVE);').catch(() => {});
      }
    } catch (_e) {}
  }, 5 * 60 * 1000);
}

const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 [EduConnect] Received ${signal}. Flushing database WAL to disk for permanent persistence...`);
  try {
    if (db && typeof db.raw === 'function') {
      await db.raw('PRAGMA wal_checkpoint(TRUNCATE);');
      console.log('✅ [EduConnect] Database WAL flushed to disk successfully. Zero data loss.');
    }
  } catch (err) {
    console.error('⚠️ [EduConnect] Error during shutdown WAL checkpoint:', err.message);
  } finally {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server };

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [EduConnect Process] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('💥 [EduConnect Process] Uncaught Exception:', err.message, err.stack);
});
