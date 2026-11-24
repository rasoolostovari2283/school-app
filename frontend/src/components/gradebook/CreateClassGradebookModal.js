'use client';

import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineXMark,
  HiOutlineBuildingOffice2,
  HiOutlineMagnifyingGlass,
  HiOutlineCheckCircle,
  HiOutlineTrash,
  HiOutlineUserPlus,
  HiOutlineExclamationTriangle,
} from 'react-icons/hi2';
import api from '../../lib/api';
import styles from './CreateClassGradebookModal.module.css';

const GRADE_OPTIONS = [
  'پیش‌دبستانی ۱',
  'پیش‌دبستانی ۲',
  'پایه اول',
  'پایه دوم',
  'پایه سوم',
  'پایه چهارم',
  'پایه پنجم',
  'پایه ششم',
  'پایه هفتم',
  'پایه هشتم',
  'پایه نهم',
  'پایه دهم',
  'پایه یازدهم',
  'پایه دوازدهم',
  'عمومی',
];

export default function CreateClassGradebookModal({ isOpen, onClose, onCreated }) {
  const [className, setClassName] = useState('');
  const [classGrade, setClassGrade] = useState('پایه دهم');
  const [classSubject, setClassSubject] = useState('');
  const [categoryTitle, setCategoryTitle] = useState('نمره کارنامه (مستمر)');

  // Autocomplete search state
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchBoxRef = useRef(null);

  // Selected DB-linked students + inline scores: [{ student, score, comment }]
  const [rows, setRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Reset form when opened
  useEffect(() => {
    if (!isOpen) return;
    setClassName('');
    setClassGrade('پایه دهم');
    setClassSubject('');
    setCategoryTitle('نمره کارنامه (مستمر)');
    setQuery('');
    setRows([]);
    setShowDropdown(false);
  }, [isOpen]);

  // Close autocomplete dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handleOutside = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showDropdown]);

  // Live DB student suggestion search (debounced)
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const res = await api.get('/gradebook/students/search', {
          params: { q: query.trim(), limit: 15 },
        });
        if (!cancelled) {
          setSuggestions(res.data?.data?.students || []);
        }
      } catch (_err) {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    }, 140);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, query]);

  if (!isOpen) return null;

  const addedIds = new Set(rows.map((r) => r.student.id));

  const handleSelectSuggestion = (student) => {
    if (addedIds.has(student.id)) {
      toast('این دانش‌آموز قبلاً به لیست اضافه شده است', { id: 'dup-st' });
      return;
    }
    setRows((prev) => [...prev, { student, score: '', comment: '' }]);
    setQuery('');
    setShowDropdown(false);
  };

  const handleScoreChange = (studentId, val) => {
    setRows((prev) =>
      prev.map((r) => (r.student.id === studentId ? { ...r, score: val } : r))
    );
  };

  const handleCommentChange = (studentId, val) => {
    setRows((prev) =>
      prev.map((r) => (r.student.id === studentId ? { ...r, comment: val } : r))
    );
  };

  const handleRemoveRow = (studentId) => {
    setRows((prev) => prev.filter((r) => r.student.id !== studentId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!className.trim() || className.trim().length < 2) {
      toast.error('لطفاً نام کلاس را وارد کنید');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: className.trim(),
        grade: classGrade,
        subject: classSubject.trim() || 'عمومی',
        category_title: categoryTitle.trim() || 'نمره کارنامه (مستمر)',
        max_score: 20,
        entries: rows.map((r) => ({
          student_id: r.student.id,
          score: r.score,
          teacher_comment: r.comment,
        })),
      };

      const res = await api.post('/gradebook/classes-with-scores', payload);
      const created = res.data?.data;
      toast.success(
        res.data?.message || `کلاس «${className.trim()}» و نمرات با موفقیت در دیتابیس ثبت شد`
      );
      if (onCreated) {
        await onCreated(created);
      }
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'خطا در ایجاد کلاس و ذخیره نمرات');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      data-testid="create-class-gradebook-modal"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <HiOutlineBuildingOffice2 className={styles.headerIcon} />
            <div>
              <h2>ایجاد و ثبت کلاس جدید + ورود دستی دانش‌آموزان و نمرات</h2>
              <p>
                کلاس جدید در دیتابیس ثبت شده و با انتخاب دانش‌آموزان از پیشنهادهای دیتابیس مدرسه، نمرات بلافاصله در کارنامه پنل دانش‌آموز نمایش داده می‌شود.
              </p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="بستن"
          >
            <HiOutlineXMark />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.formBody}>
          {/* 1. Class Metadata */}
          <div className={styles.metaGrid}>
            <div className={styles.field}>
              <label htmlFor="manual-cls-name">نام کلاس *</label>
              <input
                id="manual-cls-name"
                type="text"
                className={styles.input}
                placeholder="مثلاً: فیزیک دهم ریاضی — کلاس ۱۰۲"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                required
                data-testid="manual-class-name-input"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="manual-cls-grade">پایه تحصیلی *</label>
              <select
                id="manual-cls-grade"
                className={styles.input}
                value={classGrade}
                onChange={(e) => setClassGrade(e.target.value)}
                data-testid="manual-class-grade-select"
              >
                {GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="manual-cls-subject">عنوان درس / رشته</label>
              <input
                id="manual-cls-subject"
                type="text"
                className={styles.input}
                placeholder="مثلاً: فیزیک، ریاضی، شیمی"
                value={classSubject}
                onChange={(e) => setClassSubject(e.target.value)}
                data-testid="manual-class-subject-input"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="manual-cls-category">عنوان ستون نمره / آزمون</label>
              <input
                id="manual-cls-category"
                type="text"
                className={styles.input}
                placeholder="مثلاً: آزمون میان‌ترم یا نمره مستمر"
                value={categoryTitle}
                onChange={(e) => setCategoryTitle(e.target.value)}
                data-testid="manual-class-category-input"
              />
            </div>
          </div>

          {/* 2. Autocomplete Student Selector */}
          <div className={styles.studentSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>
                <HiOutlineUserPlus />
                <span>افزودن دانش‌آموزان از دیتابیس مدرسه و ثبت نمره هر نفر</span>
              </div>
              <span className={styles.countBadge}>{rows.length} دانش‌آموز انتخاب‌شده</span>
            </div>

            <div className={styles.searchContainer} ref={searchBoxRef}>
              <div className={styles.searchInputWrap}>
                <HiOutlineMagnifyingGlass className={styles.searchIcon} />
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="نام دانش‌آموز یا @نام‌کاربری را بنویسید تا پیشنهادهای دیتابیس نمایش داده شود..."
                  value={query}
                  onFocus={() => setShowDropdown(true)}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShowDropdown(true);
                  }}
                  data-testid="manual-student-search-input"
                />
              </div>

              {showDropdown && (
                <div
                  className={styles.suggestionsDropdown}
                  data-testid="student-suggestions-dropdown"
                >
                  {loadingSuggestions ? (
                    <div className={styles.suggestionState}>در حال جستجو در دیتابیس مدرسه...</div>
                  ) : suggestions.length === 0 ? (
                    <div className={styles.suggestionEmpty}>
                      <HiOutlineExclamationTriangle />
                      <span>
                        دانش‌آموز ثبت‌شده‌ای با این عبارت در دیتابیس مدرسه یافت نشد. برای اتصال صحیح به پنل دانش‌آموز، از گزینه‌های پیشنهادی انتخاب کنید.
                      </span>
                    </div>
                  ) : (
                    suggestions.map((st) => {
                      const isAdded = addedIds.has(st.id);
                      return (
                        <button
                          key={st.id}
                          type="button"
                          className={`${styles.suggestionItem} ${isAdded ? styles.suggestionAdded : ''}`}
                          onClick={() => handleSelectSuggestion(st)}
                          data-testid={`student-suggestion-${st.username || st.id}`}
                        >
                          <div className={styles.suggestionAvatar}>
                            {(st.display_name || 'د').charAt(0)}
                          </div>
                          <div className={styles.suggestionInfo}>
                            <strong>{st.display_name}</strong>
                            <div className={styles.suggestionMeta}>
                              {st.username && <span dir="ltr">@{st.username}</span>}
                              {st.grade && <span>• {st.grade}</span>}
                              {st.major && <span>({st.major})</span>}
                            </div>
                          </div>
                          {isAdded ? (
                            <span className={styles.addedTag}>اضافه شده ✓</span>
                          ) : (
                            <span className={styles.pickTag}>انتخاب +</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* 3. Selected Students & Inline Score Entry Table */}
            {rows.length === 0 ? (
              <div className={styles.emptyTableBox}>
                هنوز دانش‌آموزی به این کلاس اضافه نشده است. با جستجو در کادر بالا، نام دانش‌آموزان را از پیشنهادهای دیتابیس انتخاب کنید تا ردیف ورود نمره آن‌ها ایجاد شود.
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.scoreTable} data-testid="manual-students-score-table">
                  <thead>
                    <tr>
                      <th>ردیف</th>
                      <th>دانش‌آموز (متصل به دیتابیس)</th>
                      <th>نمره (از ۲۰)</th>
                      <th>توضیح (اختیاری)</th>
                      <th>حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={row.student.id} data-testid={`manual-row-${row.student.username || row.student.id}`}>
                        <td>{idx + 1}</td>
                        <td>
                          <div className={styles.studentCell}>
                            <div className={styles.studentNameRow}>
                              <strong>{row.student.display_name}</strong>
                              <span className={styles.dbLinkedTag}>
                                <HiOutlineCheckCircle />
                                متصل به پنل
                              </span>
                            </div>
                            <span className={styles.studentSub} dir="ltr">
                              {row.student.username ? `@${row.student.username}` : row.student.student_code || ''}
                              {row.student.grade ? ` • ${row.student.grade}` : ''}
                            </span>
                          </div>
                        </td>
                        <td>
                          <input
                            type="text"
                            inputMode="decimal"
                            className={styles.scoreInput}
                            placeholder="مثلاً ۱۸.۵"
                            value={row.score}
                            onChange={(e) => handleScoreChange(row.student.id, e.target.value)}
                            data-testid={`manual-score-input-${row.student.username || row.student.id}`}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className={styles.commentInput}
                            placeholder="توضیح معلم..."
                            value={row.comment}
                            onChange={(e) => handleCommentChange(row.student.id, e.target.value)}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.removeBtn}
                            onClick={() => handleRemoveRow(row.student.id)}
                            title="حذف از لیست"
                            aria-label={`حذف ${row.student.display_name}`}
                          >
                            <HiOutlineTrash />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={submitting}
            >
              انصراف
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={submitting}
              data-testid="submit-create-class-gradebook-btn"
            >
              {submitting ? 'در حال ثبت کلاس و نمرات...' : 'ثبت کلاس و ذخیره نمرات'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
