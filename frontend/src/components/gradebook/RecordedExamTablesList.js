'use client';
import { useMemo } from 'react';
import { HiOutlineTrash } from 'react-icons/hi2';
import GradeTableFooterSummary, { computeLocalClassStats } from './GradeTableFooterSummary';
import styles from './RecordedExamTablesList.module.css';

export default function RecordedExamTablesList({
  activeClass,
  categories = [],
  students = [],
  cellValues = {},
  teacherName = '',
  highlightCategoryId = null,
  onDeleteCategory = null,
}) {
  // Show exams that have at least one recorded score OR were just created, newest first
  const recordedExams = useMemo(() => {
    const list = (categories || [])
      .map((cat) => {
        const maxScore = Number(cat.max_score) || 20;
        const passThreshold = maxScore === 20 ? 12 : Math.round(maxScore * 0.6 * 100) / 100;

        const rows = (students || []).map((st) => {
          const rawCell = cellValues[`${st.id}_${cat.id}`];
          const dbScore = st.scores?.[cat.id]?.score;
          const comment = st.scores?.[cat.id]?.comment || '';

          let numScore = null;
          if (rawCell !== undefined && rawCell !== '' && !Number.isNaN(Number(rawCell))) {
            numScore = Number(rawCell);
          } else if (dbScore !== null && dbScore !== undefined && !Number.isNaN(Number(dbScore))) {
            numScore = Number(dbScore);
          }

          return {
            student: st,
            score: numScore,
            comment,
            passed: numScore !== null ? numScore >= passThreshold : null,
          };
        });

        const gradedCount = rows.filter((r) => r.score !== null).length;
        const stats = computeLocalClassStats(
          rows.map((r) => r.score),
          { totalStudents: (students || []).length, passThreshold }
        );

        return {
          cat,
          maxScore,
          passThreshold,
          rows,
          gradedCount,
          stats,
        };
      })
      .filter((item) => item.gradedCount > 0 || String(item.cat.id) === String(highlightCategoryId));

    // Newest created exam at top
    return list.reverse();
  }, [categories, students, cellValues, highlightCategoryId]);

  if (recordedExams.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} data-testid="recorded-exams-list">
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>لیست نمرات آزمون‌های ثبت‌شده این کلاس</h2>
          <p className={styles.sectionSub}>
            آمار چهارگانه هر آزمون به‌صورت خودکار محاسبه شده و فایل پی‌دی‌اف هر جدول جداگانه قابل دانلود است.
          </p>
        </div>
        <span className={styles.sectionCount}>
          {recordedExams.length} لیست نمره ثبت‌شده
        </span>
      </div>

      {recordedExams.map(({ cat, maxScore, passThreshold, rows, stats }) => {
        const isHighlighted = String(cat.id) === String(highlightCategoryId);

        const pdfColumns = [
          { label: 'ردیف', weight: 0.55, align: 'center' },
          { label: 'نام و نام خانوادگی دانش‌آموز', weight: 2.3, align: 'right' },
          { label: 'کد دانش‌آموزی', weight: 1.1, align: 'center' },
          { label: `نمره (از ${maxScore})`, weight: 1.0, align: 'center' },
          { label: 'وضعیت قبولی', weight: 1.1, align: 'center' },
          { label: 'توضیح دبیر', weight: 1.8, align: 'right' },
        ];

        const pdfRows = rows.map((r, idx) => [
          String(idx + 1),
          r.student.display_name || '—',
          r.student.student_code || '—',
          r.score !== null ? String(r.score) : '—',
          r.passed === null ? 'ثبت نشده' : r.passed ? 'قبول' : 'نیاز به تلاش',
          r.comment || '—',
        ]);

        return (
          <article
            key={cat.id}
            className={`${styles.examCard} ${isHighlighted ? styles.examCardHighlight : ''}`}
            data-testid={`recorded-exam-card-${cat.id}`}
          >
            <div className={styles.examHeader}>
              <div className={styles.examIdentity}>
                <h3 className={styles.examTitle}>{cat.title}</h3>
                <div className={styles.examMeta}>
                  <span>{activeClass?.name || 'کلاس'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeClass?.grade || 'عمومی'}</span>
                  <span aria-hidden="true">·</span>
                  <span>سقف نمره {maxScore}</span>
                  <span aria-hidden="true">·</span>
                  <span>ضریب {cat.weight || 1}</span>
                </div>
              </div>

              {onDeleteCategory && (
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => onDeleteCategory(cat.id, cat.title)}
                  title={`حذف آزمون «${cat.title}»`}
                >
                  <HiOutlineTrash />
                  <span>حذف آزمون</span>
                </button>
              )}
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: '52px' }}>ردیف</th>
                    <th>نام و نام خانوادگی دانش‌آموز</th>
                    <th style={{ width: '120px' }}>کد دانش‌آموزی</th>
                    <th style={{ width: '110px' }}>نمره (از {maxScore})</th>
                    <th style={{ width: '130px' }}>وضعیت</th>
                    <th>توضیح دبیر</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={r.student.id}>
                      <td className={styles.numCell}>{idx + 1}</td>
                      <td className={styles.nameCell}>{r.student.display_name}</td>
                      <td className={styles.codeCell}>{r.student.student_code || '—'}</td>
                      <td className={styles.scoreCell}>
                        {r.score !== null ? r.score : '—'}
                      </td>
                      <td>
                        {r.passed === null ? (
                          <span className={styles.statusNeutral}>ثبت نشده</span>
                        ) : r.passed ? (
                          <span className={styles.statusPass}>قبول</span>
                        ) : (
                          <span className={styles.statusFail}>نیاز به تلاش</span>
                        )}
                      </td>
                      <td className={styles.commentCell}>{r.comment || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <GradeTableFooterSummary
              stats={stats}
              testIdPrefix={`exam-table-footer-${cat.id}`}
              passThresholdLabel={`نمره ${passThreshold} به بالا`}
              pdfConfig={{
                title: `لیست نمرات آزمون: ${cat.title}`,
                subtitle: `${activeClass?.name || 'کلاس'} · ${activeClass?.grade || ''} · درس ${activeClass?.subject || 'عمومی'}`,
                teacherName,
                columns: pdfColumns,
                rows: pdfRows,
                fileName: `exam-${cat.title}-${activeClass?.name || 'class'}.pdf`,
              }}
            />
          </article>
        );
      })}
    </section>
  );
}
