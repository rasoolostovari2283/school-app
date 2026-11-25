'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import {
  HiOutlineHome,
  HiOutlineAcademicCap,
  HiOutlineDocumentText,
  HiOutlineClipboardDocumentCheck,
  HiOutlineChatBubbleLeftRight,
  HiOutlineMegaphone,
  HiOutlineChartBar,
  HiOutlineCog6Tooth,
  HiOutlineArrowRightOnRectangle,
  HiOutlineBuildingLibrary,
  HiOutlineUserGroup,
  HiOutlineSparkles,
  HiOutlineCalendarDays,
  HiOutlineLifebuoy,
  HiOutlineBookOpen,
  HiOutlineBanknotes,
  HiOutlineShieldCheck,
  HiOutlineCpuChip,
  HiOutlineXMark,
  HiOutlineChevronLeft,
  HiOutlineVideoCamera,
  HiOutlinePlayCircle,
  HiOutlineComputerDesktop,
  HiOutlineCheckBadge,
} from 'react-icons/hi2';
import styles from './Sidebar.module.css';

const navByRole = {
  admin: [
    { href: '/dashboard/', icon: HiOutlineHome, fa: 'میز کار مدیریتی', en: 'Dashboard', group: 'مدیریت و عملیات' },
    { href: '/dashboard/management/', icon: HiOutlineBuildingLibrary, fa: 'اتوماسیون جامع مدرسه', en: 'School Management', group: 'مدیریت و عملیات' },
    { href: '/dashboard/teachers/', icon: HiOutlineUserGroup, fa: 'مدیریت کادر و دبیران', en: 'Teachers Directory', group: 'مدیریت و عملیات' },
    { href: '/dashboard/manage-classes/', icon: HiOutlineAcademicCap, fa: 'مدیریت کلاس‌ها و پایه‌ها', en: 'Manage Classes', group: 'مدیریت و عملیات' },
    { href: '/dashboard/smart-operations/', icon: HiOutlineCpuChip, fa: 'عملیات هوشمند (سیدا و OCR)', en: 'Smart Operations', group: 'مدیریت و عملیات', tag: 'هوشمند' },
    { href: '/dashboard/finance/', icon: HiOutlineBanknotes, fa: 'امور مالی و درگاه شاپرک', en: 'Finance & Shaparak', group: 'مدیریت و عملیات' },
    { href: '/dashboard/class-rosters/', icon: HiOutlineUserGroup, fa: 'لیست کلاس‌ها و آمار', en: 'Class Rosters', group: 'آموزش و ارزشیابی' },
    { href: '/dashboard/classes/', icon: HiOutlineAcademicCap, fa: 'کلاس‌های درس و آنلاین', en: 'Classes', group: 'آموزش و ارزشیابی' },
    { href: '/dashboard/courses/', icon: HiOutlineBuildingLibrary, fa: 'واحدها و دروس انتخابی', en: 'Course Catalog', group: 'آموزش و ارزشیابی' },
    { href: '/dashboard/attendance/', icon: HiOutlineCheckBadge, fa: 'حضور و غیاب مدرسه', en: 'Attendance', group: 'آموزش و ارزشیابی' },
    { href: '/dashboard/report-card/', icon: HiOutlineSparkles, fa: 'کارنامه رسمی و دفتر نمره', en: 'Report Card', group: 'آموزش و ارزشیابی' },
    { href: '/dashboard/discipline/', icon: HiOutlineShieldCheck, fa: 'انضباطی و مشاوره', en: 'Discipline & Counseling', group: 'آموزش و ارزشیابی' },
    { href: '/dashboard/analytics/', icon: HiOutlineChartBar, fa: 'تحلیل و آمار مدرسه', en: 'Analytics', group: 'آموزش و ارزشیابی' },
    { href: '/dashboard/school-meetings/', icon: HiOutlineVideoCamera, fa: 'وبینار و جلسات آنلاین', en: 'School Meetings', group: 'ارتباطات و پشتیبانی' },
    { href: '/dashboard/messages/', icon: HiOutlineChatBubbleLeftRight, fa: 'پیام‌ها', en: 'Messages', badgeKey: 'messages', group: 'ارتباطات و پشتیبانی' },
    { href: '/dashboard/announcements/', icon: HiOutlineMegaphone, fa: 'اطلاعیه‌های رسمی', en: 'Announcements', group: 'ارتباطات و پشتیبانی' },
    { href: '/dashboard/tickets/', icon: HiOutlineLifebuoy, fa: 'تیکت‌ها و پشتیبانی', en: 'Tickets', group: 'ارتباطات و پشتیبانی' },
  ],
  teacher: [
    { href: '/dashboard/', icon: HiOutlineHome, fa: 'داشبورد دبیر', en: 'Dashboard', group: 'میز کار آموزشی' },
    { href: '/dashboard/classes/', icon: HiOutlineAcademicCap, fa: 'کلاس‌های من', en: 'My Classes', group: 'میز کار آموزشی' },
    { href: '/dashboard/class-rosters/', icon: HiOutlineUserGroup, fa: 'لیست کلاسی', en: 'Class Rosters', group: 'میز کار آموزشی' },
    { href: '/dashboard/attendance/', icon: HiOutlineCheckBadge, fa: 'ثبت حضور و غیاب', en: 'Attendance', group: 'میز کار آموزشی' },
    { href: '/dashboard/record/', icon: HiOutlineComputerDesktop, fa: 'تخته هوشمند', en: 'Smart Board', group: 'میز کار آموزشی', tag: 'ضبط' },
    { href: '/dashboard/videos/', icon: HiOutlinePlayCircle, fa: 'ویدیوها و محتوای آموزشی', en: 'Educational Videos', group: 'میز کار آموزشی' },
    { href: '/dashboard/report-card/', icon: HiOutlineSparkles, fa: 'کارنامه‌ها', en: 'Report Cards & Gradebook', group: 'سنجش و تکالیف' },
    { href: '/dashboard/assignments/', icon: HiOutlineDocumentText, fa: 'تکالیف کلاسی', en: 'Assignments', group: 'سنجش و تکالیف' },
    { href: '/dashboard/quizzes/', icon: HiOutlineClipboardDocumentCheck, fa: 'آزمون‌ها و بانک سوال', en: 'Quizzes', group: 'سنجش و تکالیف' },
    { href: '/dashboard/study-planner/', icon: HiOutlineBookOpen, fa: 'دفتر برنامه‌ریزی تحصیلی', en: 'Study Planner', group: 'سنجش و تکالیف' },
    { href: '/dashboard/school-meetings/', icon: HiOutlineVideoCamera, fa: 'جلسات آنلاین مدرسه', en: 'School Meetings', group: 'برنامه و ارتباطات' },
    { href: '/dashboard/messages/', icon: HiOutlineChatBubbleLeftRight, fa: 'پیام‌ها', en: 'Messages', badgeKey: 'messages', group: 'برنامه و ارتباطات' },
    { href: '/dashboard/announcements/', icon: HiOutlineMegaphone, fa: 'اطلاعیه‌ها', en: 'Announcements', group: 'برنامه و ارتباطات' },
  ],
  counselor: [
    { href: '/dashboard/', icon: HiOutlineHome, fa: 'میز کار مشاور', en: 'Counselor Desk', group: 'هدایت تحصیلی' },
    { href: '/dashboard/discipline/', icon: HiOutlineShieldCheck, fa: 'پرونده مشاوره و انضباطی', en: 'Counseling & Discipline', group: 'هدایت تحصیلی' },
    { href: '/dashboard/study-planner/', icon: HiOutlineBookOpen, fa: 'دفتر برنامه‌ریزی و کنکور', en: 'Study Planner', group: 'هدایت تحصیلی', tag: 'ویژه' },
    { href: '/dashboard/report-card/', icon: HiOutlineSparkles, fa: 'پایش کارنامه و تراز', en: 'Academic Progress', group: 'هدایت تحصیلی' },
    { href: '/dashboard/class-rosters/', icon: HiOutlineUserGroup, fa: 'فهرست دانش‌آموزان', en: 'Student Roster', group: 'تحلیل و ارتباط' },
    { href: '/dashboard/analytics/', icon: HiOutlineChartBar, fa: 'تحلیل پیشرفت تحصیلی', en: 'Analytics', group: 'تحلیل و ارتباط' },
    { href: '/dashboard/schedule/', icon: HiOutlineCalendarDays, fa: 'برنامه هفتگی و امتحانات', en: 'Schedule', group: 'تحلیل و ارتباط' },
    { href: '/dashboard/messages/', icon: HiOutlineChatBubbleLeftRight, fa: 'پیام‌ها', en: 'Messages', badgeKey: 'messages', group: 'تحلیل و ارتباط' },
    { href: '/dashboard/tickets/', icon: HiOutlineLifebuoy, fa: 'تیکت‌های مشاوره', en: 'Counseling Tickets', group: 'تحلیل و ارتباط' },
  ],
  financial_officer: [
    { href: '/dashboard/', icon: HiOutlineHome, fa: 'میز کار امور مالی', en: 'Finance Desk', group: 'حسابداری و شهریه' },
    { href: '/dashboard/finance/', icon: HiOutlineBanknotes, fa: 'دفتر کل شهریه و شاپرک', en: 'Tuition & Shaparak', group: 'حسابداری و شهریه', tag: 'شاپرک' },
    { href: '/dashboard/smart-operations/', icon: HiOutlineCpuChip, fa: 'ابزارهای شبا و سیدا', en: 'Sheba & Sida Tools', group: 'حسابداری و شهریه' },
    { href: '/dashboard/management/', icon: HiOutlineBuildingLibrary, fa: 'فهرست دانش‌آموزان و اولیا', en: 'Student Directory', group: 'پشتیبانی مالی' },
    { href: '/dashboard/messages/', icon: HiOutlineChatBubbleLeftRight, fa: 'پیام‌ها', en: 'Messages', badgeKey: 'messages', group: 'پشتیبانی مالی' },
    { href: '/dashboard/tickets/', icon: HiOutlineLifebuoy, fa: 'تیکت‌های امور شهریه', en: 'Finance Tickets', group: 'پشتیبانی مالی' },
  ],
  student: [
    { href: '/dashboard/', icon: HiOutlineHome, fa: 'میز کار دانش‌آموز', en: 'Dashboard', group: 'تحصیل و کلاس' },
    { href: '/dashboard/select-teachers/', icon: HiOutlineUserGroup, fa: 'انتخاب معلمان من', en: 'Select Teachers', group: 'تحصیل و کلاس' },
    { href: '/dashboard/classes/', icon: HiOutlineAcademicCap, fa: 'کلاس‌های من', en: 'My Classes', group: 'تحصیل و کلاس' },
    { href: '/dashboard/courses/', icon: HiOutlineBuildingLibrary, fa: 'انتخاب واحد و دروس', en: 'Course Enrollment', group: 'تحصیل و کلاس' },
    { href: '/dashboard/study-planner/', icon: HiOutlineBookOpen, fa: 'دفتر برنامه‌ریزی تحصیلی', en: 'Study Planner', group: 'تحصیل و کلاس', tag: 'هدفمند' },
    { href: '/dashboard/record/', icon: HiOutlineComputerDesktop, fa: 'تخته هوشمند', en: 'Smart Board', group: 'تحصیل و کلاس' },
    { href: '/dashboard/videos/', icon: HiOutlinePlayCircle, fa: 'ویدیوها و محتوای آموزشی', en: 'Educational Videos', group: 'تحصیل و کلاس' },
    { href: '/dashboard/school-meetings/', icon: HiOutlineVideoCamera, fa: 'جلسات آنلاین مدرسه', en: 'School Meetings', group: 'تحصیل و کلاس' },
    { href: '/dashboard/schedule/', icon: HiOutlineCalendarDays, fa: 'برنامه هفتگی و امتحانات', en: 'Weekly Schedule', group: 'سنجش و کارنامه' },
    { href: '/dashboard/assignments/', icon: HiOutlineDocumentText, fa: 'تکالیف من', en: 'My Assignments', group: 'سنجش و کارنامه' },
    { href: '/dashboard/quizzes/', icon: HiOutlineClipboardDocumentCheck, fa: 'آزمون‌های آنلاین', en: 'Quizzes', group: 'سنجش و کارنامه' },
    { href: '/dashboard/report-card/', icon: HiOutlineSparkles, fa: 'کارنامه‌ها', en: 'Report Cards', group: 'سنجش و کارنامه' },
    { href: '/dashboard/attendance/', icon: HiOutlineCheckBadge, fa: 'وضعیت حضور و غیاب', en: 'My Attendance', group: 'سنجش و کارنامه' },
    { href: '/dashboard/finance/', icon: HiOutlineBanknotes, fa: 'شهریه و پرداخت شاپرک', en: 'Tuition & Payment', group: 'ارتباطات و امور مالی' },
    { href: '/dashboard/messages/', icon: HiOutlineChatBubbleLeftRight, fa: 'پیام‌ها', en: 'Messages', badgeKey: 'messages', group: 'ارتباطات و امور مالی' },
    { href: '/dashboard/announcements/', icon: HiOutlineMegaphone, fa: 'اطلاعیه‌های مدرسه', en: 'Announcements', group: 'ارتباطات و امور مالی' },
    { href: '/dashboard/tickets/', icon: HiOutlineLifebuoy, fa: 'تیکت و پشتیبانی', en: 'Support Tickets', group: 'ارتباطات و امور مالی' },
  ],
  parent: [
    { href: '/dashboard/', icon: HiOutlineHome, fa: 'پورتال اولیا', en: 'Parent Portal', group: 'پایش تحصیلی فرزند' },
    { href: '/dashboard/report-card/', icon: HiOutlineSparkles, fa: 'کارنامه و نمرات فرزند', en: 'Child Report Card', group: 'پایش تحصیلی فرزند' },
    { href: '/dashboard/attendance/', icon: HiOutlineCheckBadge, fa: 'حضور و غیاب فرزند', en: 'Child Attendance', group: 'پایش تحصیلی فرزند' },
    { href: '/dashboard/assignments/', icon: HiOutlineDocumentText, fa: 'تکالیف درسی فرزند', en: 'Child Assignments', group: 'پایش تحصیلی فرزند' },
    { href: '/dashboard/quizzes/', icon: HiOutlineClipboardDocumentCheck, fa: 'آزمون‌های فرزند', en: 'Child Quizzes', group: 'پایش تحصیلی فرزند' },
    { href: '/dashboard/discipline/', icon: HiOutlineShieldCheck, fa: 'پرونده انضباطی و مشاوره', en: 'Discipline & Counseling', group: 'پایش تحصیلی فرزند' },
    { href: '/dashboard/study-planner/', icon: HiOutlineBookOpen, fa: 'پایش برنامه‌ریزی فرزند', en: 'Study Progress', group: 'برنامه و ارتباط با مدرسه' },
    { href: '/dashboard/schedule/', icon: HiOutlineCalendarDays, fa: 'برنامه هفتگی فرزند', en: 'Weekly Schedule', group: 'برنامه و ارتباط با مدرسه' },
    { href: '/dashboard/finance/', icon: HiOutlineBanknotes, fa: 'امور شهریه و پرداخت آنلاین', en: 'Tuition & Shaparak', group: 'برنامه و ارتباط با مدرسه', tag: 'شاپرک' },
    { href: '/dashboard/school-meetings/', icon: HiOutlineVideoCamera, fa: 'جلسات آنلاین اولیا', en: 'Online Meetings', group: 'برنامه و ارتباط با مدرسه' },
    { href: '/dashboard/messages/', icon: HiOutlineChatBubbleLeftRight, fa: 'پیام‌ها', en: 'Messages', badgeKey: 'messages', group: 'برنامه و ارتباط با مدرسه' },
    { href: '/dashboard/announcements/', icon: HiOutlineMegaphone, fa: 'اطلاعیه‌های مدرسه', en: 'Announcements', group: 'برنامه و ارتباط با مدرسه' },
    { href: '/dashboard/tickets/', icon: HiOutlineLifebuoy, fa: 'درخواست و تیکت به مدرسه', en: 'School Tickets', group: 'برنامه و ارتباط با مدرسه' },
  ],
};

const ROLE_LABELS = {
  admin: { fa: 'مدیر و ستاد مدرسه', en: 'School Admin', badgeClass: styles.badgeAdmin },
  manager: { fa: 'مدیر مجتمع آموزشی', en: 'School Manager', badgeClass: styles.badgeAdmin },
  teacher: { fa: 'دبیر و کادر آموزشی', en: 'Teacher', badgeClass: styles.badgeTeacher },
  counselor: { fa: 'مشاور ارشد تحصیلی', en: 'Academic Counselor', badgeClass: styles.badgeCounselor },
  financial_officer: { fa: 'مسئول امور مالی و شهریه', en: 'Financial Officer', badgeClass: styles.badgeFinance },
  accountant: { fa: 'حسابدار مدرسه', en: 'Accountant', badgeClass: styles.badgeFinance },
  student: { fa: 'دانش‌آموز', en: 'Student', badgeClass: styles.badgeStudent },
  parent: { fa: 'ولی دانش‌آموز', en: 'Parent', badgeClass: styles.badgeParent },
};

export default function Sidebar({ isOpen, onClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, t } = useAuthStore();
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [navigatingHref, setNavigatingHref] = useState(null);

  useEffect(() => {
    setNavigatingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const fetchUnreadCounts = async () => {
      try {
        const res = await api.get('/messages/conversations');
        if (!isMounted) return;
        const rawData = res.data?.data;
        const convs = Array.isArray(rawData) ? rawData : (rawData?.conversations || []);
        const totalDirectUnread = convs.reduce((acc, c) => acc + (Number(c.unread_count ?? c.unreadCount) || 0), 0);
        setUnreadMessagesCount(totalDirectUnread);
      } catch {
        // Silently ignore background polling errors
      }
    };

    fetchUnreadCounts();
    const interval = setInterval(fetchUnreadCounts, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user, pathname]);

  const normalizedRole =
    ['manager', 'principal', 'school_admin'].includes(user?.role)
      ? 'admin'
      : user?.role === 'accountant'
      ? 'financial_officer'
      : user?.role || 'student';
  const items = navByRole[normalizedRole] || navByRole.student;
  const roleMeta = ROLE_LABELS[user?.role] || ROLE_LABELS.student;

  // Group items by their section header
  const groupedItems = items.reduce((acc, item) => {
    const groupName = item.group || 'منوی اصلی';
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(item);
    return acc;
  }, {});

  const handleNavClick = (e, targetHref, badgeKey) => {
    if (badgeKey === 'messages') {
      setUnreadMessagesCount(0);
    }
    const normCurrent = pathname?.replace(/\/+$/, '') || '/dashboard';
    const normTarget = targetHref.replace(/\/+$/, '') || '/dashboard';

    if (normCurrent === normTarget) {
      // Already on this page; simply close the mobile drawer
      onClose?.();
      return;
    }

    setNavigatingHref(targetHref);
    // DashboardLayout's useEffect([pathname]) automatically closes the drawer
    // once the new page mounts. Add a safety fallback timer so the drawer never stays stuck.
    setTimeout(() => {
      onClose?.();
      setNavigatingHref(null);
    }, 450);
  };

  const handleLogout = async () => {
    onClose?.();
    await logout();
    router.push('/login/');
  };

  const avatarSrc = user?.avatar_url
    ? user.avatar_url.replace(/^https?:\/\/localhost:5000/, '')
    : null;

  return (
    <>
      {isOpen && (
        <div
          className={styles.overlay}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}
        aria-label="منوی اصلی سامانه"
      >
        {/* Top Brand Row + Mobile Close Button */}
        <div className={styles.brandRow}>
          <Link
            href="/dashboard/"
            className={styles.brand}
            onClick={(e) => handleNavClick(e, '/dashboard/')}
          >
            <div className={styles.brandIcon}>🎓</div>
            <div className={styles.brandTextWrap}>
              <div className={styles.brandName}>EduConnect</div>
              <div className={styles.brandSub}>
                {t('پلتفرم هوشمند مدارس ایران', 'Smart School Platform')}
              </div>
            </div>
          </Link>

          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="بستن منو"
            title="بستن منو"
          >
            <HiOutlineXMark />
          </button>
        </div>

        {/* User Profile Card */}
        {user && (
          <Link
            href="/dashboard/settings/"
            className={styles.userCard}
            onClick={(e) => handleNavClick(e, '/dashboard/settings/')}
            title="مشاهده و ویرایش تنظیمات حساب کاربری"
          >
            <div className={styles.avatar}>
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={user.display_name}
                  className={styles.avatarImg}
                />
              ) : (
                user.display_name?.charAt(0) || 'ک'
              )}
              <span className={styles.onlineDot} />
            </div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user.display_name}</div>
              <span className={`${styles.roleBadge} ${roleMeta.badgeClass}`}>
                {t(roleMeta.fa, roleMeta.en)}
              </span>
            </div>
            <HiOutlineChevronLeft className={styles.userChevron} />
          </Link>
        )}

        {/* Grouped Navigation Links */}
        <nav className={styles.nav}>
          {Object.entries(groupedItems).map(([groupTitle, groupLinks]) => (
            <div key={groupTitle} className={styles.navGroup}>
              <div className={styles.navGroupLabel}>{groupTitle}</div>
              {groupLinks.map((item) => {
                const Icon = item.icon;
                const normPath = pathname?.replace(/\/+$/, '') || '';
                const normHref = item.href.replace(/\/+$/, '');
                const isActive =
                  normPath === normHref ||
                  (normHref !== '/dashboard' && normPath.startsWith(normHref));
                const isPending = navigatingHref === item.href;
                const badgeValue = item.badgeKey === 'messages' ? unreadMessagesCount : 0;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.navItem} ${isActive || isPending ? styles.active : ''}`}
                    onClick={(e) => handleNavClick(e, item.href, item.badgeKey)}
                  >
                    <div className={styles.navIconWrap}>
                      <Icon className={styles.navIcon} />
                    </div>
                    <span className={styles.navLabelText}>{t(item.fa, item.en)}</span>
                    {isPending && (
                      <span className={styles.featureTag}>...</span>
                    )}
                    {!isPending && item.tag && !badgeValue && (
                      <span className={styles.featureTag}>{item.tag}</span>
                    )}
                    {badgeValue > 0 && (
                      <span className={styles.unreadBadge}>
                        {badgeValue > 99 ? '99+' : badgeValue.toLocaleString('fa-IR')}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom Actions Footer */}
        <div className={styles.footer}>
          <Link
            href="/dashboard/settings/"
            className={`${styles.navItem} ${pathname?.includes('/settings') ? styles.active : ''}`}
            onClick={(e) => handleNavClick(e, '/dashboard/settings/')}
          >
            <div className={styles.navIconWrap}>
              <HiOutlineCog6Tooth className={styles.navIcon} />
            </div>
            <span className={styles.navLabelText}>{t('تنظیمات حساب و پروفایل', 'Account Settings')}</span>
          </Link>
          <button
            type="button"
            className={`${styles.navItem} ${styles.logoutBtn}`}
            onClick={handleLogout}
          >
            <div className={styles.navIconWrap}>
              <HiOutlineArrowRightOnRectangle className={styles.navIcon} />
            </div>
            <span className={styles.navLabelText}>{t('خروج امن از سامانه', 'Sign Out')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
