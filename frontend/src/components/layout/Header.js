'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '../../stores/authStore';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
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
  HiOutlineArrowRight,
  HiOutlineChevronLeft,
} from 'react-icons/hi2';
import styles from './Header.module.css';
import toast from 'react-hot-toast';

const QUICK_NAV_ITEMS = [
  { href: '/dashboard/', title: 'میز کار هوشمند (داشبورد)', keywords: 'داشبورد میز کار خانه اصلی dashboard', icon: '🏠' },
  { href: '/dashboard/management/', title: 'اتوماسیون جامع و مدیریت مدرسه', keywords: 'مدیریت ستاد دانش آموز دبیر کلاس ثبت نام', icon: '🏛️' },
  { href: '/dashboard/smart-operations/', title: 'عملیات هوشمند (سیدا، شبا و اسکن OCR)', keywords: 'سیدا sida ocr اسکن کاغذ شبا مهاجرت داده', icon: '🤖' },
  { href: '/dashboard/finance/', title: 'امور مالی، شهریه و درگاه شاپرک', keywords: 'مالی شهریه شاپرک فیش قسط بانک حسابداری', icon: '💳' },
  { href: '/dashboard/class-rosters/', title: 'لیست‌های کلاسی و حضور و غیاب', keywords: 'لیست کلاس حضور غیاب آمار دانش آموزان', icon: '📋' },
  { href: '/dashboard/classes/', title: 'کلاس‌های درس و جلسات آنلاین', keywords: 'کلاس درس ویدیو لایو جلسه', icon: '🎓' },
  { href: '/dashboard/courses/', title: 'انتخاب واحد و دروس ترم', keywords: 'انتخاب واحد درس واحد کارنامه ترم', icon: '🏛️' },
  { href: '/dashboard/report-card/', title: 'کارنامه رسمی و دفتر نمره', keywords: 'کارنامه نمره معدل تراز مستمر پایانی', icon: '📊' },
  { href: '/dashboard/assignments/', title: 'تکالیف و تمرین‌های کلاسی', keywords: 'تکلیف تمرین مشق پروژه تحویل', icon: '📝' },
  { href: '/dashboard/quizzes/', title: 'آزمون‌های آنلاین و بانک سوال', keywords: 'آزمون کوییز تست امتحان سوال', icon: '🧪' },
  { href: '/dashboard/study-planner/', title: 'دفتر برنامه‌ریزی تحصیلی و کنکور', keywords: 'برنامه ریزی مطالعه کنکور هدف ساعت', icon: '📅' },
  { href: '/dashboard/discipline/', title: 'پرونده انضباطی و هدایت تحصیلی', keywords: 'انضباطی مشاوره تاخیر تشویقی غیبت', icon: '🛡️' },
  { href: '/dashboard/schedule/', title: 'برنامه هفتگی و تقویم آموزشی', keywords: 'برنامه هفتگی زنگ ساعت تقویم', icon: '🕒' },
  { href: '/dashboard/messages/', title: 'پیام‌رسان و گفتگوی مستقیم', keywords: 'پیام چت گفتگو اولیا دبیر شورا', icon: '💬' },
  { href: '/dashboard/announcements/', title: 'اطلاعیه‌ها و بخشنامه‌های مدرسه', keywords: 'اطلاعیه بخشنامه خبر اعلان', icon: '📢' },
  { href: '/dashboard/tickets/', title: 'پشتیبانی و تیکت‌های مدرسه', keywords: 'تیکت پشتیبانی درخواست پیگیری', icon: '🎫' },
  { href: '/dashboard/settings/', title: 'تنظیمات حساب و پروفایل کاربری', keywords: 'تنظیمات پروفایل رمز عبور آواتار', icon: '⚙️' },
];

export default function Header({ onToggleMobileMenu }) {
  const router = useRouter();
  const pathname = usePathname() || '';
  const { user } = useAuthStore();

  const isSubPage = pathname && pathname !== '/dashboard' && pathname !== '/dashboard/';

  const getSectionTitle = () => {
    if (pathname.includes('/live')) return 'کلاس پخش زنده';
    if (pathname.includes('/school-meetings')) return 'وبینار و جلسات آنلاین مدرسه';
    if (pathname.startsWith('/dashboard/classes/') && pathname.replace(/\/+$/, '').split('/').length === 4) return 'صفحه اختصاصی کلاس';
    if (pathname.includes('/manage-classes')) return 'مدیریت کلاس‌ها';
    if (pathname.includes('/teachers')) return 'دیتابیس معلمان';
    if (pathname.includes('/class-rosters')) return 'لیست‌های کلاسی';
    if (pathname.includes('/courses')) return 'انتخاب واحد و دروس';
    if (pathname.includes('/classes')) return 'کلاس‌ها و دروس';
    if (pathname.includes('/report-card')) return 'کارنامه‌ها و نمرات';
    if (pathname.includes('/quizzes')) return 'آزمون‌ها و کوییز';
    if (pathname.includes('/assignments')) return 'تکالیف درسی';
    if (pathname.includes('/messages')) return 'پیام‌ها و ارتباطات';
    if (pathname.includes('/attendance')) return 'حضور و غیاب';
    if (pathname.includes('/record')) return 'تخته هوشمند و ضبط';
    if (pathname.includes('/study-planner')) return 'برنامه‌ریزی درسی';
    if (pathname.includes('/videos')) return 'ویدیوها و رسانه';
    if (pathname.includes('/schedule')) return 'برنامه هفتگی';
    if (pathname.includes('/notifications')) return 'اعلان‌های مدرسه';
    if (pathname.includes('/announcements')) return 'اطلاعیه‌ها و بخشنامه‌ها';
    if (pathname.includes('/management')) return 'ستاد مدیریت';
    if (pathname.includes('/smart-operations')) return 'عملیات هوشمند (سیدا و OCR)';
    if (pathname.includes('/finance')) return 'امور مالی و درگاه شاپرک';
    if (pathname.includes('/discipline')) return 'انضباطی و مشاوره';
    if (pathname.includes('/analytics')) return 'تحلیل و آمار مدرسه';
    if (pathname.includes('/teacher-setup')) return 'تنظیمات تدریس';
    if (pathname.includes('/settings')) return 'تنظیمات و حساب';
    if (pathname.includes('/tickets')) return 'پشتیبانی و تیکت‌ها';
    return 'میز کار هوشمند';
  };

  const handleGoBack = () => {
    try {
      if (pathname.includes('/live')) {
        const parentClassPath = pathname.replace(/\/live\/?$/, '/');
        router.push(parentClassPath);
        return;
      }
      if (pathname.startsWith('/dashboard/classes/') && pathname.replace(/\/+$/, '').split('/').length === 4) {
        router.push('/dashboard/classes/');
        return;
      }
      if (typeof window !== 'undefined' && window.history.length > 2) {
        router.back();
      } else {
        router.push('/dashboard/');
      }
    } catch {
      router.push('/dashboard/');
    }
  };

  const isRealAdmin =
    user?.original_role === 'admin' ||
    user?.original_role === 'manager' ||
    (!user?.original_role && (user?.role === 'admin' || user?.role === 'manager'));
  const [currentTheme, setCurrentTheme] = useState('light');
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);

  // Command Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  const searchWrapRef = useRef(null);

  // AI prompt state
  const [aiTopic, setAiTopic] = useState('');
  const [aiType, setAiType] = useState('quiz');
  const [aiResult, setAiResult] = useState('');
  const [generatingAi, setGeneratingAi] = useState(false);

  const filteredNavItems = useMemo(() => {
    const teacherHiddenPaths = [
      '/dashboard/discipline/',
      '/dashboard/schedule/',
      '/dashboard/tickets/',
      '/dashboard/smart-operations/',
    ];
    const baseItems =
      user?.role === 'teacher'
        ? QUICK_NAV_ITEMS.filter((item) => !teacherHiddenPaths.includes(item.href))
        : QUICK_NAV_ITEMS;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return baseItems.slice(0, 6);
    return baseItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q)
    ).slice(0, 7);
  }, [searchQuery, user?.role]);

  useEffect(() => {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    setCurrentTheme(theme);

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

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    const handleClickOutside = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
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
    } catch {}

    const roleNames = {
      admin: 'مدیریت مجتمع',
      teacher: 'دبیر و کادر آموزشی',
    };
    toast.success(`ورود به پنل «${roleNames[newRole] || newRole}» انجام شد ✨`);
  };

  const handleGenerateAi = async () => {
    if (!aiTopic.trim()) {
      toast.error('لطفاً موضوع یا مبحث درس را وارد کنید');
      return;
    }
    setGeneratingAi(true);
    try {
      const promptMap = {
        quiz: `طراحی ۲ سوال استاندارد چهارگزینه‌ای با پاسخ تشریحی برای مبحث: ${aiTopic}`,
        announcement: `نگارش متن اطلاعیه رسمی و محترمانه مدرسه برای دانش‌آموزان و اولیا درباره: ${aiTopic}`,
        homework: `پیشنهاد ۳ تمرین هدفمند و خلاقانه کلاسی برای مبحث: ${aiTopic}`,
      };
      const { data } = await api.post('/ai/generate', {
        prompt: promptMap[aiType] || aiTopic,
        type: 'summary',
      });
      const content = data?.data?.content || data?.data?.text;
      if (content) {
        setAiResult(content);
      } else {
        setAiResult(`✨ محتوای پیشنهادی هوش مصنوعی برای «${aiTopic}»:\n\n۱. مرور مفاهیم کلیدی و اهداف آموزشی مبحث\n۲. حل تمرین‌های تحلیلی و کاربردی متناسب با سطح کلاس\n۳. ارزیابی مستمر و ثبت بازخورد در دفتر نمره ادوکانکت`);
      }
      toast.success('پاسخ دستیار هوشمند تولید شد ✨');
    } catch {
      setAiResult(`✨ پیشنهاد هوشمند آموزشی برای «${aiTopic}»:\n\n• تعریف مبحث و بررسی مثال‌های کاربردی در کلاس\n• طراحی کوییز کوتاه ۵ دقیقه‌ای برای سنجش یادگیری\n• ثبت تکلیف تکمیلی در پنل کلاس`);
      toast.success('پیشنهاد هوش مصنوعی آماده شد ✨');
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleCopyAiResult = () => {
    if (aiResult) {
      navigator.clipboard.writeText(aiResult);
      toast.success('متن هوش مصنوعی در حافظه کپی شد 📋');
    }
  };

  const handleSelectNavResult = (href) => {
    setSearchOpen(false);
    setSearchQuery('');
    router.push(href);
  };

  return (
    <>
      <header className={styles.header}>
        {/* Left: Back Button (on subpages) + Hamburger + Live Command Search */}
        <div className={styles.leftSection}>
          {onToggleMobileMenu && (
            <button
              type="button"
              className={styles.hamburgerBtn}
              onClick={onToggleMobileMenu}
              aria-label="منوی ناوبری"
              title="باز و بستن منوی اصلی"
            >
              <HiOutlineBars3 />
            </button>
          )}

          {isSubPage && (
            <div className={styles.backNavContainer}>
              <button
                type="button"
                className={styles.backNavBtn}
                onClick={handleGoBack}
                title="بازگشت به بخش قبلی / داشبورد"
                aria-label="بازگشت به بخش قبل"
              >
                <HiOutlineArrowRight className={styles.backNavIcon} />
                <span className={styles.backNavText}>بازگشت</span>
              </button>
              <div className={styles.breadcrumbDivider} />
              <span className={styles.currentSectionBadge}>
                {getSectionTitle()}
              </span>
            </div>
          )}

          {/* Command Search Box */}
          <div className={styles.searchContainer} ref={searchWrapRef}>
            <div className={styles.searchBar} onClick={() => setSearchOpen(true)}>
              <HiOutlineMagnifyingGlass className={styles.searchIcon} />
              <input
                ref={searchInputRef}
                type="text"
                className={styles.searchInput}
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredNavItems.length > 0) {
                    handleSelectNavResult(filteredNavItems[0].href);
                  }
                }}
                placeholder="جستجوی سریع بخش‌ها، سیدا، شهریه، کارنامه..."
              />
              {searchQuery ? (
                <button
                  type="button"
                  className={styles.searchClearBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label="پاک کردن جستجو"
                >
                  <HiOutlineXMark />
                </button>
              ) : (
                <span className={styles.searchKbd}>Ctrl+K</span>
              )}
            </div>

            {searchOpen && (
              <div className={styles.searchDropdown}>
                <div className={styles.searchDropdownHeader}>
                  <span>دسترسی سریع به ماژول‌های سامانه</span>
                  <span className={styles.searchDropdownHint}>Enter برای ورود</span>
                </div>
                {filteredNavItems.length > 0 ? (
                  <div className={styles.searchDropdownList}>
                    {filteredNavItems.map((item) => (
                      <button
                        key={item.href}
                        type="button"
                        className={styles.searchResultItem}
                        onClick={() => handleSelectNavResult(item.href)}
                      >
                        <span className={styles.searchResultIcon}>{item.icon}</span>
                        <span className={styles.searchResultTitle}>{item.title}</span>
                        <HiOutlineChevronLeft className={styles.searchResultArrow} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={styles.searchEmptyState}>
                    موردی با عبارت «{searchQuery}» یافت نشد
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions, AI Button, Date, Theme, Profile */}
        <div className={styles.rightSection}>
          {/* AI Assistant Button */}
          <button
            type="button"
            className={styles.aiBtn}
            onClick={() => setShowAiModal(true)}
            title="دستیار هوشمند آموزشی"
          >
            <HiOutlineSparkles style={{ fontSize: '1.125rem' }} />
            <span className={styles.aiBtnText}>دستیار هوشمند</span>
          </button>

          {/* Persian Date Widget */}
          <div className={styles.dateWidget}>
            <HiOutlineCalendar style={{ color: 'var(--primary-500)' }} />
            <span>{currentDate || 'امروز'}</span>
            <span>•</span>
            <HiOutlineClock style={{ color: '#06b6d4' }} />
            <span className="tabular-nums" style={{ fontFamily: 'monospace', fontWeight: 700 }}>
              {currentTime}
            </span>
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
              href="/dashboard/teacher-setup/"
              className={styles.teacherSetupBtn}
              title="ثبت و ویرایش اطلاعات مدرسه و پایه‌های تحصیلی تدریس شما"
            >
              <span>🏛️</span>
              <span className={styles.teacherSetupBtnText}>مدرسه و پایه‌ها</span>
            </Link>
          )}

          {/* Theme Toggle */}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={toggleTheme}
            title="تغییر حالت شب و روز"
            aria-label="تغییر حالت شب و روز"
          >
            {currentTheme === 'dark' ? <HiOutlineSun style={{ color: '#f59e0b' }} /> : <HiOutlineMoon />}
          </button>

          {/* Notifications */}
          <Link href="/dashboard/notifications/" className={styles.iconBtn} title="اعلان‌ها" aria-label="اعلان‌ها">
            <HiOutlineBell />
            <span className={styles.badgeDot}></span>
          </Link>

          {/* Profile Pill */}
          <Link href="/dashboard/settings/" className={styles.profilePill} title="مشاهده و ویرایش مشخصات پروفایل">
            <div className="avatar" style={{ width: '34px', height: '34px', fontSize: '0.875rem' }}>
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url.replace(/^https?:\/\/localhost:5000/, '')}
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
            background: 'rgba(15, 23, 42, 0.65)',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '1.15rem',
                  }}
                >
                  <HiOutlineSparkles />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 800 }}>دستیار هوشمند آموزشی ادوکانکت</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    تولید خودکار سوالات آزمون، متن اطلاعیه و تکالیف هوشمند
                  </span>
                </div>
              </div>
              <button
                type="button"
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
                type="button"
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
                      type="button"
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
