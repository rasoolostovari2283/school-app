'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import useAuthStore from '../../stores/authStore';
import Sidebar from '../../components/layout/Sidebar';
import Header from '../../components/layout/Header';
import MobileBottomNav from '../../components/layout/MobileBottomNav';
import MandatoryAnnouncementModal from '../../components/announcements/MandatoryAnnouncementModal';
import AutoUpdateChecker from '../../components/system/AutoUpdateChecker';
import toast, { Toaster, ToastBar } from 'react-hot-toast';

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
        reverseOrder={false}
        gutter={8}
        containerStyle={{
          top: 24,
          zIndex: 999999,
        }}
        toastOptions={{
          duration: 3500,
          error: {
            duration: 3500,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#ffffff',
            },
          },
          success: {
            duration: 2500,
            iconTheme: {
              primary: '#10b981',
              secondary: '#ffffff',
            },
          },
          style: {
            background: 'var(--bg-card, #1e293b)',
            color: 'var(--text-primary, #f8fafc)',
            border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
            backdropFilter: 'blur(16px)',
            borderRadius: 'var(--radius-xl, 12px)',
            fontFamily: 'var(--font-fa, inherit)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
            cursor: 'pointer',
            padding: '10px 14px',
            fontSize: '0.875rem',
            maxWidth: '420px',
          },
        }}
      >
        {(t) => (
          <ToastBar
            toast={t}
            style={{
              ...t.style,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {({ icon, message }) => (
              <div
                onClick={() => toast.dismiss(t.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  cursor: 'pointer',
                }}
                title="برای بستن اعلان کلیک کنید"
              >
                {icon}
                <div style={{ flex: 1, textAlign: 'right' }}>{message}</div>
                {t.type !== 'loading' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.dismiss(t.id);
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.12)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      color: 'inherit',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      opacity: 0.8,
                      marginRight: 'auto',
                      marginLeft: '4px',
                      flexShrink: 0,
                    }}
                    title="بستن"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </ToastBar>
        )}
      </Toaster>
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
