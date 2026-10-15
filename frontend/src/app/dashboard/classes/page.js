'use client';
import { useEffect, useState } from 'react';
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
} from 'react-icons/hi2';
import styles from './classes.module.css';

export default function ClassesPage() {
  const { user } = useAuthStore();
  const { classes, fetchClasses, createClass, joinClass, deleteClass, isLoading } = useClassStore();
  const locale = user?.locale || 'fa';
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('create'); // 'create' | 'join'
  const [formData, setFormData] = useState({ name: '', subject: '', grade: '', join_code: '', teacher_name: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [teachersList, setTeachersList] = useState([]);

  useEffect(() => {
    fetchClasses();
    try {
      const code = user?.school_code || 'SCH-4821';
      const saved = localStorage.getItem('school_teachers_database') || localStorage.getItem(`mgmt_teachers_${code}`);
      if (saved) {
        setTeachersList(JSON.parse(saved));
      }
    } catch (e) {}
  }, [user]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const cls = await createClass(formData);
      toast.success(`کلاس "${cls.name}" با موفقیت ساخته شد! 🎉`);
      setShowModal(false);
      setFormData({ name: '', subject: '', grade: '', join_code: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ساخت کلاس');
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

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
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

                  {user?.role === 'teacher' && (
                    <div className={styles.codeRow}>
                      <span className={styles.joinCode}>{cls.join_code}</span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Link
                          href="/dashboard/report-card"
                          onClick={(e) => e.stopPropagation()}
                          className="btn btn-secondary btn-sm"
                          style={{ color: '#6366f1', borderColor: 'rgba(99, 102, 241, 0.4)' }}
                          title="ورود و ثبت نمرات این کلاس"
                        >
                          دفتر نمرات
                        </Link>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={(e) => {
                            e.preventDefault();
                            copyCode(cls.join_code);
                          }}
                          title="کپی کد عضویت"
                          type="button"
                        >
                          <HiOutlineClipboard />
                          <span>کپی</span>
                        </button>
                        <button
                          className={styles.deleteClassBtn}
                          onClick={(e) => handleDeleteClass(e, cls)}
                          title="حذف کلاس اشتباهی"
                          type="button"
                        >
                          <HiOutlineTrash size={15} />
                          <span>حذف</span>
                        </button>
                      </div>
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
                {modalType === 'create' ? 'ساخت کلاس درس جدید' : 'عضویت در کلاس با کد'}
              </h2>
              <button
                style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', fontSize: '1.5rem', cursor: 'pointer' }}
                onClick={() => setShowModal(false)}
              >
                <HiOutlineXMark />
              </button>
            </div>

            {modalType === 'create' ? (
              <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>ماده درسی *</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="مثلاً: ریاضیات"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      required
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

                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    ایجاد کلاس و دریافت کد
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                    انصراف
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
