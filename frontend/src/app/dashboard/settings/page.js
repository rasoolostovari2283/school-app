'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import useAuthStore from '../../../stores/authStore';
import api, { getApiBaseUrl, setApiBaseUrl, probeServer, autoDetectServer, DEFAULT_LOCAL_API, DEFAULT_TUNNEL_API } from '../../../lib/api';
import toast from 'react-hot-toast';
import {
  HiOutlineUser,
  HiOutlineSun,
  HiOutlineMoon,
  HiOutlineShieldCheck,
  HiOutlineCamera,
  HiOutlineTrash,
  HiOutlineArrowUpTray,
  HiOutlineSparkles,
  HiOutlineIdentification,
  HiOutlineAcademicCap,
  HiOutlineBuildingOffice2,
  HiOutlineCheck,
  HiOutlineBellAlert,
  HiOutlineGlobeAlt,
  HiOutlineWifi,
  HiOutlineArrowPath,
  HiOutlineSignal,
} from 'react-icons/hi2';
import styles from './settings.module.css';

// Domestic & Offline-Safe SVG Emoji Avatars (0 external dependencies)
const PRESET_AVATARS = [
  {
    label: 'دبیر آقا',
    icon: '👨‍🏫',
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%234f46e5'/><text x='50%' y='55%' font-size='50' text-anchor='middle' dominant-baseline='central'>👨‍🏫</text></svg>",
  },
  {
    label: 'دبیر خانم',
    icon: '👩‍🏫',
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23ec4899'/><text x='50%' y='55%' font-size='50' text-anchor='middle' dominant-baseline='central'>👩‍🏫</text></svg>",
  },
  {
    label: 'علوم و تجربی',
    icon: '🔬',
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%2306b6d4'/><text x='50%' y='55%' font-size='50' text-anchor='middle' dominant-baseline='central'>🔬</text></svg>",
  },
  {
    label: 'ریاضی و هندسه',
    icon: '📐',
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23059669'/><text x='50%' y='55%' font-size='50' text-anchor='middle' dominant-baseline='central'>📐</text></svg>",
  },
  {
    label: 'ادبیات و کتاب',
    icon: '📚',
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23d97706'/><text x='50%' y='55%' font-size='50' text-anchor='middle' dominant-baseline='central'>📚</text></svg>",
  },
  {
    label: 'خلاقیت و ایده',
    icon: '💡',
    url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%238b5cf6'/><text x='50%' y='55%' font-size='50' text-anchor='middle' dominant-baseline='central'>💡</text></svg>",
  },
];

export default function SettingsPage() {
  const { user, updateProfile } = useAuthStore();
  const fileInputRef = useRef(null);

  const [currentTheme, setCurrentTheme] = useState('light');
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [personnelCode, setPersonnelCode] = useState(user?.personnel_code || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [jobTitle, setJobTitle] = useState(user?.job_title || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');

  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(true);
  const [serverUrl, setServerUrl] = useState('');
  const [serverStatus, setServerStatus] = useState(null);
  const [isDetectingServer, setIsDetectingServer] = useState(false);

  // OTA Live Update State
  const [updateInfo, setUpdateInfo] = useState({
    currentBuild: '',
    remoteBuild: '',
    commitMessage: '',
    commitAuthor: '',
    commitDate: '',
    lastSync: '',
    hasUpdate: false,
    hasChecked: false,
  });
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);

  const checkLatestUpdate = async (showFeedback = true) => {
    setIsCheckingUpdate(true);
    let toastId = null;
    if (showFeedback) {
      toastId = toast.loading('در حال بررسی سریع نسخه سرور (حداکثر ۲ ثانیه)...');
    }

    try {
      let res = null;
      try {
        res = await api.get('/system/app-version', { timeout: 3000 });
      } catch (err) {
        const detected = await autoDetectServer();
        if (detected.success && detected.data) {
          res = { data: detected.data };
          setServerUrl(detected.url);
        }
      }

      if (res?.data?.success && res.data.build) {
        const remoteBuild = res.data.build;
        const savedBuild = localStorage.getItem('educonnect_active_build') || remoteBuild;
        if (!localStorage.getItem('educonnect_active_build')) {
          localStorage.setItem('educonnect_active_build', remoteBuild);
        }

        const hasNew = remoteBuild !== savedBuild;
        setUpdateInfo({
          currentBuild: savedBuild,
          remoteBuild: remoteBuild,
          commitMessage: res.data.commit_message || 'به‌روزرسانی و پایداری عملکرد سامانه',
          commitAuthor: res.data.commit_author || 'EduConnect Team',
          commitDate: res.data.commit_date || res.data.last_sync,
          lastSync: res.data.last_sync,
          hasUpdate: hasNew,
          hasChecked: true,
        });

        if (showFeedback) {
          if (hasNew) {
            toast.success(`نسخه جدیدتر (${remoteBuild.substring(0, 7)}) بر روی سرور موجود است! 🚀`, { id: toastId, duration: 4000 });
          } else {
            toast.success(`شما در حال استفاده از آخرین نسخه هستید (${remoteBuild.substring(0, 7)}) ✅`, { id: toastId });
          }
        }
      } else {
        if (showFeedback) {
          toast.error('سرور پاسخ نداد. لطفاً وضعیت وای‌فای یا اینترنت را بررسی فرمایید.', { id: toastId });
        }
      }
    } catch (e) {
      if (showFeedback) {
        toast.error('خطا در ارتباط با سرور.', { id: toastId });
      }
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleApplyUpdate = async () => {
    setIsApplyingUpdate(true);
    const toastId = toast.loading('در حال دریافت پچ و پاکسازی حافظه موقت...');
    try {
      if (updateInfo.remoteBuild) {
        localStorage.setItem('educonnect_active_build', updateInfo.remoteBuild);
      }
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch (e) {}
      }
      toast.success('پچ با موفقیت اعمال شد! در حال راه‌اندازی مجدد... 🚀', { id: toastId });
      setTimeout(() => {
        window.location.reload(true);
      }, 800);
    } catch (err) {
      toast.error('خطا در اعمال پچ', { id: toastId });
      setIsApplyingUpdate(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const active = localStorage.getItem('server_api_url') || getApiBaseUrl();
      setServerUrl(active);
      const savedBuild = localStorage.getItem('educonnect_active_build') || '';
      setUpdateInfo((prev) => ({ ...prev, currentBuild: savedBuild }));
      checkLatestUpdate(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const theme = document.documentElement.getAttribute('data-theme') || 'light';
      setCurrentTheme(theme);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setPersonnelCode(user.personnel_code || '');
      setDepartment(user.department || '');
      setJobTitle(user.job_title || '');
      setBio(user.bio || '');
      setAvatarUrl(user.avatar_url || '');
    }
  }, [user]);

  const handleThemeChange = (newTheme) => {
    setCurrentTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    toast.success(newTheme === 'dark' ? 'حالت شب فعال شد 🌙' : 'حالت روز فعال شد ☀️');
  };

  const handleAvatarFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('لطفاً یک فایل تصویری معتبر (JPG, PNG, WEBP) انتخاب کنید');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم عکس انتخابی نباید بیشتر از ۵ مگابایت باشد');
      return;
    }

    setIsUploadingAvatar(true);
    const loadingToast = toast.loading('در حال پردازش و بارگذاری عکس پروفایل...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const uploadedUrl = res.data?.data?.url || res.data?.url;
      if (uploadedUrl) {
        setAvatarUrl(uploadedUrl);
        toast.dismiss(loadingToast);
        toast.success('عکس پروفایل با موفقیت بارگذاری شد 📷✨');
      } else {
        throw new Error('URL not returned');
      }
    } catch (err) {
      // Offline fallback: save as base64 DataURL
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        setAvatarUrl(uploadEvent.target.result);
        toast.dismiss(loadingToast);
        toast.success('عکس پروفایل بارگذاری شد (آماده ذخیره) 📷');
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl('');
    toast.success('عکس پروفایل حذف شد (به نشان حرف نام تغییر یافت)');
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.error('لطفاً نام و نام خانوادگی را وارد کنید');
      return;
    }

    setIsSaving(true);
    const saveToast = toast.loading('در حال ذخیره‌سازی تغییرات مشخصات...');

    try {
      await updateProfile({
        display_name: displayName.trim(),
        avatar_url: avatarUrl,
        phone: phone.trim(),
        personnel_code: personnelCode.trim(),
        department: department.trim(),
        job_title: jobTitle.trim(),
        bio: bio.trim(),
      });
      toast.dismiss(saveToast);
      toast.success('مشخصات فردی و عکس پروفایل با موفقیت به‌روزرسانی شد ✅');
    } catch (err) {
      toast.dismiss(saveToast);
      toast.error('خطا در ذخیره اطلاعات: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsSaving(false);
    }
  };

  const fullAvatarSrc = avatarUrl
    ? avatarUrl.startsWith('http') || avatarUrl.startsWith('data:')
      ? avatarUrl
      : (process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:5000') + avatarUrl
    : null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>پروفایل و مشخصات شخصی</h1>
        <p className={styles.subtitle}>مدیریت هویت کاربری، عکس پرسنلی، مشخصات تدریس و تنظیمات سامانه</p>
      </div>

      {/* ── 1. Profile Photo & Identity Section ── */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <HiOutlineUser style={{ fontSize: '1.25rem', color: 'var(--primary-500)' }} />
          <h2 className={styles.sectionTitle}>تصویر پروفایل و نشان اختصاصی</h2>
        </div>

        <div className={styles.profileTop}>
          {/* Avatar Preview Box */}
          <div className={styles.avatarWrapper}>
            <div className={styles.avatarLarge}>
              {fullAvatarSrc ? (
                <img src={fullAvatarSrc} alt={displayName} className={styles.avatarImg} />
              ) : (
                displayName.charAt(0) || 'ک'
              )}
            </div>

            <button
              type="button"
              className={styles.avatarBadgeUpload}
              onClick={() => fileInputRef.current?.click()}
              title="بارگذاری یا تغییر عکس"
            >
              <HiOutlineCamera />
            </button>
          </div>

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarFileSelect}
          />

          {/* Avatar Actions & Presets */}
          <div className={styles.avatarControls}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{displayName || 'کاربر ادوکانکت'}</h3>
              <span
                style={{
                  display: 'inline-block',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: 'var(--primary-500)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  padding: '3px 12px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  marginTop: '4px',
                }}
              >
                نقش کاربری: {user?.role === 'teacher' ? 'دبیر و مدرس رسمی' : user?.role === 'student' ? 'دانش‌آموز' : user?.role === 'admin' ? 'مدیریت مجتمع' : 'ولی دانش‌آموز'}
              </span>
            </div>

            <div className={styles.avatarBtnGroup}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
              >
                <HiOutlineArrowUpTray />
                <span>{isUploadingAvatar ? 'در حال بارگذاری...' : 'انتخاب عکس از کامپیوتر'}</span>
              </button>

              {avatarUrl && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleRemoveAvatar}
                  style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                >
                  <HiOutlineTrash />
                  <span>حذف عکس</span>
                </button>
              )}
            </div>

            {/* Quick Preset SVG Avatars */}
            <div className={styles.presetBox}>
              <span className={styles.presetTitle}>یا انتخاب یکی از آیکون‌های آماده:</span>
              <div className={styles.presetList}>
                {PRESET_AVATARS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={styles.presetBtn}
                    onClick={() => {
                      setAvatarUrl(p.url);
                      toast.success(`نشان «${p.label}» انتخاب شد ✨`);
                    }}
                    title={p.label}
                  >
                    <span>{p.icon}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Teacher School & Grades Setup Banner ── */}
      {user?.role === 'teacher' && (
        <div className={styles.sectionCard} style={{ border: '1px solid rgba(99, 102, 241, 0.35)', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(6, 182, 212, 0.05) 100%)' }}>
          <div className={styles.sectionHeader} style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <HiOutlineBuildingOffice2 style={{ fontSize: '1.75rem', color: 'var(--primary-500)' }} />
              <div>
                <h2 className={styles.sectionTitle} style={{ fontSize: '1.0625rem' }}>مدرسه و پایه‌های تحصیلی تدریس شما</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  تعیین نام مدرسه، ثبت مدارس دیگر، انتخاب پایه‌های تدریس و درس تخصصی
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/teacher-setup"
              className="btn btn-primary"
              style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <span>🏛️ ویرایش و ثبت اطلاعات مدرسه و پایه‌ها</span>
            </Link>
          </div>
        </div>
      )}

      {/* ── 2. Personal & Teaching Details Form ── */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <HiOutlineIdentification style={{ fontSize: '1.25rem', color: 'var(--primary-500)' }} />
          <h2 className={styles.sectionTitle}>مشخصات فردی و شغلی معلم</h2>
        </div>

        <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>نام و نام خانوادگی:</label>
              <input
                type="text"
                className="input"
                placeholder="مثلاً: دکتر علیرضا سلیمانی"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>کد پرسنلی / کد معلمی:</label>
              <input
                type="text"
                className="input"
                placeholder="مثلاً: 98401254"
                value={personnelCode}
                onChange={(e) => setPersonnelCode(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label>گروه آموزشی / دپارتمان:</label>
              <input
                type="text"
                className="input"
                placeholder="مثلاً: گروه علوم پایه و ریاضی متوسطه دوم"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label>سمت و عنوان تخصصی:</label>
              <input
                type="text"
                className="input"
                placeholder="مثلاً: دبیر تخصصی فیزیک و المپیاد"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label>شماره تلفن همراه (محرمانه):</label>
              <input
                type="text"
                className="input"
                value={phone}
                placeholder="09123456789"
                onChange={(e) => setPhone(e.target.value)}
              />
              <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <HiOutlineShieldCheck />
                شماره همراه فقط برای احراز هویت است و به دانش‌آموزان نشان داده نمی‌شود.
              </span>
            </div>

            <div className={styles.formGroup}>
              <label>آدرس ایمیل سازمانی:</label>
              <input
                type="email"
                className="input"
                value={email}
                disabled
                title="ایمیل حساب کاربری توسط سرپرست سیستم تعیین شده است"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>معرفی کوتاه، تجارب تدریس و پیام به دانش‌آموزان (بیوگرافی):</label>
            <textarea
              className={styles.bioInput}
              rows={3}
              placeholder="توضیحاتی درباره سوابق تدریس، شیوه نمره‌دهی، منابع درسی یا معرفی خود بنویسید..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                fontWeight: 800,
                fontSize: '0.95rem',
              }}
            >
              <HiOutlineCheck />
              <span>{isSaving ? 'در حال ثبت تغییرات...' : 'ذخیره تغییرات مشخصات و عکس پروفایل'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* ── 3. Appearance & Theme Section ── */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <HiOutlineSun style={{ fontSize: '1.25rem', color: 'var(--primary-500)' }} />
          <h2 className={styles.sectionTitle}>پوسته و ظاهر برنامه</h2>
        </div>

        <div>
          <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '12px' }}>
            انتخاب حالت نمایش پنل:
          </label>
          <div className={styles.themeSelector}>
            <button
              type="button"
              className={`${styles.themeBtn} ${currentTheme === 'dark' ? styles.themeBtnActive : ''}`}
              onClick={() => handleThemeChange('dark')}
            >
              <HiOutlineMoon style={{ fontSize: '1.75rem' }} />
              <strong>حالت تاریک (Dark Mode)</strong>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>مناسب برای نور کم و تمرکز شبانه</span>
            </button>

            <button
              type="button"
              className={`${styles.themeBtn} ${currentTheme === 'light' ? styles.themeBtnActive : ''}`}
              onClick={() => handleThemeChange('light')}
            >
              <HiOutlineSun style={{ fontSize: '1.75rem' }} />
              <strong>حالت روشن (Light Mode)</strong>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>کنتراست بالا و مناسب روز</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 4. Privacy & Quiet Hours ── */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <HiOutlineBellAlert style={{ fontSize: '1.25rem', color: 'var(--primary-500)' }} />
          <h2 className={styles.sectionTitle}>حریم خصوصی و ساعت سکوت کلاسی</h2>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ fontWeight: 600 }}>فعال‌سازی ساعت سکوت شبانه (Quiet Hours)</h4>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              در بازه ساعت ۲۱:۰۰ تا ۰۷:۰۰ صبح، هیچ اعلان یا پیامی برای شما زنگ نخواهد زد.
            </p>
          </div>

          <label className="switch" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={quietHoursEnabled}
              onChange={(e) => {
                setQuietHoursEnabled(e.target.checked);
                toast.success(
                  e.target.checked ? 'ساعت سکوت فعال شد 🌙' : 'ساعت سکوت غیرفعال شد'
                );
              }}
            />
          </label>
        </div>
      </div>

      {/* ── 5. Server Connection & Live OTA Update ── */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <HiOutlineSignal style={{ fontSize: '1.25rem', color: 'var(--primary-500)' }} />
          <h2 className={styles.sectionTitle}>تنظیمات اتصال سرور و به‌روزرسانی زنده (OTA)</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              آدرس سرور متصل (API Base URL):
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://192.168.1.108/api/v1"
                dir="ltr"
                style={{
                  flex: 1,
                  minWidth: '240px',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-input, rgba(255,255,255,0.05))',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace'
                }}
              />
              <button
                type="button"
                className={styles.saveBtn}
                style={{ width: 'auto', padding: '10px 18px', whiteSpace: 'nowrap' }}
                onClick={async () => {
                  let raw = (serverUrl || '').trim();
                  if (!raw) {
                    toast.error('لطفاً آدرس سرور را وارد نمایید');
                    return;
                  }
                  if (raw.startsWith('p://')) raw = 'htt' + raw;
                  if (raw.startsWith('ttp://')) raw = 'h' + raw;
                  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
                    raw = raw.startsWith('192.168.') || raw.startsWith('10.') || raw.startsWith('localhost')
                      ? 'http://' + raw
                      : 'https://' + raw;
                  }
                  let cleaned = raw.replace(/\/+$/, '');
                  const finalUrl = cleaned.endsWith('/api/v1') ? cleaned : `${cleaned}/api/v1`;

                  const loadId = toast.loading('در حال تست اتصال به آدرس جدید...');
                  const probe = await probeServer(finalUrl);
                  if (probe.success) {
                    setApiBaseUrl(finalUrl);
                    setServerUrl(finalUrl);
                    const buildName = probe.data?.build?.substring(0, 7) || '1.2.0';
                    toast.success(`اتصال برقرار شد! نسخه سرور: ${buildName} 🚀`, { id: loadId });
                    setServerStatus({ connected: true, message: `نسخه سرور: ${buildName}` });
                  } else {
                    toast.error(`خطا در اتصال: ${probe.error || 'عدم پاسخگویی سرور'}`, { id: loadId });
                    setServerStatus({ connected: false, message: 'عدم پاسخگویی سرور' });
                  }
                }}
              >
                ذخیره و تست
              </button>

              <button
                type="button"
                disabled={isDetectingServer}
                style={{
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: 'var(--primary-400, #818cf8)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: '12px',
                  padding: '10px 16px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                onClick={async () => {
                  setIsDetectingServer(true);
                  const loadId = toast.loading('در حال جستجو و شناسایی خودکار سرور...');
                  const detected = await autoDetectServer();
                  setIsDetectingServer(false);
                  if (detected.success) {
                    setServerUrl(detected.url);
                    setServerStatus({ connected: true, message: `شناسایی موفق! نسخه: ${detected.data?.build?.substring(0, 7)}` });
                    toast.success(`سرور با موفقیت شناسایی شد: ${detected.url}`, { id: loadId });
                  } else {
                    toast.error('هیچ سرور فعالی یافت نشد. لطفاً از اتصال وای‌فای یا اینترنت مطمئن شوید.', { id: loadId });
                  }
                }}
              >
                <HiOutlineArrowPath className={isDetectingServer ? 'spin' : ''} />
                شناسایی خودکار
              </button>
            </div>

            {/* Quick Preset Buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={{
                  fontSize: '0.78rem',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                onClick={async () => {
                  const url = 'http://192.168.1.104/api/v1';
                  setServerUrl(url);
                  setApiBaseUrl(url);
                  const probe = await probeServer(url);
                  if (probe.success) {
                    toast.success('اتصال به وای‌فای اصلی (104) برقرار شد! ✅');
                    setServerStatus({ connected: true, message: 'متصل به 192.168.1.104' });
                  } else {
                    toast.error('وای‌فای 104 پاسخ نداد');
                  }
                }}
              >
                <HiOutlineWifi />
                وای‌فای اصلی (192.168.1.104)
              </button>

              <button
                type="button"
                style={{
                  fontSize: '0.78rem',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                onClick={async () => {
                  const url = DEFAULT_LOCAL_API;
                  setServerUrl(url);
                  setApiBaseUrl(url);
                  const probe = await probeServer(url);
                  if (probe.success) {
                    toast.success('اتصال به وای‌فای (108) برقرار شد! ✅');
                    setServerStatus({ connected: true, message: 'متصل به 192.168.1.108' });
                  } else {
                    toast.error('وای‌فای 108 پاسخ نداد');
                  }
                }}
              >
                <HiOutlineWifi />
                وای‌فای (192.168.1.108)
              </button>

              <button
                type="button"
                style={{
                  fontSize: '0.78rem',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  background: 'rgba(16, 185, 129, 0.1)',
                  color: '#10b981',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                onClick={async () => {
                  const url = DEFAULT_TUNNEL_API;
                  setServerUrl(url);
                  setApiBaseUrl(url);
                  const probe = await probeServer(url);
                  if (probe.success) {
                    toast.success('اتصال به تونل آنلاین برقرار شد! 🚀');
                    setServerStatus({ connected: true, message: 'متصل به تونل آنلاین' });
                  } else {
                    toast.error('تونل آنلاین پاسخ نداد');
                  }
                }}
              >
                <HiOutlineGlobeAlt />
                اینترنت سیم‌کارت و بیرون (تونل آنلاین پینگی)
              </button>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />

          {/* OTA Update Center */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.06) 0%, rgba(6, 182, 212, 0.06) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.22)',
            borderRadius: 'var(--radius-2xl)',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            marginTop: '8px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '1.35rem',
                  boxShadow: '0 4px 12px rgba(79, 70, 229, 0.35)',
                }}>
                  <HiOutlineSparkles />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    مرکز دریافت و بررسی آخرین آپدیت سامانه (OTA)
                  </h4>
                  <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                    دریافت بلادرنگ آخرین تغییرات و پچ‌های ثبت‌شده از سرور بدون نیاز به دانلود فایل نصبی جدید
                  </p>
                </div>
              </div>

              {/* Version Comparison Badge */}
              {updateInfo.hasChecked && (
                <div style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.8125rem',
                  fontWeight: 750,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: updateInfo.hasUpdate ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.12)',
                  color: updateInfo.hasUpdate ? '#10b981' : '#6366f1',
                  border: `1px solid ${updateInfo.hasUpdate ? 'rgba(16, 185, 129, 0.35)' : 'rgba(99, 102, 241, 0.25)'}`,
                }}>
                  <span>{updateInfo.hasUpdate ? '🚀 آپدیت جدیدتر موجود است' : '✅ سامانه شما کاملاً به‌روز است'}</span>
                </div>
              )}
            </div>

            {/* Version Information Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '10px',
              background: 'var(--bg-body)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-xl)',
              padding: '12px 16px',
            }}>
              <div>
                <span style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', display: 'block' }}>
                  نسخه فعال در مرورگر شما:
                </span>
                <span style={{
                  fontFamily: 'monospace',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  direction: 'ltr',
                  display: 'inline-block',
                }}>
                  {updateInfo.currentBuild ? updateInfo.currentBuild.substring(0, 7) : 'نسخه اولیه'}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', display: 'block' }}>
                  آخرین نسخه موجود در سرور:
                </span>
                <span style={{
                  fontFamily: 'monospace',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  color: updateInfo.hasUpdate ? '#10b981' : 'var(--primary-500)',
                  direction: 'ltr',
                  display: 'inline-block',
                }}>
                  {updateInfo.remoteBuild ? updateInfo.remoteBuild.substring(0, 7) : 'در حال استعلام...'}
                </span>
              </div>

              {updateInfo.lastSync && (
                <div>
                  <span style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', display: 'block' }}>
                    زمان آخرین انتشار پچ:
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {new Date(updateInfo.lastSync).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) + ' - ' + new Date(updateInfo.lastSync).toLocaleDateString('fa-IR')}
                  </span>
                </div>
              )}
            </div>

            {/* Commit Message Box */}
            {updateInfo.commitMessage && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                borderRight: '3px solid #6366f1',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>عنوان آخرین پچ گیت‌هاب: </span>
                <span>{updateInfo.commitMessage}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
              <button
                type="button"
                className={styles.saveBtn}
                disabled={isCheckingUpdate}
                onClick={() => checkLatestUpdate(true)}
                style={{
                  width: 'auto',
                  padding: '10px 20px',
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                }}
              >
                <HiOutlineArrowPath className={isCheckingUpdate ? 'spin' : ''} style={{ fontSize: '1rem' }} />
                <span>{isCheckingUpdate ? 'در حال بررسی سریع...' : 'بررسی مجدد آخرین نسخه 🔄'}</span>
              </button>

              <button
                type="button"
                className={styles.saveBtn}
                disabled={isApplyingUpdate}
                onClick={handleApplyUpdate}
                style={{
                  width: 'auto',
                  padding: '10px 20px',
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: updateInfo.hasUpdate
                    ? 'linear-gradient(135deg, #059669, #10b981)'
                    : 'linear-gradient(135deg, #0284c7, #06b6d4)',
                }}
              >
                <span>{updateInfo.hasUpdate ? '🚀 اعمال آنی پچ جدید' : '⚡ پاکسازی کش و رفرش برنامه'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
