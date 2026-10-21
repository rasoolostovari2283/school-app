'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
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

      {/* ── 5. In-App Live Update (OTA) ── */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <HiOutlineSparkles style={{ fontSize: '1.25rem', color: 'var(--primary-500)' }} />
          <h2 className={styles.sectionTitle}>وضعیت نسخه و به‌روزرسانی زنده (OTA)</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ fontWeight: 600 }}>همگام‌سازی مستقیم با سرور مدرسه</h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                هنگامی که سرور آپدیت می‌شود، می‌توانید بدون نیاز به دانلود و نصب مجدد فایل APK، آخرین نسخه را دریافت کنید.
              </p>
            </div>
            <button
              type="button"
              className={styles.saveBtn}
              style={{ width: 'auto', padding: '10px 20px', whiteSpace: 'nowrap' }}
              onClick={async () => {
                const loadId = toast.loading('در حال بررسی آخرین نسخه سرور...');
                try {
                  const res = await api.get('/system/app-version');
                  if (res.data?.success) {
                    toast.success(
                      `سرور متصل است! نسخه فعال: ${res.data.build?.substring(0, 7) || '1.2.0'}`,
                      { id: loadId }
                    );
                    localStorage.setItem('educonnect_active_build', res.data.build || 'latest');
                    setTimeout(() => {
                      window.location.reload(true);
                    }, 1000);
                  } else {
                    toast.error('پاسخی از سرور دریافت نشد', { id: loadId });
                  }
                } catch (e) {
                  toast.error('خطا در برقراری ارتباط با سرور', { id: loadId });
                }
              }}
            >
              بررسی و دریافت آپدیت
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
