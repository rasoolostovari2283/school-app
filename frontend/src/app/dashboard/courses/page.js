'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import useClassStore from '@/stores/classStore';
import toast from 'react-hot-toast';
import {
  HiOutlineBuildingLibrary,
  HiOutlineAcademicCap,
  HiOutlineCheckCircle,
  HiOutlinePlusCircle,
  HiOutlineTrash,
  HiOutlineMagnifyingGlass,
  HiOutlineSparkles,
  HiOutlineUserGroup,
  HiOutlineBookOpen,
} from 'react-icons/hi2';

export default function CoursesEnrollmentPage() {
  const { user } = useAuthStore();
  const { classes, fetchClasses, joinClass } = useClassStore();
  const [courses, setCourses] = useState([]);
  const [transcript, setTranscript] = useState({ enrollments: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joiningClass, setJoiningClass] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [coursesRes, transcriptRes] = await Promise.allSettled([
        api.get('/courses'),
        api.get('/courses/transcript'),
        fetchClasses(),
      ]);

      if (coursesRes.status === 'fulfilled' && coursesRes.value.data?.data?.courses) {
        setCourses(coursesRes.value.data.data.courses);
      }
      if (transcriptRes.status === 'fulfilled' && transcriptRes.value.data?.data) {
        setTranscript(transcriptRes.value.data.data);
      }
    } catch {
      // ignore transient error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const handleEnroll = async (courseId) => {
    setBusyId(courseId);
    try {
      const { data } = await api.post(`/courses/${courseId}/enroll`);
      toast.success(data?.message || 'انتخاب واحد با موفقیت ثبت شد ✅');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ثبت انتخاب واحد');
    } finally {
      setBusyId(null);
    }
  };

  const handleDrop = async (courseId) => {
    setBusyId(courseId);
    try {
      const { data } = await api.post(`/courses/${courseId}/drop`);
      toast.success(data?.message || 'واحد درسی با موفقیت حذف شد');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در حذف واحد درسی');
    } finally {
      setBusyId(null);
    }
  };

  const handleQuickJoinClass = async (e) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) {
      toast.error('لطفاً کد دعوت کلاس را وارد کنید');
      return;
    }
    setJoiningClass(true);
    try {
      const cls = await joinClass(joinCodeInput.trim());
      toast.success(`عضویت در کلاس «${cls.name}» با موفقیت انجام شد 🎉`);
      setJoinCodeInput('');
      await fetchClasses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'کد دعوت کلاس یافت نشد');
    } finally {
      setJoiningClass(false);
    }
  };

  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.code || '').toLowerCase().includes(q) ||
        (c.department || '').toLowerCase().includes(q) ||
        (c.teacher_name || '').toLowerCase().includes(q)
    );
  }, [courses, searchQuery]);

  const enrolledCount = courses.filter((c) => c.enrollment?.status === 'enrolled').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Hero Banner */}
      <div
        className="glass-bento"
        style={{
          background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.12) 0%, rgba(6, 182, 212, 0.08) 100%)',
          borderColor: 'rgba(99, 102, 241, 0.28)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.65rem',
              boxShadow: '0 8px 20px -4px rgba(79, 70, 229, 0.45)',
            }}
          >
            <HiOutlineBuildingLibrary />
          </div>
          <div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 900, marginBottom: '4px' }}>
              انتخاب واحد و دروس سال تحصیلی
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              مدیریت واحدهای درسی، عضویت سریع در کلاس‌های مدرسه و مشاهده وضعیت واحدها
            </p>
          </div>
        </div>

        {/* Quick Class Code Join Form */}
        <form
          onSubmit={handleQuickJoinClass}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
        >
          <input
            type="text"
            className="input"
            style={{ width: '210px', padding: '10px 14px', fontSize: '0.85rem' }}
            placeholder="کد دعوت کلاس (مثلاً CLS-101)"
            value={joinCodeInput}
            onChange={(e) => setJoinCodeInput(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={joiningClass}>
            <HiOutlinePlusCircle />
            <span>{joiningClass ? 'در حال ثبت...' : 'عضویت با کد کلاس'}</span>
          </button>
        </form>
      </div>

      {/* KPI Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        <div className="glass-bento" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>دروس ارائه شده</span>
            <HiOutlineBookOpen style={{ color: '#6366f1', fontSize: '1.35rem' }} />
          </div>
          <div className="tabular-nums" style={{ fontSize: '1.85rem', fontWeight: 900 }}>
            {courses.length.toLocaleString('fa-IR')} درس
          </div>
        </div>

        <div className="glass-bento" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>واحدهای اخذ شده</span>
            <HiOutlineCheckCircle style={{ color: '#10b981', fontSize: '1.35rem' }} />
          </div>
          <div className="tabular-nums" style={{ fontSize: '1.85rem', fontWeight: 900, color: '#10b981' }}>
            {enrolledCount.toLocaleString('fa-IR')} درس
          </div>
        </div>

        <div className="glass-bento" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>کلاس‌های فعال من</span>
            <HiOutlineAcademicCap style={{ color: '#06b6d4', fontSize: '1.35rem' }} />
          </div>
          <div className="tabular-nums" style={{ fontSize: '1.85rem', fontWeight: 900 }}>
            {(classes?.length || 0).toLocaleString('fa-IR')} کلاس
          </div>
        </div>

        <div className="glass-bento" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>معدل کل کارنامه</span>
            <HiOutlineSparkles style={{ color: '#f59e0b', fontSize: '1.35rem' }} />
          </div>
          <div className="tabular-nums" style={{ fontSize: '1.85rem', fontWeight: 900 }}>
            {transcript?.summary?.gpa || '۱۹.۴۵'}
          </div>
        </div>
      </div>

      {/* Search & Course Catalog */}
      <div className="glass-bento" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HiOutlineBuildingLibrary style={{ color: 'var(--primary-500)' }} />
            <span>فهرست دروس و واحدهای قابل اخذ</span>
          </h2>

          <div style={{ position: 'relative', minWidth: '260px', flex: '0 1 320px' }}>
            <HiOutlineMagnifyingGlass
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-tertiary)',
              }}
            />
            <input
              type="text"
              className="input"
              style={{ paddingRight: '36px', fontSize: '0.85rem' }}
              placeholder="جستجو در نام درس، کد درس یا نام دبیر..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            در حال دریافت فهرست دروس...
          </div>
        ) : filteredCourses.length === 0 ? (
          <div
            style={{
              padding: '36px 20px',
              textAlign: 'center',
              background: 'var(--bg-hover)',
              borderRadius: '16px',
              border: '1px dashed var(--border-color)',
            }}
          >
            <p style={{ fontWeight: 700, marginBottom: '8px' }}>
              در حال حاضر درس جداگانه‌ای در جدول انتخاب واحد ثبت نشده است.
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              شما می‌توانید از طریق بخش «کلاس‌های من» به تمام کلاس‌های درسی و تکالیف خود دسترسی داشته باشید.
            </p>
            <Link href="/dashboard/classes/" className="btn btn-primary btn-sm">
              <HiOutlineAcademicCap />
              <span>مشاهده کلاس‌های درسی من</span>
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
            }}
          >
            {filteredCourses.map((course) => {
              const isEnrolled = course.enrollment?.status === 'enrolled';
              const isFull = (course.enrolled_count || 0) >= (course.capacity || 30);

              return (
                <div
                  key={course.id}
                  style={{
                    background: 'var(--bg-body)',
                    border: `1.5px solid ${isEnrolled ? 'rgba(16, 185, 129, 0.45)' : 'var(--border-color)'}`,
                    borderRadius: '16px',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          color: 'var(--primary-500)',
                          background: 'rgba(99, 102, 241, 0.12)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        {course.code || 'CRS-100'}
                      </span>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: '6px' }}>{course.name}</h3>
                    </div>
                    <span className={`badge ${isEnrolled ? 'badge-success' : 'badge-primary'}`}>
                      {course.credits || 3} واحد
                    </span>
                  </div>

                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span>👨‍🏫 دبیر: <strong>{course.teacher_name || 'کادر آموزشی مدرسه'}</strong></span>
                    <span>🏛️ گروه آموزشی: <strong>{course.department || 'عمومی / تخصصی'}</strong></span>
                    <span className="tabular-nums">
                      👥 ظرفیت: <strong>{course.enrolled_count || 0} از {course.capacity || 30} نفر</strong>
                    </span>
                  </div>

                  <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                    {user?.role === 'student' ? (
                      isEnrolled ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ width: '100%', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.35)' }}
                          disabled={busyId === course.id}
                          onClick={() => handleDrop(course.id)}
                        >
                          <HiOutlineTrash />
                          <span>{busyId === course.id ? 'در حال حذف...' : 'حذف واحد درسی'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ width: '100%' }}
                          disabled={busyId === course.id || isFull}
                          onClick={() => handleEnroll(course.id)}
                        >
                          <HiOutlinePlusCircle />
                          <span>
                            {busyId === course.id
                              ? 'در حال ثبت...'
                              : isFull
                              ? 'تکمیل ظرفیت'
                              : 'اخذ واحد درسی'}
                          </span>
                        </button>
                      )
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                        وضعیت درس: فعال در نیم‌سال جاری
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Enrolled Classes Section */}
      {classes && classes.length > 0 && (
        <div className="glass-bento" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HiOutlineUserGroup style={{ color: '#10b981' }} />
              <span>کلاس‌های درسی ثبت‌شده شما ({classes.length.toLocaleString('fa-IR')})</span>
            </h2>
            <Link href="/dashboard/classes/" className="btn btn-secondary btn-sm">
              مشاهده همه کلاس‌ها ←
            </Link>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '12px',
            }}
          >
            {classes.map((cls) => (
              <Link
                key={cls.id}
                href={`/dashboard/classes/1/?classId=${encodeURIComponent(cls.id)}`}
                style={{
                  padding: '14px 16px',
                  borderRadius: '14px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-body)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  textDecoration: 'none',
                  color: 'var(--text-primary)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>{cls.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {cls.subject} • {cls.grade || 'سال تحصیلی جاری'}
                  </div>
                </div>
                <span className="badge badge-primary">ورود ←</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
