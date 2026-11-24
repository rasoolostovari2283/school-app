/**
 * Pure helper utilities for Class Roster student search and group snapshot building.
 */

function normalizePersianSearch(input) {
  if (!input) return '';
  return String(input)
    .trim()
    .replace(/^@+/, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function matchSchoolStudent(student, rawQuery) {
  const q = normalizePersianSearch(rawQuery);
  if (!q) return true;

  const fields = [
    student?.display_name,
    student?.username,
    student?.student_code,
    student?.grade,
    student?.student_grade,
    student?.major,
    student?.student_major,
  ];

  return fields.some((field) => {
    const normalized = normalizePersianSearch(field);
    return normalized.length > 0 && normalized.includes(q);
  });
}

function isExactStudentMatch(student, rawQuery) {
  const q = normalizePersianSearch(rawQuery);
  if (!q) return false;
  const name = normalizePersianSearch(student?.display_name);
  const username = normalizePersianSearch(student?.username);
  const code = normalizePersianSearch(student?.student_code);
  return (username && username === q) || (name && name === q) || (code && code === q);
}

function buildRosterGroupSnapshot(cls, enrolledStudents = []) {
  const membersSnapshot = enrolledStudents.map((s) => ({
    id: s.id,
    display_name: s.display_name || '',
    username: s.username || '',
    student_code: s.student_code || '',
    grade: s.grade || s.student_grade || cls?.grade || '',
    major: s.major || s.student_major || cls?.major || '',
  }));

  const memberUserIds = membersSnapshot.map((m) => m.id).filter(Boolean);

  return {
    class_id: cls.id,
    school_id: cls.school_id || null,
    teacher_id: cls.teacher_id || null,
    group_name: cls.name || 'لیست کلاسی',
    grade: cls.grade || null,
    major: cls.major || null,
    member_user_ids: JSON.stringify(memberUserIds),
    members_snapshot: JSON.stringify(membersSnapshot),
    member_count: memberUserIds.length,
  };
}

function parseRosterGroupRow(row) {
  if (!row) return null;
  let memberUserIds = [];
  let membersSnapshot = [];
  try {
    memberUserIds = JSON.parse(row.member_user_ids || '[]');
  } catch (e) {
    memberUserIds = [];
  }
  try {
    membersSnapshot = JSON.parse(row.members_snapshot || '[]');
  } catch (e) {
    membersSnapshot = [];
  }
  return {
    ...row,
    member_user_ids: Array.isArray(memberUserIds) ? memberUserIds : [],
    members_snapshot: Array.isArray(membersSnapshot) ? membersSnapshot : [],
  };
}

module.exports = {
  normalizePersianSearch,
  matchSchoolStudent,
  isExactStudentMatch,
  buildRosterGroupSnapshot,
  parseRosterGroupRow,
};
