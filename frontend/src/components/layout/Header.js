'use client';
import { useState, useEffect } from 'react';
import useAuthStore from '../../stores/authStore';
import Link from 'next/link';
import {
  HiOutlineMagnifyingGlass,
  HiOutlineBell,
  HiOutlineMoon,
  HiOutlineSun,
  HiOutlineSparkles,
  HiOutlineCalendar,
  HiOutlineClock,
  HiOutlineXMark,
  HiOutlineDocumentDuplicate,
  HiOutlineBars3,
  HiOutlineArrowUturnRight,
} from 'react-icons/hi2';
import styles from './Header.module.css';
import toast from 'react-hot-toast';

export default function Header({ onToggleMobileMenu, isMobileMenuOpen }) {
  const { user } = useAuthStore();
  const isRealAdmin =
    user?.original_role === 'admin' ||
    user?.original_role === 'manager' ||
    (!user?.original_role && (user?.role === 'admin' || user?.role === 'manager'));
  const [currentTheme, setCurrentTheme] = useState('light');
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);

  // AI prompt state
  const [aiTopic, setAiTopic] = useState('');
  const [aiType, setAiType] = useState('quiz');
  const [aiResult, setAiResult] = useState('');
  const [generatingAi, setGeneratingAi] = useState(false);

  useEffect(() => {
    // Check initial theme
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    setCurrentTheme(theme);

    // Update Persian Date & Clock
    const updateDateTime = () => {
      const now = new Date();
      setCurrentDate(
        now.toLocaleDateString('fa-IR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      );
      setCurrentTime(
        now.toLocaleTimeString('fa-IR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    };

    updateDateTime();
    const timer = setInterval(updateDateTime, 30000);
    return () => clearInterval(timer);
  }, []);

  const toggleTheme = () => {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setCurrentTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);
    toast.success(nextTheme === 'dark' ? 'حالت شب فعال شد 🌙' : 'حالت روز فعال شد ☀️');
  };

  const handleRoleSwitch = (newRole) => {
    if (!user) return;
    if (!isRealAdmin) {
      toast.error('امکان تغییر نقش برای این حساب کاربری مجاز نمی‌باشد');
      return;
    }
    if (newRole !== 'admin' && newRole !== 'teacher') {
      toast.error('تنها جابجایی بین پنل مدیریت و دبیر امکان‌پذیر است');
      return;
    }

    const originalRole = user.original_role || 'admin';
    const updatedUser = { ...user, role: newRole, original_role: originalRole };
    useAuthStore.setState({ user: updatedUser });
    try {
      localStorage.setItem('cached_user', JSON.stringify(updatedUser));
    } catch (e) {}

    const roleNames = {
      admin: 'مدیریت مجتمع',
      teacher: 'دبیر و کادر آموزشی',
    };
    toast.success(`ورود به پنل «${roleNames[newRole] || newRole}» انجام شد ✨`);
  };

  const handleGenerateAi = () => {
    if (!aiTopic.trim()) {
      toast.error('لطفاً موضوع یا مبحث درس را وارد کنید');
      return;
    }
    setGeneratingAi(true);
    setTimeout(() => {
      if (aiType === 'quiz') {
        setAiResult(`📝 سوالات پیشنهادی هوش مصنوعی برای "${aiTopic}":

سوال ۱: تعریف اصلی و کاربرد کلیدی ${aiTopic} چیست؟
الف) گزینه اول پایه
ب) گزینه تحلیلی و صحیح ★
ج) گزینه گمراه‌کننده اول
د) گزینه نامرتبط

سوال ۲: در تحلیل رفتار سیستم‌های مرتبط با ${aiTopic}، کدام متغیر بیشترین اثر را دارد؟
الف) متغیر ورودی اصلی ★
ب) متغیر تصادفی
ج) شاخص بدون تغییر
د) هیچ‌کدام`);
      } else if (aiType === 'announcement') {
        setAiResult(`📢 متن اطلاعیه هوشمند:
دانش‌آموزان گرامی کلاس،
با توجه به تدریس مبحث "${aiTopic}"، لطفاً تکالیف بخش مربوطه را تا روز تعیین‌شده در پنل ادوکانکت ارسال نمایید. آزمون کلاسی کوتاهی نیز در این رابطه برگزار خواهد شد.
با آرزوی موفقیت، دبیر محترم شما ✨`);
      } else {
        setAiResult(`💡 پیشنهاد تمرینات تکمیلی هوش مصنوعی:
۱. حل ۳ مسئله با درجه دشواری متوسط از مبحث ${aiTopic}
۲. تدوین خلاصه نموداری (Mind Map) در یک صفحه
۳. تحلیل یک مثال کاربردی در دنیای واقعی`);
      }
      setGeneratingAi(false);
      toast.success('پیشنهاد هوش مصنوعی تولید شد ✨');
    }, 1200);
  };

  const handleCopyAiResult = () => {
    if (aiResult) {
      navigator.clipboard.writeText(aiResult);
      toast.success('متن هوش مصنوعی در حافظه کپی شد 📋');
    }
  };

  return (
    <>
      <header className={styles.header}>
        {/* Left: Hamburger Button (for mobile) & Search Bar */}
        <div className={styles.leftSection}>
          {onToggleMobileMenu && (
            <button
              className={styles.hamburgerBtn}
              onClick={onToggleMobileMenu}
              aria-label="منوی ناوبری"
              title="باز و بستن منوی سایت"
            >
              <HiOutlineBars3 />
            </button>
          )}

          <div className={styles.searchBar}>
            <HiOutlineMagnifyingGlass style={{ color: 'var(--text-tertiary)', fontSize: '1.125rem' }} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="جستجوی سریع کلاس‌ها، تکالیف یا دانش‌آموزان..."
            />
            <span className={styles.searchKbd}>Ctrl + K</span>
          </div>
        </div>

        {/* Right: Actions, AI Button, Date, Theme, Profile */}
        <div className={styles.rightSection}>
          {/* AI Assistant Button */}
          <button className={styles.aiBtn} onClick={() => setShowAiModal(true)} title="دستیار هوشمند آموزشی">
            <HiOutlineSparkles style={{ fontSize: '1.125rem' }} />
            <span className={styles.aiBtnText}>EduConnect AI</span>
          </button>

          {/* Persian Date Widget */}
          <div className={styles.dateWidget}>
            <HiOutlineCalendar style={{ color: 'var(--primary-400)' }} />
            <span>{currentDate || 'امروز'}</span>
            <span>•</span>
            <HiOutlineClock style={{ color: '#06b6d4' }} />
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{currentTime}</span>
          </div>

          {/* Panel Switcher - ONLY for Principal/Admin to view Teacher panel */}
          {isRealAdmin && (
            <div className={styles.adminRoleSwitchContainer}>
              <select
                className={styles.roleSelect}
                value={user?.role === 'teacher' ? 'teacher' : 'admin'}
                onChange={(e) => handleRoleSwitch(e.target.value)}
                title="تغییر پنل (فقط مجاز بین مدیریت و دبیر)"
              >
                <option value="admin">🏛️ پنل مدیر</option>
                <option value="teacher">👨‍🏫 پنل دبیر</option>
              </select>

              {user?.role === 'teacher' && (
                <button
                  type="button"
                  onClick={() => handleRoleSwitch('admin')}
                  className={styles.returnAdminBtn}
                  title="بازگشت به ستاد مدیریت مدرسه"
                >
                  <HiOutlineArrowUturnRight style={{ fontSize: '0.875rem' }} />
                  <span className={styles.returnAdminBtnText}>بازگشت به مدیر</span>
                </button>
              )}
            </div>
          )}

          {/* Teacher School & Grades Quick Link */}
          {user?.role === 'teacher' && (
            <Link
              href="/dashboard/teacher-setup"
              className={styles.teacherSetupBtn}
              title="ثبت و ویرایش اطلاعات مدرسه و پایه‌های تحصیلی تدریس شما"
            >
              <span>🏛️</span>
              <span className={styles.teacherSetupBtnText}>مدرسه و پایه‌ها</span>
            </Link>
          )}

          {/* Theme Toggle */}
          <button className={styles.iconBtn} onClick={toggleTheme} title="تغییر حالت شب و روز">
            {currentTheme === 'dark' ? <HiOutlineSun style={{ color: '#f59e0b' }} /> : <HiOutlineMoon />}
          </button>

          {/* Notifications */}
          <Link href="/dashboard/notifications" className={styles.iconBtn} title="اعلان‌ها">
            <HiOutlineBell />
            <span className={styles.badgeDot}></span>
          </Link>

          {/* Profile Pill */}
          <Link href="/dashboard/settings" className={styles.profilePill} title="مشاهده و ویرایش مشخصات پروفایل">
            <div className="avatar" style={{ width: '34px', height: '34px', fontSize: '0.875rem' }}>
              {user?.avatar_url ? (
                <img
                  src={
                    user.avatar_url.startsWith('http') || user.avatar_url.startsWith('data:')
                      ? user.avatar_url
                      : (process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:5000') + user.avatar_url
                  }
                  alt={user?.display_name || 'کاربر'}
                />
              ) : (
                user?.display_name?.charAt(0) || 'ک'
              )}
            </div>
            <div className={styles.userTexts}>
              <span className={styles.userName}>{user?.display_name}</span>
              <span className={styles.userStatus}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                آنلاین
              </span>
            </div>
          </Link>
        </div>
      </header>

      {/* AI Assistant Modal */}
      {showAiModal && (
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
            animation: 'fadeIn 0.2s ease',
          }}
          onClick={() => setShowAiModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              width: '100%',
              maxWidth: '600px',
              borderRadius: 'var(--radius-2xl)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              boxShadow: '0 20px 50px -10px rgba(168, 85, 247, 0.3)',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                  }}
                >
                  <HiOutlineSparkles />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 800 }}>دستیار هوش مصنوعی ادوکانکت</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    تولید خودکار سوالات آزمون، متن اطلاعیه و تکالیف هوشمند
                  </span>
                </div>
              </div>
              <button
                style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '1.25rem' }}
                onClick={() => setShowAiModal(false)}
              >
                <HiOutlineXMark />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                  نوع محتوای مورد نیاز:
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${aiType === 'quiz' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setAiType('quiz')}
                  >
                    طراحی سوالات تستی
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${aiType === 'announcement' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setAiType('announcement')}
                  >
                    نگارش اطلاعیه کلاسی
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${aiType === 'homework' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setAiType('homework')}
                  >
                    پیشنهاد تمارین تکمیلی
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                  مبحث درسی یا موضوع مورد نظر:
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="مثلاً: مشتق توابع مثلثاتی، قوانین نیوتن، آرایه‌های ادبی..."
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                />
              </div>

              <button
                className="btn btn-primary"
                onClick={handleGenerateAi}
                disabled={generatingAi}
                style={{ background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)' }}
              >
                <HiOutlineSparkles />
                <span>{generatingAi ? 'در حال پردازش هوش مصنوعی...' : 'تولید محتوا با هوش مصنوعی'}</span>
              </button>

              {aiResult && (
                <div
                  style={{
                    background: 'var(--bg-hover)',
                    borderRadius: 'var(--radius-xl)',
                    padding: '16px',
                    border: '1px solid rgba(168, 85, 247, 0.25)',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c084fc' }}>پاسخ هوش مصنوعی:</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleCopyAiResult}
                      title="کپی در حافظه"
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                    >
                      <HiOutlineDocumentDuplicate />
                      <span>کپی متن</span>
                    </button>
                  </div>
                  <pre
                    style={{
                      fontFamily: 'inherit',
                      whiteSpace: 'pre-line',
                      fontSize: '0.875rem',
                      color: 'var(--text-primary)',
                      lineHeight: 1.7,
                    }}
                  >
                    {aiResult}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
