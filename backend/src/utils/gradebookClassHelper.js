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

module.exports = {
  parseScoreValue,
  rankStudentSuggestions,
  validateManualClassPayload,
};
