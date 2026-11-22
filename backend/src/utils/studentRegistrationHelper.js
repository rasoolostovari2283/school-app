/**
 * Pure domain helpers for Student Registration validation & academic structure
 */

const STUDENT_EDUCATION_LEVELS = [
  'پیش دبستانی ۱',
  'پیش دبستانی ۲',
  'دبستان',
  'متوسطه اول',
  'متوسطه دوم',
];

const HIGH_SCHOOL_STUDENT_MAJORS = [
  'تجربی',
  'ریاضی',
  'علوم انسانی',
  'هنرستان',
  'کار دانش',
];

const GRADES_BY_EDUCATION_LEVEL = {
  'پیش دبستانی ۱': ['پیش دبستانی ۱'],
  'پیش دبستانی ۲': ['پیش دبستانی ۲'],
  'دبستان': ['پایه اول', 'پایه دوم', 'پایه سوم', 'پایه چهارم', 'پایه پنجم', 'پایه ششم'],
  'متوسطه اول': ['پایه هفتم', 'پایه هشتم', 'پایه نهم'],
  'متوسطه دوم': ['پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'],
};

function normalizePersianDigits(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

function normalizeEducationLevel(rawLevel) {
  const clean = String(rawLevel || '')
    .trim()
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ');

  if (!clean) return '';
  if (clean === 'پیش دبستانی 1' || clean === 'پیش دبستانی ۱') return 'پیش دبستانی ۱';
  if (clean === 'پیش دبستانی 2' || clean === 'پیش دبستانی ۲') return 'پیش دبستانی ۲';
  if (clean.includes('دبستان')) return 'دبستان';
  if (clean.includes('متوسطه اول') || clean.includes('راهنمایی')) return 'متوسطه اول';
  if (clean.includes('متوسطه دوم') || clean.includes('دبیرستان')) return 'متوسطه دوم';
  return clean;
}

function normalizeMajor(rawMajor) {
  const clean = String(rawMajor || '')
    .trim()
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ');
  if (!clean) return '';
  if (clean === 'کاردانش' || clean === 'کار دانش') return 'کار دانش';
  if (clean === 'ادبیات و علوم انسانی' || clean === 'انسانی' || clean === 'علوم انسانی') return 'علوم انسانی';
  if (clean === 'ریاضی و فیزیک' || clean === 'ریاضی') return 'ریاضی';
  if (clean === 'علوم تجربی' || clean === 'تجربی') return 'تجربی';
  if (clean.includes('هنرستان') || clean.includes('فنی')) return 'هنرستان';
  return clean;
}

function validateStudentAcademicInfo({ education_level, major = null, grade = null }) {
  const normalizedLevel = normalizeEducationLevel(education_level);
  if (!STUDENT_EDUCATION_LEVELS.includes(normalizedLevel)) {
    return {
      valid: false,
      error: 'مقطع تحصیلی معتبر نیست. لطفاً یکی از مقاطع پیش دبستانی ۱، پیش دبستانی ۲، دبستان، متوسطه اول یا متوسطه دوم را انتخاب کنید.',
    };
  }

  const allowedGrades = GRADES_BY_EDUCATION_LEVEL[normalizedLevel] || [];

  // Preschool levels map directly to their own grade
  if (normalizedLevel === 'پیش دبستانی ۱' || normalizedLevel === 'پیش دبستانی ۲') {
    return {
      valid: true,
      education_level: normalizedLevel,
      major: null,
      grade: normalizedLevel,
      departmentLabel: normalizedLevel,
    };
  }

  let normalizedMajor = null;
  if (normalizedLevel === 'متوسطه دوم') {
    normalizedMajor = normalizeMajor(major);
    if (!HIGH_SCHOOL_STUDENT_MAJORS.includes(normalizedMajor)) {
      return {
        valid: false,
        error: 'برای مقطع متوسطه دوم، انتخاب رشته تحصیلی (تجربی، ریاضی، علوم انسانی، هنرستان یا کار دانش) الزامی است.',
      };
    }
  }

  const cleanGrade = String(grade || '').trim();
  if (!allowedGrades.includes(cleanGrade)) {
    return {
      valid: false,
      error: `لطفاً پایه تحصیلی معتبر برای مقطع ${normalizedLevel} انتخاب کنید.`,
    };
  }

  const departmentLabel = normalizedMajor
    ? `${cleanGrade} - ${normalizedMajor}`
    : `${cleanGrade} (${normalizedLevel})`;

  return {
    valid: true,
    education_level: normalizedLevel,
    major: normalizedMajor,
    grade: cleanGrade,
    departmentLabel,
  };
}

module.exports = {
  STUDENT_EDUCATION_LEVELS,
  HIGH_SCHOOL_STUDENT_MAJORS,
  GRADES_BY_EDUCATION_LEVEL,
  normalizePersianDigits,
  normalizeEducationLevel,
  normalizeMajor,
  validateStudentAcademicInfo,
};
