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
} from 'react-icons/hi2';
import styles from './Sidebar.module.css';

const navByRole = {
  admin: [
    { href: '/dashboard', icon: HiOutlineHome, fa: 'میز کار مدیریتی', en: 'Dashboard' },
    { href: '/dashboard/management', icon: HiOutlineBuildingLibrary, fa: 'اتوماسیون جامع مدرسه', en: 'School Management' },
    { href: '/dashboard/smart-operations', icon: HiOutlineCpuChip, fa: 'عملیات هوشمند (سیدا و OCR)', en: 'Smart Operations' },
    { href: '/dashboard/finance', icon: HiOutlineBanknotes, fa: 'امور مالی و درگاه شاپرک', en: 'Finance & Shaparak' },
    { href: '/dashboard/class-rosters', icon: HiOutlineUserGroup, fa: 'لیست کلاس‌ها و آمار', en: 'Class Rosters' },
    { href: '/dashboard/classes', icon: HiOutlineAcademicCap, fa: 'کلاس‌های درس', en: 'Classes' },
    { href: '/dashboard/report-card', icon: HiOutlineSparkles, fa: 'کارنامه رسمی و دفتر نمره', en: 'Report Card' },
    { href: '/dashboard/discipline', icon: HiOutlineShieldCheck, fa: 'انضباطی و مشاوره', en: 'Discipline & Counseling' },
    { href: '/dashboard/analytics', icon: HiOutlineChartBar, fa: 'تحلیل و آمار مدرسه', en: 'Analytics' },
    { href: '/dashboard/messages', icon: HiOutlineChatBubbleLeftRight, fa: 'پیام‌رسان و شوراها', en: 'Messages', badgeKey: 'messages' },
    { href: '/dashboard/announcements', icon: HiOutlineMegaphone, fa: 'اطلاعیه‌های رسمی', en: 'Announcements' },
    { href: '/dashboard/tickets', icon: HiOutlineLifebuoy, fa: 'تیکت‌ها و پشتیبانی', en: 'Tickets' },
  ],
  teacher: [
    { href: '/dashboard', icon: HiOutlineHome, fa: 'داشبورد دبیر', en: 'Dashboard' },
    { href: '/dashboard/smart-operations', icon: HiOutlineCpuChip, fa: 'عملیات هوشمند (سیدا و OCR)', en: 'Smart Operations' },
    { href: '/dashboard/class-rosters', icon: HiOutlineUserGroup, fa: 'لیست کلاسی و حضور و غیاب', en: 'Class Rosters' },
    { href: '/dashboard/classes', icon: HiOutlineAcademicCap, fa: 'کلاس‌های من', en: 'My Classes' },
    { href: '/dashboard/report-card', icon: HiOutlineSparkles, fa: 'دفتر نمره و کارنامه', en: 'Gradebook & Report Card' },
    { href: '/dashboard/assignments', icon: HiOutlineDocumentText, fa: 'تکالیف کلاسی', en: 'Assignments' },
    { href: '/dashboard/quizzes', icon: HiOutlineClipboardDocumentCheck, fa: 'آزمون‌ها و بانک سوال', en: 'Quizzes' },
    { href: '/dashboard/study-planner', icon: HiOutlineBookOpen, fa: 'دفتر برنامه‌ریزی تحصیلی', en: 'Study Planner' },
    { href: '/dashboard/discipline', icon: HiOutlineShieldCheck, fa: 'موارد انضباطی و تشویقی', en: 'Discipline' },
    { href: '/dashboard/schedule', icon: HiOutlineCalendarDays, fa: 'برنامه هفتگی', en: 'Weekly Schedule' },
    { href: '/dashboard/messages', icon: HiOutlineChatBubbleLeftRight, fa: 'پیام‌رسان مدرسه', en: 'Messages', badgeKey: 'messages' },
    { href: '/dashboard/announcements', icon: HiOutlineMegaphone, fa: 'اطلاعیه‌ها', en: 'Announcements' },
  ],
  counselor: [
    { href: '/dashboard', icon: HiOutlineHome, fa: 'میز کار مشاور', en: 'Counselor Desk' },
    { href: '/dashboard/discipline', icon: HiOutlineShieldCheck, fa: 'پرونده مشاوره و انضباطی', en: 'Counseling & Discipline' },
    { href: '/dashboard/study-planner', icon: HiOutlineBookOpen, fa: 'دفتر برنامه‌ریزی و کنکور', en: 'Study Planner' },
    { href: '/dashboard/report-card', icon: HiOutlineSparkles, fa: 'پایش کارنامه و تراز', en: 'Academic Progress' },
    { href: '/dashboard/class-rosters', icon: HiOutlineUserGroup, fa: 'فهرست دانش‌آموزان', en: 'Student Roster' },
    { href: '/dashboard/analytics', icon: HiOutlineChartBar, fa: 'تحلیل پیشرفت تحصیلی', en: 'Analytics' },
    { href: '/dashboard/messages', icon: HiOutlineChatBubbleLeftRight, fa: 'ارتباط با اولیا و دانش‌آموز', en: 'Messages', badgeKey: 'messages' },
    { href: '/dashboard/tickets', icon: HiOutlineLifebuoy, fa: 'تیکت‌های مشاوره', en: 'Counseling Tickets' },
  ],
  financial_officer: [
    { href: '/dashboard', icon: HiOutlineHome, fa: 'میز کار امور مالی', en: 'Finance Desk' },
    { href: '/dashboard/finance', icon: HiOutlineBanknotes, fa: 'دفتر کل شهریه و شاپرک', en: 'Tuition & Shaparak' },
    { href: '/dashboard/smart-operations', icon: HiOutlineCpuChip, fa: 'ابزارهای شبا و سیدا', en: 'Sheba & Sida Tools' },
    { href: '/dashboard/management', icon: HiOutlineBuildingLibrary, fa: 'فهرست دانش‌آموزان و اولیا', en: 'Student Directory' },
    { href: '/dashboard/messages', icon: HiOutlineChatBubbleLeftRight, fa: 'پیام‌رسان مالی', en: 'Messages', badgeKey: 'messages' },
    { href: '/dashboard/tickets', icon: HiOutlineLifebuoy, fa: 'تیکت‌های امور شهریه', en: 'Finance Tickets' },
  ],
  student: [
    { href: '/dashboard', icon: HiOutlineHome, fa: 'میز کار دانش‌آموز', en: 'Dashboard' },
    { href: '/dashboard/classes', icon: HiOutlineAcademicCap, fa: 'کلاس‌های من', en: 'My Classes' },
    { href: '/dashboard/courses', icon: HiOutlineBuildingLibrary, fa: 'انتخاب واحد و دروس', en: 'Course Enrollment' },
    { href: '/dashboard/study-planner', icon: HiOutlineBookOpen, fa: 'دفتر برنامه‌ریزی تحصیلی', en: 'Study Planner' },
    { href: '/dashboard/schedule', icon: HiOutlineCalendarDays, fa: 'برنامه هفتگی و امتحانات', en: 'Weekly Schedule' },
    { href: '/dashboard/assignments', icon: HiOutlineDocumentText, fa: 'تکالیف من', en: 'My Assignments' },
    { href: '/dashboard/quizzes', icon: HiOutlineClipboardDocumentCheck, fa: 'آزمون‌های آنلاین', en: 'Quizzes' },
    { href: '/dashboard/report-card', icon: HiOutlineSparkles, fa: 'کارنامه رسمی نمرات', en: 'Report Card' },
    { href: '/dashboard/finance', icon: HiOutlineBanknotes, fa: 'شهریه و پرداخت شاپرک', en: 'Tuition & Payment' },
    { href: '/dashboard/messages', icon: HiOutlineChatBubbleLeftRight, fa: 'پیام‌رسان کلاسی', en: 'Messages', badgeKey: 'messages' },
    { href: '/dashboard/tickets', icon: HiOutlineLifebuoy, fa: 'تیکت و پشتیبانی', en: 'Support Tickets' },
  ],
  parent: [
    { href: '/dashboard', icon: HiOutlineHome, fa: 'پورتال اولیا', en: 'Parent Portal' },
    { href: '/dashboard/report-card', icon: HiOutlineSparkles, fa: 'کارنامه و نمرات فرزند', en: 'Child Report Card' },
    { href: '/dashboard/finance', icon: HiOutlineBanknotes, fa: 'امور شهریه و پرداخت آنلاین', en: 'Tuition & Shaparak' },
    { href: '/dashboard/discipline', icon: HiOutlineShieldCheck, fa: 'پرونده انضباطی و مشاوره', en: 'Discipline & Counseling' },
    { href: '/dashboard/study-planner', icon: HiOutlineBookOpen, fa: 'پایش برنامه‌ریزی فرزند', en: 'Study Progress' },
    { href: '/dashboard/schedule', icon: HiOutlineCalendarDays, fa: 'برنامه هفتگی فرزند', en: 'Weekly Schedule' },
    { href: '/dashboard/messages', icon: HiOutlineChatBubbleLeftRight, fa: 'ارتباط مستقیم با مدرسه', en: 'Messages', badgeKey: 'messages' },
    { href: '/dashboard/announcements', icon: HiOutlineMegaphone, fa: 'اطلاعیه‌های مدرسه', en: 'Announcements' },
    { href: '/dashboard/tickets', icon: HiOutlineLifebuoy, fa: 'درخواست و تیکت به مدرسه', en: 'School Tickets' },
  ],
};

const ROLE_LABELS = {
  admin: { fa: 'مدیر و ستاد مدرسه', en: 'School Admin', badgeClass: styles.badgeAdmin },
  manager: { fa: 'مدیر مجتمع آموزشی', en: 'School Manager', badgeClass: styles.badgeAdmin },
  teacher: { fa: 'دبیر و کادر آموزشی', en: 'Teacher', badgeClass: styles.badgeTeacher },
  counselor: { fa: 'مشاور ارشد تحصیلی', en: 'Academic Counselor', badgeClass: styles.badgeTeacher },
  financial_officer: { fa: 'مسئول امور مالی و شهریه', en: 'Financial Officer', badgeClass: styles.badgeAdmin },
  accountant: { fa: 'حسابدار مدرسه', en: 'Accountant', badgeClass: styles.badgeAdmin },
  student: { fa: 'دانش‌آموز', en: 'Student', badgeClass: styles.badgeStudent },
  parent: { fa: 'ولی دانش‌آموز', en: 'Parent', badgeClass: styles.badgeParent },
};

export default function Sidebar({ isOpen, onClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, t } = useAuthStore();
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const fetchUnreadCounts = async () => {
      try {
        const res = await api.get('/messages/conversations');
        if (!isMounted) return;
        const convs = res.data?.data || [];
        const totalDirectUnread = convs.reduce((acc, c) => acc + (Number(c.unreadCount) || 0), 0);
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

  const normalizedRole = user?.role === 'manager' ? 'admin' : user?.role === 'accountant' ? 'financial_officer' : (user?.role || 'student');
  const items = navByRole[normalizedRole] || navByRole.student;
  const roleMeta = ROLE_LABELS[user?.role] || ROLE_LABELS.student;

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const avatarSrc = user?.avatar_url
    ? user.avatar_url.replace(/^https?:\/\/localhost:5000/, '')
    : null;

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}

      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>🎓</div>
          <div>
            <div className={styles.brandName}>EduConnect</div>
            <div className={styles.brandSub}>{t('پلتفرم هوشمند مدارس ایران', 'Smart School Platform')}</div>
          </div>
        </div>

        {user && (
          <div className={styles.userCard}>
            <div className={styles.avatar}>
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={user.display_name}
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                user.display_name?.charAt(0)
              )}
            </div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user.display_name}</div>
              <span className={`${styles.roleBadge} ${roleMeta.badgeClass}`}>
                {t(roleMeta.fa, roleMeta.en)}
              </span>
            </div>
          </div>
        )}

        <nav className={styles.nav}>
          {items.map((item) => {
            const Icon = item.icon;
            const normPath = pathname?.replace(/\/$/, '') || '';
            const normHref = item.href.replace(/\/$/, '');
            const isActive =
              normPath === normHref ||
              (normHref !== '/dashboard' && normPath.startsWith(normHref));
            const badgeValue = item.badgeKey === 'messages' ? unreadMessagesCount : 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                onClick={() => {
                  if (item.badgeKey === 'messages') setUnreadMessagesCount(0);
                  onClose?.();
                }}
              >
                <Icon className={styles.navIcon} />
                <span style={{ flex: 1 }}>{t(item.fa, item.en)}</span>
                {badgeValue > 0 && (
                  <span
                    style={{
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                      color: '#fff',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      minWidth: '20px',
                      height: '20px',
                      padding: '0 6px',
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(239, 68, 68, 0.45)',
                    }}
                  >
                    {badgeValue > 99 ? '99+' : badgeValue.toLocaleString('fa-IR')}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className={styles.footer}>
          <Link href="/dashboard/settings" className={styles.navItem} onClick={onClose}>
            <HiOutlineCog6Tooth className={styles.navIcon} />
            <span>{t('تنظیمات حساب', 'Settings')}</span>
          </Link>
          <button className={`${styles.navItem} ${styles.logoutBtn}`} onClick={handleLogout}>
            <HiOutlineArrowRightOnRectangle className={styles.navIcon} />
            <span>{t('خروج از حساب', 'Logout')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
