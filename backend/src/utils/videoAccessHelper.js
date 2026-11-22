const path = require('path');

/**
 * Pure helper utilities for Smartboard video access control,
 * teacher-to-student visibility scoping, and safe upload path confinement.
 */

const VALID_AUDIENCES = new Set(['all', 'teachers', 'students', 'parents', 'teacher_students']);

function normalizeVideoAudience(audience) {
  const clean = String(audience || 'all').trim().toLowerCase();
  return VALID_AUDIENCES.has(clean) ? clean : 'all';
}

/**
 * Determines whether a given user (already verified to belong to the same school)
 * is allowed to view/stream a video record.
 */
function canUserAccessVideo(user, video, { linkedTeacherIds = new Set(), enrolledClassIds = new Set() } = {}) {
  if (!user || !video) return false;
  const role = String(user.role || '').toLowerCase();

  // Admins / managers in the same school and the video's owner can always view it
  if (['admin', 'manager', 'principal', 'super_admin'].includes(role)) return true;
  if (video.teacher_id && video.teacher_id === user.id) return true;

  const audience = normalizeVideoAudience(video.target_audience);

  if (role === 'teacher') {
    if (audience === 'teacher_students') return false;
    return audience === 'all' || audience === 'teachers' || audience === 'students';
  }

  if (role === 'student') {
    if (audience === 'teacher_students') {
      const linkedToTeacher = Boolean(video.teacher_id && linkedTeacherIds.has(video.teacher_id));
      const enrolledInClass = Boolean(video.class_id && enrolledClassIds.has(video.class_id));
      return linkedToTeacher || enrolledInClass;
    }
    if (audience === 'all' || audience === 'students') return true;
    if (video.class_id && enrolledClassIds.has(video.class_id) && video.is_published !== false && video.is_published !== 0) {
      return true;
    }
    return false;
  }

  if (role === 'parent') {
    return audience === 'all' || audience === 'parents';
  }

  return audience === 'all';
}

/**
 * Safely resolves an uploaded filename strictly inside the uploads root directory,
 * preventing any path traversal outside `uploadsDir`.
 */
function resolveSafeUploadPath(uploadsDir, rawFilename) {
  if (!uploadsDir || !rawFilename) return null;
  const baseDir = path.resolve(uploadsDir);
  const cleanName = path.basename(String(rawFilename).trim());
  if (!cleanName || cleanName === '.' || cleanName === '..') return null;
  const resolved = path.resolve(baseDir, cleanName);
  if (!resolved.startsWith(baseDir + path.sep)) return null;
  return resolved;
}

module.exports = {
  VALID_AUDIENCES,
  normalizeVideoAudience,
  canUserAccessVideo,
  resolveSafeUploadPath,
};
