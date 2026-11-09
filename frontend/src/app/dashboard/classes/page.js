'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '../../../stores/authStore';
import useClassStore from '../../../stores/classStore';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  HiOutlinePlusCircle,
  HiOutlineQrCode,
  HiOutlineUserGroup,
  HiOutlineClipboard,
  HiOutlineCheck,
  HiOutlineMagnifyingGlass,
  HiOutlineAcademicCap,
  HiOutlineXMark,
  HiOutlineTrash,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';
import styles from './classes.module.css';

export default function ClassesPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { classes, fetchClasses, createClass, joinClass, deleteClass, isLoading } = useClassStore();
  const locale = user?.locale || 'fa';
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('create'); // 'create' | 'join'
  const [formData, setFormData] = useState({ name: '', subject: '', grade: '', join_code: '', teacher_name: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [teachersList, setTeachersList] = useState([]);
  const [launchLiveAfterCreate, setLaunchLiveAfterCreate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    fetchClasses();
  }, [user]);

  const handleCreate = async (e, launchLive = false) => {
    if (e && e.preventDefault) e.preventDefault();
    const cleanName = formData.name?.trim();
    if (!cleanName) {
      toast.error('لطفاً نام کلاس را وارد کنید');
      return;
    }
    setIsSubmitting(true);
    try {
      const cls = await createClass({
        name: cleanName,
        subject: formData.subject?.trim() || user?.settings?.subject || user?.job_title || 'عمومی',
        grade: formData.grade?.trim() || (user?.settings?.taught_grades?.[0]) || 'پایه عمومی',
        teacher_name: formData.teacher_name?.trim() || user?.display_name || user?.name || 'دبیر گرامی',
      });
      if (!cls || !cls.id) {
        throw new Error('خطا در دریافت شناسه کلاس ایجاد شده');
      }
      toast.success(`کلاس "${cls.name}" با موفقیت ثبت شد! 🎉`);
      setShowModal(false);
      setFormData({ name: '', subject: '', grade: '', join_code: '', teacher_name: '' });
      if (launchLive) {
        toast.loading('در حال انتقال به کلاس آنلاین...', { duration: 1500 });
        router.push(`/dashboard/classes/${cls.id}/live`);
      } else {
        toast.loading(`در حال ورود به کلاس "${cls.name}"...`, { duration: 1200 });
        router.push(`/dashboard/classes/${cls.id}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'خطا در ثبت کلاس');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    try {
      const cls = await joinClass(formData.join_code);
      toast.success(`به کلاس "${cls.name}" پیوستید! ✅`);
      setShowModal(false);
      setFormData({ name: '', subject: '', grade: '', join_code: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'کد کلاس نامعتبر است');
    }
  };

  const copyCode = (code, id = null) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    if (id) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
    toast.success('کد عضویت در حافظه کپی شد! 📋');
  };

  const handleDeleteClass = async (e, cls) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`آیا از حذف کلاس «${cls.name}» اطمینان دارید؟ تمام تکالیف، اعضا و اطلاعات این کلاس حذف خواهند شد.`)) {
      return;
    }
    try {
      await deleteClass(cls.id);
      toast.success(`کلاس «${cls.name}» با موفقیت حذف شد 🗑️`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در حذف کلاس');
    }
  };

  const openModal = (type) => {
    setModalType(type);
    setShowModal(true);
  };

  const filteredClasses = classes.filter(
    (c) =>
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.subject?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>📚 کلاس‌های درسی من</h1>
          <p className={styles.subtitle}>مدیریت کلاس‌ها، دریافت کد دعوت و مشاهده اعضا</p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {(user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'manager') && (
            <button onClick={() => openModal('create')} className="btn btn-primary">
              <HiOutlinePlusCircle />
              <span>ساخت کلاس جدید</span>
            </button>
          )}
          {(user?.role === 'student' || user?.role === 'parent') && (
            <button onClick={() => openModal('join')} className="btn btn-primary">
              <HiOutlineQrCode />
              <span>عضویت با کد کلاس</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div style={{ maxWidth: '400px' }}>
        <input
          type="text"
          className="input"
          placeholder="جستجوی نام کلاس یا درس..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Class Grid */}
      {isLoading ? (
        <div className={styles.grid}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 180, borderRadius: 'var(--radius-2xl)' }}></div>
          ))}
        </div>
      ) : filteredClasses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-2xl)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🏫</div>
          <h3>کلاسی یافت نشد</h3>
          <p style={{ color: 'var(--text-tertiary)', marginTop: '6px' }}>
            {user?.role === 'teacher'
              ? 'اولین کلاس خود را بسازید و دانش‌آموزان را دعوت کنید'
              : 'از معلم خود کد کلاس را بخواهید و ملحق شوید'}
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredClasses.map((cls, i) => {
            const gradients = [
              'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
              'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
              'linear-gradient(135deg, #d97706 0%, #ea580c 100%)',
              'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
            ];
            const bgGrad = gradients[i % gradients.length];
            return (
              <Link
                key={cls.id}
                href={`/dashboard/classes/${cls.id}`}
                className={styles.classCard}
              >
                <div className={styles.banner} style={{ background: bgGrad }}>
                  {user?.role === 'teacher' && (
                    <button
                      type="button"
                      className={styles.deleteClassBannerBtn}
                      onClick={(e) => handleDeleteClass(e, cls)}
                      title="حذف این کلاس (سطل زباله)"
                    >
                      <HiOutlineTrash size={16} />
                    </button>
                  )}
                  <div className={styles.bannerText}>
                    <span>{cls.subject || 'عمومی'}</span>
                    <h3>{cls.name}</h3>
                  </div>
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.cardMeta}>
                    {cls.grade && (
                      <span className="badge badge-primary">
                        پایه {cls.grade}
                      </span>
                    )}
                    {cls.teacher_name && (
                      <span className={styles.teacherName}>👨‍🏫 {cls.teacher_name}</span>
                    )}
                  </div>

                  {(user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'manager') && (
                    <div className={styles.codeRow}>
                      <button
                        type="button"
                        className={styles.joinCodeBadge}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          copyCode(cls.join_code, cls.id);
                        }}
                        title="برای کپی کد عضویت کلاس کلیک کنید"
                      >
                        <span className={styles.joinCodeLabel}>کد کلاس:</span>
                        <span className={styles.joinCodeText}>{cls.join_code}</span>
                        <span className={`${styles.copyIconWrapper} ${copiedId === cls.id ? styles.copied : ''}`}>
                          {copiedId === cls.id ? (
                            <>
                              <HiOutlineCheck size={14} />
                              <span className={styles.copyText}>کپی شد</span>
                            </>
                          ) : (
                            <>
                              <HiOutlineClipboard size={14} />
                              <span className={styles.copyText}>کپی</span>
                            </>
                          )}
                        </span>
                      </button>

                      <div className={styles.codeActions}>
                        <Link
                          href={`/dashboard/classes/${cls.id}/live`}
                          onClick={(e) => e.stopPropagation()}
                          className="btn btn-primary btn-sm"
                          style={{
                            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                            borderColor: '#ef4444',
                            color: '#fff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            fontWeight: 700,
                            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.35)',
                          }}
                          title="شروع یا ورود به کلاس آنلاین"
                        >
                          <HiOutlineVideoCamera size={16} />
                          <span>کلاس آنلاین 🔴</span>
                        </Link>
                        <Link
                          href="/dashboard/report-card"
                          onClick={(e) => e.stopPropagation()}
                          className="btn btn-secondary btn-sm"
                          style={{
                            color: '#6366f1',
                            borderColor: 'rgba(99, 102, 241, 0.4)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="ورود و ثبت نمرات این کلاس"
                        >
                          دفتر نمرات
                        </Link>
                      </div>
                    </div>
                  )}

                  {user?.role !== 'teacher' && (
                    <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                      <Link
                        href={`/dashboard/classes/${cls.id}/live`}
                        onClick={(e) => e.stopPropagation()}
                        className="btn btn-primary btn-sm"
                        style={{
                          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                          borderColor: '#ef4444',
                          color: '#fff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 700,
                          boxShadow: '0 2px 8px rgba(239, 68, 68, 0.35)'
                        }}
                      >
                        <HiOutlineVideoCamera size={16} />
                        <span>ورود به کلاس آنلاین 🔴</span>
                      </Link>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Modal: Create or Join */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-3xl)',
              padding: '32px',
              maxWidth: '500px',
              width: '100%',
              boxShadow: 'var(--shadow-2xl)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                {modalType === 'create' ? 'ساخت و برگزاری کلاس درس' : 'عضویت در کلاس با کد'}
              </h2>
              <button
                style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', fontSize: '1.5rem', cursor: 'pointer' }}
                onClick={() => setShowModal(false)}
              >
                <HiOutlineXMark />
              </button>
            </div>

            {modalType === 'create' ? (
              <form onSubmit={(e) => handleCreate(e, launchLiveAfterCreate)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>نام کلاس *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="مثلاً: ریاضی یازدهم تجربی - الف"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                {teachersList.length > 0 && (
                  <div>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                      دبیر سرپرست کلاس (از دیتابیس معلمان مدرسه):
                    </label>
                    <select
                      className="input"
                      value={formData.teacher_name || ''}
                      onChange={(e) => {
                        const selectedTeacher = teachersList.find((t) => t.name === e.target.value);
                        setFormData({
                          ...formData,
                          teacher_name: e.target.value,
                          subject: selectedTeacher ? selectedTeacher.subject : formData.subject,
                        });
                      }}
                    >
                      <option value="">-- انتخاب دبیر تخصصی --</option>
                      {teachersList.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name} ({t.code} - {t.subject})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>ماده درسی</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="مثلاً: ریاضیات (پیش‌فرض: عمومی)"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>پایه تحصیلی</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="مثلاً: یازدهم"
                      value={formData.grade}
                      onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    />
                  </div>
                </div>

                {/* Instant Live Class Option */}
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: 'var(--radius-xl)',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                  }}
                  onClick={() => setLaunchLiveAfterCreate((prev) => !prev)}
                >
                  <input
                    type="checkbox"
                    id="instantLiveCheck"
                    checked={launchLiveAfterCreate}
                    onChange={(e) => {
                      e.stopPropagation();
                      setLaunchLiveAfterCreate(e.target.checked);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: '18px', height: '18px', accentColor: '#ef4444', cursor: 'pointer' }}
                  />
                  <label
                    htmlFor="instantLiveCheck"
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}
                  >
                    🔴 پس از ثبت کلاس، بلافاصله وارد محیط کلاس آنلاین شو
                  </label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={(e) => handleCreate(e, false)}
                      disabled={isSubmitting}
                      className="btn btn-primary"
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        fontWeight: 600,
                        padding: '12px',
                      }}
                    >
                      <HiOutlineAcademicCap size={20} />
                      <span>{isSubmitting ? 'در حال ثبت کلاس...' : 'ثبت کلاس (عادی / آفلاین) 📚'}</span>
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                      انصراف
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleCreate(e, true)}
                    disabled={isSubmitting}
                    className="btn btn-secondary"
                    style={{
                      background: 'rgba(239, 68, 68, 0.08)',
                      borderColor: 'rgba(239, 68, 68, 0.3)',
                      color: '#ef4444',
                      fontWeight: 700,
                      padding: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <HiOutlineVideoCamera size={20} />
                    <span>{isSubmitting ? 'در حال بارگذاری...' : 'ثبت و ورود مستقیم به کلاس آنلاین 🔴'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>کد ۶ رقمی کلاس *</label>
                  <input
                    type="text"
                    className="input"
                    style={{
                      textAlign: 'center',
                      fontSize: '1.5rem',
                      letterSpacing: '6px',
                      fontFamily: 'monospace',
                      textTransform: 'uppercase',
                    }}
                    placeholder="TX7H8L"
                    maxLength={6}
                    value={formData.join_code}
                    onChange={(e) => setFormData({ ...formData, join_code: e.target.value })}
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '6px', display: 'block' }}>
                    کد دعوت را از دبیر خود دریافت کنید.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    عضویت در کلاس
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                    انصراف
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
