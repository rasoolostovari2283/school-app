'use client';
import { useState, useEffect } from 'react';
import api, { autoDetectServer } from '../../lib/api';
import toast from 'react-hot-toast';
import { HiOutlineArrowPath, HiOutlineCheckCircle, HiOutlineSparkles } from 'react-icons/hi2';

export default function AutoUpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [remoteInfo, setRemoteInfo] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check for updates on mount after 2.5 seconds
    const timer = setTimeout(() => {
      checkUpdate();
    }, 2500);

    // Listen for manual update check events
    const handleManualCheck = () => checkUpdate(true);
    window.addEventListener('educonnect_check_update', handleManualCheck);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('educonnect_check_update', handleManualCheck);
    };
  }, []);

  const checkUpdate = async (manual = false) => {
    try {
      let res = null;
      try {
        res = await api.get('/system/app-version', { timeout: 3500 });
      } catch (err) {
        const detected = await autoDetectServer();
        if (detected.success && detected.data) {
          res = { data: detected.data };
        }
      }

      if (res?.data?.success && res.data.build) {
        const remoteBuild = res.data.build;
        const savedBuild = localStorage.getItem('educonnect_active_build');

        if (!savedBuild) {
          // First run: save current remote build as base
          localStorage.setItem('educonnect_active_build', remoteBuild);
          if (manual) {
            toast.success(`شما در حال استفاده از آخرین نسخه هستید (${remoteBuild.substring(0, 7)}) ✅`);
          }
        } else if (remoteBuild !== savedBuild) {
          setRemoteInfo(res.data);
          setUpdateAvailable(true);
          setDismissed(false);
          if (manual) {
            toast.success(`نسخه جدید (${remoteBuild.substring(0, 7)}) یافت شد! 🚀`);
          }
        } else {
          if (manual) {
            toast.success(`سامانه کاملاً به‌روز است (${remoteBuild.substring(0, 7)}) ✅`);
          }
        }
      } else if (manual) {
        toast.error('پاسخی از سرور دریافت نشد. لطفاً از اتصال اینترنت یا وای‌فای اطمینان حاصل فرمایید.');
      }
    } catch (e) {
      if (manual) {
        toast.error('خطا در بررسی نسخه جدید سرور');
      }
    }
  };

  const handleApplyUpdate = async () => {
    setIsUpdating(true);
    const toastId = toast.loading('در حال بارگذاری تغییرات جدید و پاکسازی حافظه موقت...', { id: 'ota-update' });

    try {
      if (remoteInfo?.build) {
        localStorage.setItem('educonnect_active_build', remoteInfo.build);
      }

      // Clear Service Worker and browser caches if supported
      if ('caches' in window) {
        try {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map((key) => caches.delete(key)));
        } catch (cErr) {}
      }

      setTimeout(() => {
        toast.success('برنامه با موفقیت به‌روزرسانی شد! در حال راه‌اندازی مجدد...', { id: 'ota-update' });
        window.location.reload(true);
      }, 900);
    } catch (err) {
      toast.error('خطا در اعمال به‌روزرسانی', { id: 'ota-update' });
      setIsUpdating(false);
    }
  };

  if (!updateAvailable || dismissed) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '80px',
      left: '16px',
      right: '16px',
      zIndex: 9999,
      maxWidth: '440px',
      margin: '0 auto',
      background: 'rgba(23, 23, 35, 0.95)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(99, 102, 241, 0.4)',
      boxShadow: '0 20px 40px rgba(0,0,0,0.4), 0 0 20px rgba(99, 102, 241, 0.25)',
      borderRadius: '20px',
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      animation: 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: '1.2rem'
          }}>
            <HiOutlineSparkles />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
              به‌روزرسانی جدید سرور آماده است
            </h4>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              نسخه {remoteInfo?.build?.substring(0, 7) || 'جدید'} • بدون نیاز به نصب مجدد
            </span>
          </div>
        </div>
      </div>

      {remoteInfo?.commit_message && (
        <div style={{
          fontSize: '0.8rem',
          color: '#cbd5e1',
          background: 'rgba(255,255,255,0.05)',
          padding: '8px 12px',
          borderRadius: '8px',
          borderRight: '3px solid #6366f1'
        }}>
          {remoteInfo.commit_message}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button
          onClick={handleApplyUpdate}
          disabled={isUpdating}
          style={{
            flex: 1,
            background: 'linear-gradient(135deg, #4f46e5, #3b82f6)',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            padding: '10px 16px',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <HiOutlineArrowPath className={isUpdating ? 'spin' : ''} style={{ fontSize: '1.1rem' }} />
          {isUpdating ? 'در حال اعمال...' : 'اعمال خودکار تغییرات'}
        </button>

        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'rgba(255,255,255,0.08)',
            color: '#94a3b8',
            border: 'none',
            borderRadius: '12px',
            padding: '10px 14px',
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          بعداً
        </button>
      </div>
    </div>
  );
}
