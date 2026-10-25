'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import useAuthStore from '../../stores/authStore';
import {
  HiOutlineHome,
  HiOutlineAcademicCap,
  HiOutlineChatBubbleLeftRight,
  HiOutlineBell,
  HiOutlineCog6Tooth,
  HiOutlineArrowLeftOnRectangle,
  HiOutlineClipboardDocumentList,
  HiOutlineQuestionMarkCircle,
  HiOutlineUserGroup,
  HiOutlineVideoCamera,
  HiOutlineChartBar,
  HiOutlineComputerDesktop,
  HiOutlineIdentification,
  HiOutlineMegaphone,
  HiOutlineBuildingOffice2,
  HiOutlineDocumentText,
  HiOutlineXMark,
} from 'react-icons/hi2';
import styles from './Sidebar.module.css';

const adminNav = [
  { label: 'ستاد مدیریت مدرسه', labelEn: 'School Management', href: '/dashboard/management', icon: HiOutlineBuildingOffice2 },
  { label: 'ثبت و دیتابیس معلمین', labelEn: 'Teachers Database', href: '/dashboard/teachers', icon: HiOutlineAcademicCap, badge: 'پایه' },
  { label: 'ثبت و مدیریت کلاس‌ها', labelEn: 'Class Registry', href: '/dashboard/manage-classes', icon: HiOutlineUserGroup, badge: 'پایه' },
  { label: 'وبینار', labelEn: 'Webinars', href: '/dashboard/school-meetings', icon: HiOutlineVideoCamera, badge: 'جلسات' },
  { label: 'تخته هوشمند و ضبط', labelEn: 'Whiteboard & Recording', href: '/dashboard/record', icon: HiOutlineComputerDesktop },
  { label: 'ویدیوها و رسانه‌ها', labelEn: 'Videos & Media', href: '/dashboard/videos', icon: HiOutlineVideoCamera },
  { label: 'اطلاع‌رسانی و بخشنامه‌ها', labelEn: 'Announcements', href: '/dashboard/announcements', icon: HiOutlineMegaphone },
  { label: 'لیست‌های کلاسی', labelEn: 'Class Rosters', href: '/dashboard/class-rosters', icon: HiOutlineIdentification },
  { label: 'کارنامه‌ها و دفتر نمرات', labelEn: 'Report Cards & Gradebook', href: '/dashboard/report-card', icon: HiOutlineDocumentText },
  { label: 'پیام‌ها و ارتباطات', labelEn: 'Messages', href: '/dashboard/messages', icon: HiOutlineChatBubbleLeftRight },
  { label: 'اعلان‌های مدرسه', labelEn: 'Notifications', href: '/dashboard/notifications', icon: HiOutlineBell },
];

const teacherNav = [
  { label: 'داشبورد', labelEn: 'Dashboard', href: '/dashboard', icon: HiOutlineHome },
  { label: 'جلسات آنلاین مدرسه', labelEn: 'School Meetings', href: '/dashboard/school-meetings', icon: HiOutlineVideoCamera, badge: 'مدرسه' },
  { label: 'مدرسه و پایه‌های تدریس', labelEn: 'School & Grades', href: '/dashboard/teacher-setup', icon: HiOutlineBuildingOffice2, badge: 'تنظیمات' },
  { label: 'کارنامه‌ها', labelEn: 'Report Cards', href: '/dashboard/report-card', icon: HiOutlineDocumentText },
  { label: 'اطلاع‌رسانی', labelEn: 'Announcements', href: '/dashboard/announcements', icon: HiOutlineMegaphone },
  { label: 'لیست‌های کلاسی', labelEn: 'Class Rosters', href: '/dashboard/class-rosters', icon: HiOutlineIdentification },
  { label: 'تخته هوشمند و ضبط', labelEn: 'Whiteboard & Recording', href: '/dashboard/record', icon: HiOutlineComputerDesktop },
  { label: 'کلاس‌ها', labelEn: 'Classes', href: '/dashboard/classes', icon: HiOutlineAcademicCap },
  { label: 'برنامه‌ریزی درسی', labelEn: 'Study Planner', href: '/dashboard/study-planner', icon: HiOutlineChartBar },
  { label: 'تکالیف', labelEn: 'Assignments', href: '/dashboard/assignments', icon: HiOutlineClipboardDocumentList },
  { label: 'کوییز', labelEn: 'Quizzes', href: '/dashboard/quizzes', icon: HiOutlineQuestionMarkCircle },
  { label: 'حضور و غیاب', labelEn: 'Attendance', href: '/dashboard/attendance', icon: HiOutlineUserGroup },
  { label: 'ویدیوها و رسانه', labelEn: 'Videos', href: '/dashboard/videos', icon: HiOutlineVideoCamera },
  { label: 'پیام‌ها', labelEn: 'Messages', href: '/dashboard/messages', icon: HiOutlineChatBubbleLeftRight },
  { label: 'اعلان‌ها', labelEn: 'Notifications', href: '/dashboard/notifications', icon: HiOutlineBell },
];

const studentNav = [
  { label: 'داشبورد', labelEn: 'Dashboard', href: '/dashboard', icon: HiOutlineHome },
  { label: 'جلسات آنلاین مدرسه', labelEn: 'School Meetings', href: '/dashboard/school-meetings', icon: HiOutlineVideoCamera, badge: 'مدرسه' },
  { label: 'کارنامه تحصیلی', labelEn: 'Report Cards', href: '/dashboard/report-card', icon: HiOutlineDocumentText },
  { label: 'اطلاع‌رسانی', labelEn: 'Announcements', href: '/dashboard/announcements', icon: HiOutlineMegaphone },
  { label: 'تخته هوشمند و ضبط', labelEn: 'Whiteboard & Recording', href: '/dashboard/record', icon: HiOutlineComputerDesktop },
  { label: 'کلاس‌ها', labelEn: 'Classes', href: '/dashboard/classes', icon: HiOutlineAcademicCap },
  { label: 'برنامه‌ریزی درسی', labelEn: 'Study Planner', href: '/dashboard/study-planner', icon: HiOutlineChartBar },
  { label: 'تکالیف', labelEn: 'Assignments', href: '/dashboard/assignments', icon: HiOutlineClipboardDocumentList },
  { label: 'کوییز', labelEn: 'Quizzes', href: '/dashboard/quizzes', icon: HiOutlineQuestionMarkCircle },
  { label: 'ویدیوها و رسانه', labelEn: 'Videos', href: '/dashboard/videos', icon: HiOutlineVideoCamera },
  { label: 'پیام‌ها', labelEn: 'Messages', href: '/dashboard/messages', icon: HiOutlineChatBubbleLeftRight },
  { label: 'اعلان‌ها', labelEn: 'Notifications', href: '/dashboard/notifications', icon: HiOutlineBell },
];

const parentNav = [
  { label: 'داشبورد وضعیت فرزند', labelEn: 'Child Dashboard', href: '/dashboard/', icon: HiOutlineHome },
  { label: 'جلسات آنلاین اولیا با مدرسه', labelEn: 'School Parent Meetings', href: '/dashboard/school-meetings', icon: HiOutlineVideoCamera, badge: 'مدرسه' },
  { label: 'ویدیوها و رسانه‌های مدرسه', labelEn: 'School Videos', href: '/dashboard/videos', icon: HiOutlineVideoCamera },
  { label: 'فرزندان من', labelEn: 'My Children', href: '/dashboard/children/', icon: HiOutlineUserGroup },
  { label: 'کارنامه تحصیلی فرزند', labelEn: 'Child Report Card', href: '/dashboard/report-card/', icon: HiOutlineDocumentText },
  { label: 'تکالیف فرزند', labelEn: 'Assignments', href: '/dashboard/assignments/', icon: HiOutlineClipboardDocumentList },
  { label: 'امتحانات و آزمون‌ها', labelEn: 'Quizzes & Exams', href: '/dashboard/quizzes/', icon: HiOutlineQuestionMarkCircle },
  { label: 'پیام‌ها و ارتباط با مدرسه', labelEn: 'Messages', href: '/dashboard/messages/', icon: HiOutlineChatBubbleLeftRight },
];

export default function Sidebar({ isOpen = false, onClose }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const locale = user?.locale || 'fa';

  const getNavItems = () => {
    switch (user?.role) {
      case 'admin':
      case 'manager':
        return adminNav;
      case 'teacher':
        return teacherNav;
      case 'student':
        return studentNav;
      case 'parent':
        return parentNav;
      default:
        return teacherNav;
    }
  };

  const roleLabels = {
    admin: { fa: 'مدیریت مجتمع', en: 'Principal/Admin' },
    manager: { fa: 'معاونت مدرسه', en: 'Vice Principal' },
    teacher: { fa: 'معلم و کادر آموزشی', en: 'Teacher' },
    student: { fa: 'دانش‌آموز', en: 'Student' },
    parent: { fa: 'اولیا', en: 'Parent' },
  };

  const handleLinkClick = () => {
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className={styles.backdrop}
          onClick={onClose}
          aria-label="بستن منو"
        />
      )}

      <aside
        className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}
        dir={locale === 'fa' ? 'rtl' : 'ltr'}
      >
        {/* Logo and Mobile Close Button */}
        <div className={styles.logo}>
          <div className={styles.logoIcon}>🎓</div>
          <span className={styles.logoText}>EduConnect</span>
          {onClose && (
            <button
              className={styles.closeBtn}
              onClick={onClose}
              title="بستن منو"
              aria-label="بستن منوی ناوبری"
            >
              <HiOutlineXMark />
            </button>
          )}
        </div>

        {/* User Info - Clickable Profile Card */}
        <Link
          href="/dashboard/settings"
          className={styles.userCard}
          title="مشاهده و ویرایش مشخصات شخصی و عکس پروفایل"
          onClick={handleLinkClick}
        >
          <div className="avatar">
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
              user?.display_name?.charAt(0)?.toUpperCase() || 'ک'
            )}
          </div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user?.display_name}</span>
            <span className={styles.userRole}>
              {roleLabels[user?.role]?.[locale] || user?.role}
            </span>
          </div>
          <span className={styles.userEditIcon} title="ویرایش اطلاعات">
            ✏️
          </span>
        </Link>

        {/* Navigation */}
        <nav className={styles.nav}>
          {getNavItems().map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                onClick={handleLinkClick}
              >
                <Icon className={styles.navIcon} />
                <span>{locale === 'fa' ? item.label : item.labelEn}</span>
                {item.badge && (
                  <span
                    style={{
                      marginRight: 'auto',
                      fontSize: '0.6875rem',
                      background: 'rgba(99, 102, 241, 0.15)',
                      color: '#818cf8',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontWeight: 700,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Actions */}
        <div className={styles.bottomActions}>
          <Link href="/dashboard/settings" className={styles.navItem} onClick={handleLinkClick}>
            <HiOutlineCog6Tooth className={styles.navIcon} />
            <span>{locale === 'fa' ? 'تنظیمات' : 'Settings'}</span>
          </Link>
          <button
            onClick={() => {
              if (onClose) onClose();
              logout();
            }}
            className={`${styles.navItem} ${styles.logoutBtn}`}
          >
            <HiOutlineArrowLeftOnRectangle className={styles.navIcon} />
            <span>{locale === 'fa' ? 'خروج' : 'Logout'}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
