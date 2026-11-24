const path = require('path');

const VALID_AUDIENCES = new Set([
  'all',
  'teachers',
  'students',
  'parents',
  'teacher_students',
]);

const ADMIN_ROLES = new Set(['admin', 'manager', 'principal', 'super_admin', 'school_admin']);

function normalizeVideoAudience(audience) {
  if (!audience || typeof audience !== 'string') return 'all';
  const normalized = audience.trim().toLowerCase();
  return VALID_AUDIENCES.has(normalized) ? normalized : 'all';
}

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function normalizeGrade(value) {
  if (!value || typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

function getEffectiveClassIds(entity, relationClassIds = null) {
  const ids = new Set();
  if (Array.isArray(relationClassIds)) {
    for (const id of relationClassIds) {
      if (id) ids.add(String(id));
    }
  }
  if (entity && entity.target_class_ids) {
    for (const id of parseJsonArray(entity.target_class_ids)) {
      ids.add(String(id));
    }
  }
  if (entity && entity.class_id) {
    ids.add(String(entity.class_id));
  }
  return Array.from(ids);
}

/**
 * Checks whether a user can access a specific video folder.
 * For students, if the folder targets specific DB classes, the student MUST be enrolled in at least one of them.
 */
function canUserAccessFolder(
  user,
  folder,
  { linkedTeacherIds = new Set(), enrolledClassIds = new Set(), studentGrades = new Set(), folderClassIds = null } = {}
) {
  if (!user || !folder) return false;
  const role = String(user.role || '').toLowerCase();

  if (ADMIN_ROLES.has(role)) return true;
  if (folder.teacher_id && String(folder.teacher_id) === String(user.id)) return true;

  if (role === 'teacher') {
    return false;
  }

  if (role === 'student') {
    const targetClasses = getEffectiveClassIds(folder, folderClassIds);
    if (targetClasses.length > 0) {
      return targetClasses.some((cid) => enrolledClassIds.has(String(cid)));
    }
    const folderGrade = normalizeGrade(folder.grade);
    if (folderGrade) {
      if (studentGrades.size > 0 && studentGrades.has(folderGrade)) return true;
      return false;
    }
    // Unrestricted folder: visible if from a linked teacher
    return Boolean(folder.teacher_id && linkedTeacherIds.has(String(folder.teacher_id)));
  }

  if (role === 'parent') {
    const targetClasses = getEffectiveClassIds(folder, folderClassIds);
    if (targetClasses.length > 0) {
      return targetClasses.some((cid) => enrolledClassIds.has(String(cid)));
    }
    return true;
  }

  return false;
}

/**
 * Checks whether a user can access a specific video.
 * Enforces DB-backed class selection for students so videos published for specific classes
 * appear automatically and exclusively for students enrolled in those classes.
 */
function canUserAccessVideo(
  user,
  video,
  {
    linkedTeacherIds = new Set(),
    enrolledClassIds = new Set(),
    studentGrades = new Set(),
    videoClassIds = null,
    folderClassIds = null,
  } = {}
) {
  if (!user || !video) return false;
  const role = String(user.role || '').toLowerCase();
  const audience = normalizeVideoAudience(video.target_audience);

  if (ADMIN_ROLES.has(role)) return true;
  if (video.teacher_id && String(video.teacher_id) === String(user.id)) return true;

  const isPublished = video.is_published !== false && video.is_published !== 0;

  if (role === 'teacher') {
    if (audience === 'teacher_students') return false;
    return audience === 'all' || audience === 'teachers' || audience === 'students';
  }

  if (role === 'student') {
    if (!isPublished) return false;
    if (audience === 'teachers' || audience === 'parents') return false;

    const directClasses = getEffectiveClassIds(video, videoClassIds);
    const inheritedFolderClasses = Array.isArray(folderClassIds) ? folderClassIds.map(String) : [];
    const effectiveClasses = directClasses.length > 0 ? directClasses : inheritedFolderClasses;

    // Priority 1: Explicit DB class selection (teacher chose specific classes from DB)
    if (effectiveClasses.length > 0) {
      return effectiveClasses.some((cid) => enrolledClassIds.has(String(cid)));
    }

    // Priority 2: Explicit grade targeting when no specific class IDs were selected
    const videoGrade = normalizeGrade(video.grade);
    if (videoGrade) {
      if (studentGrades.size > 0) {
        return studentGrades.has(videoGrade);
      }
      return false;
    }

    // Priority 3: Legacy audience fallback
    if (audience === 'teacher_students') {
      return Boolean(video.teacher_id && linkedTeacherIds.has(String(video.teacher_id)));
    }
    if (audience === 'all' || audience === 'students') {
      return true;
    }
    return false;
  }

  if (role === 'parent') {
    if (!isPublished) return false;
    return audience === 'all' || audience === 'parents';
  }

  return isPublished && audience === 'all';
}

function resolveSafeUploadPath(uploadsDir, rawFilename) {
  if (!uploadsDir || !rawFilename || typeof rawFilename !== 'string') return null;
  const baseDir = path.resolve(uploadsDir);
  const safeName = path.basename(rawFilename);
  if (!safeName || safeName === '.' || safeName === '..') return null;
  const resolved = path.resolve(baseDir, safeName);
  if (!resolved.startsWith(baseDir + path.sep)) return null;
  return resolved;
}

module.exports = {
  VALID_AUDIENCES,
  ADMIN_ROLES,
  normalizeVideoAudience,
  parseJsonArray,
  normalizeGrade,
  getEffectiveClassIds,
  canUserAccessFolder,
  canUserAccessVideo,
  resolveSafeUploadPath,
};
