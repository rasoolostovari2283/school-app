const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const db = require('../../config/database');
const { authenticate, authorize } = require('../../middleware/auth');
const {
  normalizeVideoAudience,
  parseJsonArray,
  normalizeGrade,
  canUserAccessFolder,
  canUserAccessVideo,
  resolveSafeUploadPath,
  ADMIN_ROLES,
} = require('../../utils/videoAccessHelper');

const router = express.Router();
router.use(authenticate);

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
  multer({ dest: os.tmpdir() }).single('file'),
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
              res.setHeader('X-Cache', 'MISS');
              const stream = fs.createReadStream(tempOutput);
              stream.pipe(res);
              stream.on('finish', () => {
                try {
                  if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
                } catch (_e) {}
              });
            } else {
              try { if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput); } catch (_e) {}
              res.status(500).json({ success: false, message: 'تبدیل فایل انجام نشد.' });
            }
          });
        }
      });
    } catch (err) {
      releaseSlot();
      next(err);
    }
  }
);

const DEFAULT_FOLDER_NAME = 'عمومی';
const UPLOADS_DIR = path.resolve(__dirname, '../../../uploads');
const MAX_CHUNK_SIZE = 3 * 1024 * 1024; // 3MB per Range chunk

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const genId = () => (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));

// Multer storage for video, thumbnail, and multiple PDFs
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    const prefix = file.fieldname === 'pdf' || file.fieldname === 'pdfs' ? 'pdf' : file.fieldname === 'thumbnail' ? 'thumb' : 'vid';
    cb(null, `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB max video size
    files: 15,
  },
});

const uploadVideoFields = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
  { name: 'pdf', maxCount: 1 },
  { name: 'pdfs', maxCount: 10 },
]);

const uploadPdfFields = upload.fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'pdfs', maxCount: 10 },
]);

function isAdminUser(user) {
  return Boolean(user && ADMIN_ROLES.has(String(user.role || '').toLowerCase()));
}

function isTeacherOrAdmin(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'teacher' || isAdminUser(user);
}

function parseInputList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      return parseJsonArray(trimmed).map((v) => String(v).trim()).filter(Boolean);
    }
    return trimmed.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function safeUnlinkUpload(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.startsWith('/uploads/')) return;
  const filename = fileUrl.replace(/^\/uploads\//, '');
  const fullPath = resolveSafeUploadPath(UPLOADS_DIR, filename);
  if (fullPath && fs.existsSync(fullPath)) {
    fs.unlink(fullPath, () => {});
  }
}

/**
 * Fetches student's enrolled DB classes, linked teachers, and grade(s).
 */
async function getStudentAccessContext(user) {
  const enrolledClassIds = new Set();
  const linkedTeacherIds = new Set();
  const studentGrades = new Set();

  if (!user || !user.id) {
    return { enrolledClassIds, linkedTeacherIds, studentGrades };
  }

  const role = String(user.role || '').toLowerCase();
  if (role !== 'student' && role !== 'parent') {
    return { enrolledClassIds, linkedTeacherIds, studentGrades };
  }

  // 1. Enrolled classes from class_members
  const memberships = await db('class_members')
    .leftJoin('classes', 'class_members.class_id', 'classes.id')
    .where('class_members.user_id', user.id)
    .select('class_members.class_id', 'classes.teacher_id', 'classes.grade');

  for (const row of memberships) {
    if (row.class_id) enrolledClassIds.add(String(row.class_id));
    if (row.teacher_id) linkedTeacherIds.add(String(row.teacher_id));
    if (row.grade) studentGrades.add(normalizeGrade(row.grade));
  }

  // 2. Direct student_teacher_links (if table exists)
  const hasLinks = await db.schema.hasTable('student_teacher_links');
  if (hasLinks) {
    const colInfo = await db('student_teacher_links').columnInfo();
    const studentCol = colInfo.student_user_id ? 'student_user_id' : 'student_id';
    const teacherCol = colInfo.teacher_user_id ? 'teacher_user_id' : 'teacher_id';
    const links = await db('student_teacher_links')
      .where(studentCol, user.id)
      .select(teacherCol);
    for (const l of links) {
      const tid = l[teacherCol];
      if (tid) linkedTeacherIds.add(String(tid));
    }
  }

  // 3. Student's grade from students table (if table exists)
  const hasStudents = await db.schema.hasTable('students');
  if (hasStudents) {
    const studentRow = await db('students').where({ user_id: user.id }).first('grade');
    if (studentRow && studentRow.grade) {
      studentGrades.add(normalizeGrade(studentRow.grade));
    }
  }

  return { enrolledClassIds, linkedTeacherIds, studentGrades };
}

/**
 * Validates that requested class IDs exist in the DB (and belong to the teacher/school).
 */
async function validateAndResolveDbClasses(user, requestedClassIds) {
  const uniqueIds = Array.from(new Set(parseInputList(requestedClassIds)));
  if (uniqueIds.length === 0) return [];

  let query = db('classes').whereIn('id', uniqueIds);
  if (user.school_id) {
    query = query.andWhere('school_id', user.school_id);
  }
  if (!isAdminUser(user) && String(user.role || '').toLowerCase() === 'teacher') {
    query = query.andWhere('teacher_id', user.id);
  }

  const rows = await query.select('id', 'name', 'grade', 'subject', 'teacher_id', 'school_id');
  return rows;
}

/**
 * Optional background transcoding into 720p / 480p / 360p MP4 variants if ffmpeg is installed.
 * Never blocks the upload response.
 */
function triggerBackgroundQualityTranscode(videoId, sourceFilePath) {
  if (!sourceFilePath || !fs.existsSync(sourceFilePath)) return;
  const ext = path.extname(sourceFilePath).toLowerCase();
  const videoExts = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);
  if (!videoExts.has(ext)) return;

  execFile('ffmpeg', ['-version'], { timeout: 3000 }, (checkErr) => {
    if (checkErr) return; // ffmpeg not available on host — gracefully stick to original stream

    const presets = [
      { label: '720p', height: 720, crf: '24' },
      { label: '480p', height: 480, crf: '26' },
      { label: '360p', height: 360, crf: '28' },
    ];

    const baseName = path.basename(sourceFilePath, ext);
    const variants = [];

    const runNext = async (idx) => {
      if (idx >= presets.length) {
        if (variants.length > 0) {
          try {
            await db('videos')
              .where({ id: videoId })
              .update({ quality_variants: JSON.stringify(variants) });
          } catch {
            // ignore DB update errors in background worker
          }
        }
        return;
      }

      const preset = presets[idx];
      const outFilename = `${baseName}_${preset.label}.mp4`;
      const outPath = path.join(UPLOADS_DIR, outFilename);

      execFile(
        'ffmpeg',
        [
          '-y',
          '-i',
          sourceFilePath,
          '-vf',
          `scale=-2:'min(${preset.height},ih)'`,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          preset.crf,
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          outPath,
        ],
        { timeout: 10 * 60 * 1000 },
        (err) => {
          if (!err && fs.existsSync(outPath)) {
            const stat = fs.statSync(outPath);
            variants.push({
              label: preset.label,
              height: preset.height,
              url: `/uploads/${outFilename}`,
              file_size: stat.size,
            });
          }
          runNext(idx + 1);
        }
      );
    };

    runNext(0);
  });
}

function streamMediaFile(req, res, filePath, mimetype = 'video/mp4') {
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'فایل ویدیو یافت نشد.' });
  }
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const requestedEnd = parts[1] ? parseInt(parts[1], 10) : Math.min(start + MAX_CHUNK_SIZE - 1, fileSize - 1);
    const end = Math.min(requestedEnd, start + MAX_CHUNK_SIZE - 1, fileSize - 1);

    if (Number.isNaN(start) || start >= fileSize || end < start) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': mimetype || 'video/mp4',
      'Cache-Control': 'private, max-age=3600',
    });
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  }

  res.writeHead(200, {
    'Content-Length': fileSize,
    'Content-Type': mimetype || 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  });
  return fs.createReadStream(filePath).pipe(res);
}

/**
 * Helper: Loads relational metadata (classes, folders, PDFs) for a list of videos.
 */
async function hydrateVideos(videos) {
  if (!videos || videos.length === 0) return [];
  const videoIds = videos.map((v) => v.id);

  const [vcRows, vfiRows, pdfRows] = await Promise.all([
    db('video_classes')
      .join('classes', 'video_classes.class_id', 'classes.id')
      .whereIn('video_classes.video_id', videoIds)
      .select(
        'video_classes.video_id',
        'classes.id as class_id',
        'classes.name as class_name',
        'classes.grade as class_grade',
        'classes.subject as class_subject'
      ),
    db('video_folder_items')
      .leftJoin('video_folders', 'video_folder_items.folder_id', 'video_folders.id')
      .whereIn('video_folder_items.video_id', videoIds)
      .select(
        'video_folder_items.video_id',
        'video_folder_items.folder_id',
        'video_folder_items.folder_name',
        'video_folders.color as folder_color'
      ),
    db('video_pdfs')
      .whereIn('video_id', videoIds)
      .orderBy('created_at', 'asc')
      .select('id', 'video_id', 'file_url', 'file_name', 'file_size', 'created_at'),
  ]);

  const classesByVideo = new Map();
  for (const r of vcRows) {
    if (!classesByVideo.has(r.video_id)) classesByVideo.set(r.video_id, []);
    classesByVideo.get(r.video_id).push({
      id: r.class_id,
      name: r.class_name,
      grade: r.class_grade || '',
      subject: r.class_subject || '',
    });
  }

  const foldersByVideo = new Map();
  for (const r of vfiRows) {
    if (!foldersByVideo.has(r.video_id)) foldersByVideo.set(r.video_id, []);
    foldersByVideo.get(r.video_id).push({
      id: r.folder_id || null,
      name: r.folder_name,
      color: r.folder_color || '#6366f1',
    });
  }

  const pdfsByVideo = new Map();
  for (const r of pdfRows) {
    if (!pdfsByVideo.has(r.video_id)) pdfsByVideo.set(r.video_id, []);
    pdfsByVideo.get(r.video_id).push({
      id: r.id,
      file_url: r.file_url,
      file_name: r.file_name,
      file_size: r.file_size || 0,
      created_at: r.created_at,
      download_url: `/api/v1/videos/${r.video_id}/pdf/${r.id}/download`,
      view_url: `/api/v1/videos/${r.video_id}/pdf/${r.id}/view`,
    });
  }

  return videos.map((v) => {
    const targetClasses = classesByVideo.get(v.id) || [];
    const targetClassIds = targetClasses.map((c) => c.id);
    const folders = foldersByVideo.get(v.id) || [
      { id: null, name: v.folder_name || DEFAULT_FOLDER_NAME, color: '#6366f1' },
    ];
    const pdfs = pdfsByVideo.get(v.id) || [];
    if (pdfs.length === 0 && v.pdf_url) {
      pdfs.push({
        id: 'legacy',
        file_url: v.pdf_url,
        file_name: v.pdf_name || 'فایل پیوست.pdf',
        file_size: 0,
        download_url: `/api/v1/videos/${v.id}/pdf/legacy/download`,
        view_url: `/api/v1/videos/${v.id}/pdf/legacy/view`,
      });
    }

    const parsedVariants = parseJsonArray(v.quality_variants);
    const qualities = [
      {
        label: 'اصلی (خودکار)',
        key: 'original',
        stream_url: `/api/v1/videos/${v.id}/stream`,
      },
      ...parsedVariants.map((q) => ({
        label: q.label,
        key: q.label,
        height: q.height,
        file_size: q.file_size || 0,
        stream_url: `/api/v1/videos/${v.id}/stream?quality=${encodeURIComponent(q.label)}`,
      })),
    ];

    return {
      ...v,
      folder_name: v.folder_name || DEFAULT_FOLDER_NAME,
      folders,
      folder_names: folders.map((f) => f.name),
      target_class_ids: targetClassIds,
      target_classes: targetClasses,
      pdfs,
      pdf_url: pdfs[0]?.file_url || v.pdf_url || null,
      pdf_name: pdfs[0]?.file_name || v.pdf_name || null,
      qualities,
      stream_url: `/api/v1/videos/${v.id}/stream`,
      download_url: `/api/v1/videos/${v.id}/download`,
    };
  });
}

// ============================================================================
// 1. DB CLASSES & GRADES OPTIONS FOR TEACHER PUBLISHING
// ============================================================================
router.get('/classes-options', async (req, res, next) => {
  try {
    let query = db('classes').where('is_active', true);
    if (req.user.school_id) {
      query = query.andWhere('school_id', req.user.school_id);
    }
    if (!isAdminUser(req.user) && String(req.user.role || '').toLowerCase() === 'teacher') {
      query = query.andWhere('teacher_id', req.user.id);
    } else if (String(req.user.role || '').toLowerCase() === 'student') {
      const ctx = await getStudentAccessContext(req.user);
      const ids = Array.from(ctx.enrolledClassIds);
      if (ids.length === 0) {
        return res.json({ success: true, data: { classes: [], grades: [] } });
      }
      query = query.whereIn('id', ids);
    }

    const classes = await query
      .orderBy([{ column: 'grade', order: 'asc' }, { column: 'name', order: 'asc' }])
      .select('id', 'name', 'grade', 'subject', 'teacher_id');

    const classIds = classes.map((c) => c.id);
    const counts = classIds.length
      ? await db('class_members')
          .whereIn('class_id', classIds)
          .andWhere('role', 'student')
          .groupBy('class_id')
          .select('class_id')
          .count('* as students_count')
      : [];

    const countMap = new Map(counts.map((r) => [r.class_id, Number(r.students_count || 0)]));
    const enrichedClasses = classes.map((c) => ({
      ...c,
      grade: normalizeGrade(c.grade),
      students_count: countMap.get(c.id) || 0,
    }));

    const grades = Array.from(new Set(enrichedClasses.map((c) => c.grade).filter(Boolean)));

    res.json({
      success: true,
      data: {
        classes: enrichedClasses,
        grades,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 2. FOLDER MANAGEMENT (CREATE, LIST, UPDATE GRADE/CLASSES, DELETE)
// ============================================================================
router.get('/folders', async (req, res, next) => {
  try {
    const studentCtx = await getStudentAccessContext(req.user);
    const role = String(req.user.role || '').toLowerCase();

    let foldersQuery = db('video_folders')
      .leftJoin('users', 'video_folders.teacher_id', 'users.id')
      .select('video_folders.*', 'users.school_id as owner_school_id', 'users.display_name as teacher_name');

    if (req.user.school_id) {
      foldersQuery = foldersQuery.where('users.school_id', req.user.school_id);
    }
    if (role === 'teacher') {
      foldersQuery = foldersQuery.andWhere('video_folders.teacher_id', req.user.id);
    }

    const rawFolders = await foldersQuery.orderBy('video_folders.created_at', 'asc');
    const folderIds = rawFolders.map((f) => f.id);

    const folderClassRows = folderIds.length
      ? await db('video_folder_classes')
          .join('classes', 'video_folder_classes.class_id', 'classes.id')
          .whereIn('video_folder_classes.folder_id', folderIds)
          .select(
            'video_folder_classes.folder_id',
            'classes.id as class_id',
            'classes.name as class_name',
            'classes.grade as class_grade',
            'classes.subject as class_subject'
          )
      : [];

    const classesByFolder = new Map();
    for (const r of folderClassRows) {
      if (!classesByFolder.has(r.folder_id)) classesByFolder.set(r.folder_id, []);
      classesByFolder.get(r.folder_id).push({
        id: r.class_id,
        name: r.class_name,
        grade: r.class_grade || '',
        subject: r.class_subject || '',
      });
    }

    // Filter folders by student DB-class access
    const visibleFolders = rawFolders.filter((f) => {
      const fClasses = (classesByFolder.get(f.id) || []).map((c) => c.id);
      return canUserAccessFolder(req.user, f, {
        ...studentCtx,
        folderClassIds: fClasses,
      });
    });

    // Count accessible videos per folder (including shared videos in video_folder_items!)
    let videosQuery = db('videos')
      .leftJoin('users', 'videos.teacher_id', 'users.id')
      .select('videos.*', 'users.school_id as owner_school_id');

    if (req.user.school_id) {
      videosQuery = videosQuery.where('users.school_id', req.user.school_id);
    }
    const allVideos = await videosQuery;
    const allVideoIds = allVideos.map((v) => v.id);

    const [vcAll, vfiAll] = allVideoIds.length
      ? await Promise.all([
          db('video_classes').whereIn('video_id', allVideoIds).select('video_id', 'class_id'),
          db('video_folder_items').whereIn('video_id', allVideoIds).select('video_id', 'folder_id', 'folder_name'),
        ])
      : [[], []];

    const vcMap = new Map();
    for (const r of vcAll) {
      if (!vcMap.has(r.video_id)) vcMap.set(r.video_id, []);
      vcMap.get(r.video_id).push(r.class_id);
    }

    const accessibleVideoIds = new Set();
    for (const v of allVideos) {
      const ok = canUserAccessVideo(req.user, v, {
        ...studentCtx,
        videoClassIds: vcMap.get(v.id) || [],
      });
      if (ok) accessibleVideoIds.add(v.id);
    }

    const countByFolderName = new Map();
    const countedPairs = new Set();
    for (const item of vfiAll) {
      if (!accessibleVideoIds.has(item.video_id)) continue;
      const key = `${item.folder_name}::${item.video_id}`;
      if (countedPairs.has(key)) continue;
      countedPairs.add(key);
      countByFolderName.set(item.folder_name, (countByFolderName.get(item.folder_name) || 0) + 1);
    }

    const resultFolders = visibleFolders.map((f) => {
      const targetClasses = classesByFolder.get(f.id) || [];
      return {
        id: f.id,
        name: f.name,
        color: f.color || '#6366f1',
        grade: f.grade || '',
        teacher_id: f.teacher_id,
        teacher_name: f.teacher_name || '',
        target_class_ids: targetClasses.map((c) => c.id),
        target_classes: targetClasses,
        count: countByFolderName.get(f.name) || 0,
        created_at: f.created_at,
      };
    });

    res.json({
      success: true,
      data: {
        folders: resultFolders,
        total_videos: accessibleVideoIds.size,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/folders', authorize('teacher', 'admin', 'manager', 'school_admin'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, message: 'نام پوشه الزامی است.' });
    }
    const color = String(req.body.color || '#6366f1').trim();
    const grade = normalizeGrade(req.body.grade || '');
    const resolvedClasses = await validateAndResolveDbClasses(req.user, req.body.class_ids || req.body.target_class_ids);
    const classIds = resolvedClasses.map((c) => c.id);

    const existing = await db('video_folders')
      .where({ teacher_id: req.user.id, name })
      .first();

    let folderId;
    if (existing) {
      folderId = existing.id;
      await db('video_folders').where({ id: folderId }).update({
        color,
        grade: grade || existing.grade || null,
        class_id: classIds[0] || existing.class_id || null,
        target_class_ids: JSON.stringify(classIds),
        updated_at: db.fn.now(),
      });
    } else {
      folderId = genId();
      await db('video_folders').insert({
        id: folderId,
        name,
        teacher_id: req.user.id,
        class_id: classIds[0] || null,
        grade: grade || null,
        target_class_ids: JSON.stringify(classIds),
        color,
      });
    }

    // Sync video_folder_classes
    await db('video_folder_classes').where({ folder_id: folderId }).del();
    if (classIds.length > 0) {
      await db('video_folder_classes').insert(
        classIds.map((cid) => ({ id: genId(), folder_id: folderId, class_id: cid }))
      );
    }

    res.status(existing ? 200 : 201).json({
      success: true,
      data: {
        folder: {
          id: folderId,
          name,
          color,
          grade,
          target_class_ids: classIds,
          target_classes: resolvedClasses.map((c) => ({
            id: c.id,
            name: c.name,
            grade: c.grade || '',
            subject: c.subject || '',
          })),
          count: 0,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/folders/:id', authorize('teacher', 'admin', 'manager', 'school_admin'), async (req, res, next) => {
  try {
    const folder = await db('video_folders').where({ id: req.params.id }).first();
    if (!folder) {
      return res.status(404).json({ success: false, message: 'پوشه یافت نشد.' });
    }
    if (!isAdminUser(req.user) && String(folder.teacher_id) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'دسترسی ویرایش این پوشه را ندارید.' });
    }

    const newName = String(req.body.name || folder.name).trim();
    if (!newName) {
      return res.status(400).json({ success: false, message: 'نام پوشه نمی‌تواند خالی باشد.' });
    }
    const color = String(req.body.color || folder.color || '#6366f1').trim();
    const grade = req.body.grade !== undefined ? normalizeGrade(req.body.grade) : folder.grade || '';
    const hasClassIdsField = req.body.class_ids !== undefined || req.body.target_class_ids !== undefined;
    const resolvedClasses = hasClassIdsField
      ? await validateAndResolveDbClasses(req.user, req.body.class_ids || req.body.target_class_ids)
      : null;

    await db.transaction(async (trx) => {
      const updatePayload = {
        name: newName,
        color,
        grade: grade || null,
        updated_at: trx.fn.now(),
      };

      if (resolvedClasses !== null) {
        const classIds = resolvedClasses.map((c) => c.id);
        updatePayload.class_id = classIds[0] || null;
        updatePayload.target_class_ids = JSON.stringify(classIds);

        await trx('video_folder_classes').where({ folder_id: folder.id }).del();
        if (classIds.length > 0) {
          await trx('video_folder_classes').insert(
            classIds.map((cid) => ({ id: genId(), folder_id: folder.id, class_id: cid }))
          );
        }
      }

      await trx('video_folders').where({ id: folder.id }).update(updatePayload);

      if (newName !== folder.name) {
        await trx('videos')
          .where({ teacher_id: folder.teacher_id, folder_name: folder.name })
          .update({ folder_name: newName });
        await trx('video_folder_items')
          .where({ folder_id: folder.id })
          .update({ folder_name: newName });
      }
    });

    res.json({
      success: true,
      data: {
        folder: {
          id: folder.id,
          name: newName,
          color,
          grade,
          target_class_ids: resolvedClasses ? resolvedClasses.map((c) => c.id) : parseJsonArray(folder.target_class_ids),
          target_classes: resolvedClasses
            ? resolvedClasses.map((c) => ({ id: c.id, name: c.name, grade: c.grade || '', subject: c.subject || '' }))
            : undefined,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/folders/:nameOrId', authorize('teacher', 'admin', 'manager', 'school_admin'), async (req, res, next) => {
  try {
    const param = decodeURIComponent(req.params.nameOrId || '').trim();
    if (!param || param === DEFAULT_FOLDER_NAME) {
      return res.status(400).json({ success: false, message: 'پوشه عمومی قابل حذف نیست.' });
    }

    let query = db('video_folders').where(function () {
      this.where('id', param).orWhere('name', param);
    });
    if (!isAdminUser(req.user)) {
      query = query.andWhere('teacher_id', req.user.id);
    }

    const folder = await query.first();
    if (!folder) {
      return res.status(404).json({ success: false, message: 'پوشه یافت نشد.' });
    }

    await db.transaction(async (trx) => {
      await trx('video_folder_items').where({ folder_id: folder.id }).del();
      await trx('video_folder_items').where({ folder_name: folder.name }).del();
      await trx('videos')
        .where({ teacher_id: folder.teacher_id, folder_name: folder.name })
        .update({ folder_name: DEFAULT_FOLDER_NAME });
      await trx('video_folders').where({ id: folder.id }).del();
    });

    res.json({ success: true, message: 'پوشه با موفقیت حذف شد.' });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 3. LIST & GET VIDEOS (RESPECTING DB CLASS VISIBILITY & MULTI-FOLDER SHARING)
// ============================================================================
router.get('/', async (req, res, next) => {
  try {
    const { folder, audience, class_id: classFilter, grade: gradeFilter, search } = req.query;
    const studentCtx = await getStudentAccessContext(req.user);

    let query = db('videos')
      .leftJoin('users', 'videos.teacher_id', 'users.id')
      .select('videos.*', 'users.display_name as teacher_name', 'users.school_id as owner_school_id')
      .orderBy('videos.created_at', 'desc');

    if (req.user.school_id) {
      query = query.where('users.school_id', req.user.school_id);
    }
    if (audience && audience !== 'all') {
      query = query.andWhere('videos.target_audience', normalizeVideoAudience(audience));
    }

    const rawVideos = await query;
    const hydrated = await hydrateVideos(rawVideos);

    const filtered = hydrated.filter((v) => {
      // Check user access based on DB classes / grade / audience
      const allowed = canUserAccessVideo(req.user, v, {
        ...studentCtx,
        videoClassIds: v.target_class_ids,
      });
      if (!allowed) return false;

      // Folder filter (supports multi-folder sharing!)
      if (folder && folder !== 'all') {
        const inFolder =
          v.folder_name === folder ||
          (Array.isArray(v.folder_names) && v.folder_names.includes(folder));
        if (!inFolder) return false;
      }

      // Class filter
      if (classFilter && classFilter !== 'all') {
        if (!v.target_class_ids.includes(String(classFilter))) return false;
      }

      // Grade filter
      if (gradeFilter && gradeFilter !== 'all') {
        const gNorm = normalizeGrade(gradeFilter);
        const matchesDirectGrade = normalizeGrade(v.grade) === gNorm;
        const matchesClassGrade = v.target_classes.some((c) => normalizeGrade(c.grade) === gNorm);
        if (!matchesDirectGrade && !matchesClassGrade) return false;
      }

      // Text search
      if (search && String(search).trim()) {
        const q = String(search).trim().toLowerCase();
        const hay = `${v.title || ''} ${v.description || ''} ${v.folder_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    res.json({ success: true, data: { videos: filtered } });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 4. STREAM & DOWNLOAD VIDEO (WITH QUALITY SELECTION & ATTACHMENT DOWNLOAD)
// ============================================================================
router.get('/stream/:filename', async (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename || '');
    const fileUrl = `/uploads/${filename}`;
    const video = await db('videos')
      .where('file_url', fileUrl)
      .orWhere('video_url', fileUrl)
      .first();

    if (!video) {
      return res.status(404).json({ success: false, message: 'ویدیو یافت نشد.' });
    }

    const studentCtx = await getStudentAccessContext(req.user);
    const vcRows = await db('video_classes').where({ video_id: video.id }).select('class_id');
    const allowed = canUserAccessVideo(req.user, video, {
      ...studentCtx,
      videoClassIds: vcRows.map((r) => r.class_id),
    });
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'دسترسی به این ویدیو مجاز نیست.' });
    }

    const fullPath = resolveSafeUploadPath(UPLOADS_DIR, filename);
    return streamMediaFile(req, res, fullPath, video.mimetype || 'video/mp4');
  } catch (err) {
    next(err);
  }
});

router.get('/:id/stream', async (req, res, next) => {
  try {
    const video = await db('videos').where({ id: req.params.id }).first();
    if (!video) {
      return res.status(404).json({ success: false, message: 'ویدیو یافت نشد.' });
    }

    const studentCtx = await getStudentAccessContext(req.user);
    const vcRows = await db('video_classes').where({ video_id: video.id }).select('class_id');
    const allowed = canUserAccessVideo(req.user, video, {
      ...studentCtx,
      videoClassIds: vcRows.map((r) => r.class_id),
    });
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'دسترسی به این ویدیو مجاز نیست.' });
    }

    // Increment views count on initial request (not every range seek)
    if (!req.headers.range || req.headers.range === 'bytes=0-') {
      await db('videos').where({ id: video.id }).increment('views_count', 1);
    }

    let targetFileUrl = video.file_url || video.video_url;
    const requestedQuality = String(req.query.quality || '').trim();
    if (requestedQuality && requestedQuality !== 'original') {
      const variants = parseJsonArray(video.quality_variants);
      const matched = variants.find((q) => q.label === requestedQuality);
      if (matched && matched.url) {
        targetFileUrl = matched.url;
      }
    }

    const filename = path.basename(targetFileUrl || '');
    const fullPath = resolveSafeUploadPath(UPLOADS_DIR, filename);
    return streamMediaFile(req, res, fullPath, video.mimetype || 'video/mp4');
  } catch (err) {
    next(err);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const video = await db('videos').where({ id: req.params.id }).first();
    if (!video) {
      return res.status(404).json({ success: false, message: 'ویدیو یافت نشد.' });
    }

    const studentCtx = await getStudentAccessContext(req.user);
    const vcRows = await db('video_classes').where({ video_id: video.id }).select('class_id');
    const allowed = canUserAccessVideo(req.user, video, {
      ...studentCtx,
      videoClassIds: vcRows.map((r) => r.class_id),
    });
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'دسترسی دانلود این ویدیو مجاز نیست.' });
    }

    const fileUrl = video.file_url || video.video_url || '';
    const filename = path.basename(fileUrl);
    const fullPath = resolveSafeUploadPath(UPLOADS_DIR, filename);
    if (!fullPath || !fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'فایل ویدیو روی سرور یافت نشد.' });
    }

    const ext = path.extname(filename) || '.mp4';
    const cleanTitle = String(video.title || 'video').replace(/[<>:"/\\|?*]+/g, '_').trim();
    const downloadName = `${cleanTitle}${ext}`;

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="video${ext}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`
    );
    res.setHeader('Content-Type', video.mimetype || 'application/octet-stream');
    return fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 5. UPLOAD / PUBLISH VIDEO (WITH DB CLASSES, MULTI-FOLDER & MULTI-PDF)
// ============================================================================
router.post('/', authorize('teacher', 'admin', 'manager', 'school_admin'), uploadVideoFields, async (req, res, next) => {
  try {
    const mainFile = req.files?.file?.[0];
    if (!mainFile) {
      return res.status(400).json({ success: false, message: 'انتخاب فایل ویدیو الزامی است.' });
    }

    const title = String(req.body.title || path.basename(mainFile.originalname, path.extname(mainFile.originalname))).trim();
    const description = String(req.body.description || '').trim();
    const category = String(req.body.category || 'آموزشی').trim();
    const targetAudience = normalizeVideoAudience(req.body.target_audience || 'students');
    const primaryFolderName = String(req.body.folder_name || DEFAULT_FOLDER_NAME).trim() || DEFAULT_FOLDER_NAME;
    const extraFolderNames = parseInputList(req.body.folder_names);
    const allFolderNames = Array.from(new Set([primaryFolderName, ...extraFolderNames]));
    const gradeInput = normalizeGrade(req.body.grade || '');

    // Resolve DB classes selected by teacher
    let requestedClassIds = parseInputList(req.body.class_ids || req.body.target_class_ids);
    if (requestedClassIds.length === 0 && req.body.class_id) {
      requestedClassIds = [String(req.body.class_id).trim()];
    }

    // If no explicit class_ids sent, inherit from primary folder's DB classes
    let primaryFolderRecord = await db('video_folders')
      .where({ teacher_id: req.user.id, name: primaryFolderName })
      .first();

    if (requestedClassIds.length === 0 && primaryFolderRecord) {
      const fClasses = await db('video_folder_classes')
        .where({ folder_id: primaryFolderRecord.id })
        .select('class_id');
      requestedClassIds = fClasses.map((r) => r.class_id);
    }

    const resolvedClasses = await validateAndResolveDbClasses(req.user, requestedClassIds);
    const classIds = resolvedClasses.map((c) => c.id);
    const effectiveGrade =
      gradeInput ||
      primaryFolderRecord?.grade ||
      (resolvedClasses[0]?.grade ? normalizeGrade(resolvedClasses[0].grade) : null);

    const fileUrl = `/uploads/${mainFile.filename}`;
    const thumbFile = req.files?.thumbnail?.[0];
    const thumbnailUrl = thumbFile ? `/uploads/${thumbFile.filename}` : null;

    const uploadedPdfs = [
      ...(req.files?.pdf || []),
      ...(req.files?.pdfs || []),
    ];
    const primaryPdf = uploadedPdfs[0] || null;
    const primaryPdfUrl = primaryPdf ? `/uploads/${primaryPdf.filename}` : req.body.pdf_url || null;
    const primaryPdfName = primaryPdf ? primaryPdf.originalname : req.body.pdf_name || null;

    const videoId = genId();

    await db.transaction(async (trx) => {
      // Ensure folders exist for all selected folder names
      const folderRecords = new Map();
      for (const fName of allFolderNames) {
        if (fName === DEFAULT_FOLDER_NAME) {
          folderRecords.set(fName, null);
          continue;
        }
        let fRec = await trx('video_folders')
          .where({ teacher_id: req.user.id, name: fName })
          .first();
        if (!fRec) {
          const newFId = genId();
          await trx('video_folders').insert({
            id: newFId,
            name: fName,
            teacher_id: req.user.id,
            class_id: classIds[0] || null,
            grade: effectiveGrade || null,
            target_class_ids: JSON.stringify(classIds),
            color: '#6366f1',
          });
          if (classIds.length > 0) {
            await trx('video_folder_classes').insert(
              classIds.map((cid) => ({ id: genId(), folder_id: newFId, class_id: cid }))
            );
          }
          fRec = { id: newFId, name: fName };
        }
        folderRecords.set(fName, fRec);
      }

      await trx('videos').insert({
        id: videoId,
        title,
        description,
        class_id: classIds[0] || null,
        teacher_id: req.user.id,
        file_url: fileUrl,
        video_url: fileUrl,
        thumbnail_url: thumbnailUrl,
        mimetype: mainFile.mimetype || 'video/mp4',
        file_size: mainFile.size || 0,
        duration_seconds: Number(req.body.duration_seconds || 0),
        views_count: 0,
        is_published: req.body.is_published === 'false' || req.body.is_published === false ? false : true,
        folder_name: primaryFolderName,
        category,
        target_audience: targetAudience,
        grade: effectiveGrade || null,
        target_class_ids: JSON.stringify(classIds),
        quality_variants: '[]',
        pdf_url: primaryPdfUrl,
        pdf_name: primaryPdfName,
      });

      if (classIds.length > 0) {
        await trx('video_classes').insert(
          classIds.map((cid) => ({ id: genId(), video_id: videoId, class_id: cid }))
        );
      }

      for (const fName of allFolderNames) {
        const fRec = folderRecords.get(fName);
        await trx('video_folder_items').insert({
          id: genId(),
          video_id: videoId,
          folder_id: fRec ? fRec.id : null,
          folder_name: fName,
        });
      }

      for (const pdfFile of uploadedPdfs) {
        await trx('video_pdfs').insert({
          id: genId(),
          video_id: videoId,
          file_url: `/uploads/${pdfFile.filename}`,
          file_name: pdfFile.originalname || 'فایل پیوست.pdf',
          file_size: pdfFile.size || 0,
        });
      }
    });

    // Optional non-blocking multi-quality transcode
    triggerBackgroundQualityTranscode(videoId, mainFile.path);

    const created = await db('videos').where({ id: videoId }).first();
    const [hydrated] = await hydrateVideos([created]);

    res.status(201).json({ success: true, data: { video: hydrated } });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 6. MOVE VIDEO BETWEEN FOLDERS & SHARE VIDEO ACROSS MULTIPLE FOLDERS
// ============================================================================
router.patch('/:id/folder', authorize('teacher', 'admin', 'manager', 'school_admin'), async (req, res, next) => {
  try {
    const video = await db('videos').where({ id: req.params.id }).first();
    if (!video) return res.status(404).json({ success: false, message: 'ویدیو یافت نشد.' });
    if (!isAdminUser(req.user) && String(video.teacher_id) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'اجازه انتقال این ویدیو را ندارید.' });
    }

    const targetFolder = String(req.body.folder_name || DEFAULT_FOLDER_NAME).trim() || DEFAULT_FOLDER_NAME;

    await db.transaction(async (trx) => {
      let folderRec = null;
      if (targetFolder !== DEFAULT_FOLDER_NAME) {
        folderRec = await trx('video_folders')
          .where({ teacher_id: video.teacher_id, name: targetFolder })
          .first();
        if (!folderRec) {
          const newId = genId();
          await trx('video_folders').insert({
            id: newId,
            name: targetFolder,
            teacher_id: video.teacher_id,
            color: '#6366f1',
          });
          folderRec = { id: newId, name: targetFolder };
        }
      }

      // Replace old primary folder entry with target folder
      await trx('video_folder_items')
        .where({ video_id: video.id, folder_name: video.folder_name || DEFAULT_FOLDER_NAME })
        .del();

      const exists = await trx('video_folder_items')
        .where({ video_id: video.id, folder_name: targetFolder })
        .first();
      if (!exists) {
        await trx('video_folder_items').insert({
          id: genId(),
          video_id: video.id,
          folder_id: folderRec ? folderRec.id : null,
          folder_name: targetFolder,
        });
      }

      await trx('videos').where({ id: video.id }).update({
        folder_name: targetFolder,
        updated_at: trx.fn.now(),
      });
    });

    const updated = await db('videos').where({ id: video.id }).first();
    const [hydrated] = await hydrateVideos([updated]);
    res.json({ success: true, data: { video: hydrated } });
  } catch (err) {
    next(err);
  }
});

// Share a single video across multiple folders simultaneously
router.put('/:id/folders', authorize('teacher', 'admin', 'manager', 'school_admin'), async (req, res, next) => {
  try {
    const video = await db('videos').where({ id: req.params.id }).first();
    if (!video) return res.status(404).json({ success: false, message: 'ویدیو یافت نشد.' });
    if (!isAdminUser(req.user) && String(video.teacher_id) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'اجازه اشتراک‌گذاری این ویدیو را ندارید.' });
    }

    const folderNames = Array.from(new Set(parseInputList(req.body.folder_names)));
    if (folderNames.length === 0) {
      folderNames.push(DEFAULT_FOLDER_NAME);
    }

    await db.transaction(async (trx) => {
      await trx('video_folder_items').where({ video_id: video.id }).del();

      for (const fName of folderNames) {
        let folderRec = null;
        if (fName !== DEFAULT_FOLDER_NAME) {
          folderRec = await trx('video_folders')
            .where({ teacher_id: video.teacher_id, name: fName })
            .first();
          if (!folderRec) {
            const newId = genId();
            await trx('video_folders').insert({
              id: newId,
              name: fName,
              teacher_id: video.teacher_id,
              color: '#6366f1',
            });
            folderRec = { id: newId, name: fName };
          }
        }
        await trx('video_folder_items').insert({
          id: genId(),
          video_id: video.id,
          folder_id: folderRec ? folderRec.id : null,
          folder_name: fName,
        });
      }

      await trx('videos').where({ id: video.id }).update({
        folder_name: folderNames[0],
        updated_at: trx.fn.now(),
      });
    });

    const updated = await db('videos').where({ id: video.id }).first();
    const [hydrated] = await hydrateVideos([updated]);
    res.json({ success: true, data: { video: hydrated } });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 7. UPDATE TARGET DB CLASSES / AUDIENCE FOR A VIDEO
// ============================================================================
router.put('/:id/classes', authorize('teacher', 'admin', 'manager', 'school_admin'), async (req, res, next) => {
  try {
    const video = await db('videos').where({ id: req.params.id }).first();
    if (!video) return res.status(404).json({ success: false, message: 'ویدیو یافت نشد.' });
    if (!isAdminUser(req.user) && String(video.teacher_id) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'اجازه ویرایش کلاس‌های این ویدیو را ندارید.' });
    }

    const resolvedClasses = await validateAndResolveDbClasses(req.user, req.body.class_ids || req.body.target_class_ids);
    const classIds = resolvedClasses.map((c) => c.id);
    const grade = req.body.grade !== undefined ? normalizeGrade(req.body.grade) : video.grade || '';

    await db.transaction(async (trx) => {
      await trx('video_classes').where({ video_id: video.id }).del();
      if (classIds.length > 0) {
        await trx('video_classes').insert(
          classIds.map((cid) => ({ id: genId(), video_id: video.id, class_id: cid }))
        );
      }
      await trx('videos').where({ id: video.id }).update({
        class_id: classIds[0] || null,
        grade: grade || null,
        target_class_ids: JSON.stringify(classIds),
        updated_at: trx.fn.now(),
      });
    });

    const updated = await db('videos').where({ id: video.id }).first();
    const [hydrated] = await hydrateVideos([updated]);
    res.json({ success: true, data: { video: hydrated } });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/audience', authorize('teacher', 'admin', 'manager', 'school_admin'), async (req, res, next) => {
  try {
    const video = await db('videos').where({ id: req.params.id }).first();
    if (!video) return res.status(404).json({ success: false, message: 'ویدیو یافت نشد.' });
    if (!isAdminUser(req.user) && String(video.teacher_id) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'اجازه ویرایش این ویدیو را ندارید.' });
    }
    const targetAudience = normalizeVideoAudience(req.body.target_audience);
    await db('videos').where({ id: video.id }).update({
      target_audience: targetAudience,
      updated_at: db.fn.now(),
    });
    const updated = await db('videos').where({ id: video.id }).first();
    const [hydrated] = await hydrateVideos([updated]);
    res.json({ success: true, data: { video: hydrated } });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 8. PDF ATTACHMENTS UNDERNEATH VIDEO (ADD, VIEW, DOWNLOAD, DELETE)
// ============================================================================
router.post('/:id/pdf', authorize('teacher', 'admin', 'manager', 'school_admin'), uploadPdfFields, async (req, res, next) => {
  try {
    const video = await db('videos').where({ id: req.params.id }).first();
    if (!video) return res.status(404).json({ success: false, message: 'ویدیو یافت نشد.' });
    if (!isAdminUser(req.user) && String(video.teacher_id) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'اجازه افزودن PDF به این ویدیو را ندارید.' });
    }

    const uploadedPdfs = [
      ...(req.files?.pdf || []),
      ...(req.files?.pdfs || []),
    ];

    if (uploadedPdfs.length === 0 && !req.body.pdf_url) {
      return res.status(400).json({ success: false, message: 'فایل PDF انتخاب نشده است.' });
    }

    await db.transaction(async (trx) => {
      if (uploadedPdfs.length > 0) {
        for (const f of uploadedPdfs) {
          await trx('video_pdfs').insert({
            id: genId(),
            video_id: video.id,
            file_url: `/uploads/${f.filename}`,
            file_name: f.originalname || 'فایل پیوست.pdf',
            file_size: f.size || 0,
          });
        }
        if (!video.pdf_url) {
          await trx('videos').where({ id: video.id }).update({
            pdf_url: `/uploads/${uploadedPdfs[0].filename}`,
            pdf_name: uploadedPdfs[0].originalname || 'فایل پیوست.pdf',
          });
        }
      } else if (req.body.pdf_url) {
        await trx('video_pdfs').insert({
          id: genId(),
          video_id: video.id,
          file_url: req.body.pdf_url,
          file_name: req.body.pdf_name || 'فایل پیوست.pdf',
          file_size: 0,
        });
      }
    });

    const updated = await db('videos').where({ id: video.id }).first();
    const [hydrated] = await hydrateVideos([updated]);
    res.status(201).json({ success: true, data: { video: hydrated } });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/pdf/:pdfId/:mode', async (req, res, next) => {
  try {
    const { id, pdfId, mode } = req.params;
    const video = await db('videos').where({ id }).first();
    if (!video) return res.status(404).json({ success: false, message: 'ویدیو یافت نشد.' });

    const studentCtx = await getStudentAccessContext(req.user);
    const vcRows = await db('video_classes').where({ video_id: video.id }).select('class_id');
    const allowed = canUserAccessVideo(req.user, video, {
      ...studentCtx,
      videoClassIds: vcRows.map((r) => r.class_id),
    });
    if (!allowed) return res.status(403).json({ success: false, message: 'دسترسی مجاز نیست.' });

    let pdfUrl = null;
    let pdfName = 'document.pdf';
    if (pdfId === 'legacy') {
      pdfUrl = video.pdf_url;
      pdfName = video.pdf_name || 'document.pdf';
    } else {
      const rec = await db('video_pdfs').where({ id: pdfId, video_id: video.id }).first();
      if (!rec) return res.status(404).json({ success: false, message: 'فایل PDF یافت نشد.' });
      pdfUrl = rec.file_url;
      pdfName = rec.file_name || 'document.pdf';
    }

    const fullPath = resolveSafeUploadPath(UPLOADS_DIR, path.basename(pdfUrl || ''));
    if (!fullPath || !fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'فایل PDF روی سرور یافت نشد.' });
    }

    const disposition = mode === 'download' ? 'attachment' : 'inline';
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="attachment.pdf"; filename*=UTF-8''${encodeURIComponent(pdfName)}`
    );
    res.setHeader('Content-Type', 'application/pdf');
    return fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/pdf/:pdfId', authorize('teacher', 'admin', 'manager', 'school_admin'), async (req, res, next) => {
  try {
    const video = await db('videos').where({ id: req.params.id }).first();
    if (!video) return res.status(404).json({ success: false, message: 'ویدیو یافت نشد.' });
    if (!isAdminUser(req.user) && String(video.teacher_id) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'اجازه حذف فایل PDF را ندارید.' });
    }

    const pdfRec = await db('video_pdfs')
      .where({ id: req.params.pdfId, video_id: video.id })
      .first();
    if (pdfRec) {
      safeUnlinkUpload(pdfRec.file_url);
      await db('video_pdfs').where({ id: pdfRec.id }).del();
    }

    const remaining = await db('video_pdfs').where({ video_id: video.id }).orderBy('created_at', 'asc').first();
    await db('videos').where({ id: video.id }).update({
      pdf_url: remaining ? remaining.file_url : null,
      pdf_name: remaining ? remaining.file_name : null,
    });

    const updated = await db('videos').where({ id: video.id }).first();
    const [hydrated] = await hydrateVideos([updated]);
    res.json({ success: true, data: { video: hydrated } });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 9. GET SINGLE VIDEO & DELETE VIDEO
// ============================================================================
router.get('/:id', async (req, res, next) => {
  try {
    const video = await db('videos').where({ id: req.params.id }).first();
    if (!video) return res.status(404).json({ success: false, message: 'ویدیو یافت نشد.' });

    const studentCtx = await getStudentAccessContext(req.user);
    const vcRows = await db('video_classes').where({ video_id: video.id }).select('class_id');
    const allowed = canUserAccessVideo(req.user, video, {
      ...studentCtx,
      videoClassIds: vcRows.map((r) => r.class_id),
    });
    if (!allowed) return res.status(403).json({ success: false, message: 'دسترسی مجاز نیست.' });

    await db('videos').where({ id: video.id }).increment('views_count', 1);
    const [hydrated] = await hydrateVideos([{ ...video, views_count: (video.views_count || 0) + 1 }]);
    res.json({ success: true, data: { video: hydrated } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authorize('teacher', 'admin', 'manager', 'school_admin'), async (req, res, next) => {
  try {
    const video = await db('videos').where({ id: req.params.id }).first();
    if (!video) return res.status(404).json({ success: false, message: 'ویدیو یافت نشد.' });
    if (!isAdminUser(req.user) && String(video.teacher_id) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'اجازه حذف این ویدیو را ندارید.' });
    }

    const pdfRows = await db('video_pdfs').where({ video_id: video.id }).select('file_url');
    const variants = parseJsonArray(video.quality_variants);

    safeUnlinkUpload(video.file_url);
    if (video.video_url && video.video_url !== video.file_url) safeUnlinkUpload(video.video_url);
    safeUnlinkUpload(video.thumbnail_url);
    safeUnlinkUpload(video.pdf_url);
    for (const p of pdfRows) safeUnlinkUpload(p.file_url);
    for (const q of variants) safeUnlinkUpload(q.url);

    await db('videos').where({ id: video.id }).del();

    res.json({ success: true, message: 'ویدیو با موفقیت حذف شد.' });
  } catch (err) {
    next(err);
  }
});

router._setConversionBusyForTest = (busy) => {
  activeConversions = busy ? MAX_CONCURRENT_CONVERSIONS : 0;
};

module.exports = router;
