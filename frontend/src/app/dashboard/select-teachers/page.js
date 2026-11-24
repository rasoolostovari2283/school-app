'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  HiOutlineAcademicCap,
  HiOutlineBuildingLibrary,
  HiOutlineCheck,
  HiOutlineCheckCircle,
  HiOutlineMagnifyingGlass,
  HiOutlineUserGroup,
  HiOutlineArrowRight,
  HiOutlineArrowPath,
} from 'react-icons/hi2';
import api from '@/lib/api';
import useAuthStore from '@/stores/authStore';
import useClassStore from '@/stores/classStore';
import styles from './select-teachers.module.css';

export default function SelectTeachersPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const { fetchClasses } = useClassStore();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [studentProfile, setStudentProfile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadOptions = async () => {
    try {
      setLoading(true);
      const res = await api.get('/auth/student-setup-options');
      const data = res.data?.data || {};
      setTeachers(Array.isArray(data.teachers) ? data.teachers : []);
      setSchoolInfo(data.school || null);
      setStudentProfile(data.student_profile || null);
      setSelectedIds(Array.isArray(data.selected_teacher_ids) ? data.selected_teacher_ids : []);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'خطا در دریافت لیست معلمان مدرسه');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadOptions();
  }, [user]);

  const studentGrade = studentProfile?.grade || user?.department || '';
  const studentMajor = studentProfile?.major || '';
  const studentLevel = studentProfile?.education_level || schoolInfo?.education_level || '';

  const isRecommendedTeacher = (teacher) => {
    const grades = Array.isArray(teacher.taught_grades) ? teacher.taught_grades : [];
    const majors = Array.isArray(teacher.majors) ? teacher.majors : [];
    const gradeMatch = studentGrade && grades.some((g) => String(g).includes(studentGrade) || String(studentGrade).includes(g));
    const majorMatch = !studentMajor || majors.length === 0 || majors.includes(studentMajor);
    return Boolean(gradeMatch && majorMatch);
  };

  const filteredTeachers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/^@+/, '');
    const list = teachers.filter((t) => {
      if (!q) return true;
      const haystack = [
        t.display_name,
        t.username,
        t.job_title,
        t.education_level,
        ...(t.majors || []),
        ...(t.taught_grades || []),
        ...(t.subjects || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    return [...list].sort((a, b) => {
      const aRec = isRecommendedTeacher(a) ? 0 : 1;
      const bRec = isRecommendedTeacher(b) ? 0 : 1;
      if (aRec !== bRec) return aRec - bRec;
      return String(a.display_name || '').localeCompare(String(b.display_name || ''), 'fa');
    });
  }, [teachers, searchQuery, studentGrade, studentMajor]);

  const toggleTeacher = (teacherId) => {
    setSelectedIds((prev) =>
      prev.includes(teacherId) ? prev.filter((id) => id !== teacherId) : [...prev, teacherId]
    );
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();

    if (teachers.length > 0 && selectedIds.length === 0) {
      toast.error('لطفاً حداقل یک معلم را که با او کلاس دارید انتخاب کنید');
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.post('/auth/student-setup', {
        school_name: schoolInfo?.name || studentProfile?.school_name || '',
        grade: studentGrade,
        major: studentMajor,
        education_level: studentLevel,
        teacher_ids: selectedIds,
      });

      const payload = res.data?.data || {};
      if (payload.user) {
        setUser(payload.user);
      }
      await fetchClasses().catch(() => {});

      const count = payload.linked_teachers?.length ?? selectedIds.length;
      toast.success(
        count > 0
          ? `ثبت انجام شد! شما به لیست کلاسی ${count.toLocaleString('fa-IR')} معلم متصل شدید.`
          : 'اطلاعات شما با موفقیت ذخیره شد.'
      );
      router.push('/dashboard/');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'خطا در ثبت معلمان انتخابی');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page} dir="rtl" data-testid="select-teachers-page">
      {/* Header Banner */}
      <section className={styles.heroCard}>
        <div className={styles.heroTop}>
          <div>
            <span className={styles.heroBadge}>
              <HiOutlineAcademicCap />
              <span>اتصال هوشمند به معلمان و لیست کلاسی مدرسه</span>
            </span>
            <h1 className={styles.heroTitle}>انتخاب معلمان کلاس‌های شما</h1>
            <p className={styles.heroSub}>
              معلمانی که در این سال تحصیلی با آن‌ها کلاس دارید را از فهرست معلمان ثبت‌شده مدرسه خود انتخاب کرده و
              در انتهای لیست دکمه «ثبت» را بزنید تا به‌صورت خودکار در لیست کلاسی هر معلم بر اساس پایه و رشته قرار بگیرید.
            </p>
          </div>
          {studentProfile?.is_onboarded && (
            <Link href="/dashboard/" className={styles.secondaryBtn}>
              <HiOutlineArrowRight />
              <span>بازگشت به داشبورد</span>
            </Link>
          )}
        </div>

        <div className={styles.metaRow}>
          <span className={styles.metaPill}>
            <HiOutlineBuildingLibrary />
            <span>مدرسه: {schoolInfo?.name || studentProfile?.school_name || 'مدرسه ثبت‌شده شما'}</span>
          </span>
          {studentLevel && (
            <span className={styles.metaPill}>
              <span>مقطع: {studentLevel}</span>
            </span>
          )}
          {studentGrade && (
            <span className={styles.metaPill}>
              <span>پایه: {studentGrade}</span>
            </span>
          )}
          {studentMajor && (
            <span className={styles.metaPill}>
              <span>رشته: {studentMajor}</span>
            </span>
          )}
          {user?.username && (
            <span className={styles.metaPill} dir="ltr">
              @{user.username}
            </span>
          )}
        </div>
      </section>

      {/* Search & Selection Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <HiOutlineMagnifyingGlass className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="جستجوی معلم بر اساس نام، آیدی (@username) یا پایه تدریس..."
            aria-label="جستجوی معلم"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className={styles.toolbarActions}>
          <span className={styles.countBadge} data-testid="selected-teachers-count">
            <HiOutlineCheckCircle />
            <span>{selectedIds.length.toLocaleString('fa-IR')} معلم انتخاب شده</span>
          </span>
          {teachers.length > 0 && (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() =>
                setSelectedIds(
                  selectedIds.length === teachers.length ? [] : teachers.map((t) => t.id)
                )
              }
            >
              {selectedIds.length === teachers.length ? 'لغو انتخاب همه' : 'انتخاب همه معلمان'}
            </button>
          )}
        </div>
      </div>

      {/* Teachers Checklist & Bottom Submit Button */}
      <form className={styles.listSection} onSubmit={handleSubmit}>
        {loading ? (
          <div className={styles.emptyState}>
            <HiOutlineArrowPath style={{ fontSize: '2rem', color: '#4f46e5' }} />
            <p className={styles.emptyTitle}>در حال دریافت فهرست معلمان مدرسه از دیتابیس...</p>
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div className={styles.emptyState}>
            <HiOutlineUserGroup style={{ fontSize: '2.4rem', color: '#64748b' }} />
            <h2 className={styles.emptyTitle}>
              {teachers.length === 0
                ? 'هنوز معلمی در دیتابیس این مدرسه ثبت‌نام نکرده است'
                : 'معلمی مطابق با جستجوی شما یافت نشد'}
            </h2>
            <p className={styles.emptyDesc}>
              {teachers.length === 0
                ? 'پس از ثبت‌نام معلمان مدرسه در سامانه، اسامی آن‌ها در این صفحه نمایش داده می‌شود و هر زمان می‌توانید از منوی «انتخاب معلمان من» آن‌ها را انتخاب کنید.'
                : 'عبارت جستجو را پاک کنید تا تمامی معلمان ثبت‌شده مدرسه نمایش داده شوند.'}
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" className={styles.secondaryBtn} onClick={loadOptions}>
                بروزرسانی لیست معلمان
              </button>
              {teachers.length === 0 && (
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={submitting}
                  data-testid="submit-teachers-btn"
                >
                  <span>ورود به پنل دانش‌آموز</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className={styles.teachersGrid} data-testid="school-teachers-list">
              {filteredTeachers.map((teacher) => {
                const isSelected = selectedIds.includes(teacher.id);
                const recommended = isRecommendedTeacher(teacher);
                return (
                  <button
                    key={teacher.id}
                    type="button"
                    aria-pressed={isSelected}
                    data-testid={`teacher-option-${teacher.username || teacher.id}`}
                    className={`${styles.teacherCard} ${isSelected ? styles.teacherCardSelected : ''}`}
                    onClick={() => toggleTeacher(teacher.id)}
                  >
                    <div className={styles.avatar}>
                      {teacher.display_name?.charAt(0) || 'م'}
                    </div>
                    <div className={styles.teacherInfo}>
                      <div className={styles.teacherNameRow}>
                        <span className={styles.teacherName}>{teacher.display_name}</span>
                        {recommended && <span className={styles.matchBadge}>مرتبط با پایه شما</span>}
                      </div>
                      {teacher.username && (
                        <span className={styles.teacherUsername} dir="ltr" style={{ alignSelf: 'flex-start' }}>
                          @{teacher.username}
                        </span>
                      )}
                      <span className={styles.teacherMeta}>
                        {teacher.job_title || (teacher.education_level ? `معلم مقطع ${teacher.education_level}` : 'معلم مدرسه')}
                      </span>
                      {(teacher.taught_grades?.length > 0 || teacher.majors?.length > 0) && (
                        <div className={styles.tagRow}>
                          {(teacher.taught_grades || []).slice(0, 3).map((g) => (
                            <span key={g} className={styles.tag}>{g}</span>
                          ))}
                          {(teacher.majors || []).slice(0, 2).map((m) => (
                            <span key={m} className={styles.tag}>{m}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className={`${styles.checkBox} ${isSelected ? styles.checkBoxSelected : ''}`} aria-hidden="true">
                      <HiOutlineCheck />
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Prominent Submit Button at the Bottom of the List */}
            <div className={styles.submitBar}>
              <span className={styles.submitHint}>
                {selectedIds.length > 0
                  ? `${selectedIds.length.toLocaleString('fa-IR')} معلم انتخاب شده است. با زدن «ثبت»، نام شما در لیست کلاسی این معلمان ثبت می‌شود.`
                  : 'روی کارت هر معلمی که با او کلاس دارید کلیک کنید و سپس دکمه «ثبت» را بزنید.'}
              </span>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={submitting || selectedIds.length === 0}
                data-testid="submit-teachers-btn"
              >
                <HiOutlineCheckCircle />
                <span>{submitting ? 'در حال ثبت در دیتابیس و لیست کلاسی...' : 'ثبت'}</span>
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
