const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../../config/database');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate);

const UPLOADS_DIR = path.resolve(__dirname, '../../../uploads/school_meetings');
const MAX_CHUNK_SIZE = 3 * 1024 * 1024;
const VALID_MEDIA_TYPES = new Set(['photo', 'video', 'file']);
const PRINCIPAL_ROLES = new Set(['admin', 'manager', 'principal', 'school_admin', 'super_admin']);
const ALLOWED_VIEW_ROLES = new Set([...PRINCIPAL_ROLES, 'teacher']);

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const genId = () => (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));

function isPrincipal(user) {
  return Boolean(user && PRINCIPAL_ROLES.has(String(user.role || '').toLowerCase()));
}

function canViewSchoolMeetings(user) {
  return Boolean(user && ALLOWED_VIEW_ROLES.has(String(user.role || '').toLowerCase()));
}

async function resolveUserSchoolId(user) {
  if (user?.school_id) return String(user.school_id);
  const dbUser = await db('users').where({ id: user.id }).first('school_id');
  if (dbUser?.school_id) return String(dbUser.school_id);

  // Fallback to teachers table if linked there
  const hasTeachers = await db.schema.hasTable('teachers');
  if (hasTeachers) {
    const tRow = await db('teachers').where({ user_id: user.id }).first('school_id');
    if (tRow?.school_id) return String(tRow.school_id);
  }
  return 'default_school';
}

function resolveSafeFilePath(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  const safeName = path.basename(fileUrl);
  if (!safeName || safeName === '.' || safeName === '..') return null;
  const fullPath = path.resolve(UPLOADS_DIR, safeName);
  if (!fullPath.startsWith(UPLOADS_DIR + path.sep)) return null;
  return fullPath;
}

function inferMediaType(requestedType, mimetype = '', filename = '') {
  const normalized = String(requestedType || '').trim().toLowerCase();
  if (VALID_MEDIA_TYPES.has(normalized)) return normalized;
  const mime = String(mimetype || '').toLowerCase();
  const ext = path.extname(filename || '').toLowerCase();
  if (mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return 'photo';
  if (mime.startsWith('video/') || ['.mp4', '.webm', '.mov', '.mkv', '.avi'].includes(ext)) return 'video';
  return 'file';
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    cb(null, `sm_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 600 * 1024 * 1024 }, // 600MB for recorded webinar videos
});

function requireAllowedRole(req, res, next) {
  if (!canViewSchoolMeetings(req.user)) {
    return res.status(403).json({ success: false, message: 'این بخش مخصوص مدیر و معلمان مدرسه است.' });
  }
  return next();
}

function requirePrincipal(req, res, next) {
  if (!isPrincipal(req.user)) {
    return res.status(403).json({ success: false, message: 'فقط مدیر مدرسه مجاز به انجام این عملیات است.' });
  }
  return next();
}

router.use(requireAllowedRole);

// ============================================================================
// 1. CATEGORIZED MEDIA & FILES (PHOTOS, VIDEOS, FILES) SCOPED BY SCHOOL_ID
// ============================================================================
router.get('/items', async (req, res, next) => {
  try {
    const schoolId = await resolveUserSchoolId(req.user);
    const { media_type: mediaType, category_group: categoryGroup, search } = req.query;

    let query = db('school_meeting_items')
      .leftJoin('users', 'school_meeting_items.uploaded_by', 'users.id')
      .where('school_meeting_items.school_id', schoolId)
      .select('school_meeting_items.*', 'users.display_name as uploader_name')
      .orderBy('school_meeting_items.created_at', 'desc');

    if (mediaType && VALID_MEDIA_TYPES.has(String(mediaType).toLowerCase())) {
      query = query.andWhere('school_meeting_items.media_type', String(mediaType).toLowerCase());
    }
    if (categoryGroup && categoryGroup !== 'all') {
      query = query.andWhere('school_meeting_items.category_group', String(categoryGroup));
    }

    const rows = await query;
    const searchLower = String(search || '').trim().toLowerCase();

    const items = rows
      .filter((item) => {
        if (!searchLower) return true;
        const hay = `${item.title || ''} ${item.description || ''} ${item.category_group || ''} ${item.file_name || ''}`.toLowerCase();
        return hay.includes(searchLower);
      })
      .map((item) => ({
        ...item,
        is_recording: Boolean(item.is_recording),
        stream_url: `/api/v1/school-meetings/items/${item.id}/stream`,
        download_url: `/api/v1/school-meetings/items/${item.id}/download`,
      }));

    // Return counts per group for badges
    const allCounts = await db('school_meeting_items')
      .where({ school_id: schoolId })
      .groupBy('media_type')
      .select('media_type')
      .count('* as total');

    const counts = { photo: 0, video: 0, file: 0 };
    for (const c of allCounts) {
      if (counts[c.media_type] !== undefined) counts[c.media_type] = Number(c.total || 0);
    }

    res.json({ success: true, data: { items, counts } });
  } catch (err) {
    next(err);
  }
});

router.post('/items', requirePrincipal, upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'انتخاب فایل الزامی است.' });
    }

    const schoolId = await resolveUserSchoolId(req.user);
    const mediaType = inferMediaType(req.body.media_type, file.mimetype, file.originalname);
    const title = String(
      req.body.title || path.basename(file.originalname || 'فایل', path.extname(file.originalname || ''))
    ).trim();
    const description = String(req.body.description || '').trim();
    const categoryGroup = String(req.body.category_group || 'عمومی').trim() || 'عمومی';
    const isRecording = req.body.is_recording === 'true' || req.body.is_recording === true;
    const webinarSessionId = req.body.webinar_session_id ? String(req.body.webinar_session_id).trim() : null;

    const id = genId();
    const fileUrl = `/uploads/school_meetings/${file.filename}`;

    await db('school_meeting_items').insert({
      id,
      school_id: schoolId,
      uploaded_by: req.user.id,
      media_type: mediaType,
      category_group: categoryGroup,
      title,
      description,
      file_url: fileUrl,
      file_name: file.originalname || file.filename,
      mimetype: file.mimetype || 'application/octet-stream',
      file_size: file.size || 0,
      is_recording: isRecording,
      webinar_session_id: webinarSessionId,
    });

    if (isRecording && webinarSessionId) {
      await db('school_webinar_sessions')
        .where({ id: webinarSessionId, school_id: schoolId })
        .update({ recording_item_id: id });
    }

    const created = await db('school_meeting_items')
      .leftJoin('users', 'school_meeting_items.uploaded_by', 'users.id')
      .where('school_meeting_items.id', id)
      .first('school_meeting_items.*', 'users.display_name as uploader_name');

    res.status(201).json({
      success: true,
      data: {
        item: {
          ...created,
          is_recording: Boolean(created.is_recording),
          stream_url: `/api/v1/school-meetings/items/${id}/stream`,
          download_url: `/api/v1/school-meetings/items/${id}/download`,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/items/:id/stream', async (req, res, next) => {
  try {
    const schoolId = await resolveUserSchoolId(req.user);
    const item = await db('school_meeting_items')
      .where({ id: req.params.id, school_id: schoolId })
      .first();

    if (!item) {
      return res.status(404).json({ success: false, message: 'مورد درخواستی یافت نشد.' });
    }

    const fullPath = resolveSafeFilePath(item.file_url);
    if (!fullPath || !fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'فایل روی سرور یافت نشد.' });
    }

    const stat = fs.statSync(fullPath);
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
        'Content-Type': item.mimetype || 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      });
      return fs.createReadStream(fullPath, { start, end }).pipe(res);
    }

    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': item.mimetype || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    });
    return fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    next(err);
  }
});

router.get('/items/:id/download', async (req, res, next) => {
  try {
    const schoolId = await resolveUserSchoolId(req.user);
    const item = await db('school_meeting_items')
      .where({ id: req.params.id, school_id: schoolId })
      .first();

    if (!item) {
      return res.status(404).json({ success: false, message: 'فایل یافت نشد.' });
    }

    const fullPath = resolveSafeFilePath(item.file_url);
    if (!fullPath || !fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'فایل روی سرور یافت نشد.' });
    }

    const ext = path.extname(item.file_name || item.file_url || '') || '';
    const downloadName = item.file_name || `${item.title || 'download'}${ext}`;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="file${ext}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`
    );
    res.setHeader('Content-Type', item.mimetype || 'application/octet-stream');
    return fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    next(err);
  }
});

router.delete('/items/:id', requirePrincipal, async (req, res, next) => {
  try {
    const schoolId = await resolveUserSchoolId(req.user);
    const item = await db('school_meeting_items')
      .where({ id: req.params.id, school_id: schoolId })
      .first();

    if (!item) {
      return res.status(404).json({ success: false, message: 'مورد یافت نشد.' });
    }

    const fullPath = resolveSafeFilePath(item.file_url);
    if (fullPath && fs.existsSync(fullPath)) {
      fs.unlink(fullPath, () => {});
    }

    await db('school_meeting_items').where({ id: item.id }).del();
    res.json({ success: true, message: 'با موفقیت حذف شد.' });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 2. NOTICE BOARD (تابلو اعلانات مدیر به معلمان مدرسه)
// ============================================================================
router.get('/notices', async (req, res, next) => {
  try {
    const schoolId = await resolveUserSchoolId(req.user);
    const notices = await db('school_meeting_notices')
      .leftJoin('users', 'school_meeting_notices.author_id', 'users.id')
      .where('school_meeting_notices.school_id', schoolId)
      .orderBy([
        { column: 'school_meeting_notices.is_pinned', order: 'desc' },
        { column: 'school_meeting_notices.created_at', order: 'desc' },
      ])
      .select('school_meeting_notices.*', 'users.display_name as author_name');

    res.json({
      success: true,
      data: {
        notices: notices.map((n) => ({ ...n, is_pinned: Boolean(n.is_pinned) })),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/notices', requirePrincipal, async (req, res, next) => {
  try {
    const content = String(req.body.content || '').trim();
    if (!content) {
      return res.status(400).json({ success: false, message: 'متن یادداشت تابلو اعلانات نمی‌تواند خالی باشد.' });
    }

    const schoolId = await resolveUserSchoolId(req.user);
    const title = String(req.body.title || '').trim() || null;
    const isPinned = Boolean(req.body.is_pinned);
    const id = genId();

    await db('school_meeting_notices').insert({
      id,
      school_id: schoolId,
      author_id: req.user.id,
      title,
      content,
      is_pinned: isPinned,
    });

    const created = await db('school_meeting_notices')
      .leftJoin('users', 'school_meeting_notices.author_id', 'users.id')
      .where('school_meeting_notices.id', id)
      .first('school_meeting_notices.*', 'users.display_name as author_name');

    const io = req.app.get('io');
    if (io) {
      io.to(`school_meetings_feed:${schoolId}`).emit('school_notice_updated');
    }

    res.status(201).json({
      success: true,
      data: { notice: { ...created, is_pinned: Boolean(created.is_pinned) } },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/notices/:id', requirePrincipal, async (req, res, next) => {
  try {
    const schoolId = await resolveUserSchoolId(req.user);
    const existing = await db('school_meeting_notices')
      .where({ id: req.params.id, school_id: schoolId })
      .first();

    if (!existing) {
      return res.status(404).json({ success: false, message: 'اعلان یافت نشد.' });
    }

    const updateData = { updated_at: db.fn.now() };
    if (req.body.title !== undefined) updateData.title = String(req.body.title || '').trim() || null;
    if (req.body.content !== undefined) {
      const c = String(req.body.content || '').trim();
      if (!c) return res.status(400).json({ success: false, message: 'متن اعلان الزامی است.' });
      updateData.content = c;
    }
    if (req.body.is_pinned !== undefined) updateData.is_pinned = Boolean(req.body.is_pinned);

    await db('school_meeting_notices').where({ id: existing.id }).update(updateData);

    const updated = await db('school_meeting_notices')
      .leftJoin('users', 'school_meeting_notices.author_id', 'users.id')
      .where('school_meeting_notices.id', existing.id)
      .first('school_meeting_notices.*', 'users.display_name as author_name');

    res.json({
      success: true,
      data: { notice: { ...updated, is_pinned: Boolean(updated.is_pinned) } },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/notices/:id', requirePrincipal, async (req, res, next) => {
  try {
    const schoolId = await resolveUserSchoolId(req.user);
    const deleted = await db('school_meeting_notices')
      .where({ id: req.params.id, school_id: schoolId })
      .del();

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'اعلان یافت نشد.' });
    }
    res.json({ success: true, message: 'اعلان حذف شد.' });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 3. LIVE WEBINAR ROOM SESSIONS (اتاق وبینار زنده مدرسه)
// ============================================================================
router.get('/webinar/active', async (req, res, next) => {
  try {
    const schoolId = await resolveUserSchoolId(req.user);
    const activeSession = await db('school_webinar_sessions')
      .leftJoin('users', 'school_webinar_sessions.host_id', 'users.id')
      .where({ 'school_webinar_sessions.school_id': schoolId, 'school_webinar_sessions.status': 'live' })
      .orderBy('school_webinar_sessions.started_at', 'desc')
      .first('school_webinar_sessions.*', 'users.display_name as host_name');

    res.json({
      success: true,
      data: {
        school_id: schoolId,
        active_session: activeSession || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/webinar/start', requirePrincipal, async (req, res, next) => {
  try {
    const schoolId = await resolveUserSchoolId(req.user);
    const title = String(req.body.title || 'جلسه وبینار زنده مدرسه').trim();

    // Reuse existing live session if already active for this school
    const existing = await db('school_webinar_sessions')
      .leftJoin('users', 'school_webinar_sessions.host_id', 'users.id')
      .where({ 'school_webinar_sessions.school_id': schoolId, 'school_webinar_sessions.status': 'live' })
      .first('school_webinar_sessions.*', 'users.display_name as host_name');

    if (existing) {
      return res.json({ success: true, data: { session: existing, reused: true } });
    }

    const id = genId();
    await db('school_webinar_sessions').insert({
      id,
      school_id: schoolId,
      host_id: req.user.id,
      title,
      status: 'live',
    });

    const session = await db('school_webinar_sessions')
      .leftJoin('users', 'school_webinar_sessions.host_id', 'users.id')
      .where('school_webinar_sessions.id', id)
      .first('school_webinar_sessions.*', 'users.display_name as host_name');

    const io = req.app.get('io');
    if (io) {
      io.to(`school_meetings_feed:${schoolId}`).emit('school_webinar_started', { session });
    }

    res.status(201).json({ success: true, data: { session, reused: false } });
  } catch (err) {
    next(err);
  }
});

router.post('/webinar/:id/end', requirePrincipal, async (req, res, next) => {
  try {
    const schoolId = await resolveUserSchoolId(req.user);
    const session = await db('school_webinar_sessions')
      .where({ id: req.params.id, school_id: schoolId })
      .first();

    if (!session) {
      return res.status(404).json({ success: false, message: 'جلسه وبینار یافت نشد.' });
    }

    await db('school_webinar_sessions')
      .where({ id: session.id })
      .update({ status: 'ended', ended_at: db.fn.now() });

    const io = req.app.get('io');
    if (io) {
      io.to(`school_webinar:${schoolId}`).emit('school_webinar_ended', { sessionId: session.id });
      io.to(`school_meetings_feed:${schoolId}`).emit('school_webinar_ended', { sessionId: session.id });
    }

    res.json({ success: true, message: 'جلسه وبینار زنده پایان یافت.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
