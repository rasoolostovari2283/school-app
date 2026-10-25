'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useAuthStore from '../../stores/authStore';
import {
  HiOutlineHome,
  HiOutlineAcademicCap,
  HiOutlineVideoCamera,
  HiOutlineChartBar,
  HiOutlineChatBubbleLeftRight,
  HiOutlineBars3,
  HiOutlineDocumentText,
  HiOutlineComputerDesktop,
} from 'react-icons/hi2';
import styles from './MobileBottomNav.module.css';

export default function MobileBottomNav({ onOpenMenu }) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'teacher';
  const isParent = user?.role === 'parent';
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const navLinks = [
    {
      id: 'home',
      label: 'داشبورد',
      href: '/dashboard',
      icon: HiOutlineHome,
      exact: true,
    },
    {
      id: 'classes',
      label: isAdmin ? 'وبینار' : (isParent ? 'جلسات مدرسه' : 'کلاس‌ها'),
      href: (isAdmin || isParent) ? '/dashboard/school-meetings' : '/dashboard/classes',
      icon: (isAdmin || isParent) ? HiOutlineVideoCamera : HiOutlineAcademicCap,
    },
    {
      id: 'live',
      label: isTeacher ? 'کلاس زنده' : 'پخش زنده',
      href: '/dashboard/classes/1/live',
      icon: HiOutlineVideoCamera,
      badge: 'LIVE',
    },
    {
      id: 'planner',
      label: 'برنامه‌ریزی',
      href: '/dashboard/study-planner',
      icon: HiOutlineChartBar,
    },
    {
      id: 'messages',
      label: 'پیام‌ها',
      href: '/dashboard/messages',
      icon: HiOutlineChatBubbleLeftRight,
    },
  ];

  return (
    <nav className={styles.bottomNav} aria-label="نوار ناوبری موبایل">
      {navLinks.map((item) => {
        const Icon = item.icon;
        const isActive = item.exact
          ? pathname === item.href
          : pathname?.startsWith(item.href);

        return (
          <Link
            key={item.id}
            href={item.href}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
            title={item.label}
          >
            {isActive && <div className={styles.activeIndicator} />}
            <div className={styles.iconWrapper}>
              <Icon />
              {item.badge && <span className={styles.liveBadge}>{item.badge}</span>}
            </div>
            <span className={styles.navLabel}>{item.label}</span>
          </Link>
        );
      })}

      {/* Menu / Drawer Toggle */}
      <button
        type="button"
        className={styles.navItem}
        onClick={onOpenMenu}
        title="سایر امکانات و منوی کامل"
        aria-label="باز کردن منوی کامل"
      >
        <div className={styles.iconWrapper}>
          <HiOutlineBars3 />
        </div>
        <span className={styles.navLabel}>بیشتر...</span>
      </button>
    </nav>
  );
}
