'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import {
  HiOutlineBuildingOffice2,
  HiOutlineArrowRight,
  HiOutlineCheckCircle,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineClipboardDocument,
  HiOutlineClipboardDocumentCheck,
  HiOutlineSparkles,
  HiOutlineShieldCheck,
  HiOutlineMapPin,
  HiOutlineAcademicCap,
  HiOutlineUser,
  HiOutlinePhone,
  HiOutlineLockClosed,
  HiOutlineArrowLeft,
} from 'react-icons/hi2';
import useAuthStore from '../../stores/authStore';
import styles from './registerSchool.module.css';

const SCHOOL_LEVELS = [
  { value: 'پیش‌دبستانی', label: 'پیش‌دبستانی' },
  { value: 'دبستان (ابتدایی)', label: 'دبستان (ابتدایی)' },
  { value: 'متوسطه اول (راهنمایی)', label: 'متوسطه اول (راهنمایی)' },
  { value: 'متوسطه دوم (دبیرستان)', label: 'متوسطه دوم (دبیرستان)' },
  { value: 'هنرستان فنی و حرفه‌ای / کاردانش', label: 'هنرستان فنی و حرفه‌ای / کاردانش' },
  { value: 'مجتمع آموزشی کامل', label: 'مجتمع آموزشی کامل' },
];

const HIGH_SCHOOL_MAJORS = [
  'ریاضی و فیزیک',
  'علوم تجربی',
  'ادبیات و علوم انسانی',
  'علوم و معارف اسلامی',
  'فنی و حرفه‌ای',
  'کاردانش',
];

const IRAN_CITIES = [
  'تهران',
  'شیراز',
  'اصفهان',
  'مشهد',
  'تبریز',
  'کرج',
  'اهواز',
  'قم',
  'رشت',
  'کرمان',
  'یزد',
  'ساری',
  'همدان',
  'قزوین',
  'اردبیل',
  'بندرعباس',
  'زنجان',
  'کرمانشاه',
  'ارومیه',
  'سنندج',
  'کاشان',
  'بوشهر',
];

function normalizeDigits(str) {
  if (!str) return '';
  return String(str)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

function isSecondHighSchool(level) {
  const clean = String(level || '').trim();
  return clean.includes('متوسطه دوم') || clean.includes('دبیرستان');
}

export default function RegisterSchoolPage() {
  const router = useRouter();
  const registerSchool = useAuthStore((s) => s.registerSchool);

  const [form, setForm] = useState({
    school_name: '',
    city: '',
    school_level: 'متوسطه دوم (دبیرستان)',
    majors: ['ریاضی و فیزیک', 'علوم تجربی'],
    admin_name: '',
    admin_phone: '',
    admin_password: '',
    confirm_password: '',
  });
  const [customMajor, setCustomMajor] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [registeredResult, setRegisteredResult] = useState(null);
  const [copiedField, setCopiedField] = useState('');

  const showMajorsField = isSecondHighSchool(form.school_level);

  const handleToggleMajor = (major) => {
    setForm((prev) => {
      const exists = prev.majors.includes(major);
      return {
        ...prev,
        majors: exists ? prev.majors.filter((m) => m !== major) : [...prev.majors, major],
      };
    });
  };

  const handleAddCustomMajor = () => {
    const clean = customMajor.trim();
    if (!clean) return;
    if (!form.majors.includes(clean)) {
      setForm((prev) => ({ ...prev, majors: [...prev.majors, clean] }));
    }
    setCustomMajor('');
  };

  const handleCopy = async (value, fieldKey, label) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldKey);
      toast.success(`${label} کپی شد`);
      setTimeout(() => setCopiedField(''), 2500);
    } catch {
      toast.error('امکان کپی خودکار وجود ندارد؛ لطفاً متن را دستی انتخاب کنید');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const cleanSchoolName = form.school_name.trim();
    const cleanCity = form.city.trim();
    const cleanAdminName = form.admin_name.trim();
    const cleanPhone = normalizeDigits(form.admin_phone).replace(/\s+/g, '');
    const cleanPassword = form.admin_password.trim();
    const cleanConfirm = form.confirm_password.trim();

    if (!cleanSchoolName) {
      toast.error('لطفاً نام مدرسه را وارد کنید');
      return;
    }
    if (!cleanCity) {
      toast.error('لطفاً شهر محل استقرار مدرسه را وارد کنید');
      return;
    }
    if (showMajorsField && form.majors.length === 0) {
      toast.error('برای مقطع متوسطه دوم، حداقل یک رشته ارائه‌دهنده را انتخاب کنید');
      return;
    }
    if (!cleanAdminName) {
      toast.error('لطفاً نام و نام خانوادگی مدیر مدرسه را وارد کنید');
      return;
    }
    if (!/^09\d{9}$/.test(cleanPhone)) {
      toast.error('شماره موبایل مدیر باید ۱۱ رقم و با 09 شروع شود');
      return;
    }
    if (cleanPassword.length < 6) {
      toast.error('رمز عبور باید حداقل ۶ کاراکتر باشد');
      return;
    }
    if (cleanPassword !== cleanConfirm) {
      toast.error('رمز عبور و تکرار آن یکسان نیستند');
      return;
    }

    setSubmitting(true);
    try {
      const res = await registerSchool({
        school_name: cleanSchoolName,
        school_level: form.school_level,
        majors: showMajorsField ? form.majors : [],
        city: cleanCity,
        admin_name: cleanAdminName,
        admin_phone: cleanPhone,
        admin_password: cleanPassword,
      });

      const schoolObj = res?.school || res?.data?.school;
      const userObj = res?.user || res?.data?.user;

      setRegisteredResult({
        school: schoolObj,
        user: userObj,
      });
      toast.success(
        `مدرسه «${schoolObj?.name || cleanSchoolName}» با موفقیت ثبت شد! نام کاربری شما: @${schoolObj?.username || userObj?.username}`
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || 'خطا در ثبت مدرسه. لطفاً مجدداً تلاش کنید.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page} dir="rtl">
      <Toaster position="top-center" />

      <div className={styles.shell}>
        {/* Top Bar */}
        <div className={styles.topBar}>
          <Link href="/login/" className={styles.backLink}>
            <HiOutlineArrowRight />
            <span>بازگشت به صفحه ورود</span>
          </Link>
          <div className={styles.brandMark}>
            <span className={styles.brandBadge}>
              <HiOutlineBuildingOffice2 />
            </span>
            <span>EduConnect | ثبت مدرسه</span>
          </div>
        </div>

        <div className={styles.card}>
          {!registeredResult ? (
            <>
              <div className={styles.header}>
                <span className={styles.headerKicker}>
                  <HiOutlineSparkles />
                  <span>ثبت رسمی مدرسه در دیتابیس مرکزی</span>
                </span>
                <h1 className={styles.title}>ثبت مدرسه جدید و ایجاد پنل مدیریت</h1>
                <p className={styles.subtitle}>
                  مشخصات مدرسه، مقطع تحصیلی، مدیر و رمز عبور را وارد کنید. پس از ثبت، یک نام کاربری شخصی و غیرتکراری
                  برای ورود بعدی و جستجوی مدرسه به شما اختصاص داده می‌شود.
                </p>
              </div>

              <form onSubmit={handleSubmit} className={styles.form} noValidate>
                {/* Section 1: School Identity */}
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>
                    <span className={styles.sectionStep}>۱</span>
                    <span>مشخصات مدرسه و مقطع تحصیلی</span>
                  </h2>

                  <div className={styles.gridTwo}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="school_name">
                        <HiOutlineBuildingOffice2 />
                        <span>نام مدرسه</span>
                        <span className={styles.requiredMark}>*</span>
                      </label>
                      <input
                        id="school_name"
                        name="school_name"
                        className="input"
                        type="text"
                        placeholder="مثلاً: دبیرستان نمونه دولتی علامه طباطبایی"
                        value={form.school_name}
                        onChange={(e) => setForm({ ...form, school_name: e.target.value })}
                        required
                        autoFocus
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="school_city">
                        <HiOutlineMapPin />
                        <span>شهر محل استقرار مدرسه</span>
                        <span className={styles.requiredMark}>*</span>
                      </label>
                      <input
                        id="school_city"
                        name="city"
                        list="iran-cities-datalist"
                        className="input"
                        type="text"
                        placeholder="مثلاً: شیراز، تهران، اصفهان، مشهد..."
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                        required
                      />
                      <datalist id="iran-cities-datalist">
                        {IRAN_CITIES.map((city) => (
                          <option key={city} value={city} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="school_level">
                      <HiOutlineAcademicCap />
                      <span>مقطع تحصیلی مدرسه</span>
                      <span className={styles.requiredMark}>*</span>
                    </label>
                    <select
                      id="school_level"
                      name="school_level"
                      className="input"
                      value={form.school_level}
                      onChange={(e) => {
                        const nextLevel = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          school_level: nextLevel,
                          majors: isSecondHighSchool(nextLevel)
                            ? prev.majors.length > 0
                              ? prev.majors
                              : ['ریاضی و فیزیک', 'علوم تجربی']
                            : [],
                        }));
                      }}
                    >
                      {SCHOOL_LEVELS.map((lvl) => (
                        <option key={lvl.value} value={lvl.value}>
                          {lvl.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Conditional Majors Selector ONLY for High School (متوسطه دوم) */}
                  {showMajorsField && (
                    <div className={styles.majorsBox} data-testid="high-school-majors-section">
                      <div className={styles.majorsHeader}>
                        <label className={styles.label}>
                          <span>رشته‌های ارائه‌دهنده مدرسه (مخصوص مقطع متوسطه دوم)</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <span className={styles.majorsCount}>{form.majors.length} رشته انتخاب‌شده</span>
                      </div>
                      <p className={styles.hint}>
                        تمام رشته‌هایی که در دبیرستان شما تدریس می‌شود را انتخاب کنید:
                      </p>

                      <div className={styles.majorsGrid}>
                        {Array.from(new Set([...HIGH_SCHOOL_MAJORS, ...form.majors])).map((major) => {
                          const isSelected = form.majors.includes(major);
                          return (
                            <button
                              key={major}
                              type="button"
                              aria-pressed={isSelected}
                              className={`${styles.majorChip} ${isSelected ? styles.majorChipActive : ''}`}
                              onClick={() => handleToggleMajor(major)}
                            >
                              {isSelected && <HiOutlineCheckCircle style={{ color: '#4f46e5', flexShrink: 0 }} />}
                              <span>{major}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className={styles.customMajorRow}>
                        <input
                          type="text"
                          className="input"
                          placeholder="افزودن رشته دیگر (مثلاً: شبکه و نرم‌افزار رایانه)..."
                          value={customMajor}
                          onChange={(e) => setCustomMajor(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomMajor();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className={styles.customMajorBtn}
                          onClick={handleAddCustomMajor}
                        >
                          + افزودن رشته
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 2: Principal Info & Login Password */}
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>
                    <span className={styles.sectionStep}>۲</span>
                    <span>مشخصات مدیر مدرسه و رمز عبور ورود</span>
                  </h2>

                  <div className={styles.gridTwo}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="admin_name">
                        <HiOutlineUser />
                        <span>نام و نام خانوادگی مدیر مدرسه</span>
                        <span className={styles.requiredMark}>*</span>
                      </label>
                      <input
                        id="admin_name"
                        name="admin_name"
                        className="input"
                        type="text"
                        placeholder="مثلاً: دکتر حسین فضیلت‌پور"
                        value={form.admin_name}
                        onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
                        required
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="admin_phone">
                        <HiOutlinePhone />
                        <span>شماره موبایل مدیر مدرسه</span>
                        <span className={styles.requiredMark}>*</span>
                      </label>
                      <input
                        id="admin_phone"
                        name="admin_phone"
                        className="input"
                        type="tel"
                        inputMode="tel"
                        dir="ltr"
                        placeholder="09123456789"
                        value={form.admin_phone}
                        onChange={(e) => setForm({ ...form, admin_phone: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className={styles.gridTwo}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="admin_password">
                        <HiOutlineLockClosed />
                        <span>رمز عبور ورود به پنل مدیریت</span>
                        <span className={styles.requiredMark}>*</span>
                      </label>
                      <div className={styles.passwordWrap}>
                        <input
                          id="admin_password"
                          name="admin_password"
                          className={`input ${styles.passwordInput}`}
                          type={showPassword ? 'text' : 'password'}
                          dir="ltr"
                          placeholder="حداقل ۶ کاراکتر"
                          value={form.admin_password}
                          onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
                          required
                        />
                        <button
                          type="button"
                          className={styles.eyeBtn}
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'مخفی کردن رمز عبور' : 'نمایش رمز عبور'}
                        >
                          {showPassword ? <HiOutlineEyeSlash /> : <HiOutlineEye />}
                        </button>
                      </div>
                      <p className={styles.hint}>
                        این رمز عبور به صورت امن در دیتابیس ذخیره می‌شود و در ورودهای بعدی بررسی خواهد شد.
                      </p>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="confirm_password">
                        <HiOutlineShieldCheck />
                        <span>تکرار رمز عبور</span>
                        <span className={styles.requiredMark}>*</span>
                      </label>
                      <input
                        id="confirm_password"
                        name="confirm_password"
                        className="input"
                        type={showPassword ? 'text' : 'password'}
                        dir="ltr"
                        placeholder="رمز عبور را مجدداً وارد کنید"
                        value={form.confirm_password}
                        onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.autoIdNotice}>
                  <HiOutlineSparkles style={{ fontSize: '1.35rem', color: '#0284c7', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>صدور خودکار نام کاربری اختصاصی و یکتا:</strong> بلافاصله پس از ثبت فرم، سامانه به صورت خودکار یک
                    نام کاربری شخصی و غیرتکراری (آیدی مدرسه) برای شما تولید می‌کند که هم برای ورود بعدی و هم برای جستجوی
                    مدرسه توسط معلمان، دانش‌آموزان و اولیا کاربرد دارد.
                  </div>
                </div>

                <button type="submit" className={styles.submitBtn} disabled={submitting}>
                  <span>{submitting ? 'در حال ثبت در دیتابیس و صدور نام کاربری...' : 'ثبت نهایی مدرسه و صدور نام کاربری اختصاصی'}</span>
                  <HiOutlineArrowLeft />
                </button>
              </form>
            </>
          ) : (
            <div className={styles.successWrap} data-testid="school-registration-success">
              <div className={styles.successBanner}>
                <div className={styles.successIcon}>
                  <HiOutlineCheckCircle />
                </div>
                <h1 className={styles.successTitle}>مدرسه شما با موفقیت در دیتابیس ثبت شد</h1>
                <p className={styles.successSub}>
                  نام کاربری شخصی و غیرتکراری شما صادر شد. لطفاً این نام کاربری را برای ورودهای بعدی و معرفی به اعضای مدرسه یادداشت کنید.
                </p>
              </div>

              <div className={styles.credentialsGrid}>
                <div className={styles.credentialCard}>
                  <span className={styles.credentialLabel}>نام کاربری اختصاصی شما (آیدی جستجو و ورود مدرسه):</span>
                  <div className={styles.credentialValueRow}>
                    <span className={styles.credentialValue} data-testid="generated-school-username">
                      @{registeredResult.school?.username || registeredResult.user?.username}
                    </span>
                    <button
                      type="button"
                      className={styles.copyBtn}
                      onClick={() =>
                        handleCopy(
                          `@${registeredResult.school?.username || registeredResult.user?.username}`,
                          'username',
                          'نام کاربری اختصاصی'
                        )
                      }
                    >
                      {copiedField === 'username' ? <HiOutlineClipboardDocumentCheck /> : <HiOutlineClipboardDocument />}
                      <span>{copiedField === 'username' ? 'کپی شد' : 'کپی آیدی'}</span>
                    </button>
                  </div>
                </div>

                <div className={styles.credentialCard}>
                  <span className={styles.credentialLabel}>کد اختصاصی مدرسه در سامانه:</span>
                  <div className={styles.credentialValueRow}>
                    <span className={styles.credentialValue} data-testid="generated-school-code">
                      {registeredResult.school?.school_code}
                    </span>
                    <button
                      type="button"
                      className={styles.copyBtn}
                      onClick={() =>
                        handleCopy(registeredResult.school?.school_code, 'code', 'کد اختصاصی مدرسه')
                      }
                    >
                      {copiedField === 'code' ? <HiOutlineClipboardDocumentCheck /> : <HiOutlineClipboardDocument />}
                      <span>{copiedField === 'code' ? 'کپی شد' : 'کپی کد'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.summaryTable}>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryKey}>نام مدرسه</span>
                  <span className={styles.summaryVal}>{registeredResult.school?.name}</span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryKey}>شهر محل استقرار</span>
                  <span className={styles.summaryVal}>{registeredResult.school?.city}</span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryKey}>مقطع تحصیلی</span>
                  <span className={styles.summaryVal}>{registeredResult.school?.level}</span>
                </div>
                {Array.isArray(registeredResult.school?.majors) && registeredResult.school.majors.length > 0 && (
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryKey}>رشته‌های ارائه‌دهنده</span>
                    <span className={styles.summaryVal}>{registeredResult.school.majors.join('، ')}</span>
                  </div>
                )}
                <div className={styles.summaryItem}>
                  <span className={styles.summaryKey}>مدیر مدرسه</span>
                  <span className={styles.summaryVal}>{registeredResult.school?.principal_name || registeredResult.school?.principal}</span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryKey}>شماره موبایل مدیر</span>
                  <span className={styles.summaryVal} dir="ltr" style={{ textAlign: 'right' }}>
                    {registeredResult.school?.principal_phone || registeredResult.school?.phone}
                  </span>
                </div>
              </div>

              <div className={styles.actionsRow}>
                <button
                  type="button"
                  className={styles.submitBtn}
                  style={{ flex: 1 }}
                  onClick={() => router.push('/dashboard/management/')}
                >
                  <span>ورود به پنل مدیریت مدرسه</span>
                  <HiOutlineArrowLeft />
                </button>
                <Link href="/login/" className={styles.secondaryBtn}>
                  صفحه ورود
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
