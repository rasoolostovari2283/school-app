'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { App as CapApp } from '@capacitor/app';
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

  const pathnameRef = useRef(pathname);
  const isMobileMenuOpenRef = useRef(isMobileMenuOpen);
  const navStackRef = useRef(['/dashboard']);
  const lastBackTimeRef = useRef(0);

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login/');
    }
  }, [isLoading, isAuthenticated]);

  // Track route changes and close mobile drawer
  useEffect(() => {
    setIsMobileMenuOpen(false);
    pathnameRef.current = pathname;

    if (pathname) {
      const cleanPath = pathname.replace(/\/+$/, '') || '/';
      const stack = navStackRef.current;
      const currentTop = stack[stack.length - 1];

      if (cleanPath !== currentTop) {
        // If user navigated backwards to previous item, pop top
        if (stack.length > 1 && stack[stack.length - 2] === cleanPath) {
          stack.pop();
        } else {
          stack.push(cleanPath);
        }
      }
    }
  }, [pathname]);

  useEffect(() => {
    isMobileMenuOpenRef.current = isMobileMenuOpen;
  }, [isMobileMenuOpen]);

  // Handle Android Hardware Back Button (Persistent listener across all pages)
  useEffect(() => {
    let removeListener = null;

    const initBackButton = async () => {
      try {
        const listener = await CapApp.addListener('backButton', () => {
          // 1. If mobile navigation drawer is open, close it
          if (isMobileMenuOpenRef.current) {
            setIsMobileMenuOpen(false);
            return;
          }

          // 2. If any modal / popup dialog is open, close it first
          const modalCloseBtn = document.querySelector(
            '[class*="modalBackdrop"] button[class*="closeBtn"], [class*="modalBackdrop"] button[class*="close"], [class*="modalOverlay"] button[class*="close"]'
          );
          if (modalCloseBtn) {
            modalCloseBtn.click();
            return;
          }

          const modalBackdrop = document.querySelector('[class*="modalBackdrop"], [class*="modalOverlay"]');
          if (modalBackdrop) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            return;
          }

          // 3. Check current route
          const currentPath = (pathnameRef.current || window.location.pathname || '').replace(/\/+$/, '') || '/';
          const isMainDashboard = currentPath === '/dashboard' || currentPath === '' || currentPath === '/';

          if (!isMainDashboard) {
            // User is on a sub-route (e.g. /dashboard/assignments, /dashboard/videos, /dashboard/classes/...)
            // Navigate back to the previous screen in history
            const stack = navStackRef.current;
            if (stack.length > 1) {
              stack.pop(); // remove current page
              const prevPath = stack[stack.length - 1] || '/dashboard';
              router.push(prevPath);
            } else {
              // Fallback to main dashboard if stack is shallow
              router.push('/dashboard');
            }
            return;
          }

          // 4. On main dashboard home: require double tap within 2 seconds to exit
          const now = Date.now();
          if (now - lastBackTimeRef.current < 2000) {
            CapApp.exitApp();
          } else {
            lastBackTimeRef.current = now;
            toast('برای خروج از برنامه، مجدداً دکمه بازگشت را بزنید', {
              icon: '🚪',
              duration: 2000,
              id: 'exit-app-confirm',
            });
          }
        });

        removeListener = () => listener.remove();
      } catch (e) {
        // Not running in Capacitor Android environment
      }
    };

    initBackButton();

    return () => {
      if (removeListener) removeListener();
    };
  }, []);

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
