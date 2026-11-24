/**
 * Helper to generate smart, memorable usernames / IDs based on Persian Full Names
 * e.g., 'علی کیانی' -> 'ali_kiani'
 */

const nameDictionary = {
  'علی': 'ali', 'محمد': 'mohammad', 'رضا': 'reza', 'امیر': 'amir', 'حسین': 'hossein',
  'امیرحسین': 'amirhossein', 'علیرضا': 'alireza', 'محمدرضا': 'mohammadreza',
  'مهدی': 'mehdi', 'حسن': 'hassan', 'احمد': 'ahmad', 'پارسا': 'parsa', 'کیان': 'kian',
  'سارا': 'sara', 'فاطمه': 'fatemeh', 'زهرا': 'zahra', 'مریم': 'maryam', 'مسعود': 'masoud',
  'نیما': 'nima', 'سینا': 'sina', 'آرش': 'arash', 'پوریا': 'pouria', 'امید': 'omid',
  'نوید': 'navid', 'پرهام': 'parham', 'سامان': 'saman', 'بهرام': 'bahram', 'کوروش': 'kourosh',
  'داریوش': 'dariush', 'فرزاد': 'farzad', 'فرهاد': 'farhad', 'شاهین': 'shahin', 'مانی': 'mani',
  'حسینی': 'hosseini', 'احمدی': 'ahmadi', 'کیانی': 'kiani', 'سعیدی': 'saeedi', 'صادقی': 'sadeghi',
  'تقوی': 'taghavi', 'میرزایی': 'mirzaei', 'اکبری': 'akbari', 'جلالی': 'jalali', 'رحمانی': 'rahmani',
  'کریمی': 'karimi', 'رضایی': 'rezaei', 'محمدی': 'mohammadi', 'موسوی': 'mousavi', 'نوری': 'nouri',
  'سهرابی': 'sohrabi', 'طاهری': 'taheri', 'کاظمی': 'kazemi', 'حیدری': 'heidari', 'جعفری': 'jafari',
  'مرادی': 'moradi', 'باقری': 'bagheri', 'ابراهیمی': 'ebrahimi', 'صالحی': 'salehi', 'نجفی': 'najafi'
};

const charMap = {
  'ا': 'a', 'آ': 'a', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ث': 's', 'ج': 'j', 'چ': 'ch',
  'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'ژ': 'zh', 'س': 's',
  'ش': 'sh', 'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f',
  'ق': 'gh', 'ک': 'k', 'گ': 'g', 'ل': 'l', 'م': 'm', 'ن': 'n', 'و': 'v', 'ه': 'h',
  'ی': 'i', 'ئ': 'y', 'ي': 'i', 'ك': 'k', 'ة': 'h'
};

function transliterateWord(word) {
  const cleanWord = word.trim().replace(/[ًٌٍَُِّْ]/g, ''); // Remove vowels/tanwin
  if (nameDictionary[cleanWord]) return nameDictionary[cleanWord];
  
  let res = '';
  for (let i = 0; i < cleanWord.length; i++) {
    const c = cleanWord[i];
    if (charMap[c] !== undefined) res += charMap[c];
    else if (/[a-z0-9]/i.test(c)) res += c.toLowerCase();
  }
  return res;
}

function generateBaseUsername(displayName) {
  if (!displayName || typeof displayName !== 'string') return 'user';
  
  let cleaned = displayName
    .replace(/(دکتر|مهندس|استاد|سرکار|خانم|آقای|سید|سیده)\s*/gi, '')
    .trim();

  // If user already typed english name or username
  if (/^[a-zA-Z0-9_\-\.]+$/.test(cleaned)) {
    return cleaned.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  const latinWords = words.map(transliterateWord).filter(Boolean);
  let base = latinWords.join('_').toLowerCase();
  base = base.replace(/[^a-z0-9_]/g, '').replace(/^_+|_+$/g, '');
  return base || 'user';
}

/**
 * Determine whether a school level corresponds to High School (متوسطه دوم)
 * where study majors (رشته‌های تحصیلی) apply.
 */
function isHighSchoolLevel(schoolLevel) {
  if (!schoolLevel || typeof schoolLevel !== 'string') return false;
  const normalized = schoolLevel.trim().toLowerCase();
  return (
    normalized.includes('متوسطه دوم') ||
    normalized.includes('دوره دوم متوسطه') ||
    normalized.includes('دبیرستان') ||
    normalized.includes('high') ||
    normalized.includes('هنرستان') ||
    normalized.includes('مجتمع آموزشی')
  );
}

/**
 * Normalize majors list (array or comma-separated string) into deduplicated Persian labels.
 * Only retains majors when the school level supports majors (متوسطه دوم / دبیرستان / هنرستان / مجتمع).
 */
function normalizeMajors(majors, schoolLevel) {
  if (!isHighSchoolLevel(schoolLevel)) {
    return [];
  }

  let rawList = [];
  if (Array.isArray(majors)) {
    rawList = majors;
  } else if (typeof majors === 'string' && majors.trim()) {
    const trimmed = majors.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) rawList = parsed;
      } catch (_e) {
        rawList = trimmed.split(/[،,]+/);
      }
    } else {
      rawList = trimmed.split(/[،,]+/);
    }
  }

  const seen = new Set();
  const result = [];
  for (const item of rawList) {
    const clean = String(item || '').trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      result.push(clean);
    }
  }
  return result;
}

/**
 * Check if a username is already taken in users.username, schools.username, or students.username (case-insensitive)
 */
async function isUsernameTaken(db, candidate, { excludeUserId = null, excludeSchoolId = null } = {}) {
  const lower = String(candidate || '').trim().toLowerCase();
  if (!lower) return true;

  let userQuery = db('users').whereRaw('LOWER(username) = ?', [lower]);
  if (excludeUserId) {
    userQuery = userQuery.andWhere('id', '!=', excludeUserId);
  }
  const userExists = await userQuery.first();
  if (userExists) return true;

  try {
    let schoolQuery = db('schools').whereRaw('LOWER(username) = ?', [lower]);
    if (excludeSchoolId) {
      schoolQuery = schoolQuery.andWhere('id', '!=', excludeSchoolId);
    }
    const schoolExists = await schoolQuery.first();
    if (schoolExists) return true;
  } catch (_e) {
    // Ignore if schools.username column has not been migrated yet
  }

  try {
    let studentQuery = db('students').whereRaw('LOWER(username) = ?', [lower]);
    if (excludeUserId) {
      studentQuery = studentQuery.andWhere('user_id', '!=', excludeUserId);
    }
    const studentExists = await studentQuery.first();
    if (studentExists) return true;
  } catch (_e) {
    // Ignore if students table has not been migrated yet
  }

  try {
    let teacherQuery = db('teachers').whereRaw('LOWER(username) = ?', [lower]);
    if (excludeUserId) {
      teacherQuery = teacherQuery.andWhere('user_id', '!=', excludeUserId);
    }
    const teacherExists = await teacherQuery.first();
    if (teacherExists) return true;
  } catch (_e) {
    // Ignore if teachers table has not been migrated yet
  }

  try {
    let parentQuery = db('parents').whereRaw('LOWER(username) = ?', [lower]);
    if (excludeUserId) {
      parentQuery = parentQuery.andWhere('user_id', '!=', excludeUserId);
    }
    const parentExists = await parentQuery.first();
    if (parentExists) return true;
  } catch (_e) {
    // Ignore if parents table has not been migrated yet
  }

  return false;
}

/**
 * Generate a guaranteed unique username across both users and schools tables
 */
async function generateUniqueUsername(db, displayName, excludeUserId = null) {
  const base = generateBaseUsername(displayName);
  let candidate = base;
  let counter = 1;

  while (true) {
    const taken = await isUsernameTaken(db, candidate, { excludeUserId });
    if (!taken) {
      return candidate;
    }
    counter++;
    candidate = `${base}_${counter}`;
  }
}

/**
 * Generate a guaranteed unique personal username for a school registrant (stored in both schools & users)
 * Prefers personal transliterated adminName, falling back to schoolName.
 */
async function generateUniqueSchoolUsername(db, adminName, schoolName = '', excludeSchoolId = null) {
  const adminBase = generateBaseUsername(adminName);
  const schoolBase = generateBaseUsername(schoolName);

  let base = adminBase && adminBase !== 'user' ? adminBase : schoolBase;
  if (!base || base === 'user') {
    base = 'school_admin';
  }
  // Keep readable length (min 3 chars, max 32 chars before suffix)
  if (base.length < 3) {
    base = `${base}_sch`;
  }
  base = base.slice(0, 32).replace(/_+$/, '') || 'school_admin';

  let candidate = base;
  let counter = 1;

  while (true) {
    const taken = await isUsernameTaken(db, candidate, { excludeSchoolId });
    if (!taken) {
      return candidate;
    }
    counter++;
    candidate = `${base}_${counter}`;
  }
}

/**
 * Ensures a user record has a unique username, generating and persisting one if missing
 */
async function ensureUserHasUsername(userOrId, dbInstance = null) {
  const database = dbInstance || require('../config/database');
  const user =
    typeof userOrId === 'object' && userOrId !== null
      ? userOrId
      : await database('users').where({ id: userOrId }).first();

  if (!user) return 'user';
  if (user.username && String(user.username).trim()) {
    return String(user.username).trim();
  }

  const generated = await generateUniqueUsername(
    database,
    user.display_name || user.email || 'user',
    user.id
  );
  await database('users').where({ id: user.id }).update({ username: generated });
  return generated;
}

module.exports = {
  generateBaseUsername,
  generateUniqueUsername,
  generateUniqueSchoolUsername,
  isHighSchoolLevel,
  normalizeMajors,
  ensureUserHasUsername,
};

