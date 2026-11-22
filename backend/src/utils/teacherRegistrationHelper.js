/**
 * Pure domain helpers for Teacher Registration validation & multi-grade teaching rules
 */
const {
  STUDENT_EDUCATION_LEVELS,
  HIGH_SCHOOL_STUDENT_MAJORS,
  GRADES_BY_EDUCATION_LEVEL,
  normalizeEducationLevel,
  normalizeMajor,
} = require('./studentRegistrationHelper');

function toStringArray(input) {
  if (Array.isArray(input)) {
    return input.map((v) => String(v || '').trim()).filter(Boolean);
  }
  if (typeof input === 'string' && input.trim()) {
    const trimmed = input.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((v) => String(v || '').trim()).filter(Boolean);
        }
      } catch (_e) {}
    }
    return trimmed
      .split(/[،,]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function validateTeacherTeachingInfo({ education_level, majors = [], taught_grades = [] }) {
  const normalizedLevel = normalizeEducationLevel(education_level);
  if (!STUDENT_EDUCATION_LEVELS.includes(normalizedLevel)) {
    return {
      valid: false,
      error: 'مقطع تحصیلی تدریس معتبر نیست. لطفاً یکی از مقاطع پیش دبستانی ۱، پیش دبستانی ۲، دبستان، متوسطه اول یا متوسطه دوم را انتخاب کنید.',
    };
  }

  // Preschool levels map directly to their own grade
  if (normalizedLevel === 'پیش دبستانی ۱' || normalizedLevel === 'پیش دبستانی ۲') {
    return {
      valid: true,
      education_level: normalizedLevel,
      majors: [],
      taught_grades: [normalizedLevel],
      departmentLabel: `آموزگار ${normalizedLevel}`,
    };
  }

  const allowedGrades = GRADES_BY_EDUCATION_LEVEL[normalizedLevel] || [];
  const rawGrades = toStringArray(taught_grades);
  const uniqueValidGrades = [];
  const seenGrades = new Set();

  for (const g of rawGrades) {
    if (!allowedGrades.includes(g)) {
      return {
        valid: false,
        error: `پایه «${g}» با مقطع انتخاب‌شده (${normalizedLevel}) مطابقت ندارد.`,
      };
    }
    if (!seenGrades.has(g)) {
      seenGrades.add(g);
      uniqueValidGrades.push(g);
    }
  }

  if (uniqueValidGrades.length === 0) {
    return {
      valid: false,
      error: `لطفاً حداقل یک پایه تحصیلی برای تدریس در مقطع ${normalizedLevel} انتخاب کنید.`,
    };
  }

  let normalizedMajors = [];
  if (normalizedLevel === 'متوسطه دوم') {
    const rawMajors = toStringArray(majors);
    const seenMajors = new Set();
    for (const m of rawMajors) {
      const nm = normalizeMajor(m);
      if (HIGH_SCHOOL_STUDENT_MAJORS.includes(nm) && !seenMajors.has(nm)) {
        seenMajors.add(nm);
        normalizedMajors.push(nm);
      }
    }
  }

  const majorsSuffix = normalizedMajors.length > 0 ? ` (${normalizedMajors.join('، ')})` : '';
  const departmentLabel = `${normalizedLevel}${majorsSuffix} - ${uniqueValidGrades.join('، ')}`;

  return {
    valid: true,
    education_level: normalizedLevel,
    majors: normalizedMajors,
    taught_grades: uniqueValidGrades,
    departmentLabel,
  };
}

module.exports = {
  TEACHER_EDUCATION_LEVELS: STUDENT_EDUCATION_LEVELS,
  HIGH_SCHOOL_TEACHER_MAJORS: HIGH_SCHOOL_STUDENT_MAJORS,
  GRADES_BY_EDUCATION_LEVEL,
  validateTeacherTeachingInfo,
};
