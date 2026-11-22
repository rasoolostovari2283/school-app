'use client';

import { useState, useEffect, useRef } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import {
  HiOutlineUserPlus,
  HiOutlineMagnifyingGlass,
  HiOutlineCheck,
  HiOutlineXMark,
  HiOutlineExclamationTriangle,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineCircleStack,
} from 'react-icons/hi2';
import styles from '../../app/dashboard/class-rosters/rosters.module.css';

export default function ManualStudentAdder({
  classId,
  classNameTitle,
  rosterGroup,
  onStudentsAdded,
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState([]);
  const [notFoundMessage, setNotFoundMessage] = useState('');
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef(null);

  // Reset search and staged selections when switching classes
  useEffect(() => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setNotFoundMessage('');
    setSelectedStudents([]);
  }, [classId]);

  const runSearch = async (term) => {
    if (!classId) return;
    const clean = String(term || '').trim();
    setSearching(true);
    setNotFoundMessage('');
    try {
      const res = await api.get(`/classes/${classId}/students/search`, {
        params: { q: clean },
      });
      const data = res.data?.data || {};
      const list = Array.isArray(data.students) ? data.students : [];
      setResults(list);
      setHasSearched(true);
      if (data.not_found || list.length === 0) {
        setNotFoundMessage(data.message || 'نام کاربری وجود ندارد');
      } else {
        setNotFoundMessage('');
      }
    } catch (err) {
      const msg = err?.response?.data?.message || 'نام کاربری وجود ندارد';
      setResults([]);
      setHasSearched(true);
      setNotFoundMessage(msg);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !classId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setHasSearched(false);
      setNotFoundMessage('');
      return;
    }

    debounceRef.current = setTimeout(() => {
      runSearch(trimmed);
    }, 220);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, classId, isOpen]);

  const toggleSelectStudent = (student) => {
    if (student.already_in_class) return;
    setSelectedStudents((prev) => {
      const exists = prev.some((s) => s.id === student.id);
      if (exists) {
        return prev.filter((s) => s.id !== student.id);
      }
      return [...prev, student];
    });
  };

  const removeSelectedStudent = (studentId) => {
    setSelectedStudents((prev) => prev.filter((s) => s.id !== studentId));
  };

  const handleSubmitRoster = async (e) => {
    if (e) e.preventDefault();
    if (!classId) return;

    const studentIds = selectedStudents.map((s) => s.id);
    const trimmedQuery = query.trim();

    if (studentIds.length === 0 && !trimmedQuery) {
      toast.error('لطفاً ابتدا نام یا نام کاربری دانش‌آموز را جستجو و انتخاب کنید');
      return;
    }

    setSubmitting(true);
    setNotFoundMessage('');
    try {
      const payload =
        studentIds.length > 0
          ? { student_ids: studentIds }
          : { query: trimmedQuery };

      const res = await api.post(`/classes/${classId}/roster/add-students`, payload);
      const data = res.data?.data || {};
      const addedCount = Array.isArray(data.added_students) ? data.added_students.length : 0;

      if (addedCount > 0) {
        toast.success(
          `${addedCount} دانش‌آموز با موفقیت به لیست کلاسی «${classNameTitle || 'کلاس'}» اضافه و در دیتابیس ذخیره شد`
        );
      } else if (data.already_enrolled_count > 0) {
        toast('دانش‌آموز انتخاب‌شده پیش‌تر در لیست این کلاس ثبت شده بود');
      }

      setSelectedStudents([]);
      setQuery('');
      setResults([]);
      setHasSearched(false);
      setNotFoundMessage('');

      if (typeof onStudentsAdded === 'function') {
        await onStudentsAdded(data);
      }
    } catch (err) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message || 'نام کاربری وجود ندارد';
      if (status === 404 || msg.includes('نام کاربری وجود ندارد')) {
        setNotFoundMessage('نام کاربری وجود ندارد');
        setHasSearched(true);
      }
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedIdsSet = new Set(selectedStudents.map((s) => s.id));

  return (
    <section
      className={styles.manualAdderSection}
      aria-label="اضافه کردن دستی به لیست کلاسی"
      data-testid="manual-student-adder"
    >
      <div className={styles.manualAdderHeader}>
        <button
          type="button"
          className={styles.manualAdderToggle}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          data-testid="toggle-manual-adder-btn"
        >
          <span className={styles.manualAdderIcon}>
            <HiOutlineUserPlus />
          </span>
          <span className={styles.manualAdderTitleWrap}>
            <span className={styles.manualAdderTitle}>اضافه کردن دستی به لیست</span>
            <span className={styles.manualAdderSubtitle}>
              جستجوی دانش‌آموزان ثبت‌شده در دیتابیس مدرسه و ذخیره گروهی لیست کلاس
            </span>
          </span>
          <span className={styles.manualAdderChevron}>
            {isOpen ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
          </span>
        </button>

        {rosterGroup && (
          <div className={styles.dbGroupBadge} data-testid="roster-group-db-badge">
            <HiOutlineCircleStack />
            <span>
              ذخیره‌شده در دیتابیس ({rosterGroup.member_count ?? 0} عضو)
            </span>
          </div>
        )}
      </div>

      {isOpen && (
        <form className={styles.manualAdderBody} onSubmit={handleSubmitRoster}>
          <div className={styles.manualSearchRow}>
            <div className={styles.manualSearchInputWrap}>
              <HiOutlineMagnifyingGlass className={styles.manualSearchIcon} />
              <label htmlFor={`manual-student-search-${classId}`} className="sr-only">
                جستجوی نام یا نام کاربری دانش‌آموز از دیتابیس مدرسه
              </label>
              <input
                id={`manual-student-search-${classId}`}
                type="text"
                className={styles.manualSearchInput}
                placeholder="نام و نام خانوادگی یا @نام‌کاربری دانش‌آموز را از دیتابیس مدرسه جستجو کنید..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (notFoundMessage) setNotFoundMessage('');
                }}
                data-testid="manual-student-search-input"
              />
              {query && (
                <button
                  type="button"
                  className={styles.manualSearchClear}
                  aria-label="پاک کردن جستجو"
                  onClick={() => {
                    setQuery('');
                    setResults([]);
                    setHasSearched(false);
                    setNotFoundMessage('');
                  }}
                >
                  <HiOutlineXMark />
                </button>
              )}
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => runSearch(query)}
              disabled={searching}
              data-testid="manual-student-search-btn"
            >
              <HiOutlineMagnifyingGlass />
              <span>{searching ? 'در حال جستجو...' : 'جستجو در دیتابیس'}</span>
            </button>
          </div>

          {/* Not Found Alert */}
          {!searching && notFoundMessage && (
            <div
              role="alert"
              className={styles.notFoundAlert}
              data-testid="student-not-found-alert"
            >
              <HiOutlineExclamationTriangle className={styles.notFoundIcon} />
              <span>{notFoundMessage}</span>
            </div>
          )}

          {/* Matching Students List from School DB */}
          {!searching && hasSearched && results.length > 0 && (
            <div className={styles.manualResultsBox} data-testid="manual-search-results">
              <div className={styles.manualResultsHeader}>
                <span>نتایج یافت‌شده در دیتابیس مدرسه ({results.length} نفر)</span>
                <span className={styles.manualResultsHint}>
                  روی دانش‌آموز کلیک کنید و سپس دکمه «ثبت» را بزنید
                </span>
              </div>
              <div className={styles.manualResultsList}>
                {results.map((st) => {
                  const isSelected = selectedIdsSet.has(st.id);
                  return (
                    <button
                      key={st.id}
                      type="button"
                      disabled={st.already_in_class}
                      onClick={() => toggleSelectStudent(st)}
                      className={`${styles.manualResultItem} ${
                        isSelected ? styles.manualResultItemSelected : ''
                      } ${st.already_in_class ? styles.manualResultItemEnrolled : ''}`}
                      data-testid={`manual-result-student-${st.username || st.id}`}
                    >
                      <div className={styles.manualResultCheck}>
                        {(isSelected || st.already_in_class) && <HiOutlineCheck />}
                      </div>
                      <div className={styles.manualResultInfo}>
                        <span className={styles.manualResultName}>{st.display_name}</span>
                        <div className={styles.manualResultMeta}>
                          {st.username && (
                            <span className={styles.manualResultHandle} dir="ltr">
                              @{st.username}
                            </span>
                          )}
                          {(st.grade || st.major) && (
                            <span className={styles.manualResultGrade}>
                              {[st.grade, st.major].filter(Boolean).join(' — ')}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={styles.manualResultStatus}>
                        {st.already_in_class
                          ? 'عضو کلاس است'
                          : isSelected
                          ? 'انتخاب شده'
                          : 'افزودن'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Staged Selected Students + Submit Action */}
          <div className={styles.manualFooterRow}>
            <div className={styles.selectedChipsWrap}>
              {selectedStudents.length > 0 ? (
                selectedStudents.map((st) => (
                  <span key={st.id} className={styles.selectedChip}>
                    <span>{st.display_name}</span>
                    {st.username && (
                      <span className={styles.selectedChipHandle} dir="ltr">
                        @{st.username}
                      </span>
                    )}
                    <button
                      type="button"
                      className={styles.selectedChipRemove}
                      aria-label={`حذف ${st.display_name} از انتخاب`}
                      onClick={() => removeSelectedStudent(st.id)}
                    >
                      <HiOutlineXMark />
                    </button>
                  </span>
                ))
              ) : (
                <span className={styles.manualFooterHint}>
                  دانش‌آموز مورد نظر را از دیتابیس مدرسه جستجو و انتخاب کنید تا در لیست کلاسی ذخیره شود.
                </span>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || (selectedStudents.length === 0 && !query.trim())}
              data-testid="manual-roster-submit-btn"
            >
              <HiOutlineCheck />
              <span>
                {submitting
                  ? 'در حال ثبت...'
                  : selectedStudents.length > 0
                  ? `ثبت (${selectedStudents.length} نفر)`
                  : 'ثبت'}
              </span>
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
