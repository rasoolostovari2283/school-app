'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '../stores/authStore';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      router.replace(isAuthenticated ? '/dashboard/' : '/login/');
    }
  }, [isLoading, isAuthenticated]);

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
