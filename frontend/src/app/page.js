'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '../stores/authStore';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.replace('/login/');
        return;
      }

      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname || '';
        const search = window.location.search || '';
        const cleanPath = currentPath.replace(/\/+$/, '');

        if (cleanPath.startsWith('/dashboard/') && cleanPath !== '/dashboard') {
          const liveMatch = cleanPath.match(/^\/dashboard\/classes\/([^/]+)\/live$/);
          if (liveMatch && liveMatch[1] !== '1') {
            const sep = search ? '&' : '?';
            router.replace(`/dashboard/classes/1/live/${search}${sep}classId=${encodeURIComponent(liveMatch[1])}`);
            return;
          }

          const classMatch = cleanPath.match(/^\/dashboard\/classes\/([^/]+)$/);
          if (classMatch && !['1', 'cls-math-101', 'cls-phys-102'].includes(classMatch[1])) {
            const sep = search ? '&' : '?';
            router.replace(`/dashboard/classes/1/${search}${sep}classId=${encodeURIComponent(classMatch[1])}`);
            return;
          }

          router.replace(`${cleanPath}/${search}`);
          return;
        }
      }

      router.replace('/dashboard/');
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100dvh',
      background: 'var(--color-bg-primary)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎓</div>
        <div className="skeleton" style={{ width: 120, height: 20, margin: '0 auto' }}></div>
      </div>
    </div>
  );
}
