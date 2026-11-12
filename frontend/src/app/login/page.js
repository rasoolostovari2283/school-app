'use client';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '../../stores/authStore';
import toast, { Toaster, ToastBar } from 'react-hot-toast';
import {
  HiOutlineSparkles,
  HiOutlineIdentification,
  HiOutlinePhone,
  HiOutlineLockClosed,
  HiOutlineUser,
  HiOutlineAcademicCap,
  HiOutlineUserGroup,
  HiOutlineCheckCircle,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineBuildingOffice2,
  HiOutlineClipboardDocument,
  HiOutlineClipboardDocumentCheck,
  HiOutlineMapPin,
} from 'react-icons/hi2';
import styles from './login.module.css';
import ServerConnectionBar from '../../components/system/ServerConnectionBar';
import AutoUpdateChecker from '../../components/system/AutoUpdateChecker';

// Persian Name to Latin Handle Generator for instant frontend live preview
const nameDictionary = {
  'علی': 'ali', 'محمد': 'mohammad', 'رضا': 'reza', 'امیر': 'amir', 'حسین': 'hossein',
  'امیرحسین': 'amirhossein', 'علیرضا': 'alireza', 'محمدرضا': 'mohammadreza',
  'مهدی': 'mehdi', 'حسن': 'hassan', 'احمد': 'ahmad', 'پارسا': 'parsa', 'کیان': 'kian',
  'سارا': 'sara', 'فاطمه': 'fatemeh', 'زهرا': 'zahra', 'مریم': 'maryam', 'مسعود': 'masoud',
  'نیما': 'nima', 'سینا': 'sina', 'آرش': 'arash', 'پوریا': 'pouria', 'امید': 'omid',
  'نوید': 'navid', 'پرهام': 'parham', 'سامان': 'saman', 'بهرام': 'bahram', 'کوروش': 'kourosh',
  'داریوش': 'dariush', 'فرزاد': 'farzad', 'فرهاد': 'farhad', 'شاهین': 'shahin', 'مانی': 'mani',
  'حسینی': 'hosseini', 'احمدی': 'ahmadi', 'کیانی': 'kiani', 'سعیدی': 'saeedi', 'صادقی': 'sadeghi',
  'تقوی': 'taghavi', 'میرزایی': 'mirzaei', 'اکبری': 'akbari', 'جلالی': 'jalali', 'رحمانی': 'rahmani',
  'کریمی': 'karimi', 'رضایی': 'rezaei', 'محمدی': 'mohammadi', 'موسوی': 'mousavi', 'نوری': 'nouri',
  'سهرابی': 'sohrabi', 'طاهری': 'taheri', 'کاظمی': 'kazemi', 'حیدری': 'heidari', 'جعفری': 'jafari',
  'مرادی': 'moradi', 'باقری': 'bagheri', 'ابراهیمی': 'ebrahimi', 'صالحی': 'salehi', 'نجفی': 'najafi'
};

const charMap = {
  'ا': 'a', 'آ': 'a', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ث': 's', 'ج': 'j', 'چ': 'ch',
  'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'ژ': 'zh', 'س': 's',
  'ش': 'sh', 'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f',
  'ق': 'gh', 'ک': 'k', 'گ': 'g', 'ل': 'l', 'م': 'm', 'ن': 'n', 'و': 'v', 'ه': 'h',
  'ی': 'i', 'ئ': 'y', 'ي': 'i', 'ك': 'k', 'ة': 'h'
};

function previewUsername(displayName) {
  if (!displayName || !displayName.trim()) return '';
  let cleaned = displayName
    .replace(/(دکتر|مهندس|استاد|سرکار|خانم|آقای|سید|سیده)\s*/gi, '')
    .trim();

  // If already latin characters
  if (/^[a-zA-Z0-9_\-\.]+$/.test(cleaned)) {
    return cleaned.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  const latinWords = words.map((w) => {
    const cleanWord = w.replace(/[ًٌٍَُِّْ]/g, '');
    if (nameDictionary[cleanWord]) return nameDictionary[cleanWord];
    let res = '';
    for (let i = 0; i < cleanWord.length; i++) {
      const c = cleanWord[i];
      if (charMap[c] !== undefined) res += charMap[c];
      else if (/[a-z0-9]/i.test(c)) res += c.toLowerCase();
    }
    return res;
  }).filter(Boolean);

  let base = latinWords.join('_').toLowerCase().replace(/[^a-z0-9_]/g, '').replace(/^_+|_+$/g, '');
  return base || 'user';
}

const TEACHER_STAGES_MAP = {
  pre_school: {
    id: 'pre_school',
    title: 'پیش‌دبستانی (پیش ۱ و پیش ۲)',
    grades: ['پیش‌دبستانی ۱', 'پیش‌دبستانی ۲'],
  },
  elementary: {
    id: 'elementary',
    title: 'دبستان (کلاس اول تا ششم)',
    grades: ['اول دبستان', 'دوم دبستان', 'سوم دبستان', 'چهارم دبستان', 'پنجم دبستان', 'ششم دبستان'],
  },
  middle_school: {
    id: 'middle_school',
    title: 'متوسطه اول (پایه هفتم تا نهم)',
    grades: ['پایه هفتم', 'پایه هشتم', 'پایه نهم'],
  },
  high_school: {
    id: 'high_school',
    title: 'متوسطه دوم (پایه دهم تا دوازدهم)',
    branches: {
      'تجربی': ['پایه دهم تجربی', 'پایه یازدهم تجربی', 'پایه دوازدهم تجربی'],
      'ریاضی': ['پایه دهم ریاضی', 'پایه یازدهم ریاضی', 'پایه دوازدهم ریاضی'],
      'انسانی': ['پایه دهم انسانی', 'پایه یازدهم انسانی', 'پایه دوازدهم انسانی'],
      'هنرستان': ['پایه دهم هنرستان', 'پایه یازدهم هنرستان', 'پایه دوازدهم هنرستان'],
      'کاردانش': ['پایه دهم کاردانش', 'پایه یازدهم کاردانش', 'پایه دوازدهم کاردانش'],
      'عمومی': ['پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'],
    },
  },
};

const DEFAULT_TEACHER_SUBJECTS = [
  'ریاضیات و حسابان',
  'فیزیک',
  'شیمی',
  'زیست‌شناسی',
  'هندسه و گسسته',
  'ادبیات و زبان فارسی',
  'زبان انگلیسی',
  'عربی و زبان قرآن',
  'دین و زندگی',
  'تاریخ و جغرافیا',
  'علوم تجربی',
  'علوم اجتماعی و جامعه‌شناسی',
  'فلسفه و منطق',
  'روان‌شناسی',
  'کامپیوتر و برنامه‌نویسی',
  'هنر و گرافیک',
  'تربیت بدنی و ورزش',
  'کار و فناوری',
];

const DEFAULT_LOGIN_SCHOOLS = [
  { id: 'sch-1', name: 'دبیرستان استعدادهای درخشان علامه حلی ۱ (تهران)', code: 'SCH-1001', city: 'تهران', level: 'متوسطه دوم (دبیرستان)', is_registered: true },
  { id: 'sch-2', name: 'دبیرستان فرزانگان ۱ (تهران)', code: 'SCH-1002', city: 'تهران', level: 'متوسطه دوم (دبیرستان)', is_registered: true },
  { id: 'sch-3', name: 'دبیرستان ماندگار البرز', code: 'SCH-1005', city: 'تهران', level: 'متوسطه دوم (دبیرستان)' },
  { id: 'sch-4', name: 'دبیرستان استعدادهای درخشان شهید بهشتی', code: 'SCH-1004', city: 'تهران', level: 'متوسطه دوم (دبیرستان)' },
  { id: 'sch-5', name: 'دبیرستان نمونه دولتی رشد', code: 'SCH-1008', city: 'تهران', level: 'متوسطه دوم (دبیرستان)' },
  { id: 'sch-6', name: 'مجتمع آموزشی هوشمند ادیبان', code: 'SCH-1003', city: 'تهران', level: 'مجتمع آموزشی کامل' },
  { id: 'sch-7', name: 'هنرستان فنی نمونه شهید بهشتی', code: 'SCH-1007', city: 'تهران', level: 'هنرستان فنی و حرفه‌ای' },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, quickEntry, parentLogin, registerSchool, demoLogin, fetchSchools } = useAuthStore();

  // Demo Selection Modal State
  const [showDemoModal, setShowDemoModal] = useState(false);

  // Tabs: 'smart' (نام و تلفن با تولید آیدی) | 'login' (ورود با آیدی یا شماره) | 'parent' (ورود اولیا با کد) | 'school' (ثبت‌نام مدرسه جدید)
  const [activeTab, setActiveTab] = useState('smart');
  const [isLoading, setIsLoading] = useState(false);

  // Available Schools List for Login Selection
  const [availableSchools, setAvailableSchools] = useState(DEFAULT_LOGIN_SCHOOLS);
  const [customSchoolName, setCustomSchoolName] = useState('');
  const [isCustomSchoolSelected, setIsCustomSchoolSelected] = useState(false);

  // Load and merge schools
  const loadSchools = async () => {
    try {
      if (fetchSchools) {
        const list = await fetchSchools();
        if (Array.isArray(list) && list.length > 0) {
          const nameSet = new Set(list.map((s) => (s.name || '').trim()));
          const combined = [...list];
          DEFAULT_LOGIN_SCHOOLS.forEach((ds) => {
            if (!nameSet.has(ds.name.trim())) {
              combined.push(ds);
              nameSet.add(ds.name.trim());
            }
          });
          setAvailableSchools(combined);
          setSmartForm((prev) => {
            if (!prev.school_name && combined[0]?.name) {
              return { ...prev, school_name: combined[0].name, school_code: combined[0].code || '' };
            }
            return prev;
          });
        }
      }
    } catch (e) {
      console.warn('Could not load schools:', e);
    }
  };

  useEffect(() => {
    loadSchools();
  }, []);

  // School Registration State
  const [schoolForm, setSchoolForm] = useState({
    school_name: '',
    school_level: 'متوسطه دوم (دبیرستان)',
    city: 'تهران',
    admin_name: '',
    admin_phone: '',
    admin_password: '',
  });
  const [registeredSchoolResult, setRegisteredSchoolResult] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Smart Form State
  const [smartForm, setSmartForm] = useState({
    display_name: '',
    phone: '',
    role: 'student',
    password: '',
    school_name: DEFAULT_LOGIN_SCHOOLS[0].name,
    school_code: DEFAULT_LOGIN_SCHOOLS[0].code,
  });
  const [showSmartPassword, setShowSmartPassword] = useState(false);
  const [smartTeacherGrades, setSmartTeacherGrades] = useState(['پایه دهم ریاضی', 'پایه دهم تجربی']);
  const [smartCustomGrade, setSmartCustomGrade] = useState('');
  const [smartTeacherSubject, setSmartTeacherSubject] = useState('ریاضیات و حسابان');
  const [selectedTeacherStage, setSelectedTeacherStage] = useState('high_school');
  const [selectedTeacherBranch, setSelectedTeacherBranch] = useState('تجربی');

  const currentAvailableTeacherGrades = useMemo(() => {
    if (selectedTeacherStage === 'high_school') {
      return (
        TEACHER_STAGES_MAP.high_school.branches[selectedTeacherBranch] ||
        TEACHER_STAGES_MAP.high_school.branches['تجربی']
      );
    }
    return TEACHER_STAGES_MAP[selectedTeacherStage]?.grades || [];
  }, [selectedTeacherStage, selectedTeacherBranch]);

  const toggleSmartTeacherGrade = (grade) => {
    setSmartTeacherGrades((prev) => {
      if (prev.includes(grade)) {
        return prev.filter((g) => g !== grade);
      } else {
        return [...prev, grade];
      }
    });
  };

  // Account Login State
  const [accountForm, setAccountForm] = useState({
    identifier: '',
    password: '',
  });
  const [showAccountPassword, setShowAccountPassword] = useState(false);

  // Parent Code State
  const [parentStudentCode, setParentStudentCode] = useState('');
  const [parentGuardianName, setParentGuardianName] = useState('');

  const demoStudents = [
    { code: 'STD-40301', name: 'امیرحسین حسینی', class: 'دهم ریاضی' },
    { code: 'STD-40302', name: 'پارسا احمدی', class: 'دهم ریاضی' },
    { code: 'STD-40303', name: 'علی کیانی', class: 'دهم تجربی' },
    { code: 'STD-40304', name: 'محمدرضا سعیدی', class: 'دهم تجربی' },
  ];

  // Real-time generated handle preview
  const handlePreview = useMemo(() => {
    return previewUsername(smartForm.display_name);
  }, [smartForm.display_name]);

  const getPostLoginRedirect = (user) => {
    if (!user) return '/dashboard/';
    if (user.role === 'admin') return '/dashboard/management/';
    if (user.role === 'parent') return '/dashboard/';

    let settings = {};
    if (user.settings) {
      try {
        settings = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
      } catch (e) {
        settings = {};
      }
    }

    if (user.role === 'teacher' && !settings.is_teacher_onboarded) {
      return '/dashboard/teacher-setup/';
    }

    return '/dashboard/';
  };

  // Submit Smart Entry (Full Name + Phone -> Auto ID)
  const handleSmartSubmit = async (e) => {
    e.preventDefault();
    if (!smartForm.display_name.trim()) {
      toast.error('لطفاً نام و نام‌خانوادگی خود را وارد نمایید');
      return;
    }
    if (!smartForm.phone.trim()) {
      toast.error('لطفاً شماره تلفن همراه خود را وارد نمایید');
      return;
    }

    setIsLoading(true);
    try {
      const finalSchoolName = (smartForm.school_name || customSchoolName || '').trim();
      const res = await quickEntry({
        display_name: smartForm.display_name.trim(),
        phone: smartForm.phone.trim(),
        role: smartForm.role,
        password: smartForm.password.trim() || undefined,
        school_name: finalSchoolName || undefined,
        school_code: smartForm.school_code || undefined,
        grades: smartForm.role === 'teacher' ? smartTeacherGrades : undefined,
        subject: smartForm.role === 'teacher' ? (smartTeacherSubject || '').trim() || undefined : undefined,
      });

      const user = res?.data?.user || res?.user || res;
      const isNew = res?.data?.isNew ?? res?.isNew ?? false;
      toast.success(
        isNew
          ? `🎉 آیدی اختصاصی شما صادر شد: @${user.username} (مدرسه: ${user.school_name || finalSchoolName || 'ثبت شد'})`
          : `خوش آمدید! ورود با آیدی @${user.username} انجام شد 👋`,
        { duration: 5000 }
      );

      router.push(getPostLoginRedirect(user));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'خطا در ثبت‌نام یا ورود به سامانه');
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Standard Account Login
  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    if (!accountForm.identifier.trim()) {
      toast.error('لطفاً آیدی اختصاصی، شماره تلفن یا ایمیل خود را وارد نمایید');
      return;
    }

    setIsLoading(true);
    try {
      const res = await login(accountForm.identifier.trim(), accountForm.password);
      const user = res?.data?.user || res?.user || res;
      toast.success(`خوش آمدید ${user.display_name}! 👋`);
      router.push(getPostLoginRedirect(user));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'آیدی یا رمز عبور اشتباه است');
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Parent Code Login
  const handleParentCodeLogin = async (e, codeOverride, nameOverride) => {
    if (e) e.preventDefault();
    const code = codeOverride || parentStudentCode;
    const name = nameOverride || parentGuardianName;

    if (!code || !code.trim()) {
      toast.error('لطفاً کد اختصاصی دانش‌آموز (فرزند خود) را وارد فرمایید');
      return;
    }

    setIsLoading(true);
    try {
      const res = await parentLogin(code.trim(), name ? name.trim() : '');
      toast.success(res?.message || 'ورود موفقیت‌آمیز اولیا انجام شد! 👋');
      router.push('/dashboard/');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'کد دانش‌آموزی در سامانه مدرسه یافت نشد');
    } finally {
      setIsLoading(false);
    }
  };

  // Submit School Registration
  const handleSchoolRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!schoolForm.school_name.trim()) {
      toast.error('لطفاً نام مدرسه را وارد فرمایید');
      return;
    }
    if (!schoolForm.admin_name.trim()) {
      toast.error('لطفاً نام مدیر یا مسئول مدرسه را وارد فرمایید');
      return;
    }
    if (!schoolForm.admin_phone.trim()) {
      toast.error('لطفاً شماره تلفن همراه مدیر را وارد فرمایید');
      return;
    }

    setIsLoading(true);
    try {
      const res = await registerSchool({
        school_name: schoolForm.school_name.trim(),
        school_level: schoolForm.school_level,
        city: schoolForm.city.trim(),
        admin_name: schoolForm.admin_name.trim(),
        admin_phone: schoolForm.admin_phone.trim(),
        admin_password: schoolForm.admin_password.trim() || '123456',
      });

      const schoolObj = res?.school || res?.data?.school;
      setRegisteredSchoolResult(schoolObj);
      await loadSchools();
      if (schoolObj) {
        setSmartForm((prev) => ({
          ...prev,
          school_name: schoolObj.name,
          school_code: schoolObj.school_code,
        }));
      }
      setIsCustomSchoolSelected(false);
      toast.success(`مدرسه «${schoolObj?.name || schoolForm.school_name}» با موفقیت ثبت شد! کد اختصاصی: ${schoolObj?.school_code || ''} 🎉`, { duration: 6000 });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'خطا در ثبت‌نام مدرسه');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySchoolCode = (code) => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopiedCode(true);
      toast.success(`کد اختصاصی مدرسه (${code}) کپی شد 📋`);
      setTimeout(() => setCopiedCode(false), 3000);
    }
  };

  // Quick Demo Accounts List & Instant Login Handler
  const demoRoles = [
    {
      role: 'admin',
      icon: '👔',
      title: 'مدیر کل مدرسه',
      personName: 'دکتر علیرضا تقوی (@alireza_taghavi)',
      badge: 'مدیریت و ستاد',
      avatarBg: 'rgba(239, 68, 68, 0.12)',
      badgeColor: '#ef4444',
      badgeBorder: 'rgba(239, 68, 68, 0.3)',
      badgeBg: 'rgba(239, 68, 68, 0.08)',
      desc: 'دسترسی کامل به ستاد مدیریت، کنترل دبیران، آمار کل آموزشگاه و تنظیمات',
    },
    {
      role: 'teacher',
      icon: '👨‍🏫',
      title: 'معاون و دبیر دبیرستان',
      personName: 'مهندس حسین میرزایی (@hossein_mirzaei)',
      badge: 'کادر آموزشی',
      avatarBg: 'rgba(16, 185, 129, 0.12)',
      badgeColor: '#10b981',
      badgeBorder: 'rgba(16, 185, 129, 0.3)',
      badgeBg: 'rgba(16, 185, 129, 0.08)',
      desc: 'تدریس حسابان، ثبت حضور و غیاب، طراحی تکالیف، آزمون‌ها و ثبت کارنامه',
    },
    {
      role: 'counselor',
      icon: '🧠',
      title: 'مشاور ارشد تحصیلی و کنکور',
      personName: 'دکتر فاطمه صادقی (@sadeghi_counselor)',
      badge: 'مرکز مشاوره و هدایت تحصیلی',
      avatarBg: 'rgba(139, 92, 246, 0.12)',
      badgeColor: '#8b5cf6',
      badgeBorder: 'rgba(139, 92, 246, 0.3)',
      badgeBg: 'rgba(139, 92, 246, 0.08)',
      desc: 'پرونده مشاوره‌ای، دفتر برنامه‌ریزی تحصیلی، پایش سلامت روان و انضباطی',
    },
    {
      role: 'financial_officer',
      icon: '💳',
      title: 'مسئول امور مالی و شهریه',
      personName: 'مهندس سعید رضایی (@rezaei_finance)',
      badge: 'حسابداری و شاپرک',
      avatarBg: 'rgba(14, 165, 233, 0.12)',
      badgeColor: '#0ea5e9',
      badgeBorder: 'rgba(14, 165, 233, 0.3)',
      badgeBg: 'rgba(14, 165, 233, 0.08)',
      desc: 'مدیریت شهریه، اقساط، درگاه شاپرک، تایید فیش‌های بانکی و اعتبارسنجی شبا',
    },
    {
      role: 'student',
      icon: '👨‍🎓',
      title: 'دانش‌آموز دبیرستان',
      personName: 'امیرحسین حسینی (@hosseini_std)',
      badge: 'دهم ریاضی - کلاس ۱۰۱',
      avatarBg: 'rgba(59, 130, 246, 0.12)',
      badgeColor: '#3b82f6',
      badgeBorder: 'rgba(59, 130, 246, 0.3)',
      badgeBg: 'rgba(59, 130, 246, 0.08)',
      desc: 'مشاهده برنامه درسی، تکالیف، کارنامه نمرات، آزمون‌های فعال و چت کلاسی',
    },
    {
      role: 'parent',
      icon: '👪',
      title: 'اولیای دانش‌آموز',
      personName: 'حاج‌محمد حسینی (پدر امیرحسین)',
      badge: 'انجمن اولیا و مربیان',
      avatarBg: 'rgba(245, 158, 11, 0.12)',
      badgeColor: '#f59e0b',
      badgeBorder: 'rgba(245, 158, 11, 0.3)',
      badgeBg: 'rgba(245, 158, 11, 0.08)',
      desc: 'پیگیری وضعیت تحصیلی و انضباطی فرزند، کارنامه، پرداخت شهریه و ارتباط با مدرسه',
    },
  ];

  const handleSelectDemoRole = async (role, title) => {
    try {
      setIsLoading(true);
      const res = await demoLogin(role);
      toast.success(`خوش آمدید! ورود به عنوان «${title}» انجام شد 🚀`);
      setShowDemoModal(false);
      const dest = res?.redirect || (role === 'admin' ? '/dashboard/management/' : '/dashboard/');
      router.push(dest);
    } catch (err) {
      console.error('Demo login error:', err);
      toast.error(err?.response?.data?.message || 'خطا در ورود به حساب آزمایشی');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3500,
          error: { duration: 3500 },
          success: { duration: 2500 },
          style: {
            background: 'var(--bg-card, #1e293b)',
            color: 'var(--text-primary, #f8fafc)',
            border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
            borderRadius: '12px',
            fontFamily: 'var(--font-fa, inherit)',
            cursor: 'pointer',
          },
        }}
      >
        {(t) => (
          <ToastBar toast={t} style={{ ...t.style, cursor: 'pointer' }}>
            {({ icon, message }) => (
              <div
                onClick={() => toast.dismiss(t.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', cursor: 'pointer' }}
                title="برای بستن کلیک کنید"
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
                      width: '20px',
                      height: '20px',
                      color: 'inherit',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      opacity: 0.8,
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

      {/* Background Decorative Ambient Glow Orbs */}
      <div className={styles.ambientOrb1} aria-hidden="true" />
      <div className={styles.ambientOrb2} aria-hidden="true" />
      <div className={styles.ambientOrb3} aria-hidden="true" />

      {/* Left Side — Hero */}
      <div className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroPillBadge}>
            <span className={styles.heroPillPulse}></span>
            <span>نسل نوین آموزش هوشمند و سامانه ابری مدارس</span>
          </div>

          <div className={styles.heroHeaderWrap}>
            <div className={styles.heroEmoji}>🎓</div>
            <h1 className={styles.heroTitle}>EduConnect</h1>
          </div>

          <p className={styles.heroSubtitle}>
            سامانه یکپارچه مدیریت هوشمند مدارس، برگزاری کلاس‌های زنده تعاملی و شبکه پیام‌رسانی امن سازمانی
          </p>

          <div className={styles.heroFeatures}>
            <div className={styles.heroFeature}>
              <div className={`${styles.featureIconBox} ${styles.featureIconBlue}`}>✨</div>
              <div className={styles.featureTextBox}>
                <span className={styles.featureTitle}>تولید خودکار آیدی اختصاصی ورودی</span>
                <span className={styles.featureDesc}>ایجاد هوشمند نام کاربری بر اساس نام و نام خانوادگی جهت ورود سریع</span>
              </div>
            </div>

            <div className={styles.heroFeature}>
              <div className={`${styles.featureIconBox} ${styles.featureIconTeal}`}>💬</div>
              <div className={styles.featureTextBox}>
                <span className={styles.featureTitle}>پیام‌رسانی و تعامل مستقیم</span>
                <span className={styles.featureDesc}>یافتن معلمان، دانش‌آموزان و کادر مدرسه فقط با جستجوی آیدی</span>
              </div>
            </div>

            <div className={styles.heroFeature}>
              <div className={`${styles.featureIconBox} ${styles.featureIconPurple}`}>📊</div>
              <div className={styles.featureTextBox}>
                <span className={styles.featureTitle}>کارنامه، آزمون و کلاس آنلاین</span>
                <span className={styles.featureDesc}>دفتر نمرات الکترونیکی، تخته هوشمند تعاملی و کلاس‌های صوتی-تصویری</span>
              </div>
            </div>

            <div className={styles.heroFeature}>
              <div className={`${styles.featureIconBox} ${styles.featureIconAmber}`}>🔒</div>
              <div className={styles.featureTextBox}>
                <span className={styles.featureTitle}>۱۰۰٪ امن، بدون قطعی و پایدار</span>
                <span className={styles.featureDesc}>سازگار با شبکه ملی اطلاعات، امنیت داده و ارتباطات رمزنگاری‌شده</span>
              </div>
            </div>
          </div>

          {/* Quick Stats / Highlights Bar */}
          <div className={styles.heroStatsRow}>
            <div className={styles.heroStatItem}>
              <span className={styles.heroStatValue}>۱۰۰٪</span>
              <span className={styles.heroStatLabel}>ابری و بلادرنگ</span>
            </div>
            <div className={styles.heroStatDivider}></div>
            <div className={styles.heroStatItem}>
              <span className={styles.heroStatValue}>WebRTC</span>
              <span className={styles.heroStatLabel}>کلاس زنده و آنلاین</span>
            </div>
            <div className={styles.heroStatDivider}></div>
            <div className={styles.heroStatItem}>
              <span className={styles.heroStatValue}>AES-256</span>
              <span className={styles.heroStatLabel}>امنیت داده و پیام‌ها</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side — Form Panel */}
      <div className={styles.formSide}>
        <div className={styles.formWrapper}>
          {/* Server Connection Status & Quick Switcher */}
          <ServerConnectionBar />
          <AutoUpdateChecker />

          {/* Header */}
          <div className={styles.formHeader}>
            <div className={styles.formHeaderBadge}>
              <HiOutlineSparkles style={{ fontSize: '1rem' }} />
              <span>پرتال جامع کاربران، اولیا و کادر آموزشی</span>
            </div>
            <h2>ورود به سامانه مدرسه</h2>
            <p>مشخصات خود را وارد کنید تا آیدی اختصاصی شما صادر گردد</p>
          </div>

          {/* Navigation Tabs */}
          <div className={styles.entryTabs}>
            <button
              type="button"
              className={`${styles.entryTabBtn} ${styles.tabBtnSmart} ${activeTab === 'smart' ? styles.entryTabBtnActive : ''}`}
              onClick={() => setActiveTab('smart')}
            >
              <HiOutlineSparkles style={{ fontSize: '1.2rem' }} />
              <span>ثبت‌نام و صدور آیدی</span>
            </button>
            <button
              type="button"
              className={`${styles.entryTabBtn} ${styles.tabBtnLogin} ${activeTab === 'login' ? styles.entryTabBtnActive : ''}`}
              onClick={() => setActiveTab('login')}
            >
              <HiOutlineIdentification style={{ fontSize: '1.2rem' }} />
              <span>ورود با آیدی / شماره</span>
            </button>
            <button
              type="button"
              className={`${styles.entryTabBtn} ${styles.tabBtnParent} ${activeTab === 'parent' ? styles.entryTabBtnActive : ''}`}
              onClick={() => setActiveTab('parent')}
            >
              <HiOutlineUserGroup style={{ fontSize: '1.2rem' }} />
              <span>ورود اولیا</span>
            </button>
            <button
              type="button"
              className={`${styles.entryTabBtn} ${styles.tabBtnSchool} ${activeTab === 'school' ? styles.entryTabBtnActive : ''}`}
              onClick={() => setActiveTab('school')}
            >
              <HiOutlineBuildingOffice2 style={{ fontSize: '1.2rem' }} />
              <span>ثبت مدرسه جدید</span>
            </button>
          </div>

          {/* ── TAB 1: Smart Entry with Name & Phone (Auto Generated Handle) ── */}
          {activeTab === 'smart' && (
            <form onSubmit={handleSmartSubmit} className={styles.form}>
              {/* Full Name */}
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel} htmlFor="display_name">
                  نام و نام خانوادگی کامل *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="display_name"
                    className="input"
                    type="text"
                    placeholder="مثلاً: علیرضا محمدی یا سارا کریمی"
                    value={smartForm.display_name}
                    onChange={(e) => setSmartForm({ ...smartForm, display_name: e.target.value })}
                    required
                    autoFocus
                  />
                </div>

                {/* Live Generated ID Preview */}
                {handlePreview && (
                  <div className={styles.handlePreviewBox}>
                    <div className={styles.handlePreviewHeader}>
                      <span className={styles.handlePreviewLabel}>
                        <HiOutlineCheckCircle style={{ color: '#0284c7', fontSize: '1rem' }} />
                        آیدی اختصاصی ورودی شما:
                      </span>
                      <span className={styles.handleBadge}>@{handlePreview}</span>
                    </div>
                    <span className={styles.handlePreviewHint}>
                      💡 از این شناسه (@{handlePreview}) برای ورود سریع و یافتن شما در قسمت پیام‌ها استفاده می‌شود.
                    </span>
                  </div>
                )}
              </div>

              {/* Phone Number */}
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel} htmlFor="phone">
                  شماره تلفن همراه *
                </label>
                <input
                  id="phone"
                  className="input"
                  type="tel"
                  placeholder="09123456789"
                  value={smartForm.phone}
                  onChange={(e) => setSmartForm({ ...smartForm, phone: e.target.value })}
                  required
                  dir="ltr"
                />
              </div>

              {/* Role Selector Chips */}
              <div className={styles.roleChipsContainer}>
                <label className={styles.roleChipsLabel}>نقش کاربری در سامانه:</label>
                <div className={styles.roleChipsGrid}>
                  <button
                    type="button"
                    className={`${styles.roleChip} ${styles.roleChipTeacher} ${smartForm.role === 'teacher' ? styles.roleChipActive : ''}`}
                    onClick={() => setSmartForm({ ...smartForm, role: 'teacher' })}
                  >
                    <span className={styles.roleChipEmoji}>👨‍🏫</span>
                    <span>معلم / دبیر</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.roleChip} ${styles.roleChipStudent} ${smartForm.role === 'student' ? styles.roleChipActive : ''}`}
                    onClick={() => setSmartForm({ ...smartForm, role: 'student' })}
                  >
                    <span className={styles.roleChipEmoji}>👨‍🎓</span>
                    <span>دانش‌آموز</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.roleChip} ${styles.roleChipParent} ${smartForm.role === 'parent' ? styles.roleChipActive : ''}`}
                    onClick={() => setSmartForm({ ...smartForm, role: 'parent' })}
                  >
                    <span className={styles.roleChipEmoji}>👪</span>
                    <span>اولیا</span>
                  </button>
                </div>
              </div>

              {/* ── School Selection for Student & Teacher ── */}
              <div className={styles.inputGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className={styles.inputLabel} htmlFor="smart_school_input">
                    🏛️ نام مدرسه {smartForm.role === 'teacher' ? 'اصلی محل تدریس دبیر' : 'تحصیلی شما'} (هم قابل تایپ، هم انتخاب از لیست): *
                  </label>
                  {smartForm.school_name && (
                    <span style={{ fontSize: '0.74rem', color: '#10b981', fontWeight: 700 }}>
                      مدرسه: {smartForm.school_name}
                    </span>
                  )}
                </div>

                {/* Direct Text Input with Datalist Autocomplete */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    id="smart_school_input"
                    type="text"
                    list="available-schools-datalist"
                    className="input"
                    placeholder="نام کامل مدرسه خود را تایپ فرمایید یا از گزینه‌های زیر انتخاب نمایید..."
                    value={smartForm.school_name}
                    onChange={(e) => {
                      const val = e.target.value;
                      const cleanVal = val.trim();
                      const found = availableSchools.find((s) => 
                        s.name.toLowerCase() === cleanVal.toLowerCase() ||
                        (s.code && s.code.toLowerCase() === cleanVal.toLowerCase()) ||
                        (s.id && s.id.toLowerCase() === cleanVal.toLowerCase())
                      );
                      setSmartForm({
                        ...smartForm,
                        school_name: found ? found.name : val,
                        school_code: found ? (found.code || '') : (cleanVal.toUpperCase().startsWith('SCH-') ? cleanVal.toUpperCase() : smartForm.school_code),
                      });
                      setCustomSchoolName(val);
                    }}
                    style={{ flex: 1, fontWeight: 750 }}
                    required
                  />
                  {smartForm.school_name && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setSmartForm({ ...smartForm, school_name: '', school_code: '' });
                        setCustomSchoolName('');
                      }}
                      style={{ fontSize: '0.75rem', padding: '8px 10px', whiteSpace: 'nowrap' }}
                      title="پاک کردن متن"
                    >
                      ✕ پاک کردن
                    </button>
                  )}
                </div>

                {/* Datalist for autocomplete */}
                <datalist id="available-schools-datalist">
                  {availableSchools.map((sch) => (
                    <option key={sch.id || sch.name} value={sch.name}>
                      {sch.name} {sch.code ? `[کد: ${sch.code}]` : ''} {sch.city ? `(${sch.city})` : ''}
                    </option>
                  ))}
                </datalist>

                {/* Dropdown list for instant selection */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    📋 یا انتخاب از لیست:
                  </span>
                  <select
                    className="input"
                    value={availableSchools.some((s) => s.name === smartForm.school_name) ? smartForm.school_name : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        const found = availableSchools.find((s) => s.name === e.target.value);
                        setSmartForm({
                          ...smartForm,
                          school_name: e.target.value,
                          school_code: found?.code || '',
                        });
                        setCustomSchoolName(e.target.value);
                      }
                    }}
                    style={{ flex: 1, fontSize: '0.8rem', padding: '6px 10px', cursor: 'pointer' }}
                  >
                    <option value="">-- برای انتخاب از مدارس ثبت‌شده و نمونه کلیک کنید --</option>
                    {availableSchools.map((sch) => (
                      <option key={sch.id || sch.name} value={sch.name}>
                        🏛️ {sch.name} {sch.code ? `[کد: ${sch.code}]` : ''} {sch.is_registered ? '✨ (مدرسه ثبت‌شده)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

              </div>

              {/* ── Teacher Subject Selection & Typing (درس و تخصص آموزشی دبیر) ── */}
              {smartForm.role === 'teacher' && (
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1.5px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  marginTop: '4px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📖</span>
                      <span>درس و تخصص تدریسی شما (هم قابل تایپ، هم انتخاب از لیست): *</span>
                    </label>
                    {smartTeacherSubject && (
                      <span style={{ fontSize: '0.74rem', color: '#10b981', fontWeight: 700 }}>
                        درس: {smartTeacherSubject}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                    عنوان درسی که تدریس می‌فرمایید را تایپ نمایید یا از گزینه‌های لیست انتخاب فرمایید:
                  </p>

                  {/* Direct Text Input with Datalist Autocomplete */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      list="login-teacher-subjects-datalist"
                      className="input"
                      placeholder="نام درس را بنویسید (مثلاً: ریاضیات، شیمی، فیزیک، زیست المپیاد، حسابان)..."
                      value={smartTeacherSubject}
                      onChange={(e) => setSmartTeacherSubject(e.target.value)}
                      style={{ flex: 1, fontWeight: 750, fontSize: '0.88rem' }}
                    />
                    {smartTeacherSubject && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setSmartTeacherSubject('')}
                        style={{ fontSize: '0.78rem', padding: '8px 12px', whiteSpace: 'nowrap' }}
                        title="پاک کردن متن برای تایپ عنوان جدید"
                      >
                        ✕ پاک کردن
                      </button>
                    )}
                  </div>

                  {/* Native Datalist */}
                  <datalist id="login-teacher-subjects-datalist">
                    {DEFAULT_TEACHER_SUBJECTS.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </datalist>

                  {/* Dropdown Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      📋 یا انتخاب از لیست دروس:
                    </span>
                    <select
                      className="input"
                      value={DEFAULT_TEACHER_SUBJECTS.includes(smartTeacherSubject) ? smartTeacherSubject : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          setSmartTeacherSubject(e.target.value);
                          toast.success(`درس «${e.target.value}» انتخاب شد 👍`);
                        }
                      }}
                      style={{ flex: 1, fontSize: '0.82rem', padding: '6px 10px', cursor: 'pointer' }}
                    >
                      <option value="">-- کلیک کنید تا از میان دروس استاندارد انتخاب فرمایید --</option>
                      {DEFAULT_TEACHER_SUBJECTS.map((sub) => (
                        <option key={sub} value={sub}>
                          📚 {sub}
                        </option>
                      ))}
                    </select>
                  </div>

                </div>
              )}

              {/* ── Teacher Grades Selection (پایه‌هایی که با آن‌ها کلاس دارید) ── */}
              {smartForm.role === 'teacher' && (
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1.5px solid rgba(79, 70, 229, 0.3)',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  marginTop: '4px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📚</span>
                      <span>پایه‌هایی که با آن‌ها کلاس دارید: *</span>
                    </label>
                    <span style={{ fontSize: '0.74rem', color: '#10b981', fontWeight: 700 }}>
                      {smartTeacherGrades.length} پایه انتخاب شده
                    </span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                    ابتدا مقطع تدریس را انتخاب کنید و سپس پایه‌های مورد نظر خود را علامت بزنید:
                  </p>

                  {/* Stage & Branch Selection (مقطع و شاخه تحصیلی) */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: selectedTeacherStage === 'high_school' ? 'repeat(auto-fit, minmax(180px, 1fr))' : '1fr',
                    gap: '10px',
                    background: 'rgba(99, 102, 241, 0.05)',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: '1px solid rgba(99, 102, 241, 0.15)',
                  }}>
                    {/* Stage Selector */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '0.76rem', fontWeight: 750, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span>🏫</span>
                        <span>مقطع تدریس:</span>
                      </label>
                      <select
                        className="input"
                        value={selectedTeacherStage}
                        onChange={(e) => setSelectedTeacherStage(e.target.value)}
                        style={{ fontSize: '0.82rem', padding: '7px 10px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        <option value="pre_school">🧸 پیش‌دبستانی (پیش ۱ و پیش ۲)</option>
                        <option value="elementary">🎒 دبستان (کلاس اول تا ششم)</option>
                        <option value="middle_school">📗 متوسطه اول (پایه هفتم تا نهم)</option>
                        <option value="high_school">🎓 متوسطه دوم (پایه دهم تا دوازدهم)</option>
                      </select>
                    </div>

                    {/* Branch Selector for High School (اگر متوسطه دوم بود) */}
                    {selectedTeacherStage === 'high_school' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '0.76rem', fontWeight: 750, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span>🎯</span>
                          <span>رشته تحصیلی / شاخه:</span>
                        </label>
                        <select
                          className="input"
                          value={selectedTeacherBranch}
                          onChange={(e) => setSelectedTeacherBranch(e.target.value)}
                          style={{ fontSize: '0.82rem', padding: '7px 10px', cursor: 'pointer', fontWeight: 700 }}
                        >
                          <option value="تجربی">🧬 علوم تجربی</option>
                          <option value="ریاضی">📐 ریاضی و فیزیک</option>
                          <option value="انسانی">📚 ادبیات و علوم انسانی</option>
                          <option value="هنرستان">⚙️ هنرستان (فنی و حرفه‌ای)</option>
                          <option value="کاردانش">🛠️ کاردانش</option>
                          <option value="عمومی">🌐 دروس عمومی / مشترک</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Available Grades Checkboxes */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      علامت زدن پایه‌های این دوره:
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
                      {currentAvailableTeacherGrades.map((grade) => {
                        const isChecked = smartTeacherGrades.includes(grade);
                        return (
                          <label
                            key={grade}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 10px',
                              borderRadius: '10px',
                              border: isChecked ? '1.5px solid #10b981' : '1px solid var(--border-color)',
                              background: isChecked ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-surface)',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                              fontWeight: isChecked ? 750 : 600,
                              color: isChecked ? '#10b981' : 'var(--text-primary)',
                              transition: 'all 0.15s ease-in-out',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSmartTeacherGrade(grade)}
                              style={{
                                width: '16px',
                                height: '16px',
                                accentColor: '#10b981',
                                cursor: 'pointer',
                              }}
                            />
                            <span>{grade}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Summary of all selected grades */}
                  {smartTeacherGrades.length > 0 && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px',
                      background: 'rgba(16, 185, 129, 0.05)',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid rgba(16, 185, 129, 0.2)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.73rem', color: '#10b981', fontWeight: 750 }}>
                          ✓ پایه‌های انتخاب‌شده نهایی شما ({smartTeacherGrades.length}):
                        </span>
                        <button
                          type="button"
                          onClick={() => setSmartTeacherGrades([])}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#ef4444',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          پاک کردن همه
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {smartTeacherGrades.map((grade) => (
                          <span
                            key={grade}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '3px 8px',
                              borderRadius: '8px',
                              background: 'rgba(16, 185, 129, 0.15)',
                              border: '1px solid rgba(16, 185, 129, 0.35)',
                              color: '#10b981',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                            }}
                          >
                            <span>{grade}</span>
                            <button
                              type="button"
                              onClick={() => toggleSmartTeacherGrade(grade)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                padding: '0 2px',
                                lineHeight: 1,
                              }}
                              title="حذف این پایه"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add custom grade for teacher */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="پایه یا کلاس دیگر (مثلاً: دهم تجربی ۲)..."
                      value={smartCustomGrade}
                      onChange={(e) => setSmartCustomGrade(e.target.value)}
                      style={{ flex: 1, fontSize: '0.78rem', padding: '6px 10px' }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!smartCustomGrade.trim()) return;
                        const clean = smartCustomGrade.trim();
                        if (!smartTeacherGrades.includes(clean)) {
                          setSmartTeacherGrades([...smartTeacherGrades, clean]);
                        }
                        setSmartCustomGrade('');
                        toast.success(`پایه «${clean}» اضافه و تیک زده شد 👍`);
                      }}
                      style={{
                        fontSize: '0.75rem',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #10b981',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#10b981',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      + افزودن و تیک زدن
                    </button>
                  </div>
                </div>
              )}

              {/* Password with Visibility Toggle */}
              <div className={styles.inputGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className={styles.inputLabel} htmlFor="password">
                    کلمه عبور (برای حساب کاربری موجود الزامی)
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    برای ثبت‌نام جدید می‌توانید خالی بگذارید
                  </span>
                </div>
                <div className={styles.passwordWrapper}>
                  <input
                    id="password"
                    className={`input ${styles.passwordInput}`}
                    type={showSmartPassword ? 'text' : 'password'}
                    placeholder="رمز عبور خود را وارد کنید"
                    value={smartForm.password}
                    onChange={(e) => setSmartForm({ ...smartForm, password: e.target.value })}
                    dir="ltr"
                  />
                  <button
                    type="button"
                    className={styles.passwordToggleBtn}
                    onClick={() => setShowSmartPassword(!showSmartPassword)}
                    title={showSmartPassword ? 'مخفی‌سازی رمز عبور' : 'مشاهده رمز عبور'}
                    aria-label={showSmartPassword ? 'مخفی‌سازی رمز عبور' : 'مشاهده رمز عبور'}
                  >
                    {showSmartPassword ? <HiOutlineEyeSlash /> : <HiOutlineEye />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className={`btn btn-primary ${styles.submitBtn}`}
                disabled={isLoading}
                style={{
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  fontWeight: 800,
                  fontSize: '1rem',
                  padding: '14px',
                }}
              >
                {isLoading ? 'در حال صدور آیدی و ورود...' : 'ثبت نام و ایجاد آیدی اختصاصی 🚀'}
              </button>
            </form>
          )}

          {/* ── TAB 2: Standard Login with Existing ID or Phone ── */}
          {activeTab === 'login' && (
            <form onSubmit={handleAccountSubmit} className={styles.form}>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel} htmlFor="account_identifier">
                  آیدی اختصاصی یا شماره تلفن همراه *
                </label>
                <input
                  id="account_identifier"
                  className="input"
                  type="text"
                  placeholder="مثلاً: @ali_kiani یا 09121110001 یا ایمیل"
                  value={accountForm.identifier}
                  onChange={(e) => setAccountForm({ ...accountForm, identifier: e.target.value })}
                  required
                  dir="ltr"
                />
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.inputLabel} htmlFor="account_password">
                  کلمه عبور *
                </label>
                <div className={styles.passwordWrapper}>
                  <input
                    id="account_password"
                    className={`input ${styles.passwordInput}`}
                    type={showAccountPassword ? 'text' : 'password'}
                    placeholder="رمز عبور خود را وارد کنید"
                    value={accountForm.password}
                    onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                    required
                    dir="ltr"
                  />
                  <button
                    type="button"
                    className={styles.passwordToggleBtn}
                    onClick={() => setShowAccountPassword(!showAccountPassword)}
                    title={showAccountPassword ? 'مخفی‌سازی رمز عبور' : 'مشاهده رمز عبور'}
                    aria-label={showAccountPassword ? 'مخفی‌سازی رمز عبور' : 'مشاهده رمز عبور'}
                  >
                    {showAccountPassword ? <HiOutlineEyeSlash /> : <HiOutlineEye />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className={`btn btn-primary ${styles.submitBtn}`}
                disabled={isLoading}
                style={{
                  background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
                  fontWeight: 800,
                  fontSize: '1rem',
                  padding: '14px',
                }}
              >
                {isLoading ? 'در حال بررسی اطلاعات...' : 'ورود به حساب کاربری 🔑'}
              </button>
            </form>
          )}

          {/* ── TAB 3: Parent Fast Code Entry ── */}
          {activeTab === 'parent' && (
            <form onSubmit={(e) => handleParentCodeLogin(e)} className={styles.form}>
              <div className={styles.parentNotice}>
                <span>💡</span>
                <span>
                  اولیا گرامی، با وارد کردن <strong>کد دانش‌آموزی فرزندتان</strong>، مستقیماً وارد سامانه
                  شده و هویت شما برای ارتباط با معلمان تأیید می‌گردد.
                </span>
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.inputLabel} htmlFor="parent_student_code">
                  کد اختصاصی دانش‌آموز (فرزند شما) *
                </label>
                <input
                  id="parent_student_code"
                  className="input"
                  type="text"
                  placeholder="مثلاً: STD-40301 یا 40301"
                  value={parentStudentCode}
                  onChange={(e) => setParentStudentCode(e.target.value)}
                  required
                  dir="ltr"
                  style={{ fontWeight: 700, letterSpacing: '0.05em' }}
                />
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.inputLabel} htmlFor="parent_guardian_name">
                  نام سرپرست (اختیاری)
                </label>
                <input
                  id="parent_guardian_name"
                  className="input"
                  type="text"
                  placeholder="مثلاً: پدر، مادر، یا نام خانوادگی سرپرست"
                  value={parentGuardianName}
                  onChange={(e) => setParentGuardianName(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className={`btn btn-primary ${styles.submitBtn}`}
                disabled={isLoading}
                style={{
                  background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                  borderColor: '#f59e0b',
                  color: '#111827',
                  fontWeight: 800,
                }}
              >
                {isLoading ? 'در حال تأیید...' : 'ورود مستقیم و دسترسی به پیام‌ها 💬'}
              </button>

              {/* Demo Quick Chips */}
              <div className={styles.studentQuickList}>
                <span className={styles.studentQuickTitle}>⚡ ورود سریع آزمایشی با دانش‌آموزان:</span>
                <div className={styles.studentQuickChips}>
                  {demoStudents.map((st) => (
                    <button
                      key={st.code}
                      type="button"
                      className={styles.studentQuickChip}
                      onClick={() => {
                        setParentStudentCode(st.code);
                        setParentGuardianName(`پدر ${st.name}`);
                        handleParentCodeLogin(null, st.code, `پدر ${st.name}`);
                      }}
                    >
                      🎓 {st.name} ({st.code})
                    </button>
                  ))}
                </div>
              </div>
            </form>
          )}

          {/* ── TAB 4: School Registration (تأسیس و ثبت‌نام مدرسه جدید) ── */}
          {activeTab === 'school' && (
            <form onSubmit={handleSchoolRegisterSubmit} className={styles.form}>
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  borderRadius: 'var(--radius-xl)',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '6px',
                }}
              >
                <div style={{ fontSize: '1.8rem' }}>🏛️</div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    تأسیس و ثبت مدرسه جدید
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                    پس از ثبت، یک کد یکتا به مدرسه اختصاص می‌یابد تا معلمان، پایه‌ها و کلاس‌ها زیرشاخه آن شوند.
                  </div>
                </div>
              </div>

              {/* School Name */}
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel} htmlFor="school_name">
                  نام کامل مدرسه یا آموزشگاه *
                </label>
                <input
                  id="school_name"
                  className="input"
                  type="text"
                  placeholder="مثلاً: دبیرستان علامه حلی، دبستان رازی، هنرستان خوارزمی"
                  value={schoolForm.school_name}
                  onChange={(e) => setSchoolForm({ ...schoolForm, school_name: e.target.value })}
                  required
                />
              </div>

              {/* School Level & City Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel} htmlFor="school_level">
                    مقطع تحصیلی
                  </label>
                  <select
                    id="school_level"
                    className="input"
                    value={schoolForm.school_level}
                    onChange={(e) => setSchoolForm({ ...schoolForm, school_level: e.target.value })}
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="دبستان (دوره اول و دوم)">دبستان (ابتدایی)</option>
                    <option value="متوسطه اول (هفتم تا نهم)">متوسطه اول (راهنمایی)</option>
                    <option value="متوسطه دوم (دبیرستان)">متوسطه دوم (دبیرستان)</option>
                    <option value="هنرستان فنی و حرفه‌ای / کاردانش">هنرستان و فنی‌حرفه‌ای</option>
                    <option value="مجتمع آموزشی کامل">مجتمع آموزشی کامل</option>
                  </select>
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel} htmlFor="city">
                    استان و شهر
                  </label>
                  <input
                    id="city"
                    className="input"
                    type="text"
                    placeholder="مثلاً: تهران، شیراز، اصفهان..."
                    value={schoolForm.city}
                    onChange={(e) => setSchoolForm({ ...schoolForm, city: e.target.value })}
                  />
                </div>
              </div>

              {/* Principal Name */}
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel} htmlFor="admin_name">
                  نام و نام خانوادگی مدیر یا نماینده مدرسه *
                </label>
                <input
                  id="admin_name"
                  className="input"
                  type="text"
                  placeholder="مثلاً: دکتر علیرضا تقوی یا مهندس مریم حسینی"
                  value={schoolForm.admin_name}
                  onChange={(e) => setSchoolForm({ ...schoolForm, admin_name: e.target.value })}
                  required
                />
              </div>

              {/* Admin Phone */}
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel} htmlFor="admin_phone">
                  شماره تلفن همراه مدیر (شناسه ورود به پنل) *
                </label>
                <input
                  id="admin_phone"
                  className="input"
                  type="tel"
                  placeholder="مثلاً: 09123456789"
                  value={schoolForm.admin_phone}
                  onChange={(e) => setSchoolForm({ ...schoolForm, admin_phone: e.target.value })}
                  required
                  dir="ltr"
                />
              </div>

              {/* Admin Password */}
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel} htmlFor="admin_password">
                  رمز عبور پنل مدیریت (اختیاری - پیش‌فرض: 123456)
                </label>
                <input
                  id="admin_password"
                  className="input"
                  type="password"
                  placeholder="رمز عبور دلخواه برای مدیریت"
                  value={schoolForm.admin_password}
                  onChange={(e) => setSchoolForm({ ...schoolForm, admin_password: e.target.value })}
                  dir="ltr"
                />
              </div>

              <button
                type="submit"
                className={`btn btn-primary ${styles.submitBtn}`}
                disabled={isLoading}
                style={{
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  fontWeight: 800,
                  fontSize: '0.98rem',
                  padding: '14px',
                }}
              >
                {isLoading ? 'در حال صدور کد و ثبت...' : '🏛️ ثبت رسمی مدرسه و صدور کد اختصاصی'}
              </button>
            </form>
          )}

          {/* Modal / Dialog when School is Registered Successfully */}
          {registeredSchoolResult && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '16px',
                animation: 'fadeIn 0.25s ease',
              }}
              onClick={() => setRegisteredSchoolResult(null)}
            >
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-2xl)',
                  maxWidth: '500px',
                  width: '100%',
                  padding: '28px',
                  textAlign: 'center',
                  boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                  position: 'relative',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: '3.5rem', marginBottom: '8px' }}>🎉</div>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  مدرسه «{registeredSchoolResult.name}» ثبت شد!
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                  کد اختصاصی زیر برای این مدرسه صادر گردید. این کد را در اختیار معلمان و کادر مدرسه قرار دهید تا به عنوان
                  زیرشاخه به مدرسه شما متصل شوند:
                </p>

                {/* School Code Card */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(6, 182, 212, 0.12))',
                    border: '2px dashed #6366f1',
                    borderRadius: 'var(--radius-xl)',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '20px',
                  }}
                >
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'block' }}>
                      کد اختصاصی مدرسه:
                    </span>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '1.5rem',
                        fontWeight: 900,
                        color: '#4f46e5',
                        letterSpacing: '1px',
                      }}
                    >
                      {registeredSchoolResult.school_code}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopySchoolCode(registeredSchoolResult.school_code)}
                    style={{ gap: '6px', fontWeight: 700 }}
                  >
                    {copiedCode ? <HiOutlineClipboardDocumentCheck style={{ color: '#10b981' }} /> : <HiOutlineClipboardDocument />}
                    <span>{copiedCode ? 'کپی شد!' : 'کپی کد'}</span>
                  </button>
                </div>

                <div
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--text-tertiary)',
                    textAlign: 'right',
                    lineHeight: 1.6,
                    marginBottom: '20px',
                    background: 'var(--bg-hover)',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-lg)',
                  }}
                >
                  💡 در پنل مدیریت می‌توانید:
                  <br />• معلمان را با کد اختصاصی زیرشاخه این مدرسه کنید
                  <br />• لیست دانش‌آموزان را پایه به پایه بسازید
                  <br />• کلاس‌ها را زیرشاخه معلم مربوطه تعریف فرمایید
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      fontWeight: 800,
                      width: '100%',
                      padding: '13px',
                      fontSize: '0.95rem',
                    }}
                    onClick={() => {
                      setRegisteredSchoolResult(null);
                      router.push('/dashboard/management');
                    }}
                  >
                    🏛️ ورود مستقیم به عنوان مدرسه و مدیر (ستاد مدیریت و شعب) 🚀
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{
                      fontWeight: 750,
                      width: '100%',
                      padding: '11px',
                    }}
                    onClick={() => {
                      const sch = registeredSchoolResult;
                      setRegisteredSchoolResult(null);
                      setActiveTab('smart');
                      setSmartForm((prev) => ({
                        ...prev,
                        role: 'teacher',
                        school_name: sch.name,
                        school_code: sch.school_code,
                      }));
                      setIsCustomSchoolSelected(false);
                      toast.success(`مدرسه «${sch.name}» انتخاب شد! نام خود را وارد فرمایید تا به عنوان دبیر متصل شوید 👨‍🏫`, { duration: 6000 });
                    }}
                  >
                    👨‍🏫 ورود معلمان به عنوان زیرشاخه این مدرسه
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{
                      fontWeight: 750,
                      width: '100%',
                      padding: '11px',
                    }}
                    onClick={() => {
                      const sch = registeredSchoolResult;
                      setRegisteredSchoolResult(null);
                      setActiveTab('smart');
                      setSmartForm((prev) => ({
                        ...prev,
                        role: 'student',
                        school_name: sch.name,
                        school_code: sch.school_code,
                      }));
                      setIsCustomSchoolSelected(false);
                      toast.success(`مدرسه «${sch.name}» انتخاب شد! نام دانش‌آموز را جهت اتصال به این مدرسه وارد فرمایید 🎓`, { duration: 6000 });
                    }}
                  >
                    🎓 ورود دانش‌آموزان به عنوان زیرشاخه این مدرسه
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Single Demo Trigger Button */}
          <div className={styles.singleDemoSection}>
            <button
              type="button"
              className={styles.singleDemoTriggerBtn}
              onClick={() => setShowDemoModal(true)}
              disabled={isLoading}
            >
              <div className={styles.singleDemoIcon}>⚡</div>
              <div className={styles.singleDemoInfo}>
                <span className={styles.singleDemoTitle}>ورود به حساب‌های دمو و آزمایشی</span>
                <span className={styles.singleDemoSubtitle}>تست سریع با نقش‌های مدیر، دبیر، دانش‌آموز یا اولیا</span>
              </div>
              <div className={styles.singleDemoBadge}>انتخاب نقش ←</div>
            </button>
          </div>

          {/* Demo Roles Selection Modal */}
          {showDemoModal && (
            <div className={styles.demoModalOverlay} onClick={() => setShowDemoModal(false)}>
              <div className={styles.demoModalCard} onClick={(e) => e.stopPropagation()}>
                <div className={styles.demoModalHeader}>
                  <div className={styles.demoModalTitleWrap}>
                    <div className={styles.demoModalIcon}>⚡</div>
                    <div>
                      <h3 className={styles.demoModalTitle}>انتخاب حساب دمو (آزمایشی)</h3>
                      <p className={styles.demoModalDesc}>
                        برای ورود بدون نیاز به رمز عبور، نقش مورد نظر خود را انتخاب نمایید:
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.demoModalCloseBtn}
                    onClick={() => setShowDemoModal(false)}
                    aria-label="بستن"
                  >
                    ✕
                  </button>
                </div>

                <div className={styles.demoAccountsList}>
                  {demoRoles.map((item) => (
                    <button
                      key={item.role}
                      type="button"
                      className={styles.demoAccountCard}
                      onClick={() => handleSelectDemoRole(item.role, item.title)}
                      disabled={isLoading}
                    >
                      <div className={styles.demoCardAvatar} style={{ background: item.avatarBg }}>
                        {item.icon}
                      </div>
                      <div className={styles.demoCardDetails}>
                        <div className={styles.demoCardHead}>
                          <span className={styles.demoCardTitle}>{item.title}</span>
                          <span
                            className={styles.demoRoleBadge}
                            style={{
                              color: item.badgeColor,
                              borderColor: item.badgeBorder,
                              background: item.badgeBg,
                            }}
                          >
                            {item.badge}
                          </span>
                        </div>
                        <span className={styles.demoCardPersonName}>{item.personName}</span>
                        <p className={styles.demoCardDescription}>{item.desc}</p>
                      </div>
                      <div className={styles.demoCardArrow}>
                        <span>ورود</span>
                        <span>←</span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className={styles.demoModalFooter}>
                  <span>💡 داده‌های تمامی نقش‌ها به صورت آزمایشی در دسترس شما قرار می‌گیرند.</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
