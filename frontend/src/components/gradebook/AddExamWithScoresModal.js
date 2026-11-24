'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import {
  HiOutlineClipboardDocumentCheck,
  HiOutlineXMark,
  HiOutlineCheckCircle,
} from 'react-icons/hi2';
import GradeTableFooterSummary, { computeLocalClassStats } from './GradeTableFooterSummary';
import styles from './AddExamWithScoresModal.module.css';

function normalizeScoreInput(rawVal) {
  return String(rawVal ?? '')
    .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
    .replace(/[/,،]/g, '.')
    .replace(/[^0-9.]/g, '');
}

export default function AddExamWithScoresModal({
  isOpen,
  onClose,
  classes = [],
  defaultClassId = '',
  onSaved,
}) {
  const [title, setTitle] = useState('');
  const [selectedClassId, setSelectedClassId] = useState(defaultClassId || '');
  const [maxScore, setMaxScore] = useState('20');
  const [weight, setWeight] = useState('1');

  const [students, setStudents] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [scoreMap, setScoreMap] = useState({});
  const [commentMap, setCommentMap] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const wasOpenRef = useRef(false);

  // Reset form strictly on closed -> open transition (never wipe user input on re-renders)
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setTitle('');
      setMaxScore('20');
      setWeight('1');
      setScoreMap({});
      setCommentMap({});
      const initialClassId = defaultClassId || (classes.length > 0 ? classes[0].id : '');
      setSelectedClassId(initialClassId);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, defaultClassId, classes]);

  // Load selected class's DB students immediately when class changes
  useEffect(() => {
    if (!isOpen || !selectedClassId) {
      setStudents([]);
      return;
    }

    let cancelled = false;
    setLoadingRoster(true);
    api
      .get(`/gradebook/classes/${selectedClassId}`)
      .then((res) => {
        if (cancelled) return;
        const list = res.data?.data?.students || [];
        setStudents(list);
        const initialScores = {};
        const initialComments = {};
        list.forEach((st) => {
          initialScores[st.id] = '';
          initialComments[st.id] = '';
        });
        setScoreMap(initialScores);
        setCommentMap(initialComments);
      })
      .catch(() => {
        if (!cancelled) {
          setStudents([]);
          toast.error('خطا در دریافت لیست دانش‌آموزان کلاس');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRoster(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedClassId]);

  const numericMaxScore = useMemo(() => {
    const n = parseFloat(maxScore);
    return !Number.isNaN(n) && n > 0 && n <= 100 ? n : 20;
  }, [maxScore]);

  const passThreshold = useMemo(() => {
    return numericMaxScore === 20 ? 12 : Math.round(numericMaxScore * 0.6 * 100) / 100;
  }, [numericMaxScore]);

  const liveStats = useMemo(() => {
    const enteredScores = students
      .map((st) => scoreMap[st.id])
      .filter((v) => v !== '' && v !== undefined && !Number.isNaN(Number(v)))
      .map((v) => Number(v))
      .filter((n) => n >= 0 && n <= numericMaxScore);

    return computeLocalClassStats(enteredScores, {
      totalStudents: students.length,
      passThreshold,
    });
  }, [students, scoreMap, numericMaxScore, passThreshold]);

  if (!isOpen) return null;

  const selectedClassObj = classes.find((c) => c.id === selectedClassId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle.length < 2) {
      toast.error('لطفاً موضوع آزمون را وارد کنید');
      return;
    }
    if (!selectedClassId) {
      toast.error('لطفاً کلاس مد نظر را انتخاب کنید');
      return;
    }

    const entries = [];
    for (const st of students) {
      const raw = (scoreMap[st.id] ?? '').trim();
      if (raw !== '') {
        const num = Number(raw);
        if (Number.isNaN(num) || num < 0 || num > numericMaxScore) {
          toast.error(`نمره ${st.display_name} باید عددی بین ۰ تا ${numericMaxScore} باشد`);
          return;
        }
        entries.push({
          student_id: st.id,
          score: num,
          teacher_comment: (commentMap[st.id] || '').trim(),
        });
      }
    }

    setSubmitting(true);
    try {
      const res = await api.post('/gradebook/exams-with-scores', {
        class_id: selectedClassId,
        title: cleanTitle,
        max_score: numericMaxScore,
        weight: parseFloat(weight) || 1.0,
        term: 'term1',
        entries,
      });

      if (res.data?.success) {
        toast.success(
          res.data.message || `نمرات آزمون «${cleanTitle}» با موفقیت ثبت شد`
        );
        onSaved?.({
          classId: selectedClassId,
          category: res.data.data?.category,
          stats: res.data.data?.stats,
        });
        onClose();
      } else {
        toast.error(res.data?.message || 'خطا در ثبت آزمون و نمرات');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ثبت آزمون و نمرات');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} data-testid="add-exam-scores-modal">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <div className={styles.headerIcon}>
              <HiOutlineClipboardDocumentCheck />
            </div>
            <div>
              <h3>افزودن آزمون جدید و ثبت نمرات کلاس</h3>
              <p>موضوع آزمون و کلاس مد نظر را انتخاب کنید؛ نمرات بلافاصله در پنل دانش‌آموزان، اولیا و مدیریت نمایش داده می‌شود</p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="بستن">
            <HiOutlineXMark />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          <div className={styles.body}>
            <div className={styles.fieldsGrid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="exam_topic_input">
                  موضوع / عنوان آزمون *
                </label>
                <input
                  id="exam_topic_input"
                  data-testid="exam-topic-input"
                  type="text"
                  className={styles.input}
                  placeholder="مثلاً: آزمون فصل دوم ریاضی"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="exam_class_select">
                  انتخاب کلاس مد نظر *
                </label>
                <select
                  id="exam_class_select"
                  data-testid="exam-class-select"
                  className={styles.select}
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  required
                >
                  <option value="">-- انتخاب کلاس --</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} {cls.subject ? `— ${cls.subject}` : ''} ({cls.grade || 'عمومی'})
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="exam_max_input">
                  سقف نمره
                </label>
                <input
                  id="exam_max_input"
                  type="number"
                  min="1"
                  max="100"
                  dir="ltr"
                  className={styles.input}
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="exam_weight_input">
                  ضریب
                </label>
                <input
                  id="exam_weight_input"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10"
                  dir="ltr"
                  className={styles.input}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
            </div>

            {/* Enrolled Students List of Selected Class */}
            <div className={styles.rosterCard}>
              <div className={styles.rosterHeader}>
                <strong>
                  لیست دانش‌آموزان {selectedClassObj ? `کلاس «${selectedClassObj.name}»` : 'کلاس انتخابی'}
                </strong>
                <span>{students.length} نفر ثبت‌شده در دیتابیس</span>
              </div>

              {loadingRoster ? (
                <div className={styles.emptyRoster}>در حال دریافت لیست افراد کلاس از دیتابیس...</div>
              ) : !selectedClassId ? (
                <div className={styles.emptyRoster}>لطفاً ابتدا کلاس مد نظر خود را انتخاب کنید.</div>
              ) : students.length === 0 ? (
                <div className={styles.emptyRoster}>
                  هنوز دانش‌آموزی در این کلاس ثبت نشده است. می‌توانید آزمون را ایجاد کرده و بعداً دانش‌آموزان را اضافه کنید.
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ width: '48px' }}>ردیف</th>
                        <th>نام و نام خانوادگی دانش‌آموز</th>
                        <th style={{ width: '124px' }}>نمره (از {numericMaxScore})</th>
                        <th>توضیح دبیر (اختیاری)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((st, idx) => {
                        const rawVal = scoreMap[st.id] ?? '';
                        const invalid =
                          rawVal !== '' &&
                          (Number.isNaN(Number(rawVal)) ||
                            Number(rawVal) < 0 ||
                            Number(rawVal) > numericMaxScore);

                        return (
                          <tr key={st.id} data-testid={`exam-student-row-${st.id}`}>
                            <td style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                              {idx + 1}
                            </td>
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
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="text"
                                inputMode="decimal"
                                dir="ltr"
                                placeholder={`0-${numericMaxScore}`}
                                aria-label={`نمره ${st.display_name}`}
                                data-testid={`exam-score-input-${st.id}`}
                                className={`${styles.scoreInput} ${invalid ? styles.scoreInputError : ''}`}
                                value={rawVal}
                                onChange={(e) =>
                                  setScoreMap((prev) => ({
                                    ...prev,
                                    [st.id]: normalizeScoreInput(e.target.value),
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className={styles.commentInput}
                                placeholder="یادداشت کوتاه..."
                                value={commentMap[st.id] || ''}
                                onChange={(e) =>
                                  setCommentMap((prev) => ({
                                    ...prev,
                                    [st.id]: e.target.value,
                                  }))
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Live Auto-Calculated 4 Stat Boxes Preview */}
              {students.length > 0 && (
                <GradeTableFooterSummary
                  stats={liveStats}
                  testIdPrefix="exam-modal-stats"
                  passThresholdLabel={`نمره ${passThreshold} به بالا`}
                />
              )}
            </div>
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              انصراف
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={submitting || !selectedClassId}
              data-testid="submit-exam-scores-btn"
            >
              <HiOutlineCheckCircle style={{ fontSize: '1.1rem' }} />
              <span>{submitting ? 'در حال ثبت نمرات...' : 'ثبت نمرات'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
