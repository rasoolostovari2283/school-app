'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useAuthStore from '../../stores/authStore';
import {
  HiOutlineHome,
  HiOutlineAcademicCap,
  HiOutlineChatBubbleLeftRight,
  HiOutlineBars3,
  HiOutlineBuildingLibrary,
  HiOutlineBanknotes,
  HiOutlineSparkles,
  HiOutlineShieldCheck,
  HiOutlineBookOpen,
} from 'react-icons/hi2';
import styles from './MobileBottomNav.module.css';

export default function MobileBottomNav({ onOpenMenu, onCloseMenu }) {
  const pathname = usePathname() || '';
  const { user } = useAuthStore();
  const role =
    user?.role === 'manager'
      ? 'admin'
      : user?.role === 'accountant'
      ? 'financial_officer'
      : user?.role || 'student';

  const getRoleTabs = () => {
    if (role === 'admin') {
      return [
        { id: 'home', label: 'میز کار', href: '/dashboard/', icon: HiOutlineHome, exact: true },
        { id: 'management', label: 'مدیریت', href: '/dashboard/management/', icon: HiOutlineBuildingLibrary },
        { id: 'finance', label: 'مالی', href: '/dashboard/finance/', icon: HiOutlineBanknotes },
        { id: 'messages', label: 'پیام‌ها', href: '/dashboard/messages/', icon: HiOutlineChatBubbleLeftRight },
      ];
    }
    if (role === 'financial_officer') {
      return [
        { id: 'home', label: 'میز کار', href: '/dashboard/', icon: HiOutlineHome, exact: true },
        { id: 'finance', label: 'شهریه', href: '/dashboard/finance/', icon: HiOutlineBanknotes },
        { id: 'management', label: 'دانش‌آموزان', href: '/dashboard/management/', icon: HiOutlineBuildingLibrary },
        { id: 'messages', label: 'پیام‌ها', href: '/dashboard/messages/', icon: HiOutlineChatBubbleLeftRight },
      ];
    }
    if (role === 'counselor') {
      return [
        { id: 'home', label: 'میز کار', href: '/dashboard/', icon: HiOutlineHome, exact: true },
        { id: 'discipline', label: 'پرونده‌ها', href: '/dashboard/discipline/', icon: HiOutlineShieldCheck },
        { id: 'planner', label: 'برنامه‌ریزی', href: '/dashboard/study-planner/', icon: HiOutlineBookOpen },
        { id: 'messages', label: 'پیام‌ها', href: '/dashboard/messages/', icon: HiOutlineChatBubbleLeftRight },
      ];
    }
    if (role === 'parent') {
      return [
        { id: 'home', label: 'پورتال', href: '/dashboard/', icon: HiOutlineHome, exact: true },
        { id: 'grades', label: 'کارنامه', href: '/dashboard/report-card/', icon: HiOutlineSparkles },
        { id: 'finance', label: 'شهریه', href: '/dashboard/finance/', icon: HiOutlineBanknotes },
        { id: 'messages', label: 'ارتباط', href: '/dashboard/messages/', icon: HiOutlineChatBubbleLeftRight },
      ];
    }
    // teacher & student
    return [
      { id: 'home', label: 'داشبورد', href: '/dashboard/', icon: HiOutlineHome, exact: true },
      { id: 'classes', label: 'کلاس‌ها', href: '/dashboard/classes/', icon: HiOutlineAcademicCap },
      { id: 'grades', label: 'کارنامه', href: '/dashboard/report-card/', icon: HiOutlineSparkles },
      { id: 'messages', label: 'پیام‌ها', href: '/dashboard/messages/', icon: HiOutlineChatBubbleLeftRight },
    ];
  };

  const navLinks = getRoleTabs();

  return (
    <nav className={styles.bottomNav} aria-label="نوار ناوبری موبایل">
      {navLinks.map((item) => {
        const Icon = item.icon;
        const normPath = pathname.replace(/\/+$/, '');
        const normHref = item.href.replace(/\/+$/, '');
        const isActive = item.exact
          ? normPath === normHref
          : normPath === normHref || normPath.startsWith(normHref);

        return (
          <Link
            key={item.id}
            href={item.href}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
            onClick={() => onCloseMenu?.()}
            title={item.label}
          >
            {isActive && <div className={styles.activeIndicator} />}
            <div className={styles.iconWrapper}>
              <Icon />
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
        <span className={styles.navLabel}>منوی کامل</span>
      </button>
    </nav>
  );
}
