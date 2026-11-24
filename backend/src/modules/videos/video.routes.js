const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const {
  authenticate,
  authorize,
  assertSameSchool,
  assertOwnsClass,
  assertOwnsResource,
} = require('../../middleware/auth');
const upload = require('../../middleware/upload');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const os = require('os');
const crypto = require('crypto');
const { cacheMiddleware, cache } = require('../../utils/cache');
const config = require('../../config');
const {
  normalizeVideoAudience,
  canUserAccessVideo,
  resolveSafeUploadPath,
} = require('../../utils/videoAccessHelper');

function getUploadsRootDir() {
  return path.isAbsolute(config.upload.dir)
    ? config.upload.dir
    : path.resolve(__dirname, '..', '..', '..', 'uploads');
}

// All video & conversion endpoints require authentication (#15/F9)
router.use(authenticate);

/**
 * Helper: load linked teacher IDs & enrolled class IDs for a student.
 * Includes BOTH `student_teacher_links` and `class_members` -> `classes.teacher_id`.
 */
async function getStudentTeacherContext(studentId) {
  const enrolledClassIds = new Set(
    await db('class_members').where({ user_id: studentId }).pluck('class_id')
  );
  const linkedTeacherIds = new Set();

  if (enrolledClassIds.size > 0) {
    const classTeachers = await db('classes')
      .whereIn('id', Array.from(enrolledClassIds))
      .pluck('teacher_id');
    classTeachers.forEach((tid) => {
      if (tid) linkedTeacherIds.add(tid);
    });
  }

  try {
    const hasLinks = await db.schema.hasTable('student_teacher_links');
    if (hasLinks) {
      const directTeachers = await db('student_teacher_links')
        .where({ student_user_id: studentId })
        .pluck('teacher_user_id');
      directTeachers.forEach((tid) => {
        if (tid) linkedTeacherIds.add(tid);
      });
    }
  } catch (_e) {}

  return { linkedTeacherIds, enrolledClassIds };
}

const MAX_CONCURRENT_CONVERSIONS = 1;
const CONVERSION_TIMEOUT_MS = 30000;
let activeConversions = 0;

/**
 * POST /api/v1/videos/convert-pptx — converts a PowerPoint presentation into a vector PDF
 */
router.post(
  '/convert-pptx',
  authorize('teacher', 'admin', 'manager'),
  (req, res, next) => {
    if (activeConversions >= MAX_CONCURRENT_CONVERSIONS) {
      return res.status(429).json({
        success: false,
        message: 'سرور در حال پردازش فایل دیگری است. لطفاً چند لحظه بعد مجدداً تلاش کنید.',
      });
    }
    return next();
  },
  upload.single('file'),
  async (req, res, next) => {
  let slotAcquired = false;
  const releaseSlot = () => {
    if (slotAcquired) {
      slotAcquired = false;
      activeConversions = Math.max(0, activeConversions - 1);
    }
  };

  res.on('close', releaseSlot);

  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'فایل پاورپوینت ارسال نشده است' });
    }

    const outputPdfFilename = `${path.parse(file.originalname || file.filename).name}.pdf`;

    const cacheDir = path.join(os.tmpdir(), 'educonnect_pptx_cache');
    if (!fs.existsSync(cacheDir)) {
      try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_e) {}
    }

    let fileHash = '';
    try {
      const fileBuffer = fs.readFileSync(file.path);
      fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      const cachedPdfPath = path.join(cacheDir, `${fileHash}.pdf`);

      if (fs.existsSync(cachedPdfPath) && fs.statSync(cachedPdfPath).size > 1000) {
        try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (_e) {}
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(outputPdfFilename)}"`);
        res.setHeader('X-Cache', 'HIT');
        return fs.createReadStream(cachedPdfPath).pipe(res);
      }
    } catch (hashErr) {
      console.warn('Cache check error:', hashErr);
    }

    if (activeConversions >= MAX_CONCURRENT_CONVERSIONS) {
      try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (_e) {}
      return res.status(429).json({
        success: false,
        message: 'سرور در حال پردازش فایل دیگری است. لطفاً چند لحظه بعد مجدداً تلاش کنید.',
      });
    }

    activeConversions += 1;
    slotAcquired = true;

    const fileId = uuidv4();
    const tempInput = path.join(os.tmpdir(), `${fileId}.pptx`);
    const tempOutput = path.join(os.tmpdir(), `${fileId}.pdf`);
    const scriptPath = path.join(os.tmpdir(), `convert_${fileId}.vbs`);

    fs.copyFileSync(file.path, tempInput);

    const vbsContent = [
      'On Error Resume Next',
      'Set ppt = CreateObject("PowerPoint.Application")',
      'Set pres = ppt.Presentations.Open("' + tempInput.replace(/\\/g, '\\\\') + '", -1, 0, 0)',
      'pres.SaveAs "' + tempOutput.replace(/\\/g, '\\\\') + '", 32',
      'pres.Close',
      'ppt.Quit',
      'Set pres = Nothing',
      'Set ppt = Nothing',
      'WScript.Echo "OK"',
    ].join('\r\n');

    fs.writeFileSync(scriptPath, vbsContent, 'ascii');

    execFile('cscript', ['//nologo', scriptPath], { timeout: CONVERSION_TIMEOUT_MS }, (err) => {
      try { if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath); } catch (_e) {}
      try { if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput); } catch (_e) {}
      try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (_e) {}

      if (fs.existsSync(tempOutput) && fs.statSync(tempOutput).size > 1000) {
        releaseSlot();
        if (fileHash) {
          try {
            const cachedPdfPath = path.join(cacheDir, `${fileHash}.pdf`);
            fs.copyFileSync(tempOutput, cachedPdfPath);
          } catch (_cErr) {}
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(outputPdfFilename)}"`);
        res.setHeader('X-Cache', 'MISS');
        const stream = fs.createReadStream(tempOutput);
        stream.pipe(res);
        stream.on('finish', () => {
          try {
            if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
          } catch (_e) {}
        });
      } else {
        const psPath = path.join(os.tmpdir(), `convert_${fileId}.ps1`);
        const psContent = `
$ErrorActionPreference = "Stop"
$ppt = New-Object -ComObject PowerPoint.Application
try { $ppt.DisplayAlerts = 1 } catch {}
try {
    $pres = $ppt.Presentations.Open("${tempInput.replace(/\\/g, '\\\\')}", [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
    $pres.SaveAs("${tempOutput.replace(/\\/g, '\\\\')}", 32)
    $pres.Close()
} finally {
    $ppt.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
}
`;
        fs.writeFileSync(psPath, psContent, 'utf8');
        execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psPath], { timeout: CONVERSION_TIMEOUT_MS }, (psErr) => {
          releaseSlot();
          try { if (fs.existsSync(psPath)) fs.unlinkSync(psPath); } catch (_e) {}
          if (fs.existsSync(tempOutput) && fs.statSync(tempOutput).size > 1000) {
            if (fileHash) {
              try { fs.copyFileSync(tempOutput, path.join(cacheDir, `${fileHash}.pdf`)); } catch (_e) {}
            }
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(outputPdfFilename)}"`);
            const stream = fs.createReadStream(tempOutput);
            stream.pipe(res);
            stream.on('finish', () => {
              try { if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput); } catch (_e) {}
            });
          } else {
            return res.status(500).json({
              success: false,
              message: 'خطا در تبدیل اسلایدهای پاورپوینت به پی‌دی‌اف',
              error: psErr?.message || err?.message,
            });
          }
        });
      }
    });
  } catch (err) {
    releaseSlot();
    next(err);
  }
});

function streamMediaFile(req, res, filePath) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'فایل چندرسانه‌ای یافت نشد' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();

  const mimeMap = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
  };
  const mimeType = mimeMap[ext] || 'video/mp4';

  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const maxChunk = 3 * 1024 * 1024;
    const rawEnd = parts[1] ? parseInt(parts[1], 10) : Math.min(start + maxChunk - 1, fileSize - 1);

    if (
      Number.isNaN(start) ||
      start < 0 ||
      start >= fileSize ||
      Number.isNaN(rawEnd) ||
      rawEnd < start
    ) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }

    const end = Math.min(rawEnd, fileSize - 1);
    const chunksize = end - start + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': mimeType,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

/**
 * GET /api/v1/videos/stream/:filename — High-speed video streaming by filename (authenticated & tenant-scoped)
 */
router.get('/stream/:filename', async (req, res, next) => {
  try {
    const cleanName = path.basename(req.params.filename);
    const fileUrl = `/uploads/${cleanName}`;
    const videoRecord = await db('videos')
      .leftJoin('users', 'users.id', 'videos.teacher_id')
      .where('videos.file_url', fileUrl)
      .orWhere('videos.video_url', fileUrl)
      .select('videos.*', 'users.school_id as teacher_school_id')
      .first();

    if (videoRecord && videoRecord.teacher_school_id) {
      assertSameSchool(req.user, { school_id: videoRecord.teacher_school_id });
    }
    if (videoRecord) {
      const ctx = req.user.role === 'student' ? await getStudentTeacherContext(req.user.id) : {};
      if (!canUserAccessVideo(req.user, videoRecord, ctx)) {
        return res.status(403).json({ success: false, message: 'شما مجاز به مشاهده این ویدیو نیستید' });
      }
    }

    const uploadsDir = getUploadsRootDir();
    const filePath = resolveSafeUploadPath(uploadsDir, cleanName);
    if (!filePath) {
      return res.status(400).json({ success: false, message: 'نام فایل نامعتبر است' });
    }
    streamMediaFile(req, res, filePath);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/videos/:id/stream — High-speed video streaming by video ID (authenticated & tenant-scoped)
 */
router.get('/:id/stream', async (req, res, next) => {
  try {
    const video = await db('videos').where({ id: req.params.id }).first();
    if (!video || !video.file_url) {
      return res.status(404).json({ success: false, message: 'ویدیو یافت نشد' });
    }

    const teacher = await db('users').where({ id: video.teacher_id }).first();
    if (teacher) {
      assertSameSchool(req.user, teacher);
    }

    const ctx = req.user.role === 'student' ? await getStudentTeacherContext(req.user.id) : {};
    if (!canUserAccessVideo(req.user, video, ctx)) {
      return res.status(403).json({ success: false, message: 'شما مجاز به مشاهده این ویدیو نیستید' });
    }

    const filename = path.basename(video.file_url);
    const uploadsDir = getUploadsRootDir();
    const filePath = resolveSafeUploadPath(uploadsDir, filename);
    if (!filePath) {
      return res.status(400).json({ success: false, message: 'مسیر فایل نامعتبر است' });
    }

    db('videos').where({ id: req.params.id }).increment('views_count', 1).catch(() => {});

    streamMediaFile(req, res, filePath);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/videos/folders — list folders in requester's school
 */
router.get('/folders', async (req, res, next) => {
  try {
    const ctx = req.user.role === 'student' ? await getStudentTeacherContext(req.user.id) : {};

    let customFolders = [];
    try {
      let folderQuery = db('video_folders')
        .leftJoin('users', 'users.id', 'video_folders.teacher_id')
        .where('users.school_id', req.user.school_id)
        .select('video_folders.*')
        .orderBy('video_folders.name', 'asc');

      if (req.user.role === 'teacher') {
        folderQuery = folderQuery.where('video_folders.teacher_id', req.user.id);
      } else if (req.user.role === 'student') {
        const linkedIds = Array.from(ctx.linkedTeacherIds || []);
        if (linkedIds.length > 0) {
          folderQuery = folderQuery.whereIn('video_folders.teacher_id', linkedIds);
        } else {
          folderQuery = folderQuery.whereRaw('1 = 0');
        }
      }
      customFolders = await folderQuery;
    } catch (_e) {}

    // Count only videos that this user is actually allowed to view
    let allSchoolVideos = [];
    try {
      allSchoolVideos = await db('videos')
        .join('users', 'users.id', 'videos.teacher_id')
        .where('users.school_id', req.user.school_id)
        .select('videos.id', 'videos.teacher_id', 'videos.class_id', 'videos.folder_name', 'videos.target_audience', 'videos.is_published');
    } catch (_e) {}

    const countMap = {};
    allSchoolVideos.forEach((v) => {
      if (!canUserAccessVideo(req.user, v, ctx)) return;
      const name = v.folder_name || 'عمومی';
      countMap[name] = (countMap[name] || 0) + 1;
    });

    const folderNamesSet = new Set(['عمومی', 'تخته هوشمند', ...customFolders.map((f) => f.name), ...Object.keys(countMap)]);
    const folders = Array.from(folderNamesSet).map((name) => {
      const found = customFolders.find((f) => f.name === name);
      return {
        id: found?.id || name,
        name,
        color: found?.color || (name === 'تخته هوشمند' ? '#8b5cf6' : '#6366f1'),
        count: countMap[name] || 0,
      };
    });

    res.json({ success: true, data: { folders } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/videos/folders — create a new folder
 */
router.post('/folders', authorize('teacher', 'admin', 'manager'), async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'نام پوشه الزامی است' });
    }
    const folderName = name.trim();
    const currentUserId = req.user.id;

    const existing = await db('video_folders')
      .where({ name: folderName, teacher_id: currentUserId })
      .first();

    if (existing) {
      return res.json({ success: true, data: { folder: existing }, message: 'این پوشه از قبل وجود دارد' });
    }

    const id = uuidv4();
    const newFolder = {
      id,
      name: folderName,
      teacher_id: currentUserId,
      color: color || '#6366f1',
    };

    await db('video_folders').insert(newFolder);
    cache.delBySchool(req.user?.school_id, '*video_folders*');
    res.status(201).json({ success: true, data: { folder: newFolder }, message: 'پوشه جدید ایجاد شد' });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/videos/folders/:name — delete a folder
 */
router.delete('/folders/:name', authorize('teacher', 'admin', 'manager'), async (req, res, next) => {
  try {
    const folderName = decodeURIComponent(req.params.name);
    if (folderName === 'عمومی') {
      return res.status(400).json({ success: false, message: 'پوشه پیش‌فرض عمومی قابل حذف نیست' });
    }
    await db('video_folders').where({ name: folderName, teacher_id: req.user.id }).del();
    await db('videos').where({ folder_name: folderName, teacher_id: req.user.id }).update({ folder_name: 'عمومی' });
    cache.delBySchool(req.user?.school_id, '*video_folders*');
    res.json({ success: true, message: 'پوشه حذف شد و رسانه‌ها به پوشه عمومی منتقل شدند' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/videos — list all videos scoped to requester's school
 */
router.get('/', async (req, res, next) => {
  try {
    const ctx = req.user.role === 'student' ? await getStudentTeacherContext(req.user.id) : {};

    let query = db('videos')
      .join('users', 'users.id', 'videos.teacher_id')
      .leftJoin('classes', 'classes.id', 'videos.class_id')
      .where('users.school_id', req.user.school_id)
      .select(
        'videos.*',
        'users.display_name as teacher_name',
        'users.username as teacher_username',
        'classes.name as class_name',
        'classes.subject as class_subject'
      )
      .orderBy('videos.created_at', 'desc');

    if (req.query.folder && req.query.folder !== 'all') {
      query = query.where('videos.folder_name', req.query.folder);
    }

    if (req.query.audience && req.query.audience !== 'all') {
      query = query.where('videos.target_audience', req.query.audience);
    }

    const rows = await query;
    const visibleVideos = rows.filter((v) => canUserAccessVideo(req.user, v, ctx));
    const enrichedVideos = visibleVideos.map((v) => ({
      ...v,
      stream_url: v.file_url ? `/api/v1/videos/stream/${path.basename(v.file_url)}` : null,
    }));
    res.json({ success: true, data: { videos: enrichedVideos } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/videos/:id — single video detail + increment views
 */
router.get('/:id', async (req, res, next) => {
  try {
    const video = await db('videos')
      .join('users', 'users.id', 'videos.teacher_id')
      .leftJoin('classes', 'classes.id', 'videos.class_id')
      .select(
        'videos.*',
        'users.display_name as teacher_name',
        'users.username as teacher_username',
        'users.school_id as teacher_school_id',
        'classes.name as class_name'
      )
      .where('videos.id', req.params.id)
      .first();

    if (!video) {
      return res.status(404).json({ success: false, message: 'ویدیو یافت نشد' });
    }

    assertSameSchool(req.user, { school_id: video.teacher_school_id });
    const ctx = req.user.role === 'student' ? await getStudentTeacherContext(req.user.id) : {};
    if (!canUserAccessVideo(req.user, video, ctx)) {
      return res.status(403).json({ success: false, message: 'شما مجاز به مشاهده این ویدیو نیستید' });
    }

    await db('videos').where('id', req.params.id).increment('views_count', 1);
    video.views_count += 1;
    video.stream_url = video.file_url ? `/api/v1/videos/stream/${path.basename(video.file_url)}` : null;

    res.json({ success: true, data: { video } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/videos — upload a new video
 */
router.post(
  '/',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
    { name: 'pdf', maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const userRole = (req.user?.role || '').toLowerCase();
      if (!['teacher', 'student', 'admin', 'manager'].includes(userRole)) {
        return res.status(403).json({ success: false, message: 'فقط کاربران مدرسه مجاز به بارگذاری هستند' });
      }

      if (req.body.class_id) {
        await assertOwnsClass(req.user, req.body.class_id, { allowEnrolled: true });
      }

      const mainFile = req.files?.file?.[0];
      if (!mainFile) {
        return res.status(400).json({ success: false, message: 'فایلی برای بارگذاری ارسال نشده' });
      }

      const thumbnailFile = req.files?.thumbnail?.[0];
      const pdfFile = req.files?.pdf?.[0];

      let pdfUrl = null;
      let pdfName = null;
      if (pdfFile) {
        pdfUrl = `/uploads/${pdfFile.filename}`;
        pdfName = req.body.pdf_name || pdfFile.originalname;
      } else if (req.body.pdf_url) {
        pdfUrl = req.body.pdf_url;
        pdfName = req.body.pdf_name || 'جزوه_ضمیمه.pdf';
      }

      const id = uuidv4();
      const folderName = (req.body.folder_name || req.body.folder || 'عمومی').trim();
      const currentUserId = req.user.id;

      if (folderName && folderName !== 'عمومی') {
        try {
          const exists = await db('video_folders')
            .where({ name: folderName, teacher_id: currentUserId })
            .first();
          if (!exists) {
            await db('video_folders').insert({
              id: uuidv4(),
              name: folderName,
              teacher_id: currentUserId,
              color: '#6366f1',
            });
          }
        } catch (_fErr) {}
      }

      const videoData = {
        id,
        title: req.body.title || mainFile.originalname,
        description: req.body.description || '',
        class_id: req.body.class_id || null,
        teacher_id: currentUserId,
        folder_name: folderName,
        category: req.body.category || 'تدریس',
        target_audience: normalizeVideoAudience(req.body.target_audience || 'all'),
        file_url: `/uploads/${mainFile.filename}`,
        video_url: `/uploads/${mainFile.filename}`,
        thumbnail_url: thumbnailFile ? `/uploads/${thumbnailFile.filename}` : null,
        pdf_url: pdfUrl,
        pdf_name: pdfName,
        mimetype: mainFile.mimetype,
        file_size: mainFile.size,
        duration_seconds: parseInt(req.body.duration_seconds, 10) || 0,
        is_published: req.body.is_published !== 'false',
      };

      await db('videos').insert(videoData);
      cache.delBySchool(req.user?.school_id, '*video_folders*');

      res.status(201).json({
        success: true,
        message: 'ویدیو با موفقیت در پوشه مورد نظر بارگذاری شد',
        data: { video: videoData },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/v1/videos/:id/audience — update target audience
 */
router.put('/:id/audience', async (req, res, next) => {
  try {
    const { target_audience } = req.body;
    const video = await db('videos').where('id', req.params.id).first();
    if (!video) {
      return res.status(404).json({ success: false, message: 'ویدیو یافت نشد' });
    }
    const owner = await db('users').where('id', video.teacher_id).first();
    if (owner) assertSameSchool(req.user, owner);
    assertOwnsResource(req.user, video, 'teacher_id');

    await db('videos').where('id', req.params.id).update({ target_audience: target_audience || 'all' });
    res.json({ success: true, message: 'مخاطبان هدف ویدیو به‌روزرسانی شد' });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/videos/:id — delete a video (owner teacher or same-school admin)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const video = await db('videos').where('id', req.params.id).first();
    if (!video) {
      return res.status(404).json({ success: false, message: 'ویدیو یافت نشد یا دسترسی ندارید' });
    }
    const owner = await db('users').where('id', video.teacher_id).first();
    if (owner) assertSameSchool(req.user, owner);
    assertOwnsResource(req.user, video, 'teacher_id');

    if (video.file_url && video.file_url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '../../..', video.file_url);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (_e) {}
    }
    if (video.pdf_url && video.pdf_url.startsWith('/uploads/')) {
      const pdfPath = path.join(__dirname, '../../..', video.pdf_url);
      try {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      } catch (_e) {}
    }
    await db('videos').where('id', req.params.id).del();
    res.json({ success: true, message: 'ویدیو با موفقیت حذف شد' });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/videos/:id/folder — move video to another folder
 */
router.patch('/:id/folder', async (req, res, next) => {
  try {
    const { folder_name } = req.body;
    if (!folder_name || !folder_name.trim()) {
      return res.status(400).json({ success: false, message: 'نام پوشه مقصد الزامی است' });
    }
    const cleanFolder = folder_name.trim();
    const currentUserId = req.user.id;

    const video = await db('videos').where('id', req.params.id).first();
    if (!video) {
      return res.status(404).json({ success: false, message: 'ویدیو یافت نشد' });
    }

    const owner = await db('users').where('id', video.teacher_id).first();
    if (owner) assertSameSchool(req.user, owner);
    assertOwnsResource(req.user, video, 'teacher_id');

    if (cleanFolder !== 'عمومی') {
      try {
        const folderExists = await db('video_folders')
          .where({ name: cleanFolder, teacher_id: video.teacher_id || currentUserId })
          .first();
        if (!folderExists) {
          await db('video_folders').insert({
            id: uuidv4(),
            name: cleanFolder,
            teacher_id: video.teacher_id || currentUserId,
            color: '#6366f1',
          });
        }
      } catch (_fErr) {}
    }

    await db('videos').where('id', req.params.id).update({
      folder_name: cleanFolder,
      updated_at: new Date().toISOString(),
    });

    const updatedVideo = await db('videos').where('id', req.params.id).first();

    res.json({
      success: true,
      message: `ویدیو با موفقیت به پوشه «${cleanFolder}» منتقل شد`,
      data: { video: updatedVideo },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/videos/:id/pdf — attach or update PDF document on an existing video
 */
router.post('/:id/pdf', upload.single('pdf'), async (req, res, next) => {
  try {
    const video = await db('videos').where('id', req.params.id).first();
    if (!video) {
      return res.status(404).json({ success: false, message: 'ویدیو یافت نشد یا دسترسی ندارید' });
    }

    const owner = await db('users').where('id', video.teacher_id).first();
    if (owner) assertSameSchool(req.user, owner);
    assertOwnsResource(req.user, video, 'teacher_id');

    let pdfUrl = null;
    let pdfName = null;

    if (req.file) {
      pdfUrl = `/uploads/${req.file.filename}`;
      pdfName = req.body.pdf_name || req.file.originalname;
    } else if (req.body.pdf_url) {
      pdfUrl = req.body.pdf_url;
      pdfName = req.body.pdf_name || 'جزوه_ضمیمه.pdf';
    } else {
      return res.status(400).json({ success: false, message: 'فایل PDF ارسال نشده است' });
    }

    if (video.pdf_url && video.pdf_url.startsWith('/uploads/') && video.pdf_url !== pdfUrl) {
      const oldPath = path.join(__dirname, '../../..', video.pdf_url);
      try {
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch (_e) {}
    }

    await db('videos').where('id', req.params.id).update({
      pdf_url: pdfUrl,
      pdf_name: pdfName,
      updated_at: new Date().toISOString(),
    });

    const updatedVideo = await db('videos').where('id', req.params.id).first();

    res.json({
      success: true,
      message: 'فایل PDF جزوه با موفقیت پیوست شد 📄',
      data: { video: updatedVideo, pdf_url: pdfUrl, pdf_name: pdfName },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/videos/:id/pdf — remove PDF attachment from a video
 */
router.delete('/:id/pdf', async (req, res, next) => {
  try {
    const video = await db('videos').where('id', req.params.id).first();
    if (!video) {
      return res.status(404).json({ success: false, message: 'ویدیو یافت نشد یا دسترسی ندارید' });
    }

    const owner = await db('users').where('id', video.teacher_id).first();
    if (owner) assertSameSchool(req.user, owner);
    assertOwnsResource(req.user, video, 'teacher_id');

    if (video.pdf_url && video.pdf_url.startsWith('/uploads/')) {
      const oldPath = path.join(__dirname, '../../..', video.pdf_url);
      try {
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch (_e) {}
    }

    await db('videos').where('id', req.params.id).update({
      pdf_url: null,
      pdf_name: null,
      updated_at: new Date().toISOString(),
    });

    res.json({ success: true, message: 'فایل پیوست PDF با موفقیت حذف شد' });
  } catch (err) {
    next(err);
  }
});

router._setConversionBusyForTest = (busy) => {
  activeConversions = busy ? MAX_CONCURRENT_CONVERSIONS : 0;
};

module.exports = router;
