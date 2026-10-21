'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import useAuthStore from '../../stores/authStore';
import Sidebar from '../../components/layout/Sidebar';
import Header from '../../components/layout/Header';
import MobileBottomNav from '../../components/layout/MobileBottomNav';
import MandatoryAnnouncementModal from '../../components/announcements/MandatoryAnnouncementModal';
import AutoUpdateChecker from '../../components/system/AutoUpdateChecker';
import { Toaster } from 'react-hot-toast';

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, initialize } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login/');
    }
  }, [isLoading, isAuthenticated]);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Handle Android Hardware Back Button (Capacitor & Web Popstate)
  useEffect(() => {
    let lastBackTime = 0;
    let removeListener = null;

    const initBackButton = async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        const listener = await CapApp.addListener('backButton', () => {
          const currentPath = window.location.pathname;
          const isMainDashboard = currentPath === '/dashboard' || currentPath === '/dashboard/';

          if (!isMainDashboard) {
            // If on a sub-route, return to parent section or dashboard
            if (currentPath.includes('/live')) {
              router.push(currentPath.replace('/live', ''));
            } else if (currentPath.startsWith('/dashboard/classes/') && currentPath.split('/').length === 4) {
              router.push('/dashboard/classes');
            } else if (window.history.length > 2) {
              router.back();
            } else {
              router.push('/dashboard');
            }
          } else {
            // On main dashboard home: double tap to exit app
            const now = Date.now();
            if (now - lastBackTime < 2000) {
              CapApp.exitApp();
            } else {
              lastBackTime = now;
              toast('برای خروج از برنامه، مجدداً دکمه بازگشت را بزنید', {
                icon: '🚪',
                duration: 2000,
                id: 'exit-app-confirm',
              });
            }
          }
        });
        removeListener = () => listener.remove();
      } catch (e) {
        // Running in desktop/mobile web browser without native wrapper
      }
    };

    initBackButton();

    return () => {
      if (removeListener) removeListener();
    };
  }, [router]);

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100dvh',
          background: 'var(--bg-body)',
          gap: '16px',
        }}
      >
        <div className="spinner"></div>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>در حال بارگذاری سامانه هوشمند ادوکانکت...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="app-layout">
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            backdropFilter: 'blur(16px)',
            borderRadius: 'var(--radius-xl)',
            fontFamily: 'var(--font-fa)',
          },
        }}
      />
      <MandatoryAnnouncementModal />
      <AutoUpdateChecker />
      <Sidebar
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      <div className="main-content">
        <Header
          onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
          isMobileMenuOpen={isMobileMenuOpen}
        />
        <main className="content-inner">
          {children}
        </main>
      </div>
      <MobileBottomNav onOpenMenu={() => setIsMobileMenuOpen(true)} />
    </div>
  );
}
