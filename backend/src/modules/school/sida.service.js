const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../../config/database');
const { generateId, insertAndReturn } = require('../../utils/dbHelpers');
const { assertOwnsClass, forbiddenError } = require('../../middleware/auth');
const {
  normalizePersianText,
  normalizePersianDigits,
  validateIranianNationalCode,
  normalizeIranianMobile,
} = require('../../utils/iranianValidators');

const HEADER_SYNONYMS = {
  national_code: ['کد ملی', 'کدملی', 'شماره ملی', 'شناسه ملی', 'national_code', 'nationalcode', 'melli_code', 'mellicode'],
  first_name: ['نام', 'first_name', 'firstname', 'fname'],
  last_name: ['نام خانوادگی', 'نام‌خانوادگی', 'فامیل', 'شهرت', 'last_name', 'lastname', 'lname'],
  full_name: ['نام و نام خانوادگی', 'نام دانش آموز', 'نام دانش‌آموز', 'دانش آموز', 'دانش‌آموز', 'full_name', 'fullname', 'display_name', 'name'],
  father_name: ['نام پدر', 'پدر', 'father_name', 'fathername', 'father'],
  student_code: ['کد دانش آموزی', 'کد دانش‌آموزی', 'شماره دانش آموزی', 'کد سیدا', 'کد سناد', 'student_code', 'studentcode', 'sida_code', 'code'],
  grade: ['پایه', 'پایه تحصیلی', 'مقطع', 'grade', 'level'],
  class_name: ['کلاس', 'نام کلاس', 'شعبه', 'کلاس درس', 'class_name', 'classname', 'class'],
  major: ['رشته', 'رشته تحصیلی', 'major', 'field'],
  parent_phone: ['تلفن ولی', 'موبایل ولی', 'همراه ولی', 'شماره همراه ولی', 'تلفن همراه', 'موبایل', 'تلفن', 'parent_phone', 'parentphone', 'phone', 'mobile'],
};

function matchHeaderKey(rawHeader) {
  const clean = normalizePersianText(String(rawHeader || ''))
    .replace(/[\u200C_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  for (const [canonical, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    for (const syn of synonyms) {
      const normalizedSyn = normalizePersianText(syn).replace(/[\u200C_\-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      if (clean === normalizedSyn) {
        return canonical;
      }
    }
  }
  return clean;
}

function parseDelimitedText(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const normalized = normalizePersianText(rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')).trim();
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';
  else if (firstLine.includes('|') && !firstLine.includes(',')) delimiter = '|';

  const splitLine = (line) =>
    line.split(delimiter).map((cell) => cell.replace(/^["']|["']$/g, '').trim());

  const headers = splitLine(lines[0]).map(matchHeaderKey);
  const hasRecognizedHeader = headers.some((h) => Object.prototype.hasOwnProperty.call(HEADER_SYNONYMS, h));

  const startIdx = hasRecognizedHeader ? 1 : 0;
  const effectiveHeaders = hasRecognizedHeader
    ? headers
    : ['national_code', 'full_name', 'father_name', 'grade', 'class_name', 'parent_phone'];

  const rows = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    if (cells.every((c) => !c)) continue;
    const obj = {};
    effectiveHeaders.forEach((hKey, idx) => {
      obj[hKey] = cells[idx] !== undefined ? cells[idx] : '';
    });
    rows.push(obj);
  }
  return rows;
}

function normalizeRowObject(rawRow, index) {
  const mapped = {};
  for (const [k, v] of Object.entries(rawRow || {})) {
    const canonical = matchHeaderKey(k);
    mapped[canonical] = typeof v === 'string' ? normalizePersianText(v).trim() : v;
  }

  const firstName = mapped.first_name || '';
  const lastName = mapped.last_name || '';
  const fullName = (mapped.full_name || `${firstName} ${lastName}`.trim()).replace(/\s+/g, ' ').trim();
  const fatherName = mapped.father_name || 'ثبت نشده';
  const grade = mapped.grade || 'پایه دهم';
  const className = mapped.class_name || `${grade} - الف`;
  const major = mapped.major || 'عمومی';

  const rawNationalCode = mapped.national_code || mapped.student_code || '';
  const nationalCheck = validateIranianNationalCode(rawNationalCode);
  const studentCode =
    mapped.student_code ||
    (nationalCheck.formatted ? nationalCheck.formatted : `SIDA-${1403000 + index + 1}`);

  const phoneCheck = normalizeIranianMobile(mapped.parent_phone || '');

  const warnings = [];
  if (!fullName) {
    warnings.push('نام و نام خانوادگی دانش‌آموز خالی است');
  }
  if (!nationalCheck.valid) {
    warnings.push(nationalCheck.reason || 'کد ملی نیاز به بازبینی دارد');
  }
  if (mapped.parent_phone && !phoneCheck.valid) {
    warnings.push(phoneCheck.reason || 'شماره موبایل ولی استاندارد نیست');
  }

  return {
    row_number: index + 1,
    full_name: fullName || `دانش‌آموز ردیف ${index + 1}`,
    first_name: firstName || fullName.split(' ')[0] || '',
    last_name: lastName || fullName.split(' ').slice(1).join(' ') || '',
    father_name: fatherName,
    national_code: nationalCheck.formatted || normalizePersianDigits(String(rawNationalCode || '')),
    national_code_valid: nationalCheck.valid,
    student_code: normalizePersianDigits(String(studentCode)),
    grade,
    class_name: className,
    major,
    parent_phone: phoneCheck.formatted || normalizePersianDigits(String(mapped.parent_phone || '')),
    phone_valid: phoneCheck.valid,
    status: !fullName ? 'error' : (warnings.length === 0 ? 'ready' : 'warning'),
    warnings,
  };
}

function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '""';
  let str = String(value).replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str}"`;
}

class SidaService {
  /**
   * Dry-run preview & intelligent column mapping for Sida / Legacy Excel imports
   */
  previewImport({ rows, raw_text, source_system = 'sida' }) {
    const rawRows = Array.isArray(rows) && rows.length > 0 ? rows : parseDelimitedText(raw_text);
    const normalizedRows = rawRows.map((r, idx) => normalizeRowObject(r, idx));

    const classSet = new Set();
    let validCount = 0;
    let warningCount = 0;

    for (const r of normalizedRows) {
      if (r.class_name) classSet.add(`${r.class_name} (${r.grade})`);
      if (r.status === 'ready') validCount++;
      else warningCount++;
    }

    return {
      source_system,
      total_rows: normalizedRows.length,
      valid_count: validCount,
      warning_count: warningCount,
      auto_detected_classes: Array.from(classSet),
      rows: normalizedRows,
    };
  }

  /**
   * Atomic import of Sida / Legacy rows into school's classes, users, class_members, and parent_student_links
   */
  async importRoster(currentUser, { rows, raw_text, source_system = 'sida', auto_create_classes = true, auto_link_parents = true }) {
    const schoolId = currentUser?.school_id;
    if (!schoolId) {
      throw forbiddenError('کاربر به هیچ مدرسه‌ای متصل نیست');
    }

    const preview = this.previewImport({ rows, raw_text, source_system });
    if (preview.rows.length === 0) {
      const err = new Error('هیچ ردیف معتبری برای درون‌ریزی یافت نشد');
      err.statusCode = 400;
      throw err;
    }

    return db.transaction(async (trx) => {
      // Fetch existing classes for this school in 1 query
      const existingClasses = await trx('classes').where({ school_id: schoolId });
      const classByName = new Map();
      for (const cls of existingClasses) {
        classByName.set(normalizePersianText(cls.name).trim(), cls);
      }

      let createdClassesCount = 0;
      let importedStudentsCount = 0;
      let updatedStudentsCount = 0;
      let linkedParentsCount = 0;
      const importedStudents = [];

      for (const row of preview.rows) {
        const cleanClassName = normalizePersianText(row.class_name || 'کلاس عمومی').trim();
        let targetClass = classByName.get(cleanClassName);

        if (!targetClass && auto_create_classes) {
          const joinCode = `SIDA-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
          targetClass = await insertAndReturn(trx, 'classes', {
            name: cleanClassName,
            subject: row.major && row.major !== 'عمومی' ? row.major : 'عمومی / سیدا',
            grade: row.grade || 'پایه دهم',
            teacher_id: currentUser.id,
            school_id: schoolId,
            join_code: joinCode,
          });
          classByName.set(cleanClassName, targetClass);
          createdClassesCount++;
        }

        const codeToUse = row.national_code || row.student_code;
        let student = await trx('users')
          .where({ school_id: schoolId, role: 'student', student_code: codeToUse })
          .first();

        const studentSettings = JSON.stringify({
          national_code: row.national_code,
          sida_code: row.student_code,
          father_name: row.father_name,
          class_name: cleanClassName,
          grade: row.grade,
          major: row.major,
          parent_phone: row.parent_phone || null,
          imported_from: source_system,
        });

        if (student) {
          await trx('users')
            .where({ id: student.id, school_id: schoolId })
            .update({
              display_name: row.full_name,
              department: row.grade,
              settings: studentSettings,
            });
          updatedStudentsCount++;
        } else {
          const studentPasswordHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 8);
          student = await insertAndReturn(trx, 'users', {
            display_name: row.full_name,
            student_code: codeToUse,
            department: row.grade,
            phone: null,
            role: 'student',
            password_hash: studentPasswordHash,
            school_id: schoolId,
            locale: 'fa',
            is_verified: true,
            is_active: true,
            settings: studentSettings,
          });
          importedStudentsCount++;
        }

        if (targetClass) {
          const existingMember = await trx('class_members')
            .where({ class_id: targetClass.id, user_id: student.id })
            .first();
          if (!existingMember) {
            await trx('class_members').insert({
              id: generateId(),
              class_id: targetClass.id,
              user_id: student.id,
              role: 'student',
              joined_at: trx.fn.now(),
            }).catch(() => {});
          }
        }

        if (auto_link_parents && row.parent_phone && row.phone_valid) {
          let parentUser = await trx('users')
            .where({ school_id: schoolId, role: 'parent', phone: row.parent_phone })
            .first();

          if (!parentUser) {
            const parentPasswordHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 8);
            parentUser = await insertAndReturn(trx, 'users', {
              display_name: `ولی ${row.full_name} (${row.father_name !== 'ثبت نشده' ? row.father_name : 'والد'})`,
              phone: row.parent_phone,
              student_code: codeToUse,
              role: 'parent',
              password_hash: parentPasswordHash,
              school_id: schoolId,
              locale: 'fa',
              is_verified: true,
              is_active: true,
              settings: JSON.stringify({ linked_student_code: codeToUse }),
            });
          }

          const existingLink = await trx('parent_student_links')
            .where({ parent_id: parentUser.id, student_id: student.id })
            .first();
          if (!existingLink) {
            await trx('parent_student_links').insert({
              id: generateId(),
              parent_id: parentUser.id,
              student_id: student.id,
              relation: 'پدر / ولی قانونی',
            }).catch(() => {});
            linkedParentsCount++;
          }
        }

        importedStudents.push({
          id: student.id,
          name: row.full_name,
          national_code: row.national_code,
          student_code: codeToUse,
          grade: row.grade,
          class_name: cleanClassName,
          class_id: targetClass ? targetClass.id : null,
          parent_phone: row.parent_phone,
        });
      }

      return {
        source_system,
        imported_students_count: importedStudentsCount,
        updated_students_count: updatedStudentsCount,
        created_classes_count: createdClassesCount,
        linked_parents_count: linkedParentsCount,
        total_processed: preview.rows.length,
        students: importedStudents,
      };
    });
  }

  /**
   * Export class gradebook in official Ministry of Education Sida (سیدا) structure
   */
  async exportClassGradesForSida(currentUser, classId) {
    const cls = await assertOwnsClass(currentUser, classId, { allowEnrolled: false });

    const students = await db('class_members')
      .join('users', 'users.id', 'class_members.user_id')
      .where({
        'class_members.class_id': classId,
        'class_members.role': 'student',
        'users.school_id': currentUser.school_id,
      })
      .select('users.id', 'users.display_name', 'users.student_code', 'users.department', 'users.settings')
      .orderBy('users.display_name', 'asc');

    const categories = await db('gradebook_categories')
      .where({ class_id: classId })
      .orderBy('created_at', 'asc');

    const catIds = categories.map((c) => c.id);
    const scores = catIds.length > 0
      ? await db('gradebook_scores').whereIn('category_id', catIds)
      : [];

    const scoreMap = new Map();
    for (const s of scores) {
      if (!scoreMap.has(s.student_id)) scoreMap.set(s.student_id, {});
      scoreMap.get(s.student_id)[s.category_id] = s.score;
    }

    const sidaRows = students.map((st, idx) => {
      let settings = {};
      try { settings = typeof st.settings === 'string' ? JSON.parse(st.settings) : (st.settings || {}); } catch (_e) {}

      const stScores = scoreMap.get(st.id) || {};
      let continuousScore = null;
      let finalScore = null;
      let weightedSum = 0;
      let totalWeight = 0;

      for (const cat of categories) {
        const val = stScores[cat.id];
        if (val !== undefined && val !== null) {
          weightedSum += Number(val) * (cat.weight || 1);
          totalWeight += cat.weight || 1;
          if (cat.title.includes('مستمر') || cat.title.includes('میان‌ترم')) {
            continuousScore = Number(val);
          } else if (cat.title.includes('پایانی') || cat.title.includes('نوبت')) {
            finalScore = Number(val);
          }
        }
      }

      const avg = totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(2)) : null;
      if (continuousScore === null && avg !== null) continuousScore = avg;
      if (finalScore === null && avg !== null) finalScore = avg;

      return {
        row_number: idx + 1,
        national_code: settings.national_code || st.student_code || '',
        student_code: st.student_code || '',
        full_name: st.display_name,
        father_name: settings.father_name || '—',
        grade: cls.grade || st.department || 'پایه دهم',
        class_name: cls.name,
        subject: cls.subject || 'عمومی',
        continuous_score: continuousScore !== null ? continuousScore : '',
        final_score: finalScore !== null ? finalScore : '',
        weighted_average: avg !== null ? avg : '',
        pass_status: avg !== null ? (avg >= 10 ? 'قبول' : 'تجدید / نیاز به تلاش') : 'ثبت نشده',
      };
    });

    const csvHeaders = [
      'ردیف',
      'کد ملی',
      'کد دانش‌آموزی سیدا',
      'نام و نام خانوادگی',
      'نام پدر',
      'پایه',
      'کلاس',
      'نام درس',
      'نمره مستمر',
      'نمره پایانی',
      'معدل وزنی درس',
      'وضعیت',
    ];

    const csvLines = [
      csvHeaders.join(','),
      ...sidaRows.map((r) =>
        [
          r.row_number,
          sanitizeCsvCell(r.national_code),
          sanitizeCsvCell(r.student_code),
          sanitizeCsvCell(r.full_name),
          sanitizeCsvCell(r.father_name),
          sanitizeCsvCell(r.grade),
          sanitizeCsvCell(r.class_name),
          sanitizeCsvCell(r.subject),
          r.continuous_score,
          r.final_score,
          r.weighted_average,
          sanitizeCsvCell(r.pass_status),
        ].join(',')
      ),
    ];

    return {
      class_info: {
        id: cls.id,
        name: cls.name,
        subject: cls.subject,
        grade: cls.grade,
      },
      sida_schema_version: 'SIDA-1403-V2',
      total_students: sidaRows.length,
      rows: sidaRows,
      csv_content: '\uFEFF' + csvLines.join('\r\n'),
    };
  }
}

module.exports = new SidaService();
