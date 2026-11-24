'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import {
  HiOutlineIdentification,
  HiOutlineCheckCircle,
  HiOutlineArrowRight,
  HiOutlineMagnifyingGlass,
  HiOutlineEye,
  HiOutlineArrowPath,
  HiOutlinePlus,
} from 'react-icons/hi2';
import GradeTableFooterSummary, { computeLocalClassStats } from './GradeTableFooterSummary';
import styles from './ClassesByGradeGradebook.module.css';

export const REPORT_CARD_STATUS_OPTIONS = [
  'قبول',
  'مردود',
  'خیلی خوب',
  'خوب',
  'قابل قبول',
  'نیازمند تلاش بیشتر',
];

const POSITIVE_STATUSES = new Set(['قبول', 'خیلی خوب', 'خوب', 'قابل قبول']);
const NEGATIVE_STATUSES = new Set(['مردود', 'نیازمند تلاش بیشتر']);

function normalizeScoreInput(rawVal) {
  return String(rawVal ?? '')
    .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
    .replace(/[/,،]/g, '.')
    .replace(/[^0-9.]/g, '');
}

function parseScoreNum(val) {
  if (val === null || val === undefined || String(val).trim() === '') return null;
  const num = Number(val);
  if (Number.isNaN(num)) return NaN;
  return num;
}

function computeLiveAverage(rowDraft) {
  if (!rowDraft) return null;
  const values = [rowDraft.continuous_score, rowDraft.midterm_score, rowDraft.final_score]
    .map((v) => parseScoreNum(v))
    .filter((n) => n !== null && !Number.isNaN(n) && n >= 0 && n <= 20);

  if (values.length === 0) return null;
  const sum = values.reduce((acc, n) => acc + n, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

function formatAvgClass(avg) {
  if (avg === null || avg === undefined) return styles.avgEmpty;
  if (avg >= 17) return styles.avgHigh;
  if (avg >= 14) return styles.avgMid;
  if (avg >= 10) return styles.avgPass;
  return styles.avgLow;
}

export default function ClassesByGradeGradebook({
  onBack,
  onPreviewStudent,
  onOpenCreateClass,
  onOpenAddExam,
  onEntriesSaved,
}) {
  const [gradeGroups, setGradeGroups] = useState([]);
  const [statusOptions, setStatusOptions] = useState(REPORT_CARD_STATUS_OPTIONS);
  const [summary, setSummary] = useState({
    total_grades: 0,
    total_classes: 0,
    total_students: 0,
    graded_students: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedGradeFilter, setSelectedGradeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Draft map keyed by `${classId}:${studentId}`
  const [drafts, setDrafts] = useState({});
  const [dirtyClasses, setDirtyClasses] = useState({});
  const [savingClassMap, setSavingClassMap] = useState({});
  const [savingAll, setSavingAll] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/gradebook/classes-by-grade');
      if (res.data?.success) {
        const data = res.data.data || {};
        const groups = Array.isArray(data.grade_groups) ? data.grade_groups : [];
        setGradeGroups(groups);
        if (Array.isArray(data.status_options) && data.status_options.length > 0) {
          setStatusOptions(data.status_options);
        }
        setSummary(
          data.summary || {
            total_grades: groups.length,
            total_classes: 0,
            total_students: 0,
            graded_students: 0,
          }
        );

        const nextDrafts = {};
        for (const grp of groups) {
          for (const cls of grp.classes || []) {
            for (const st of cls.students || []) {
              const key = `${cls.id}:${st.id}`;
              nextDrafts[key] = {
                continuous_score: st.continuous_score != null ? String(st.continuous_score) : '',
                midterm_score: st.midterm_score != null ? String(st.midterm_score) : '',
                final_score: st.final_score != null ? String(st.final_score) : '',
                status: st.status || '',
                teacher_note: st.teacher_note || '',
              };
            }
          }
        }
        setDrafts(nextDrafts);
        setDirtyClasses({});
      } else {
        setError(res.data?.message || 'خطا در دریافت لیست‌های کلاسی و پایه‌ها');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'خطا در ارتباط با سرور جهت دریافت لیست کلاس‌ها و پایه‌ها');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFieldChange = (classId, studentId, field, rawVal) => {
    const key = `${classId}:${studentId}`;
    const value = field === 'status' || field === 'teacher_note'
      ? rawVal
      : normalizeScoreInput(rawVal);

    setDrafts((prev) => ({
      ...prev,
      [key]: {
        continuous_score: '',
        midterm_score: '',
        final_score: '',
        status: '',
        teacher_note: '',
        ...(prev[key] || {}),
        [field]: value,
      },
    }));

    setDirtyClasses((prev) => ({ ...prev, [classId]: true }));
  };

  const validateClassEntries = (cls) => {
    const payloadEntries = [];
    for (const st of cls.students || []) {
      const key = `${cls.id}:${st.id}`;
      const d = drafts[key] || {
        continuous_score: '',
        midterm_score: '',
        final_score: '',
        status: '',
        teacher_note: '',
      };

      for (const [field, label] of [
        ['continuous_score', 'ارزشیابی مستمر'],
        ['midterm_score', 'آزمون میانسالی'],
        ['final_score', 'آزمون پایان سال'],
      ]) {
        const parsed = parseScoreNum(d[field]);
        if (parsed !== null && (Number.isNaN(parsed) || parsed < 0 || parsed > 20)) {
          return {
            valid: false,
            error: `نمره «${label}» برای ${st.display_name} باید عددی بین ۰ تا ۲۰ باشد`,
          };
        }
      }

      payloadEntries.push({
        student_id: st.id,
        continuous_score: d.continuous_score === '' ? null : Number(d.continuous_score),
        midterm_score: d.midterm_score === '' ? null : Number(d.midterm_score),
        final_score: d.final_score === '' ? null : Number(d.final_score),
        status: d.status || null,
        teacher_note: d.teacher_note || '',
      });
    }
    return { valid: true, entries: payloadEntries };
  };

  const handleSaveClass = async (cls, { silentToast = false } = {}) => {
    if (!cls.students || cls.students.length === 0) {
      if (!silentToast) toast.error('هیچ دانش‌آموزی در این کلاس ثبت نشده است');
      return false;
    }

    const check = validateClassEntries(cls);
    if (!check.valid) {
      toast.error(check.error);
      return false;
    }

    setSavingClassMap((prev) => ({ ...prev, [cls.id]: true }));
    try {
      const res = await api.put('/gradebook/report-entries', {
        class_id: cls.id,
        entries: check.entries,
      });

      if (res.data?.success) {
        const savedEntries = res.data.data?.entries || [];
        setDrafts((prev) => {
          const next = { ...prev };
          for (const entry of savedEntries) {
            const key = `${cls.id}:${entry.student_id}`;
            next[key] = {
              continuous_score: entry.continuous_score != null ? String(entry.continuous_score) : '',
              midterm_score: entry.midterm_score != null ? String(entry.midterm_score) : '',
              final_score: entry.final_score != null ? String(entry.final_score) : '',
              status: entry.status || '',
              teacher_note: entry.teacher_note || '',
            };
          }
          return next;
        });

        setDirtyClasses((prev) => {
          const next = { ...prev };
          delete next[cls.id];
          return next;
        });

        if (!silentToast) {
          toast.success(
            res.data.message || `نمرات و وضعیت کلاس «${cls.name}» با موفقیت ذخیره شد`
          );
        }
        onEntriesSaved?.(cls.id);
        return true;
      }

      toast.error(res.data?.message || 'خطا در ذخیره‌سازی نمرات کلاس');
      return false;
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ذخیره‌سازی نمرات و وضعیت کلاس');
      return false;
    } finally {
      setSavingClassMap((prev) => {
        const next = { ...prev };
        delete next[cls.id];
        return next;
      });
    }
  };

  const allClassesFlat = useMemo(
    () => gradeGroups.flatMap((g) => g.classes || []),
    [gradeGroups]
  );

  const dirtyClassIds = useMemo(
    () => Object.keys(dirtyClasses).filter((id) => dirtyClasses[id]),
    [dirtyClasses]
  );

  const handleSaveAllDirty = async () => {
    const targets = dirtyClassIds.length > 0
      ? allClassesFlat.filter((c) => dirtyClasses[c.id])
      : allClassesFlat.filter((c) => (c.students || []).length > 0);

    if (targets.length === 0) {
      toast('دانش‌آموزی برای ذخیره‌سازی وجود ندارد');
      return;
    }

    setSavingAll(true);
    let savedCount = 0;
    for (const cls of targets) {
      const ok = await handleSaveClass(cls, { silentToast: true });
      if (ok) savedCount += 1;
    }
    setSavingAll(false);

    if (savedCount > 0) {
      toast.success(
        `نمرات و وضعیت ${savedCount} کلاس ذخیره و در کارنامه دانش‌آموزان و اولیا ثبت شد`
      );
      await loadData();
    }
  };

  const filteredGradeGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return gradeGroups
      .filter((grp) => selectedGradeFilter === 'all' || grp.grade === selectedGradeFilter)
      .map((grp) => {
        if (!q) return grp;
        const matchedClasses = (grp.classes || [])
          .map((cls) => {
            const classMatches =
              String(cls.name || '').toLowerCase().includes(q) ||
              String(cls.subject || '').toLowerCase().includes(q) ||
              String(cls.grade || '').toLowerCase().includes(q);

            if (classMatches) return cls;

            const matchedStudents = (cls.students || []).filter((st) => {
              return (
                String(st.display_name || '').toLowerCase().includes(q) ||
                String(st.username || '').toLowerCase().includes(q) ||
                String(st.student_code || '').toLowerCase().includes(q)
              );
            });

            if (matchedStudents.length === 0) return null;
            return { ...cls, students: matchedStudents };
          })
          .filter(Boolean);

        if (matchedClasses.length === 0) return null;
        return { ...grp, classes: matchedClasses };
      })
      .filter(Boolean);
  }, [gradeGroups, selectedGradeFilter, searchQuery]);

  const liveGradedCount = useMemo(() => {
    let count = 0;
    for (const cls of allClassesFlat) {
      for (const st of cls.students || []) {
        const d = drafts[`${cls.id}:${st.id}`];
        if (!d) continue;
        if (computeLiveAverage(d) !== null || Boolean(d.status)) {
          count += 1;
        }
      }
    }
    return count;
  }, [allClassesFlat, drafts]);

  return (
    <div className={styles.container} data-testid="classes-by-grade-view">
      {/* Top Header */}
      <div className={styles.headerCard}>
        <div className={styles.headerTitleGroup}>
          <div className={styles.headerIcon}>
            <HiOutlineIdentification />
          </div>
          <div>
            <h2>لیست‌های کلاسی و پایه‌ها — ثبت نمرات و وضعیت کارنامه</h2>
            <p>
              مرتب‌سازی خودکار از کوچک‌ترین پایه به بزرگ‌ترین پایه • محاسبه خودکار میانگین و نمایش مستقیم در پنل دانش‌آموز و اولیا
            </p>
          </div>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.primarySaveBtn}
            onClick={handleSaveAllDirty}
            disabled={savingAll || loading || allClassesFlat.length === 0}
            data-testid="save-all-grade-entries-btn"
          >
            <HiOutlineCheckCircle />
            <span>
              {savingAll
                ? 'در حال ذخیره‌سازی...'
                : dirtyClassIds.length > 0
                  ? `ذخیره تغییرات (${dirtyClassIds.length} کلاس)`
                  : 'ذخیره همه نمرات و وضعیت‌ها'}
            </span>
          </button>

          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={loadData}
            disabled={loading}
            title="بروزرسانی اطلاعات از دیتابیس"
          >
            <HiOutlineArrowPath />
            <span>بروزرسانی</span>
          </button>

          {onOpenAddExam && (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={onOpenAddExam}
              data-testid="classes-by-grade-add-exam-btn"
            >
              <HiOutlinePlus />
              <span>افزودن آزمون جدید</span>
            </button>
          )}

          {onOpenCreateClass && (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={onOpenCreateClass}
            >
              <HiOutlinePlus />
              <span>ایجاد کلاس جدید</span>
            </button>
          )}

          <Link href="/dashboard/class-rosters" className={styles.secondaryBtn}>
            <span>مدیریت لیست اسامی کلاس‌ها</span>
          </Link>

          {onBack && (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={onBack}
              data-testid="back-to-single-class-btn"
            >
              <HiOutlineArrowRight />
              <span>دفتر نمرات تک‌کلاس</span>
            </button>
          )}
        </div>
      </div>

      {/* Compact Summary Strip */}
      <div className={styles.summaryStrip}>
        <div className={styles.summaryTile}>
          <span className={styles.summaryLabel}>تعداد پایه‌های فعال</span>
          <span className={styles.summaryValue}>{summary.total_grades}</span>
        </div>
        <div className={styles.summaryTile}>
          <span className={styles.summaryLabel}>کل کلاس‌های شما</span>
          <span className={styles.summaryValue}>{summary.total_classes}</span>
        </div>
        <div className={styles.summaryTile}>
          <span className={styles.summaryLabel}>کل دانش‌آموزان کلاس‌ها</span>
          <span className={styles.summaryValue}>{summary.total_students}</span>
        </div>
        <div className={styles.summaryTile}>
          <span className={styles.summaryLabel}>کارنامه‌های نمره‌دهی‌شده</span>
          <span className={styles.summaryValue}>{liveGradedCount}</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      {!loading && !error && gradeGroups.length > 0 && (
        <div className={styles.filterBar}>
          <div className={styles.gradeFilterTabs} role="tablist" aria-label="فیلتر بر اساس پایه">
            <button
              type="button"
              role="tab"
              aria-selected={selectedGradeFilter === 'all'}
              className={`${styles.gradeTabBtn} ${selectedGradeFilter === 'all' ? styles.gradeTabBtnActive : ''}`}
              onClick={() => setSelectedGradeFilter('all')}
            >
              همه پایه‌ها ({gradeGroups.length})
            </button>
            {gradeGroups.map((grp) => (
              <button
                key={grp.grade}
                type="button"
                role="tab"
                aria-selected={selectedGradeFilter === grp.grade}
                className={`${styles.gradeTabBtn} ${selectedGradeFilter === grp.grade ? styles.gradeTabBtnActive : ''}`}
                onClick={() => setSelectedGradeFilter(grp.grade)}
              >
                {grp.grade} ({grp.student_count})
              </button>
            ))}
          </div>

          <div className={styles.searchInputWrap}>
            <HiOutlineMagnifyingGlass className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="جستجوی دانش‌آموز، نام کلاس یا کد..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Body States */}
      {loading ? (
        <>
          <div className={styles.skeletonBlock} />
          <div className={styles.skeletonBlock} />
        </>
      ) : error ? (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button type="button" className={styles.secondaryBtn} onClick={loadData}>
            تلاش مجدد
          </button>
        </div>
      ) : filteredGradeGroups.length === 0 ? (
        <div className={styles.emptyBox}>
          <h3>هنوز کلاسی در لیست پایه‌ها ثبت نشده است</h3>
          <p>
            ابتدا یک کلاس ایجاد کرده و دانش‌آموزان مدرسه را به آن اضافه کنید تا در اینجا به ترتیب پایه نمایش داده شوند.
          </p>
          {onOpenCreateClass && (
            <button type="button" className={styles.primarySaveBtn} onClick={onOpenCreateClass}>
              <HiOutlinePlus />
              <span>ایجاد و ثبت کلاس جدید</span>
            </button>
          )}
        </div>
      ) : (
        filteredGradeGroups.map((grp, grpIdx) => (
          <section
            key={grp.grade}
            className={styles.gradeSection}
            data-testid="grade-group-section"
            data-grade={grp.grade}
          >
            <div className={styles.gradeSectionHeader}>
              <h3 className={styles.gradeHeading}>
                <span className={styles.gradeOrderNum}>{grpIdx + 1}.</span>
                <span>{grp.grade}</span>
              </h3>
              <span className={styles.gradeMeta}>
                {grp.classes.length} کلاس · {grp.student_count} دانش‌آموز
              </span>
            </div>

            {grp.classes.map((cls) => {
              const isDirty = Boolean(dirtyClasses[cls.id]);
              const isSaving = Boolean(savingClassMap[cls.id]);

              return (
                <div
                  key={cls.id}
                  className={styles.classCard}
                  data-testid={`grade-class-card-${cls.id}`}
                >
                  <div className={styles.classCardHeader}>
                    <div className={styles.classInfoBlock}>
                      <h4 className={styles.classTitle}>{cls.name}</h4>
                      <span className={styles.classSubMeta}>
                        {cls.subject || 'عمومی'} · {cls.grade_label} · {cls.students.length} دانش‌آموز
                        {cls.teacher_name ? ` · دبیر: ${cls.teacher_name}` : ''}
                      </span>
                    </div>

                    <div className={styles.classCardActions}>
                      {isDirty && <span className={styles.dirtyHint}>تغییرات ذخیره نشده</span>}
                      <button
                        type="button"
                        className={`${styles.classSaveBtn} ${isDirty ? styles.classSaveBtnDirty : ''}`}
                        onClick={() => handleSaveClass(cls)}
                        disabled={isSaving || cls.students.length === 0}
                        data-testid={`save-class-entries-btn-${cls.id}`}
                      >
                        <HiOutlineCheckCircle />
                        <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره نمرات و وضعیت کلاس'}</span>
                      </button>
                    </div>
                  </div>

                  {cls.students.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                      هنوز دانش‌آموزی در این کلاس عضو نشده است.
                    </div>
                  ) : (
                    <div className={styles.tableScroll}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>ردیف</th>
                            <th>نام و نام خانوادگی دانش‌آموز</th>
                            <th>ارزشیابی مستمر</th>
                            <th>آزمون میانسالی</th>
                            <th>آزمون پایان سال</th>
                            <th>میانگین</th>
                            <th>وضعیت</th>
                            <th>کارنامه</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cls.students.map((st, stIdx) => {
                            const key = `${cls.id}:${st.id}`;
                            const d = drafts[key] || {
                              continuous_score: '',
                              midterm_score: '',
                              final_score: '',
                              status: '',
                              teacher_note: '',
                            };

                            const liveAvg = computeLiveAverage(d);
                            const contInvalid = d.continuous_score !== '' && (Number.isNaN(Number(d.continuous_score)) || Number(d.continuous_score) < 0 || Number(d.continuous_score) > 20);
                            const midInvalid = d.midterm_score !== '' && (Number.isNaN(Number(d.midterm_score)) || Number(d.midterm_score) < 0 || Number(d.midterm_score) > 20);
                            const finInvalid = d.final_score !== '' && (Number.isNaN(Number(d.final_score)) || Number(d.final_score) < 0 || Number(d.final_score) > 20);

                            const parentText = (st.linked_parents || []).length > 0
                              ? st.linked_parents.map((p) => `${p.full_name} (${p.relation})`).join('، ')
                              : 'بدون ولی ثبت‌شده';

                            const statusClass = POSITIVE_STATUSES.has(d.status)
                              ? styles.statusPositive
                              : NEGATIVE_STATUSES.has(d.status)
                                ? styles.statusNegative
                                : '';

                            return (
                              <tr key={st.id} data-testid={`grade-student-row-${st.id}`}>
                                <td className={styles.rowIndexCell}>{stIdx + 1}</td>

                                <td>
                                  <div className={styles.studentCell}>
                                    <span className={styles.studentName}>{st.display_name}</span>
                                    <span className={styles.studentQuietMeta}>
                                      {st.username ? `@${st.username}` : 'بدون نام کاربری'}
                                      {st.student_code ? ` · کد ${st.student_code}` : ''}
                                    </span>
                                    <span className={styles.parentLinkMeta}>
                                      اولیا: {parentText}
                                    </span>
                                  </div>
                                </td>

                                <td className={styles.scoreCell}>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    dir="ltr"
                                    aria-label={`ارزشیابی مستمر ${st.display_name}`}
                                    data-testid={`score-continuous-${cls.id}-${st.id}`}
                                    className={`${styles.scoreInput} ${contInvalid ? styles.scoreInputError : ''}`}
                                    placeholder="0-20"
                                    value={d.continuous_score}
                                    onChange={(e) => handleFieldChange(cls.id, st.id, 'continuous_score', e.target.value)}
                                  />
                                </td>

                                <td className={styles.scoreCell}>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    dir="ltr"
                                    aria-label={`آزمون میانسالی ${st.display_name}`}
                                    data-testid={`score-midterm-${cls.id}-${st.id}`}
                                    className={`${styles.scoreInput} ${midInvalid ? styles.scoreInputError : ''}`}
                                    placeholder="0-20"
                                    value={d.midterm_score}
                                    onChange={(e) => handleFieldChange(cls.id, st.id, 'midterm_score', e.target.value)}
                                  />
                                </td>

                                <td className={styles.scoreCell}>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    dir="ltr"
                                    aria-label={`آزمون پایان سال ${st.display_name}`}
                                    data-testid={`score-final-${cls.id}-${st.id}`}
                                    className={`${styles.scoreInput} ${finInvalid ? styles.scoreInputError : ''}`}
                                    placeholder="0-20"
                                    value={d.final_score}
                                    onChange={(e) => handleFieldChange(cls.id, st.id, 'final_score', e.target.value)}
                                  />
                                </td>

                                <td className={styles.avgCell}>
                                  <span
                                    className={`${styles.avgValue} ${formatAvgClass(liveAvg)}`}
                                    data-testid={`score-average-${cls.id}-${st.id}`}
                                  >
                                    {liveAvg !== null ? liveAvg : '—'}
                                  </span>
                                </td>

                                <td className={styles.statusCell}>
                                  <select
                                    aria-label={`وضعیت ${st.display_name}`}
                                    data-testid={`status-select-${cls.id}-${st.id}`}
                                    className={`${styles.statusSelect} ${statusClass}`}
                                    value={d.status}
                                    onChange={(e) => handleFieldChange(cls.id, st.id, 'status', e.target.value)}
                                  >
                                    <option value="">انتخاب وضعیت...</option>
                                    {statusOptions.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                </td>

                                <td className={styles.actionCell}>
                                  {onPreviewStudent && (
                                    <button
                                      type="button"
                                      className={styles.previewBtn}
                                      onClick={() => onPreviewStudent(st)}
                                      title="مشاهده کارنامه رسمی دانش‌آموز"
                                    >
                                      <HiOutlineEye />
                                      <span>کارنامه</span>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {(() => {
                    const liveAverages = (cls.students || []).map((st) =>
                      computeLiveAverage(drafts[`${cls.id}:${st.id}`])
                    );
                    const classStats = computeLocalClassStats(liveAverages, {
                      totalStudents: (cls.students || []).length,
                      passThreshold: 12,
                    });
                    const pdfColumns = [
                      { label: 'ردیف', weight: 0.55, align: 'center' },
                      { label: 'نام و نام خانوادگی', weight: 2.2, align: 'right' },
                      { label: 'ارزشیابی مستمر', weight: 1.0, align: 'center' },
                      { label: 'آزمون میانسالی', weight: 1.0, align: 'center' },
                      { label: 'آزمون پایان سال', weight: 1.0, align: 'center' },
                      { label: 'میانگین', weight: 0.9, align: 'center' },
                      { label: 'وضعیت', weight: 1.35, align: 'center' },
                    ];
                    const pdfRows = (cls.students || []).map((st, idx) => {
                      const d = drafts[`${cls.id}:${st.id}`] || {};
                      const avg = computeLiveAverage(d);
                      return [
                        String(idx + 1),
                        st.display_name,
                        d.continuous_score !== '' && d.continuous_score != null ? String(d.continuous_score) : '—',
                        d.midterm_score !== '' && d.midterm_score != null ? String(d.midterm_score) : '—',
                        d.final_score !== '' && d.final_score != null ? String(d.final_score) : '—',
                        avg !== null ? String(avg) : '—',
                        d.status || 'در انتظار ثبت',
                      ];
                    });

                    return (
                      <GradeTableFooterSummary
                        stats={classStats}
                        testIdPrefix={`grade-class-footer-${cls.id}`}
                        pdfConfig={{
                          title: `کارنامه و لیست نمرات کلاس ${cls.name}`,
                          subtitle: `${cls.grade_label || cls.grade || ''} · درس ${cls.subject || 'عمومی'}`,
                          teacherName: cls.teacher_name || '',
                          columns: pdfColumns,
                          rows: pdfRows,
                          fileName: `grades-${cls.name}.pdf`,
                        }}
                      />
                    );
                  })()}
                </div>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
