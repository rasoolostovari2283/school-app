'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../../lib/api';
import {
  HiOutlineMagnifyingGlass,
  HiOutlineArrowPath,
  HiOutlineBuildingOffice2,
} from 'react-icons/hi2';
import GradeTableFooterSummary, { computeLocalClassStats } from './GradeTableFooterSummary';
import styles from './ManagerClassifiedGradebook.module.css';

const POSITIVE_STATUSES = new Set(['قبول', 'خیلی خوب', 'خوب', 'قابل قبول']);
const NEGATIVE_STATUSES = new Set(['مردود', 'نیازمند تلاش بیشتر', 'نیاز به تلاش']);

export default function ManagerClassifiedGradebook() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [teacherFilter, setTeacherFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  // Selected exam per classId: 'all' (overview matrix) or a specific category id
  const [selectedExamByClass, setSelectedExamByClass] = useState({});

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/gradebook/manager-overview');
      if (res.data?.success) {
        setData(res.data.data);
      } else {
        setError(res.data?.message || 'خطا در دریافت کارنامه معلمان مدرسه');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'خطا در برقراری ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const filteredTeachers = useMemo(() => {
    const teachers = data?.teachers || [];
    const q = searchQuery.trim().toLowerCase();

    return teachers
      .filter((t) => teacherFilter === 'all' || String(t.teacher_id || 'unassigned') === teacherFilter)
      .map((t) => {
        const matchedClasses = (t.classes || [])
          .filter((cls) => gradeFilter === 'all' || cls.grade === gradeFilter)
          .filter((cls) => {
            if (!q) return true;
            if (String(t.teacher_name || '').toLowerCase().includes(q)) return true;
            if (String(cls.name || '').toLowerCase().includes(q)) return true;
            if (String(cls.subject || '').toLowerCase().includes(q)) return true;
            if (String(cls.grade || '').toLowerCase().includes(q)) return true;
            if ((cls.categories || []).some((cat) => String(cat.title || '').toLowerCase().includes(q))) {
              return true;
            }
            return (cls.students || []).some(
              (st) =>
                String(st.display_name || '').toLowerCase().includes(q) ||
                String(st.student_code || '').toLowerCase().includes(q)
            );
          });

        if (matchedClasses.length === 0) return null;

        // Group teacher's classes hierarchically by Grade (ascending grade_rank)
        const gradeMap = new Map();
        for (const cls of matchedClasses) {
          const gradeKey = cls.grade || 'عمومی';
          if (!gradeMap.has(gradeKey)) {
            gradeMap.set(gradeKey, {
              grade: gradeKey,
              grade_rank: cls.grade_rank ?? 999,
              classes: [],
            });
          }
          gradeMap.get(gradeKey).classes.push(cls);
        }
        const gradeGroups = Array.from(gradeMap.values()).sort(
          (a, b) => a.grade_rank - b.grade_rank || a.grade.localeCompare(b.grade, 'fa')
        );

        return { ...t, classes: matchedClasses, gradeGroups };
      })
      .filter(Boolean);
  }, [data, teacherFilter, gradeFilter, searchQuery]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className="skeleton" style={{ height: 110, borderRadius: 16 }} />
        <div className="skeleton" style={{ height: 260, borderRadius: 16 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.emptyCard}>
        <p style={{ color: '#ef4444', fontWeight: 700, marginBottom: 12 }}>{error}</p>
        <button type="button" className={styles.refreshBtn} onClick={loadOverview}>
          <HiOutlineArrowPath />
          <span>تلاش مجدد</span>
        </button>
      </div>
    );
  }

  const summary = data?.summary || {};
  const schoolName = data?.school_name || 'مدرسه هوشمند';

  return (
    <div className={styles.container} data-testid="manager-classified-gradebook">
      {/* Header */}
      <div className={styles.headerCard}>
        <div className={styles.headerText}>
          <h2>کارنامه‌ها و نمرات طبقه‌بندی‌شده معلمان — {schoolName}</h2>
          <p>
            تمام نمرات، آزمون‌ها و وضعیت‌های ثبت‌شده توسط معلمان زیرمجموعه این مدرسه به‌صورت مستقیم و خودکار به تفکیک معلم، پایه، کلاس و آزمون نمایش داده می‌شوند.
          </p>
        </div>
        <button type="button" className={styles.refreshBtn} onClick={loadOverview}>
          <HiOutlineArrowPath />
          <span>بروزرسانی زنده</span>
        </button>
      </div>

      {/* School-wide KPI Strip */}
      <div className={styles.schoolKpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>معلمان دارای کلاس</span>
          <span className={styles.kpiValue}>{summary.total_teachers ?? 0} دبیر</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>کل کلاس‌های مدرسه</span>
          <span className={styles.kpiValue}>{summary.total_classes ?? 0} کلاس</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>میانگین نمرات کل مدرسه</span>
          <span className={styles.kpiValue} style={{ color: '#2563eb' }}>
            {summary.school_average != null ? `${summary.school_average} از ۲۰` : '—'}
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>درصد کل قبولی مدرسه</span>
          <span className={styles.kpiValue} style={{ color: '#059669' }}>
            {summary.school_average != null ? `${summary.school_pass_rate}٪` : '—'}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className={styles.filterBar}>
        <div className={styles.searchWrap}>
          <HiOutlineMagnifyingGlass className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="جستجوی معلم، کلاس، عنوان آزمون یا دانش‌آموز..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.filterSelects}>
          <select
            className={styles.filterSelect}
            aria-label="فیلتر بر اساس معلم"
            data-testid="manager-teacher-filter"
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(e.target.value)}
          >
            <option value="all">همه معلمان مدرسه ({(data?.teachers || []).length})</option>
            {(data?.teachers || []).map((t) => (
              <option key={t.teacher_id || 'unassigned'} value={String(t.teacher_id || 'unassigned')}>
                {t.teacher_name} ({t.class_count} کلاس)
              </option>
            ))}
          </select>

          <select
            className={styles.filterSelect}
            aria-label="فیلتر بر اساس پایه"
            data-testid="manager-grade-filter"
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
          >
            <option value="all">همه پایه‌ها</option>
            {(data?.grades || []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Classified Teacher -> Grade -> Class -> Exam Tables */}
      {filteredTeachers.length === 0 ? (
        <div className={styles.emptyCard}>
          <HiOutlineBuildingOffice2 style={{ fontSize: '2.4rem', opacity: 0.45, marginBottom: 8 }} />
          <div style={{ fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
            هنوز کلاسی یا نمره‌ای برای این مدرسه ثبت نشده است
          </div>
          <div style={{ fontSize: '0.82rem' }}>
            به‌محض اینکه معلمان مدرسه کلاسی ثبت کرده و نمره‌ای وارد کنند، مستقیماً در اینجا به تفکیک هر معلم، پایه و کلاس نمایش داده می‌شود.
          </div>
        </div>
      ) : (
        filteredTeachers.map((teacher) => (
          <section
            key={teacher.teacher_id || 'unassigned'}
            className={styles.teacherSection}
            data-testid={`manager-teacher-section-${teacher.teacher_id || 'unassigned'}`}
          >
            <div className={styles.teacherHeader}>
              <div className={styles.teacherIdentity}>
                <div className={styles.teacherAvatar}>
                  {(teacher.teacher_name || 'م').charAt(0)}
                </div>
                <div>
                  <h3 className={styles.teacherName}>{teacher.teacher_name}</h3>
                  <span className={styles.teacherMeta}>
                    {teacher.teacher_username ? `@${teacher.teacher_username} · ` : ''}
                    {teacher.gradeGroups.length} پایه · {teacher.classes.length} کلاس · {teacher.student_count} دانش‌آموز
                  </span>
                </div>
              </div>
            </div>

            {teacher.gradeGroups.map((gradeGroup) => (
              <div
                key={`${teacher.teacher_id || 'u'}-${gradeGroup.grade}`}
                className={styles.gradeGroupBlock}
                data-testid={`manager-grade-group-${gradeGroup.grade}`}
              >
                <div className={styles.gradeGroupBar}>
                  <span className={styles.gradeGroupTitle}>{gradeGroup.grade}</span>
                  <span className={styles.gradeGroupMeta}>{gradeGroup.classes.length} کلاس</span>
                </div>

                {gradeGroup.classes.map((cls) => {
                  const cats = cls.categories || [];
                  const activeExamId = selectedExamByClass[cls.id] || 'all';
                  const selectedExam =
                    activeExamId !== 'all'
                      ? cats.find((c) => String(c.id) === String(activeExamId)) || null
                      : null;

                  // Columns, Rows, and 4-box stats adapt cleanly to either full class matrix OR selected exam
                  const maxExamScore = selectedExam ? Number(selectedExam.max_score) || 20 : 20;
                  const examPassThreshold =
                    maxExamScore === 20 ? 12 : Math.round(maxExamScore * 0.6 * 100) / 100;

                  const activeStats = selectedExam
                    ? selectedExam.stats ||
                      computeLocalClassStats(
                        (cls.students || []).map((st) => st.scores?.[selectedExam.id]),
                        {
                          totalStudents: (cls.students || []).length,
                          passThreshold: examPassThreshold,
                        }
                      )
                    : cls.stats;

                  const pdfColumns = selectedExam
                    ? [
                        { label: 'ردیف', weight: 0.55, align: 'center' },
                        { label: 'نام و نام خانوادگی دانش‌آموز', weight: 2.3, align: 'right' },
                        { label: 'کد دانش‌آموزی', weight: 1.1, align: 'center' },
                        { label: `نمره ${selectedExam.title} (از ${maxExamScore})`, weight: 1.2, align: 'center' },
                        { label: 'وضعیت قبولی', weight: 1.15, align: 'center' },
                      ]
                    : [
                        { label: 'ردیف', weight: 0.55, align: 'center' },
                        { label: 'نام دانش‌آموز', weight: 2.1, align: 'right' },
                        ...cats.map((cat) => ({ label: cat.title, weight: 1.15, align: 'center' })),
                        { label: 'میانگین', weight: 0.9, align: 'center' },
                        { label: 'وضعیت', weight: 1.25, align: 'center' },
                      ];

                  const pdfRows = selectedExam
                    ? (cls.students || []).map((st, idx) => {
                        const rawScore = st.scores?.[selectedExam.id];
                        const numScore = rawScore != null ? Number(rawScore) : null;
                        return [
                          String(idx + 1),
                          st.display_name,
                          st.student_code || '—',
                          numScore != null && !Number.isNaN(numScore) ? String(numScore) : '—',
                          numScore == null || Number.isNaN(numScore)
                            ? 'ثبت نشده'
                            : numScore >= examPassThreshold
                              ? 'قبول'
                              : 'نیاز به تلاش',
                        ];
                      })
                    : (cls.students || []).map((st, idx) => [
                        String(idx + 1),
                        st.display_name,
                        ...cats.map((cat) =>
                          st.scores && st.scores[cat.id] != null ? String(st.scores[cat.id]) : '—'
                        ),
                        st.average_score != null ? String(st.average_score) : '—',
                        st.status || 'در انتظار نمره',
                      ]);

                  return (
                    <div
                      key={cls.id}
                      className={styles.classCard}
                      data-testid={`manager-class-card-${cls.id}`}
                    >
                      <div className={styles.classHeader}>
                        <div>
                          <h4 className={styles.classTitle}>{cls.name}</h4>
                          <span className={styles.classSub}>
                            {cls.grade} · درس: {cls.subject} · {cls.students.length} دانش‌آموز · {cats.length} آزمون ثبت‌شده
                          </span>
                        </div>
                      </div>

                      {/* Segmented Exam Filter Bar (Overview vs Specific Exam) */}
                      {cats.length > 0 && (
                        <div className={styles.examFilterBar} role="tablist" aria-label={`فیلتر آزمون‌های کلاس ${cls.name}`}>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={!selectedExam}
                            className={`${styles.examTabBtn} ${!selectedExam ? styles.examTabBtnActive : ''}`}
                            onClick={() =>
                              setSelectedExamByClass((prev) => ({ ...prev, [cls.id]: 'all' }))
                            }
                            data-testid={`manager-exam-tab-all-${cls.id}`}
                          >
                            همه آزمون‌ها (نمای کلی)
                          </button>
                          {cats.map((cat) => {
                            const isActive = selectedExam && String(selectedExam.id) === String(cat.id);
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                role="tab"
                                aria-selected={Boolean(isActive)}
                                className={`${styles.examTabBtn} ${isActive ? styles.examTabBtnActive : ''}`}
                                onClick={() =>
                                  setSelectedExamByClass((prev) => ({ ...prev, [cls.id]: cat.id }))
                                }
                                data-testid={`manager-exam-tab-${cat.id}`}
                              >
                                {cat.title}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {cls.students.length === 0 ? (
                        <div style={{ padding: 20, textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                          هنوز دانش‌آموزی در این کلاس عضو نشده است.
                        </div>
                      ) : (
                        <div className={styles.tableScroll}>
                          <table className={styles.table}>
                            <thead>
                              <tr>
                                <th style={{ width: '48px' }}>ردیف</th>
                                <th>نام و نام خانوادگی دانش‌آموز</th>
                                {selectedExam ? (
                                  <>
                                    <th>نمره {selectedExam.title} (از {maxExamScore})</th>
                                    <th>وضعیت در این آزمون</th>
                                  </>
                                ) : (
                                  <>
                                    {cats.map((cat) => (
                                      <th key={cat.id}>{cat.title}</th>
                                    ))}
                                    <th>میانگین</th>
                                    <th>وضعیت</th>
                                  </>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {cls.students.map((st, idx) => {
                                if (selectedExam) {
                                  const rawScore = st.scores?.[selectedExam.id];
                                  const numScore = rawScore != null ? Number(rawScore) : null;
                                  const passed = numScore != null && !Number.isNaN(numScore) ? numScore >= examPassThreshold : null;

                                  return (
                                    <tr key={st.id}>
                                      <td style={{ color: 'var(--text-tertiary)', fontWeight: 700 }}>{idx + 1}</td>
                                      <td>
                                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                          {st.display_name}
                                        </div>
                                        {st.student_code && (
                                          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                                            کد {st.student_code}
                                          </div>
                                        )}
                                      </td>
                                      <td
                                        style={{
                                          fontWeight: 800,
                                          color:
                                            passed === null
                                              ? 'var(--text-tertiary)'
                                              : passed
                                                ? '#059669'
                                                : '#dc2626',
                                        }}
                                      >
                                        {numScore != null && !Number.isNaN(numScore) ? numScore : '—'}
                                      </td>
                                      <td>
                                        <span
                                          className={
                                            passed === null
                                              ? styles.statusNeutral
                                              : passed
                                                ? styles.statusPositive
                                                : styles.statusNegative
                                          }
                                        >
                                          {passed === null ? 'ثبت نشده' : passed ? 'قبول' : 'نیاز به تلاش'}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                }

                                const statusClass = POSITIVE_STATUSES.has(st.status)
                                  ? styles.statusPositive
                                  : NEGATIVE_STATUSES.has(st.status)
                                    ? styles.statusNegative
                                    : styles.statusNeutral;

                                return (
                                  <tr key={st.id}>
                                    <td style={{ color: 'var(--text-tertiary)', fontWeight: 700 }}>{idx + 1}</td>
                                    <td>
                                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {st.display_name}
                                      </div>
                                      {st.student_code && (
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                                          کد {st.student_code}
                                        </div>
                                      )}
                                    </td>
                                    {cats.map((cat) => (
                                      <td key={cat.id} style={{ fontWeight: 700 }}>
                                        {st.scores && st.scores[cat.id] != null ? st.scores[cat.id] : '—'}
                                      </td>
                                    ))}
                                    <td style={{ fontWeight: 800, color: '#2563eb' }}>
                                      {st.average_score != null ? st.average_score : '—'}
                                    </td>
                                    <td>
                                      <span className={statusClass}>{st.status || 'در انتظار نمره'}</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* 4 Auto-Calculated Stat Boxes + PDF Export at Bottom of Every Table */}
                      <GradeTableFooterSummary
                        stats={activeStats}
                        testIdPrefix={`manager-class-footer-${cls.id}`}
                        pdfConfig={{
                          title: selectedExam
                            ? `لیست نمرات ${selectedExam.title} — کلاس ${cls.name}`
                            : `کارنامه و لیست نمرات کلاس ${cls.name}`,
                          subtitle: `${cls.grade} · درس ${cls.subject}`,
                          schoolName,
                          teacherName: teacher.teacher_name,
                          columns: pdfColumns,
                          rows: pdfRows,
                          fileName: selectedExam
                            ? `exam-${selectedExam.title}-${cls.name}.pdf`
                            : `grades-${cls.name}.pdf`,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

