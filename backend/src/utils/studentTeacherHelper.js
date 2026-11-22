/**
 * Pure domain helpers for:
 *  - Student <-> Teacher class roster grouping (by grade, major, teacher)
 *  - Group handle normalization & invite link/code parsing
 *  - Safe media attachment validation & classification (image / video / audio / file)
 */

const PERSIAN_TO_LATIN = {
  'ا': 'a', 'آ': 'a', 'أ': 'a', 'إ': 'e', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ث': 's',
  'ج': 'j', 'چ': 'ch', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z',
  'ژ': 'zh', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': 'a',
  'غ': 'gh', 'ف': 'f', 'ق': 'gh', 'ک': 'k', 'ك': 'k', 'گ': 'g', 'ل': 'l', 'م': 'm',
  'ن': 'n', 'و': 'v', 'ه': 'h', 'ة': 'h', 'ی': 'y', 'ي': 'y', 'ئ': 'y',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

function transliterateSlug(text) {
  const raw = String(text || '').trim();
  let out = '';
  for (const ch of raw) {
    if (PERSIAN_TO_LATIN[ch]) {
      out += PERSIAN_TO_LATIN[ch];
    } else if (/[a-zA-Z0-9_]/.test(ch)) {
      out += ch.toLowerCase();
    } else if (/[\s\-./]/.test(ch)) {
      out += '_';
    }
  }
  return out.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Builds a clear, deterministic Persian class title organized by grade, major, and teacher.
 */
function buildAutoClassTitle({ grade, major, teacherName }) {
  const cleanGrade = String(grade || '').trim() || 'عمومی';
  const cleanMajor = String(major || '').trim();
  const cleanTeacher = String(teacherName || '').trim();

  const parts = [`کلاس ${cleanGrade}`];
  if (cleanMajor && !cleanGrade.includes(cleanMajor)) {
    parts.push(`رشته ${cleanMajor}`);
  }
  if (cleanTeacher) {
    parts.push(`(${cleanTeacher})`);
  }
  return parts.join(' — ');
}

/**
 * Normalizes a requested or auto-generated group handle (without leading '@').
 * Always returns a lowercase [a-z0-9_] slug between 3 and 40 chars.
 */
function normalizeGroupHandle(requestedHandle, fallbackName = '', randomSuffix = '') {
  const baseSource = String(requestedHandle || '').trim().replace(/^@+/, '');
  let slug = transliterateSlug(baseSource);

  if (!slug) {
    const nameSlug = transliterateSlug(fallbackName).slice(0, 20);
    const suffix = transliterateSlug(randomSuffix) || 'group';
    slug = nameSlug ? `grp_${nameSlug}_${suffix}` : `grp_${suffix}`;
  }

  if (slug.length < 3) {
    slug = `grp_${slug || 'chat'}`;
  }
  return slug.slice(0, 40).replace(/_+$/, '') || 'grp_chat';
}

/**
 * Extracts a lookup token from an invite URL (?joinGroup=..., /join/...), @handle, or raw code.
 */
function extractGroupJoinToken(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) return { raw: '', code: '', handle: '' };

  let extracted = raw;

  try {
    if (/^https?:\/\//i.test(raw) || raw.includes('?')) {
      const urlObj = new URL(raw.startsWith('http') ? raw : `https://educonnect.local/${raw.replace(/^\/+/, '')}`);
      const qJoin = urlObj.searchParams.get('joinGroup') || urlObj.searchParams.get('code') || urlObj.searchParams.get('handle');
      if (qJoin && qJoin.trim()) {
        extracted = qJoin.trim();
      } else if (urlObj.pathname.includes('/join/')) {
        extracted = urlObj.pathname.split('/join/').pop().replace(/\/+$/, '').trim();
      }
    } else if (raw.includes('/join/')) {
      extracted = raw.split('/join/').pop().split(/[?#]/)[0].replace(/\/+$/, '').trim();
    }
  } catch {
    if (raw.includes('/join/')) {
      extracted = raw.split('/join/').pop().split(/[?#]/)[0].replace(/\/+$/, '').trim();
    }
  }

  const withoutAt = extracted.replace(/^@+/, '').trim();
  return {
    raw,
    code: withoutAt.toUpperCase(),
    handle: withoutAt.toLowerCase(),
  };
}

/**
 * Detects whether an attachment is an image, video, audio/voice, or generic file.
 */
function detectAttachmentMediaType(att) {
  if (!att || typeof att !== 'object') return 'file';
  const mime = String(att.mimetype || att.type || '').toLowerCase();
  const nameOrUrl = String(att.originalname || att.name || att.url || '').toLowerCase();

  // Check explicit MIME type first so audio/webm voice recordings are never misclassified as video
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';

  if (nameOrUrl.includes('voice_note')) return 'audio';
  if (/\.(png|jpe?g|gif|webp|bmp|heic|avif)(\?|$)/i.test(nameOrUrl)) return 'image';
  if (/\.(mp3|wav|ogg|m4a|aac|opus|flac)(\?|$)/i.test(nameOrUrl)) return 'audio';
  if (/\.(mp4|webm|mov|m4v|avi|mkv|ogv)(\?|$)/i.test(nameOrUrl)) return 'video';
  return 'file';
}

/**
 * Validates and sanitizes an attachment list before persisting to DB.
 * Only permits safe relative `/uploads/...` URLs (prevents javascript:, data:, or arbitrary external SSRF/phishing links).
 */
function sanitizeMessageAttachments(rawAttachments) {
  if (!rawAttachments) return [];
  let list = rawAttachments;
  if (typeof rawAttachments === 'string') {
    try {
      list = JSON.parse(rawAttachments);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];

  const sanitized = [];
  for (const item of list.slice(0, 10)) {
    if (!item || typeof item !== 'object') continue;
    const rawUrl = String(item.url || '').trim();
    // Strip localhost:5000 origin if legacy client sent absolute local URL
    const normalizedUrl = rawUrl.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, '');
    // Strictly allow relative /uploads/<safe-filename> only (no path traversal, no javascript:, no external hosts)
    if (!/^\/uploads\/[a-zA-Z0-9._\-]+$/.test(normalizedUrl)) {
      const err = new Error('آدرس فایل پیوست نامعتبر است. لطفاً فایل را از طریق سامانه بارگذاری کنید.');
      err.statusCode = 400;
      throw err;
    }

    let thumbUrl = normalizedUrl;
    if (item.thumb_url && typeof item.thumb_url === 'string') {
      const normThumb = item.thumb_url.trim().replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, '');
      if (/^\/uploads\/[a-zA-Z0-9._\-]+$/.test(normThumb)) {
        thumbUrl = normThumb;
      }
    }

    const mediaType = detectAttachmentMediaType({ ...item, url: normalizedUrl });
    sanitized.push({
      url: normalizedUrl,
      thumb_url: thumbUrl,
      originalname: String(item.originalname || item.name || 'فایل پیوست').slice(0, 200),
      mimetype: String(item.mimetype || item.type || 'application/octet-stream').slice(0, 120),
      size: Number.isFinite(Number(item.size)) ? Math.max(0, Number(item.size)) : 0,
      media_type: mediaType,
    });
  }
  return sanitized;
}

/**
 * Produces a concise Persian preview label for a media-only message (for conversation list & notifications).
 */
function getMessagePreviewLabel(content, attachments = []) {
  const clean = String(content || '').trim();
  if (clean) return clean;
  if (!Array.isArray(attachments) || attachments.length === 0) return '';
  const firstType = detectAttachmentMediaType(attachments[0]);
  if (firstType === 'image') return '🖼️ تصویر';
  if (firstType === 'video') return '🎬 ویدیو';
  if (firstType === 'audio') return '🎙️ پیام صوتی (ویس)';
  return '📎 فایل پیوست';
}

module.exports = {
  transliterateSlug,
  buildAutoClassTitle,
  normalizeGroupHandle,
  extractGroupJoinToken,
  detectAttachmentMediaType,
  sanitizeMessageAttachments,
  getMessagePreviewLabel,
};
