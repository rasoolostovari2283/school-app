const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const upload = require('../../middleware/upload');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const os = require('os');
const crypto = require('crypto');

/**
 * POST /api/v1/videos/convert-pptx — converts a PowerPoint presentation into a vector PDF using PowerPoint COM
 * Includes instant SHA-256 disk caching and high-speed cscript execution.
 */
router.post('/convert-pptx', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'فایل پاورپوینت ارسال نشده است' });
    }

    const outputPdfFilename = `${path.parse(file.originalname || file.filename).name}.pdf`;

    // 1. Check SHA256 Cache for Instant Response (0 seconds)
    const cacheDir = path.join(os.tmpdir(), 'educonnect_pptx_cache');
    if (!fs.existsSync(cacheDir)) {
      try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) {}
    }

    let fileHash = '';
    try {
      const fileBuffer = fs.readFileSync(file.path);
      fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      const cachedPdfPath = path.join(cacheDir, `${fileHash}.pdf`);

      if (fs.existsSync(cachedPdfPath) && fs.statSync(cachedPdfPath).size > 1000) {
        try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (e) {}
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(outputPdfFilename)}"`);
        res.setHeader('X-Cache', 'HIT');
        return fs.createReadStream(cachedPdfPath).pipe(res);
      }
    } catch (hashErr) {
      console.warn('Cache check error:', hashErr);
    }

    // 2. Perform Conversion
    const fileId = uuidv4();
    const tempInput = path.join(os.tmpdir(), `${fileId}.pptx`);
    const tempOutput = path.join(os.tmpdir(), `${fileId}.pdf`);
    const scriptPath = path.join(os.tmpdir(), `convert_${fileId}.vbs`);

    // Copy to ASCII temp path so COM automation is never affected by non-ASCII folder names
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
      'WScript.Echo "OK"'
    ].join('\r\n');

    fs.writeFileSync(scriptPath, vbsContent, 'ascii');

    execFile('cscript', ['//nologo', scriptPath], (err, stdout, stderr) => {
      // Clean up script and input temp
      try { if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath); } catch (e) {}
      try { if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput); } catch (e) {}
      try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (e) {}

      if (fs.existsSync(tempOutput) && fs.statSync(tempOutput).size > 1000) {
        // Save to cache for future instant access
        if (fileHash) {
          try {
            const cachedPdfPath = path.join(cacheDir, `${fileHash}.pdf`);
            fs.copyFileSync(tempOutput, cachedPdfPath);
          } catch (cErr) {}
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(outputPdfFilename)}"`);
        res.setHeader('X-Cache', 'MISS');
        const stream = fs.createReadStream(tempOutput);
        stream.pipe(res);
        stream.on('finish', () => {
          try {
            if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
          } catch (e) {}
        });
      } else {
        // Fallback to powershell if cscript failed
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
        execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psPath], (psErr) => {
          try { if (fs.existsSync(psPath)) fs.unlinkSync(psPath); } catch (e) {}
          if (fs.existsSync(tempOutput) && fs.statSync(tempOutput).size > 1000) {
            if (fileHash) {
              try { fs.copyFileSync(tempOutput, path.join(cacheDir, `${fileHash}.pdf`)); } catch (e) {}
            }
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(outputPdfFilename)}"`);
            const stream = fs.createReadStream(tempOutput);
            stream.pipe(res);
            stream.on('finish', () => {
              try { if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput); } catch (e) {}
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
    next(err);
  }
});

router.use(authenticate);

let targetAudienceChecked = false;
async function ensureTargetAudienceColumn() {
  if (targetAudienceChecked) return;
  try {
    const hasCol = await db.schema.hasColumn('videos', 'target_audience');
    if (!hasCol) {
      await db.schema.table('videos', (t) => {
        t.string('target_audience').defaultTo('all');
      });
    }
    targetAudienceChecked = true;
  } catch (e) {
    console.warn('ensureTargetAudienceColumn warning:', e.message);
  }
}

/**
 * GET /api/v1/videos/folders — list all folders with video counts
 */
router.get('/folders', async (req, res, next) => {
  try {
    let customFolders = [];
    try {
      customFolders = await db('video_folders')
        .select('*')
        .orderBy('name', 'asc');
    } catch (e) {}

    let videoFolderCounts = [];
    try {
      videoFolderCounts = await db('videos')
        .select('folder_name')
        .count('id as count')
        .groupBy('folder_name');
    } catch (e) {}

    const countMap = {};
    videoFolderCounts.forEach((item) => {
      const name = item.folder_name || 'عمومی';
      countMap[name] = (countMap[name] || 0) + Number(item.count || 0);
    });

    const folderNamesSet = new Set(['عمومی', ...customFolders.map((f) => f.name), ...Object.keys(countMap)]);
    const folders = Array.from(folderNamesSet).map((name) => {
      const found = customFolders.find((f) => f.name === name);
      return {
        id: found?.id || name,
        name,
        color: found?.color || '#6366f1',
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
router.post('/folders', async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'نام پوشه الزامی است' });
    }
    const folderName = name.trim();
    const currentUserId = req.user?.id || 'teacher-default';

    const existing = await db('video_folders')
      .where({ name: folderName })
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
    res.status(201).json({ success: true, data: { folder: newFolder }, message: 'پوشه جدید ایجاد شد' });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/videos/folders/:name — delete a folder
 */
router.delete('/folders/:name', async (req, res, next) => {
  try {
    const folderName = decodeURIComponent(req.params.name);
    if (folderName === 'عمومی') {
      return res.status(400).json({ success: false, message: 'پوشه پیش‌فرض عمومی قابل حذف نیست' });
    }
    await db('video_folders').where({ name: folderName, teacher_id: req.user.id }).del();
    await db('videos').where({ folder_name: folderName, teacher_id: req.user.id }).update({ folder_name: 'عمومی' });
    res.json({ success: true, message: 'پوشه حذف شد و رسانه‌ها به پوشه عمومی منتقل شدند' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/videos — list all videos (filtered by role and optional folder)
 */
router.get('/', async (req, res, next) => {
  try {
    await ensureTargetAudienceColumn();

    let query = db('videos')
      .join('users', 'users.id', 'videos.teacher_id')
      .leftJoin('classes', 'classes.id', 'videos.class_id')
      .select(
        'videos.*',
        'users.display_name as teacher_name',
        'classes.name as class_name',
        'classes.subject as class_subject'
      )
      .orderBy('videos.created_at', 'desc');

    if (req.user.role === 'teacher') {
      query = query.where(function () {
        this.where('videos.teacher_id', req.user.id)
          .orWhere('videos.target_audience', 'all')
          .orWhere('videos.target_audience', 'teachers')
          .orWhere('videos.target_audience', 'students')
          .orWhereNull('videos.target_audience');
      });
    } else if (req.user.role === 'student') {
      const classIds = await db('class_members')
        .where({ user_id: req.user.id })
        .pluck('class_id');

      query = query.where(function () {
        this.where('videos.teacher_id', req.user.id);
        this.orWhere('videos.target_audience', 'all');
        this.orWhere('videos.target_audience', 'students');
        this.orWhereNull('videos.target_audience');
        if (classIds.length > 0) {
          this.orWhere(function () {
            this.whereIn('videos.class_id', classIds)
              .where('videos.is_published', true);
          });
        }
      });
    } else if (req.user.role === 'parent') {
      query = query.where(function () {
        this.where('videos.target_audience', 'all')
          .orWhere('videos.target_audience', 'parents')
          .orWhereNull('videos.target_audience');
      });
    }

    if (req.query.folder && req.query.folder !== 'all') {
      query = query.where('videos.folder_name', req.query.folder);
    }

    if (req.query.audience && req.query.audience !== 'all') {
      query = query.where('videos.target_audience', req.query.audience);
    }

    const videos = await query;
    res.json({ success: true, data: { videos } });
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
        'classes.name as class_name'
      )
      .where('videos.id', req.params.id)
      .first();

    if (!video) {
      return res.status(404).json({ success: false, message: 'ویدیو یافت نشد' });
    }

    // Increment views
    await db('videos').where('id', req.params.id).increment('views_count', 1);
    video.views_count += 1;

    res.json({ success: true, data: { video } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/videos — upload a new video (teacher only)
 * Accepts multipart: file (video/image), title, description, class_id, folder_name, category
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
      const userRole = (req.user?.role || 'teacher').toLowerCase();
      if (!['teacher', 'student', 'admin', 'manager'].includes(userRole)) {
        return res.status(403).json({ success: false, message: 'فقط کاربران مدرسه مجاز به بارگذاری هستند' });
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
      const currentUserId = req.user?.id || 'teacher-default';

      // Ensure custom folder is registered
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
        } catch (fErr) {}
      }

      await ensureTargetAudienceColumn();

      const videoData = {
        id,
        title: req.body.title || mainFile.originalname,
        description: req.body.description || '',
        class_id: req.body.class_id || null,
        teacher_id: currentUserId,
        folder_name: folderName,
        category: req.body.category || 'تدریس',
        target_audience: req.body.target_audience || 'all',
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
 * PUT /api/v1/videos/:id/audience — update target audience (teachers / students / parents / all)
 */
router.put('/:id/audience', async (req, res, next) => {
  try {
    await ensureTargetAudienceColumn();
    const { target_audience } = req.body;
    let query = db('videos').where('id', req.params.id);
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      query = query.where('teacher_id', req.user.id);
    }
    await query.update({ target_audience: target_audience || 'all' });
    res.json({ success: true, message: 'مخاطبان هدف ویدیو به‌روزرسانی شد' });
  } catch (err) {
    next(err);
  }
});


/**
 * DELETE /api/v1/videos/:id — delete a video (owner teacher or admin)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    let query = db('videos').where('id', req.params.id);
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      query = query.where('teacher_id', req.user.id);
    }
    const video = await query.first();
    if (!video) {
      return res.status(404).json({ success: false, message: 'ویدیو یافت نشد یا دسترسی ندارید' });
    }
    // Clean up files from disk if local
    if (video.file_url && video.file_url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '../../..', video.file_url);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {}
    }
    if (video.pdf_url && video.pdf_url.startsWith('/uploads/')) {
      const pdfPath = path.join(__dirname, '../../..', video.pdf_url);
      try {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      } catch (e) {}
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
    const currentUserId = req.user?.id || 'teacher-default';

    let video = await db('videos').where('id', req.params.id).first();
    if (!video) {
      // If video was local-only or mock, ensure target folder exists and return success
      if (cleanFolder !== 'عمومی') {
        try {
          const folderExists = await db('video_folders').where({ name: cleanFolder }).first();
          if (!folderExists) {
            await db('video_folders').insert({
              id: uuidv4(),
              name: cleanFolder,
              teacher_id: currentUserId,
              color: '#6366f1',
            });
          }
        } catch (fErr) {}
      }
      return res.json({
        success: true,
        message: `ویدیو با موفقیت به پوشه «${cleanFolder}» منتقل شد`,
        data: { video: { id: req.params.id, folder_name: cleanFolder } },
      });
    }

    // Ensure target folder exists in video_folders if not عمومی
    if (cleanFolder !== 'عمومی') {
      try {
        const folderExists = await db('video_folders')
          .where({ name: cleanFolder })
          .first();
        if (!folderExists) {
          await db('video_folders').insert({
            id: uuidv4(),
            name: cleanFolder,
            teacher_id: video.teacher_id || currentUserId,
            color: '#6366f1',
          });
        }
      } catch (fErr) {}
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
    let query = db('videos').where('id', req.params.id);
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      query = query.where('teacher_id', req.user.id);
    }
    const video = await query.first();
    if (!video) {
      return res.status(404).json({ success: false, message: 'ویدیو یافت نشد یا دسترسی ندارید' });
    }

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

    // Clean up old pdf if exists and different
    if (video.pdf_url && video.pdf_url.startsWith('/uploads/') && video.pdf_url !== pdfUrl) {
      const oldPath = path.join(__dirname, '../../..', video.pdf_url);
      try {
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch (e) {}
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
    let query = db('videos').where('id', req.params.id);
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      query = query.where('teacher_id', req.user.id);
    }
    const video = await query.first();
    if (!video) {
      return res.status(404).json({ success: false, message: 'ویدیو یافت نشد یا دسترسی ندارید' });
    }

    if (video.pdf_url && video.pdf_url.startsWith('/uploads/')) {
      const oldPath = path.join(__dirname, '../../..', video.pdf_url);
      try {
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch (e) {}
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

module.exports = router;

