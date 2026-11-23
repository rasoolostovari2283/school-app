const { normalizePersianSearch } = require('./classRosterHelper');

/**
 * Pure helper utilities for Manual Class Creation + Score Entry & Student Autocomplete
 * in the Teacher Gradebook («کارنامه‌ها / دفتر نمرات کلاس»).
 */

function parseScoreValue(rawVal, maxScore = 20) {
  if (rawVal === null || rawVal === undefined || String(rawVal).trim() === '') {
    return { valid: true, isEmpty: true, value: null };
  }

  const normalized = String(rawVal)
    .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
    .replace(/[/,،]/g, '.')
    .trim();

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return { valid: false, isEmpty: false, value: null, error: 'فرمت نمره نامعتبر است' };
  }

  const num = parseFloat(normalized);
  if (Number.isNaN(num) || num < 0 || num > maxScore) {
    return {
      valid: false,
      isEmpty: false,
      value: null,
      error: `نمره باید عددی بین ۰ تا ${maxScore} باشد`,
    };
  }

  return { valid: true, isEmpty: false, value: Math.round(num * 100) / 100 };
}

/**
 * Ranks registered school students for real-time autocomplete suggestions
 * as the teacher types a student name, @username, or student code.
 */
function rankStudentSuggestions(students, rawQuery = '', limit = 15) {
  const list = Array.isArray(students) ? students : [];
  const q = normalizePersianSearch(rawQuery);
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 15));

  if (!q) {
    return [...list]
      .sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || ''), 'fa'))
      .slice(0, safeLimit);
  }

  const scored = [];
  for (const st of list) {
    const name = normalizePersianSearch(st.display_name || '');
    const username = normalizePersianSearch(st.username || '');
    const code = normalizePersianSearch(st.student_code || '');

    let rank = -1;
    if (name === q || username === q || code === q) {
      rank = 0; // exact match
    } else if (name.startsWith(q) || username.startsWith(q) || code.startsWith(q)) {
      rank = 1; // prefix match
    } else if (name.split(' ').some((part) => part.startsWith(q))) {
      rank = 2; // word-start match (e.g. family name)
    } else if (name.includes(q) || username.includes(q) || code.includes(q)) {
      rank = 3; // substring match
    }

    if (rank >= 0) {
      scored.push({ st, rank });
    }
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return String(a.st.display_name || '').localeCompare(String(b.st.display_name || ''), 'fa');
  });

  return scored.slice(0, safeLimit).map((item) => item.st);
}

/**
 * Validates payload for creating a manual class with DB-linked students and initial scores.
 */
function validateManualClassPayload(payload = {}) {
  const name = String(payload.name || '').trim();
  const grade = String(payload.grade || '').trim() || 'پایه دهم';
  const subject = String(payload.subject || '').trim() || 'عمومی';
  const categoryTitle = String(payload.category_title || '').trim() || 'نمره مستمر و کارنامه';
  const parsedMax = parseFloat(payload.max_score);
  const maxScore = !Number.isNaN(parsedMax) && parsedMax > 0 && parsedMax <= 100 ? parsedMax : 20;

  if (!name || name.length < 2) {
    return { valid: false, error: 'لطفاً نام کلاس را وارد کنید (حداقل ۲ کاراکتر)' };
  }

  const rawEntries = Array.isArray(payload.entries) ? payload.entries : [];
  const seenIds = new Set();
  const normalizedEntries = [];

  for (let i = 0; i < rawEntries.length; i += 1) {
    const item = rawEntries[i] || {};
    const studentId = String(item.student_id || '').trim();
    if (!studentId) {
      return {
        valid: false,
        error: `ردیف ${i + 1}: لطفاً دانش‌آموز را از لیست پیشنهادی دیتابیس انتخاب کنید تا اتصال به پنل او برقرار شود`,
      };
    }
    if (seenIds.has(studentId)) continue;
    seenIds.add(studentId);

    const scoreCheck = parseScoreValue(item.score, maxScore);
    if (!scoreCheck.valid) {
      return {
        valid: false,
        error: `ردیف ${i + 1}: ${scoreCheck.error}`,
      };
    }

    normalizedEntries.push({
      student_id: studentId,
      score: scoreCheck.value,
      teacher_comment: String(item.teacher_comment || '').trim().slice(0, 300),
    });
  }

  return {
    valid: true,
    data: {
      name,
      grade,
      subject,
      category_title: categoryTitle,
      max_score: maxScore,
      entries: normalizedEntries,
    },
  };
}

const REPORT_CARD_STATUS_OPTIONS = [
  'قبول',
  'مردود',
  'خیلی خوب',
  'خوب',
  'قابل قبول',
  'نیازمند تلاش بیشتر',
];

const POSITIVE_REPORT_STATUSES = new Set(['قبول', 'خیلی خوب', 'خوب', 'قابل قبول']);
const NEGATIVE_REPORT_STATUSES = new Set(['مردود', 'نیازمند تلاش بیشتر', 'نیاز به تلاش']);

/**
 * Returns a strict numeric sort rank from smallest grade (پیش‌دبستانی ۱)
 * to largest grade (پایه دوازدهم) so classes are ordered ascending by grade.
 */
function getGradeSortOrder(rawGrade) {
  const normalized = normalizePersianSearch(rawGrade || '');
  if (!normalized) return 999;

  if (normalized.includes('پیشدبستانی') || normalized.includes('پیش دبستانی')) {
    if (normalized.includes('2') || normalized.includes('دوم')) return 0.5;
    return 0;
  }

  const orderedPatterns = [
    { rank: 12, terms: ['دوازدهم', '12'] },
    { rank: 11, terms: ['یازدهم', '11'] },
    { rank: 10, terms: ['دهم', '10'] },
    { rank: 9, terms: ['نهم', '9'] },
    { rank: 8, terms: ['هشتم', '8'] },
    { rank: 7, terms: ['هفتم', '7'] },
    { rank: 6, terms: ['ششم', '6'] },
    { rank: 5, terms: ['پنجم', '5'] },
    { rank: 4, terms: ['چهارم', '4'] },
    { rank: 3, terms: ['سوم', '3'] },
    { rank: 2, terms: ['دوم', '2'] },
    { rank: 1, terms: ['اول', '1'] },
  ];

  for (const item of orderedPatterns) {
    if (item.terms.some((t) => normalized.includes(t))) {
      return item.rank;
    }
  }

  if (normalized.includes('عمومی')) return 100;
  return 200;
}

/**
 * Sorts class records strictly from smallest grade to largest grade,
 * breaking ties alphabetically in Persian by class name.
 */
function sortClassesByGradeAscending(classesList) {
  const list = Array.isArray(classesList) ? [...classesList] : [];
  return list.sort((a, b) => {
    const rankA = getGradeSortOrder(a?.grade);
    const rankB = getGradeSortOrder(b?.grade);
    if (rankA !== rankB) return rankA - rankB;
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'fa');
  });
}

/**
 * Auto-calculates arithmetic average (rounded to 2 decimals) from any entered
 * subset of continuous_score, midterm_score, and final_score.
 */
function computeThreePartAverage({ continuous_score, midterm_score, final_score } = {}) {
  const nums = [continuous_score, midterm_score, final_score]
    .filter((v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v)))
    .map((v) => Number(v));

  if (nums.length === 0) return null;
  const sum = nums.reduce((acc, n) => acc + n, 0);
  return Math.round((sum / nums.length) * 100) / 100;
}

/**
 * Validates that a teacher-selected status is either empty or strictly
 * one of the 6 allowed Persian report card statuses.
 */
function validateReportStatus(rawStatus) {
  if (rawStatus === null || rawStatus === undefined) {
    return { valid: true, value: null };
  }
  const trimmed = String(rawStatus).trim();
  if (!trimmed) {
    return { valid: true, value: null };
  }
  if (!REPORT_CARD_STATUS_OPTIONS.includes(trimmed)) {
    return {
      valid: false,
      value: null,
      error: `وضعیت نامعتبر است. گزینه‌های مجاز: ${REPORT_CARD_STATUS_OPTIONS.join('، ')}`,
    };
  }
  return { valid: true, value: trimmed };
}

/**
 * Computes the 4 required class grade statistics:
 *   1. total_students (تعداد دانش‌آموزان)
 *   2. class_average (میانگین نمرات کلاس)
 *   3. highest_score (بالاترین نمره کلاس)
 *   4. pass_rate (درصد قبولی کلاس)
 */
function computeClassGradeStats(rawScores = [], { totalStudents = null, passThreshold = 12 } = {}) {
  const validScores = (Array.isArray(rawScores) ? rawScores : [])
    .filter((v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v)))
    .map((v) => Number(v));

  const studentCount = totalStudents != null ? Number(totalStudents) : (Array.isArray(rawScores) ? rawScores.length : 0);
  if (validScores.length === 0) {
    return {
      total_students: studentCount,
      graded_count: 0,
      class_average: null,
      highest_score: null,
      pass_rate: 0,
    };
  }

  const sum = validScores.reduce((acc, n) => acc + n, 0);
  const avg = Math.round((sum / validScores.length) * 100) / 100;
  const highest = Math.round(Math.max(...validScores) * 100) / 100;
  const passedCount = validScores.filter((n) => n >= passThreshold).length;
  const passRate = Math.round((passedCount / validScores.length) * 100);

  return {
    total_students: studentCount,
    graded_count: validScores.length,
    class_average: avg,
    highest_score: highest,
    pass_rate: passRate,
  };
}

module.exports = {
  REPORT_CARD_STATUS_OPTIONS,
  POSITIVE_REPORT_STATUSES,
  NEGATIVE_REPORT_STATUSES,
  parseScoreValue,
  rankStudentSuggestions,
  validateManualClassPayload,
  getGradeSortOrder,
  sortClassesByGradeAscending,
  computeThreePartAverage,
  validateReportStatus,
  computeClassGradeStats,
};
