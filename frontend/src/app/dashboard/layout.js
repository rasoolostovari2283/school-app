'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import useAuthStore from '../../stores/authStore';
import Sidebar from '../../components/layout/Sidebar';
import Header from '../../components/layout/Header';
import MandatoryAnnouncementModal from '../../components/announcements/MandatoryAnnouncementModal';
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
    </div>
  );
}
