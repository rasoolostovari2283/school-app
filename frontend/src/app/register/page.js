'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import {
  HiOutlineAcademicCap,
  HiOutlineUserGroup,
  HiOutlineUser,
  HiOutlineArrowRight,
  HiOutlineArrowLeft,
  HiOutlineBuildingOffice2,
  HiOutlineCheckCircle,
  HiOutlineMagnifyingGlass,
  HiOutlinePhone,
  HiOutlineLockClosed,
  HiOutlineShieldCheck,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineSparkles,
  HiOutlineClipboardDocument,
  HiOutlineClipboardDocumentCheck,
  HiOutlineIdentification,
} from 'react-icons/hi2';
import useAuthStore from '../../stores/authStore';
import styles from './register.module.css';

const EDUCATION_LEVELS = [
  'پیش دبستانی ۱',
  'پیش دبستانی ۲',
  'دبستان',
  'متوسطه اول',
  'متوسطه دوم',
];

const HIGH_SCHOOL_MAJORS = [
  'تجربی',
  'ریاضی',
  'علوم انسانی',
  'هنرستان',
  'کار دانش',
];

const GRADES_BY_LEVEL = {
  'پیش دبستانی ۱': ['پیش دبستانی ۱'],
  'پیش دبستانی ۲': ['پیش دبستانی ۲'],
  'دبستان': ['پایه اول', 'پایه دوم', 'پایه سوم', 'پایه چهارم', 'پایه پنجم', 'پایه ششم'],
  'متوسطه اول': ['پایه هفتم', 'پایه هشتم', 'پایه نهم'],
  'متوسطه دوم': ['پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'],
};

function normalizeDigits(str) {
  if (!str) return '';
  return String(str)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

export default function RegisterPage() {
  const router = useRouter();
  const {
    fetchSchools,
    findSchoolByUsername,
    findStudentByUsername,
    registerStudent,
    registerTeacher,
    registerParent,
  } = useAuthStore();

  // Role selection: null (choose first) | 'student' | 'teacher' | 'parent'
  const [selectedRole, setSelectedRole] = useState(null);

  // Registered schools fetched from DB
  const [dbSchools, setDbSchools] = useState([]);
  const [schoolSearchText, setSchoolSearchText] = useState('');
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState(null);

  // Fallback school lookup by school @username in DB
  const [schoolUsernameInput, setSchoolUsernameInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  // Student form fields
  const [studentForm, setStudentForm] = useState({
    display_name: '',
    phone: '',
    education_level: '',
    major: '',
    grade: '',
    password: '',
    confirm_password: '',
  });

  // Teacher form fields (subordinate to DB school + multi-grade selection)
  const [teacherForm, setTeacherForm] = useState({
    display_name: '',
    phone: '',
    education_level: '',
    majors: [],
    taught_grades: [],
    password: '',
    confirm_password: '',
  });

  // Parent form fields (hierarchical: Parent -> Student -> School)
  const [parentForm, setParentForm] = useState({
    display_name: '',
    phone: '',
    student_name: '',
    student_username: '',
    relation_type: '', // 'father' | 'mother' | 'other'
    custom_relation: '',
    custom_relation_confirmed: false,
    password: '',
    confirm_password: '',
  });
  const [verifiedStudent, setVerifiedStudent] = useState(null);
  const [studentLookupLoading, setStudentLookupLoading] = useState(false);
  const [studentLookupError, setStudentLookupError] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [registeredResult, setRegisteredResult] = useState(null);
  const [copied, setCopied] = useState(false);

  // Fetch schools from DB on mount
  useEffect(() => {
    let active = true;
    fetchSchools().then((list) => {
      if (active && Array.isArray(list)) {
        setDbSchools(list);
      }
    });
    return () => {
      active = false;
    };
  }, [fetchSchools]);

  // Filter DB schools live by search text
  const filteredSchools = useMemo(() => {
    const q = schoolSearchText.trim().toLowerCase();
    const qNoAt = q.replace(/^@/, '');
    if (!q) return dbSchools;
    return dbSchools.filter((s) => {
      const name = (s.name || '').toLowerCase();
      const city = (s.city || '').toLowerCase();
      const code = (s.code || '').toLowerCase();
      const uname = (s.username || '').toLowerCase();
      return (
        name.includes(q) ||
        city.includes(q) ||
        code.includes(q) ||
        (uname && (uname.includes(qNoAt) || `@${uname}`.includes(q)))
      );
    });
  }, [dbSchools, schoolSearchText]);

  const availableGrades = useMemo(() => {
    return GRADES_BY_LEVEL[studentForm.education_level] || [];
  }, [studentForm.education_level]);

  const isPreschool =
    studentForm.education_level === 'پیش دبستانی ۱' ||
    studentForm.education_level === 'پیش دبستانی ۲';

  const isHighSchool = studentForm.education_level === 'متوسطه دوم';

  const teacherAvailableGrades = useMemo(() => {
    return GRADES_BY_LEVEL[teacherForm.education_level] || [];
  }, [teacherForm.education_level]);

  const isTeacherPreschool =
    teacherForm.education_level === 'پیش دبستانی ۱' ||
    teacherForm.education_level === 'پیش دبستانی ۲';

  const isTeacherHighSchool = teacherForm.education_level === 'متوسطه دوم';

  const toggleTeacherGrade = (grade) => {
    setTeacherForm((prev) => {
      const exists = prev.taught_grades.includes(grade);
      return {
        ...prev,
        taught_grades: exists
          ? prev.taught_grades.filter((g) => g !== grade)
          : [...prev.taught_grades, grade],
      };
    });
  };

  const toggleTeacherMajor = (major) => {
    setTeacherForm((prev) => {
      const exists = prev.majors.includes(major);
      return {
        ...prev,
        majors: exists ? prev.majors.filter((m) => m !== major) : [...prev.majors, major],
      };
    });
  };

  // Lookup school strictly in DB by its unique username
  const handleLookupSchoolByUsername = async () => {
    const clean = schoolUsernameInput.trim().replace(/^@/, '');
    if (!clean) {
      setLookupError('لطفاً نام کاربری اختصاصی مدرسه را وارد کنید');
      return;
    }
    setLookupLoading(true);
    setLookupError('');
    try {
      const found = await findSchoolByUsername(clean);
      setSelectedSchool(found);
      setSchoolSearchText(found.name);
      setShowSchoolDropdown(false);
      // Add to local list if not already present
      setDbSchools((prev) =>
        prev.some((s) => s.id === found.id) ? prev : [found, ...prev]
      );
      toast.success(`مدرسه «${found.name}» از دیتابیس یافت و انتخاب شد`);
    } catch (err) {
      setLookupError(
        err?.response?.data?.message || 'مدرسه‌ای با این نام کاربری در دیتابیس یافت نشد'
      );
    } finally {
      setLookupLoading(false);
    }
  };

  const handleCopyUsername = async (uname) => {
    if (!uname) return;
    try {
      await navigator.clipboard.writeText(`@${uname}`);
      setCopied(true);
      toast.success(`نام کاربری @${uname} کپی شد`);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('امکان کپی خودکار وجود ندارد');
    }
  };

  const handleStudentSubmit = async (e) => {
    e.preventDefault();
    const cleanName = studentForm.display_name.trim();
    const cleanPhone = normalizeDigits(studentForm.phone).replace(/\s+/g, '');
    const cleanPass = studentForm.password.trim();
    const cleanConfirm = studentForm.confirm_password.trim();

    if (cleanName.length < 2) {
      toast.error('لطفاً اسم و فامیل خود را وارد کنید');
      return;
    }
    if (!/^09\d{9}$/.test(cleanPhone)) {
      toast.error('شماره تماس باید ۱۱ رقم و با 09 شروع شود');
      return;
    }

    // Resolve selected school (either chosen from dropdown or matched by school_username)
    let targetSchool = selectedSchool;
    if (!targetSchool && schoolSearchText.trim()) {
      const exact = dbSchools.find(
        (s) => s.name.trim().toLowerCase() === schoolSearchText.trim().toLowerCase()
      );
      if (exact) targetSchool = exact;
    }

    if (!targetSchool && !schoolUsernameInput.trim()) {
      toast.error('لطفاً مدرسه خود را از لیست جستجو انتخاب کنید یا نام کاربری مدرسه را وارد نمایید');
      return;
    }

    if (!studentForm.education_level) {
      toast.error('لطفاً مقطع تحصیلی خود را انتخاب کنید');
      return;
    }
    if (isHighSchool && !studentForm.major) {
      toast.error('برای مقطع متوسطه دوم، انتخاب رشته تحصیلی الزامی است');
      return;
    }
    if (!isPreschool && !studentForm.grade) {
      toast.error('لطفاً پایه تحصیلی خود را انتخاب کنید');
      return;
    }
    if (cleanPass.length < 6) {
      toast.error('رمز عبور باید حداقل ۶ کاراکتر باشد');
      return;
    }
    if (cleanPass !== cleanConfirm) {
      toast.error('رمز عبور و تکرار آن یکسان نیستند');
      return;
    }

    setSubmitting(true);
    try {
      const res = await registerStudent({
        display_name: cleanName,
        phone: cleanPhone,
        school_id: targetSchool?.id || undefined,
        school_name: targetSchool?.name || schoolSearchText.trim() || undefined,
        school_code: targetSchool?.code || undefined,
        school_username: schoolUsernameInput.trim() || targetSchool?.username || undefined,
        education_level: studentForm.education_level,
        major: isHighSchool ? studentForm.major : null,
        grade: isPreschool ? studentForm.education_level : studentForm.grade,
        password: cleanPass,
      });

      setRegisteredResult({
        role: 'student',
        user: res.user,
        student: res.student,
        school: res.school,
      });
      toast.success(`ثبت‌نام شما انجام شد! نام کاربری انحصاری شما: @${res.user.username}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'خطا در ثبت‌نام دانش‌آموز');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTeacherSubmit = async (e) => {
    e.preventDefault();
    const cleanName = teacherForm.display_name.trim();
    const cleanPhone = normalizeDigits(teacherForm.phone).replace(/\s+/g, '');
    const cleanPass = teacherForm.password.trim();
    const cleanConfirm = teacherForm.confirm_password.trim();

    if (cleanName.length < 2) {
      toast.error('لطفاً اسم و فامیل خود را وارد کنید');
      return;
    }
    if (!/^09\d{9}$/.test(cleanPhone)) {
      toast.error('شماره تماس باید ۱۱ رقم و با 09 شروع شود');
      return;
    }

    let targetSchool = selectedSchool;
    if (!targetSchool && schoolSearchText.trim()) {
      const exact = dbSchools.find(
        (s) => s.name.trim().toLowerCase() === schoolSearchText.trim().toLowerCase()
      );
      if (exact) targetSchool = exact;
    }

    if (!targetSchool && !schoolUsernameInput.trim()) {
      toast.error('لطفاً مدرسه خود را از لیست جستجو انتخاب کنید یا نام کاربری مدرسه را وارد نمایید');
      return;
    }

    if (!teacherForm.education_level) {
      toast.error('لطفاً مقطع تحصیلی تدریس خود را انتخاب کنید');
      return;
    }

    const finalGrades = isTeacherPreschool
      ? [teacherForm.education_level]
      : teacherForm.taught_grades;

    if (!finalGrades || finalGrades.length === 0) {
      toast.error('لطفاً حداقل یک پایه تحصیلی برای تدریس انتخاب کنید');
      return;
    }

    if (cleanPass.length < 6) {
      toast.error('رمز عبور باید حداقل ۶ کاراکتر باشد');
      return;
    }
    if (cleanPass !== cleanConfirm) {
      toast.error('رمز عبور و تکرار آن یکسان نیستند');
      return;
    }

    setSubmitting(true);
    try {
      const res = await registerTeacher({
        display_name: cleanName,
        phone: cleanPhone,
        school_id: targetSchool?.id || undefined,
        school_name: targetSchool?.name || schoolSearchText.trim() || undefined,
        school_code: targetSchool?.code || undefined,
        school_username: schoolUsernameInput.trim() || targetSchool?.username || undefined,
        education_level: teacherForm.education_level,
        majors: isTeacherHighSchool ? teacherForm.majors : [],
        taught_grades: finalGrades,
        password: cleanPass,
      });

      setRegisteredResult({
        role: 'teacher',
        user: res.user,
        teacher: res.teacher,
        school: res.school,
      });
      toast.success(`ثبت‌نام معلم انجام شد! نام کاربری انحصاری شما: @${res.user.username}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'خطا در ثبت‌نام معلم');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLookupStudentByUsername = async () => {
    const clean = parentForm.student_username.trim().replace(/^@/, '');
    if (!clean) {
      setStudentLookupError('لطفاً نام کاربری دانش‌آموز را وارد کنید');
      return;
    }
    setStudentLookupLoading(true);
    setStudentLookupError('');
    try {
      const found = await findStudentByUsername(clean, selectedSchool?.id || null);
      setVerifiedStudent(found);
      if (found.full_name && !parentForm.student_name.trim()) {
        setParentForm((prev) => ({ ...prev, student_name: found.full_name }));
      }
      if (!selectedSchool && found.school_id) {
        const matched = dbSchools.find((s) => s.id === found.school_id);
        if (matched) {
          setSelectedSchool(matched);
          setSchoolSearchText(matched.name);
          if (matched.username) setSchoolUsernameInput(matched.username);
        }
      }
      toast.success(`دانش‌آموز «${found.full_name}» در دیتابیس مدرسه تایید شد`);
    } catch (err) {
      setVerifiedStudent(null);
      setStudentLookupError(
        err?.response?.data?.message || 'دانش‌آموزی با این نام کاربری در دیتابیس یافت نشد'
      );
    } finally {
      setStudentLookupLoading(false);
    }
  };

  const handleConfirmCustomRelation = () => {
    const cleanCustom = parentForm.custom_relation.trim();
    if (cleanCustom.length < 2) {
      toast.error('لطفاً نسبت خود با دانش‌آموز را وارد کنید (حداقل ۲ حرف)');
      return;
    }
    setParentForm((prev) => ({
      ...prev,
      custom_relation: cleanCustom,
      custom_relation_confirmed: true,
    }));
    toast.success(`نسبت «${cleanCustom}» ثبت شد`);
  };

  const handleParentSubmit = async (e) => {
    e.preventDefault();
    const cleanName = parentForm.display_name.trim();
    const cleanPhone = normalizeDigits(parentForm.phone).replace(/\s+/g, '');
    const cleanStudentName = parentForm.student_name.trim();
    const cleanStudentUsername = parentForm.student_username.trim().replace(/^@/, '');
    const cleanPass = parentForm.password.trim();
    const cleanConfirm = parentForm.confirm_password.trim();

    if (cleanName.length < 2) {
      toast.error('لطفاً اسم و فامیل خود را وارد کنید');
      return;
    }
    if (!/^09\d{9}$/.test(cleanPhone)) {
      toast.error('شماره تماس باید ۱۱ رقم و با 09 شروع شود');
      return;
    }

    let targetSchool = selectedSchool;
    if (!targetSchool && schoolSearchText.trim()) {
      const exact = dbSchools.find(
        (s) => s.name.trim().toLowerCase() === schoolSearchText.trim().toLowerCase()
      );
      if (exact) targetSchool = exact;
    }

    if (!targetSchool && !schoolUsernameInput.trim()) {
      toast.error('لطفاً مدرسه دانش‌آموز را از لیست جستجو انتخاب کنید یا نام کاربری مدرسه را وارد نمایید');
      return;
    }

    if (cleanStudentName.length < 2) {
      toast.error('لطفاً اسم دانش‌آموز را وارد کنید');
      return;
    }
    if (!cleanStudentUsername) {
      toast.error('لطفاً نام کاربری دانش‌آموز را وارد کنید');
      return;
    }

    if (!parentForm.relation_type) {
      toast.error('لطفاً نسبت خود با دانش‌آموز (پدر، مادر یا سایر موارد) را انتخاب کنید');
      return;
    }

    const cleanCustomRelation = parentForm.custom_relation.trim();
    if (parentForm.relation_type === 'other' && cleanCustomRelation.length < 2) {
      toast.error('در صورت انتخاب «سایر موارد»، لطفاً نسبت خود با دانش‌آموز را بنویسید و ثبت کنید');
      return;
    }

    if (cleanPass.length < 6) {
      toast.error('رمز عبور باید حداقل ۶ کاراکتر باشد');
      return;
    }
    if (cleanPass !== cleanConfirm) {
      toast.error('رمز عبور و تکرار آن یکسان نیستند');
      return;
    }

    const resolvedRelationLabel =
      parentForm.relation_type === 'father'
        ? 'پدر'
        : parentForm.relation_type === 'mother'
        ? 'مادر'
        : cleanCustomRelation;

    setSubmitting(true);
    try {
      const res = await registerParent({
        display_name: cleanName,
        phone: cleanPhone,
        school_id: targetSchool?.id || undefined,
        school_name: targetSchool?.name || schoolSearchText.trim() || undefined,
        school_code: targetSchool?.code || undefined,
        school_username: schoolUsernameInput.trim() || targetSchool?.username || undefined,
        student_name: cleanStudentName,
        student_username: cleanStudentUsername,
        relation_type: parentForm.relation_type,
        relation: resolvedRelationLabel,
        custom_relation: parentForm.relation_type === 'other' ? cleanCustomRelation : '',
        password: cleanPass,
      });

      setRegisteredResult({
        role: 'parent',
        user: res.user,
        parent: res.parent,
        student: res.student,
        school: res.school,
      });
      toast.success(`ثبت‌نام اولیا انجام شد! نام کاربری انحصاری شما: @${res.user.username}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'خطا در ثبت‌نام اولیا');
    } finally {
      setSubmitting(false);
    }
  };

  // Shared DB school search + @school_username verification section (used identically in Student & Teacher forms)
  const renderSchoolSelectorSection = (prefix) => (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>
        <span className={styles.stepNum}>۲</span>
        <span>انتخاب مدرسه از دیتابیس یا جستجو با نام کاربری مدرسه</span>
      </h2>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${prefix}_school_search`}>
          <HiOutlineBuildingOffice2 />
          <span>اسم مدرسه (جستجو و انتخاب از مدارس ثبت‌شده در دیتابیس)</span>
          <span className={styles.requiredMark}>*</span>
        </label>
        <input
          id={`${prefix}_school_search`}
          className="input"
          type="text"
          placeholder="نام مدرسه را تایپ کنید یا برای مشاهده مدارس ثبت‌شده کلیک کنید..."
          value={schoolSearchText}
          onFocus={() => setShowSchoolDropdown(true)}
          onChange={(e) => {
            setSchoolSearchText(e.target.value);
            setShowSchoolDropdown(true);
            if (selectedSchool && e.target.value !== selectedSchool.name) {
              setSelectedSchool(null);
            }
          }}
        />

        {showSchoolDropdown && (
          <div className={styles.schoolDropdown} data-testid="db-schools-dropdown">
            {filteredSchools.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                مدرسه‌ای با این نام یافت نشد. می‌توانید از کادر پایین «نام کاربری مدرسه» را وارد کنید.
              </div>
            ) : (
              filteredSchools.map((sch) => (
                <button
                  key={sch.id || sch.name}
                  type="button"
                  className={`${styles.schoolOption} ${selectedSchool?.id === sch.id ? styles.schoolOptionActive : ''}`}
                  onClick={() => {
                    setSelectedSchool(sch);
                    setSchoolSearchText(sch.name);
                    if (sch.username) setSchoolUsernameInput(sch.username);
                    setLookupError('');
                    setShowSchoolDropdown(false);
                  }}
                >
                  <div className={styles.schoolOptionMeta}>
                    <span className={styles.schoolOptionName}>{sch.name}</span>
                    <span className={styles.schoolOptionSub}>
                      {sch.city || 'تهران'} • {sch.level || 'متوسطه دوم'}
                      {sch.code ? ` • ${sch.code}` : ''}
                    </span>
                  </div>
                  {sch.username && <bdi className={styles.usernamePill}>@{sch.username}</bdi>}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Dedicated School Username Lookup Box */}
      <div className={styles.lookupBox}>
        <label className={styles.label} htmlFor={`${prefix}_school_username`}>
          <HiOutlineIdentification />
          <span>نام کاربری مدرسه (در صورت یافت نشدن اسم مدرسه در لیست بالا)</span>
        </label>
        <p className={styles.hint}>
          آیدی اختصاصی مدرسه را وارد کنید تا سامانه آن را در دیتابیس بررسی کرده و نام مدرسه را نمایش دهد:
        </p>
        <div className={styles.lookupRow}>
          <input
            id={`${prefix}_school_username`}
            className="input"
            type="text"
            dir="ltr"
            placeholder="مثلاً: @ali_taghavi یا ali_taghavi"
            value={schoolUsernameInput}
            onChange={(e) => {
              setSchoolUsernameInput(e.target.value);
              setLookupError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleLookupSchoolByUsername();
              }
            }}
          />
          <button
            type="button"
            data-testid="verify-school-username-btn"
            className={styles.lookupBtn}
            onClick={handleLookupSchoolByUsername}
            disabled={lookupLoading}
          >
            <HiOutlineMagnifyingGlass />
            <span>{lookupLoading ? 'در حال بررسی...' : 'بررسی و نمایش مدرسه'}</span>
          </button>
        </div>

        {lookupError && (
          <div className={styles.lookupError} data-testid="school-lookup-error">
            {lookupError}
          </div>
        )}

        {selectedSchool && (
          <div className={styles.verifiedSchoolCard} data-testid="verified-school-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HiOutlineCheckCircle style={{ fontSize: '1.3rem', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 900, fontSize: '0.9rem' }}>
                  مدرسه انتخاب‌شده: {selectedSchool.name}
                </div>
                <div style={{ fontSize: '0.76rem', opacity: 0.9 }}>
                  شهر: {selectedSchool.city || 'تهران'} • مقطع: {selectedSchool.level || '—'}
                </div>
              </div>
            </div>
            {selectedSchool.username && (
              <bdi className={styles.usernamePill}>@{selectedSchool.username}</bdi>
            )}
          </div>
        )}
      </div>
    </div>
  );

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
              <HiOutlineAcademicCap />
            </span>
            <span>EduConnect | ثبت‌نام کاربران</span>
          </div>
        </div>

        <div className={styles.card}>
          {!registeredResult ? (
            <>
              <div className={styles.header}>
                <span className={styles.headerKicker}>
                  <HiOutlineSparkles />
                  <span>ثبت‌نام و صدور نام کاربری انحصاری</span>
                </span>
                <h1 className={styles.title}>ثبت‌نام در سامانه هوشمند مدرسه</h1>
                <p className={styles.subtitle}>
                  ابتدا سمت خود را انتخاب کنید تا فرم اختصاصی ثبت‌نام نمایش داده شود. پس از تکمیل مشخصات، یک نام کاربری
                  انحصاری برای ورودهای بعدی به شما داده می‌شود.
                </p>
              </div>

              {/* Role Selection Cards: دانش‌آموز، معلم، اولیا */}
              <div className={styles.roleGrid} role="radiogroup" aria-label="انتخاب سمت کاربری">
                <button
                  type="button"
                  data-testid="role-card-student"
                  aria-pressed={selectedRole === 'student'}
                  className={`${styles.roleCard} ${selectedRole === 'student' ? styles.roleCardActive : ''}`}
                  onClick={() => setSelectedRole('student')}
                >
                  <span className={styles.roleIcon}>
                    <HiOutlineAcademicCap />
                  </span>
                  <span className={styles.roleTitle}>دانش‌آموز</span>
                  <span className={styles.roleDesc}>ثبت پرونده اختصاصی دانش‌آموز، مدرسه، مقطع، رشته و پایه</span>
                </button>

                <button
                  type="button"
                  data-testid="role-card-teacher"
                  aria-pressed={selectedRole === 'teacher'}
                  className={`${styles.roleCard} ${selectedRole === 'teacher' ? styles.roleCardActive : ''}`}
                  onClick={() => setSelectedRole('teacher')}
                >
                  <span className={styles.roleIcon}>
                    <HiOutlineUser />
                  </span>
                  <span className={styles.roleTitle}>معلم</span>
                  <span className={styles.roleDesc}>ثبت‌نام دبیران و اتصال به مدرسه و کلاس‌های آموزشی</span>
                </button>

                <button
                  type="button"
                  data-testid="role-card-parent"
                  aria-pressed={selectedRole === 'parent'}
                  className={`${styles.roleCard} ${selectedRole === 'parent' ? styles.roleCardActive : ''}`}
                  onClick={() => setSelectedRole('parent')}
                >
                  <span className={styles.roleIcon}>
                    <HiOutlineUserGroup />
                  </span>
                  <span className={styles.roleTitle}>اولیا</span>
                  <span className={styles.roleDesc}>ثبت‌نام اولیای دانش‌آموز و پیگیری وضعیت تحصیلی</span>
                </button>
              </div>

              {/* ═══════════════════════════════════════════════════════
                  STUDENT REGISTRATION FORM (6 Required Steps)
              ═══════════════════════════════════════════════════════ */}
              {selectedRole === 'student' && (
                <form onSubmit={handleStudentSubmit} className={styles.form} data-testid="student-register-form" noValidate>
                  {/* 1 & 2: Full Name & Phone */}
                  <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                      <span className={styles.stepNum}>۱</span>
                      <span>مشخصات فردی دانش‌آموز</span>
                    </h2>

                    <div className={styles.gridTwo}>
                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="student_full_name">
                          <HiOutlineUser />
                          <span>اسم و فامیل</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <input
                          id="student_full_name"
                          name="display_name"
                          className="input"
                          type="text"
                          placeholder="مثلاً: امیررضا نوری"
                          value={studentForm.display_name}
                          onChange={(e) => setStudentForm({ ...studentForm, display_name: e.target.value })}
                          required
                          autoFocus
                        />
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="student_phone">
                          <HiOutlinePhone />
                          <span>شماره تماس</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <input
                          id="student_phone"
                          name="phone"
                          className="input"
                          type="tel"
                          inputMode="tel"
                          dir="ltr"
                          placeholder="09123456789"
                          value={studentForm.phone}
                          onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3: School Search (from DB) + School Username Lookup Box */}
                  {renderSchoolSelectorSection('student')}

                  {/* 4 & 5: Education Level, Conditional High-School Major, and Conditional Grade */}
                  <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                      <span className={styles.stepNum}>۳</span>
                      <span>مقطع تحصیلی، رشته و پایه تحصیلی</span>
                    </h2>

                    {/* 4. Education Level */}
                    <div className={styles.field}>
                      <label className={styles.label}>
                        <HiOutlineAcademicCap />
                        <span>مقطع تحصیلی</span>
                        <span className={styles.requiredMark}>*</span>
                      </label>
                      <div className={styles.chipsGridFive} data-testid="education-level-options">
                        {EDUCATION_LEVELS.map((level) => {
                          const active = studentForm.education_level === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              aria-pressed={active}
                              className={`${styles.choiceBtn} ${active ? styles.choiceBtnActive : ''}`}
                              onClick={() => {
                                const autoGrade =
                                  level === 'پیش دبستانی ۱' || level === 'پیش دبستانی ۲'
                                    ? level
                                    : '';
                                setStudentForm((prev) => ({
                                  ...prev,
                                  education_level: level,
                                  major: level === 'متوسطه دوم' ? prev.major : '',
                                  grade: autoGrade,
                                }));
                              }}
                            >
                              {level}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Conditional Major selector ONLY for متوسطه دوم */}
                    {isHighSchool && (
                      <div className={styles.conditionalBox} data-testid="student-major-section">
                        <label className={styles.label}>
                          <span>رشته تحصیلی (مخصوص مقطع متوسطه دوم)</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <div className={styles.chipsGridFive}>
                          {HIGH_SCHOOL_MAJORS.map((major) => {
                            const active = studentForm.major === major;
                            return (
                              <button
                                key={major}
                                type="button"
                                aria-pressed={active}
                                className={`${styles.choiceBtn} ${active ? styles.choiceBtnActive : ''}`}
                                onClick={() => setStudentForm((prev) => ({ ...prev, major }))}
                              >
                                {major}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 5. Conditional Grade selector for دبستان (1-6), متوسطه اول (7-9), متوسطه دوم (10-12) */}
                    {studentForm.education_level && !isPreschool && (
                      <div className={styles.conditionalBox} data-testid="student-grade-section">
                        <label className={styles.label}>
                          <span>پایه تحصیلی ({studentForm.education_level})</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <div className={styles.chipsGrid}>
                          {availableGrades.map((grade) => {
                            const active = studentForm.grade === grade;
                            return (
                              <button
                                key={grade}
                                type="button"
                                aria-pressed={active}
                                className={`${styles.choiceBtn} ${active ? styles.choiceBtnActive : ''}`}
                                onClick={() => setStudentForm((prev) => ({ ...prev, grade }))}
                              >
                                {active && <HiOutlineCheckCircle style={{ color: '#4f46e5' }} />}
                                <span>{grade}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {isPreschool && (
                      <p className={styles.hint} data-testid="preschool-grade-note">
                        پایه تحصیلی به‌صورت خودکار روی «{studentForm.education_level}» تنظیم شد.
                      </p>
                    )}
                  </div>

                  {/* 6: Password */}
                  <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                      <span className={styles.stepNum}>۴</span>
                      <span>رمز عبور حساب کاربری</span>
                    </h2>

                    <div className={styles.gridTwo}>
                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="student_password">
                          <HiOutlineLockClosed />
                          <span>رمز عبور</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <div className={styles.passwordWrap}>
                          <input
                            id="student_password"
                            name="password"
                            className={`input ${styles.passwordInput}`}
                            type={showPassword ? 'text' : 'password'}
                            dir="ltr"
                            placeholder="حداقل ۶ کاراکتر"
                            value={studentForm.password}
                            onChange={(e) => setStudentForm({ ...studentForm, password: e.target.value })}
                            required
                          />
                          <button
                            type="button"
                            className={styles.eyeBtn}
                            onClick={() => setShowPassword((p) => !p)}
                            aria-label={showPassword ? 'مخفی‌سازی رمز عبور' : 'نمایش رمز عبور'}
                          >
                            {showPassword ? <HiOutlineEyeSlash /> : <HiOutlineEye />}
                          </button>
                        </div>
                        <p className={styles.hint}>
                          رمز عبور به‌صورت رمزنگاری‌شده در دیتابیس ذخیره می‌شود تا در ورودهای بعدی بررسی شود.
                        </p>
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="student_confirm_password">
                          <HiOutlineShieldCheck />
                          <span>تکرار رمز عبور</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <input
                          id="student_confirm_password"
                          name="confirm_password"
                          className="input"
                          type={showPassword ? 'text' : 'password'}
                          dir="ltr"
                          placeholder="تکرار رمز عبور"
                          value={studentForm.confirm_password}
                          onChange={(e) => setStudentForm({ ...studentForm, confirm_password: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <button type="submit" className={styles.submitBtn} disabled={submitting}>
                    <span>{submitting ? 'در حال ثبت اطلاعات در دیتابیس و صدور نام کاربری...' : 'ثبت‌نام نهایی دانش‌آموز و دریافت نام کاربری انحصاری'}</span>
                    <HiOutlineArrowLeft />
                  </button>
                </form>
              )}

              {/* ═══════════════════════════════════════════════════════
                  TEACHER REGISTRATION FORM (Subordinate to School + Multi-Grade)
              ═══════════════════════════════════════════════════════ */}
              {selectedRole === 'teacher' && (
                <form onSubmit={handleTeacherSubmit} className={styles.form} data-testid="teacher-register-form" noValidate>
                  {/* 1 & 2: Full Name & Phone */}
                  <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                      <span className={styles.stepNum}>۱</span>
                      <span>مشخصات فردی معلم / دبیر</span>
                    </h2>

                    <div className={styles.gridTwo}>
                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="teacher_full_name">
                          <HiOutlineUser />
                          <span>اسم و فامیل</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <input
                          id="teacher_full_name"
                          name="display_name"
                          className="input"
                          type="text"
                          placeholder="مثلاً: استاد حسین میرزایی"
                          value={teacherForm.display_name}
                          onChange={(e) => setTeacherForm({ ...teacherForm, display_name: e.target.value })}
                          required
                          autoFocus
                        />
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="teacher_phone">
                          <HiOutlinePhone />
                          <span>شماره تماس</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <input
                          id="teacher_phone"
                          name="phone"
                          className="input"
                          type="tel"
                          inputMode="tel"
                          dir="ltr"
                          placeholder="09123456789"
                          value={teacherForm.phone}
                          onChange={(e) => setTeacherForm({ ...teacherForm, phone: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3: School Search (from DB) + School Username Lookup Box (identical style to Student) */}
                  {renderSchoolSelectorSection('teacher')}

                  {/* 4 & 5: Teaching Education Level + Conditional Majors + Multi-Select Taught Grades */}
                  <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                      <span className={styles.stepNum}>۳</span>
                      <span>مقطع تحصیلی تدریس و پایه‌های تدریس</span>
                    </h2>

                    {/* Teaching Education Level */}
                    <div className={styles.field}>
                      <label className={styles.label}>
                        <HiOutlineAcademicCap />
                        <span>مقطع تحصیلی تدریس</span>
                        <span className={styles.requiredMark}>*</span>
                      </label>
                      <div className={styles.chipsGridFive} data-testid="teacher-education-level-options">
                        {EDUCATION_LEVELS.map((level) => {
                          const active = teacherForm.education_level === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              aria-pressed={active}
                              className={`${styles.choiceBtn} ${active ? styles.choiceBtnActive : ''}`}
                              onClick={() => {
                                const autoGrades =
                                  level === 'پیش دبستانی ۱' || level === 'پیش دبستانی ۲'
                                    ? [level]
                                    : [];
                                setTeacherForm((prev) => ({
                                  ...prev,
                                  education_level: level,
                                  majors: level === 'متوسطه دوم' ? prev.majors : [],
                                  taught_grades: autoGrades,
                                }));
                              }}
                            >
                              {level}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Conditional High-School Teaching Majors (multi-select optional) */}
                    {isTeacherHighSchool && (
                      <div className={styles.conditionalBox} data-testid="teacher-majors-section">
                        <label className={styles.label}>
                          <span>رشته‌های تدریس در متوسطه دوم (اختیاری — قابل انتخاب چندموردی)</span>
                        </label>
                        <div className={styles.chipsGridFive}>
                          {HIGH_SCHOOL_MAJORS.map((major) => {
                            const active = teacherForm.majors.includes(major);
                            return (
                              <button
                                key={major}
                                type="button"
                                aria-pressed={active}
                                className={`${styles.choiceBtn} ${active ? styles.choiceBtnActive : ''}`}
                                onClick={() => toggleTeacherMajor(major)}
                              >
                                {active && <HiOutlineCheckCircle style={{ color: '#4f46e5' }} />}
                                <span>{major}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Multi-select Taught Grades based on selected education level */}
                    {teacherForm.education_level && !isTeacherPreschool && (
                      <div className={styles.conditionalBox} data-testid="teacher-grades-section">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <label className={styles.label}>
                            <span>پایه‌های تدریس ({teacherForm.education_level} — می‌توانید چند پایه انتخاب کنید)</span>
                            <span className={styles.requiredMark}>*</span>
                          </label>
                          {teacherForm.taught_grades.length > 0 && (
                            <span
                              data-testid="teacher-selected-grades-count"
                              style={{
                                fontSize: '0.76rem',
                                fontWeight: 800,
                                color: '#4f46e5',
                                background: 'rgba(99, 102, 241, 0.1)',
                                padding: '3px 10px',
                                borderRadius: '999px',
                              }}
                            >
                              {teacherForm.taught_grades.length} پایه انتخاب‌شده
                            </span>
                          )}
                        </div>
                        <div className={styles.chipsGrid}>
                          {teacherAvailableGrades.map((grade) => {
                            const active = teacherForm.taught_grades.includes(grade);
                            return (
                              <button
                                key={grade}
                                type="button"
                                aria-pressed={active}
                                className={`${styles.choiceBtn} ${active ? styles.choiceBtnActive : ''}`}
                                onClick={() => toggleTeacherGrade(grade)}
                              >
                                {active && <HiOutlineCheckCircle style={{ color: '#4f46e5' }} />}
                                <span>{grade}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {isTeacherPreschool && (
                      <p className={styles.hint} data-testid="teacher-preschool-note">
                        پایه تدریس به‌صورت خودکار روی «{teacherForm.education_level}» تنظیم شد.
                      </p>
                    )}
                  </div>

                  {/* 6: Password */}
                  <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                      <span className={styles.stepNum}>۴</span>
                      <span>رمز عبور حساب کاربری</span>
                    </h2>

                    <div className={styles.gridTwo}>
                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="teacher_password">
                          <HiOutlineLockClosed />
                          <span>رمز عبور</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <div className={styles.passwordWrap}>
                          <input
                            id="teacher_password"
                            name="password"
                            className={`input ${styles.passwordInput}`}
                            type={showPassword ? 'text' : 'password'}
                            dir="ltr"
                            placeholder="حداقل ۶ کاراکتر"
                            value={teacherForm.password}
                            onChange={(e) => setTeacherForm({ ...teacherForm, password: e.target.value })}
                            required
                          />
                          <button
                            type="button"
                            className={styles.eyeBtn}
                            onClick={() => setShowPassword((p) => !p)}
                            aria-label={showPassword ? 'مخفی‌سازی رمز عبور' : 'نمایش رمز عبور'}
                          >
                            {showPassword ? <HiOutlineEyeSlash /> : <HiOutlineEye />}
                          </button>
                        </div>
                        <p className={styles.hint}>
                          اطلاعات شما در دیتابیس زیرشاخه مدرسه انتخاب‌شده ثبت می‌شود و با نام کاربری اختصاصی و این رمز وارد می‌شوید.
                        </p>
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="teacher_confirm_password">
                          <HiOutlineShieldCheck />
                          <span>تکرار رمز عبور</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <input
                          id="teacher_confirm_password"
                          name="confirm_password"
                          className="input"
                          type={showPassword ? 'text' : 'password'}
                          dir="ltr"
                          placeholder="تکرار رمز عبور"
                          value={teacherForm.confirm_password}
                          onChange={(e) => setTeacherForm({ ...teacherForm, confirm_password: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <button type="submit" className={styles.submitBtn} disabled={submitting}>
                    <span>{submitting ? 'در حال ثبت زیرشاخه مدرسه و صدور نام کاربری...' : 'ثبت‌نام نهایی معلم و دریافت نام کاربری (آیدی) اختصاصی'}</span>
                    <HiOutlineArrowLeft />
                  </button>
                </form>
              )}

              {/* ═══════════════════════════════════════════════════════
                  PARENT REGISTRATION FORM (Hierarchical: Parent -> Student -> School)
              ═══════════════════════════════════════════════════════ */}
              {selectedRole === 'parent' && (
                <form onSubmit={handleParentSubmit} className={styles.form} data-testid="parent-register-form" noValidate>
                  {/* 1 & 2: Parent Full Name & Phone */}
                  <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                      <span className={styles.stepNum}>۱</span>
                      <span>مشخصات فردی اولیا</span>
                    </h2>

                    <div className={styles.gridTwo}>
                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="parent_full_name">
                          <HiOutlineUser />
                          <span>اسم و فامیل</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <input
                          id="parent_full_name"
                          name="display_name"
                          className="input"
                          type="text"
                          placeholder="مثلاً: محمد حسینی"
                          value={parentForm.display_name}
                          onChange={(e) => setParentForm({ ...parentForm, display_name: e.target.value })}
                          required
                          autoFocus
                        />
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="parent_phone">
                          <HiOutlinePhone />
                          <span>شماره تماس</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <input
                          id="parent_phone"
                          name="phone"
                          className="input"
                          type="tel"
                          inputMode="tel"
                          dir="ltr"
                          placeholder="09123456789"
                          value={parentForm.phone}
                          onChange={(e) => setParentForm({ ...parentForm, phone: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3: School Search (from DB) + School Username Lookup Box (identical to Student) */}
                  {renderSchoolSelectorSection('parent')}

                  {/* 4, 5 & 6: Student Name, Student Username & Relation to Student */}
                  <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                      <span className={styles.stepNum}>۳</span>
                      <span>مشخصات دانش‌آموز و نسبت شما با دانش‌آموز</span>
                    </h2>

                    <div className={styles.gridTwo}>
                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="parent_student_name">
                          <HiOutlineAcademicCap />
                          <span>اسم دانش‌آموز</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <input
                          id="parent_student_name"
                          name="student_name"
                          className="input"
                          type="text"
                          placeholder="مثلاً: امیررضا نوری"
                          value={parentForm.student_name}
                          onChange={(e) => setParentForm({ ...parentForm, student_name: e.target.value })}
                          required
                        />
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="parent_student_username">
                          <HiOutlineIdentification />
                          <span>نام کاربری دانش‌آموز</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <div className={styles.lookupRow}>
                          <input
                            id="parent_student_username"
                            name="student_username"
                            className="input"
                            type="text"
                            dir="ltr"
                            placeholder="@student_username"
                            value={parentForm.student_username}
                            onChange={(e) => {
                              setParentForm({ ...parentForm, student_username: e.target.value });
                              setStudentLookupError('');
                              setVerifiedStudent(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleLookupStudentByUsername();
                              }
                            }}
                            required
                          />
                          <button
                            type="button"
                            data-testid="verify-student-username-btn"
                            className={styles.lookupBtn}
                            onClick={handleLookupStudentByUsername}
                            disabled={studentLookupLoading}
                          >
                            <HiOutlineMagnifyingGlass />
                            <span>{studentLookupLoading ? 'بررسی...' : 'بررسی دانش‌آموز'}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {studentLookupError && (
                      <div className={styles.lookupError} data-testid="student-lookup-error">
                        {studentLookupError}
                      </div>
                    )}

                    {verifiedStudent && (
                      <div className={styles.verifiedSchoolCard} data-testid="verified-student-banner">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <HiOutlineCheckCircle style={{ fontSize: '1.3rem', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 900, fontSize: '0.9rem' }}>
                              دانش‌آموز تاییدشده: {verifiedStudent.full_name}
                            </div>
                            <div style={{ fontSize: '0.76rem', opacity: 0.9 }}>
                              مدرسه: {verifiedStudent.school_name || selectedSchool?.name || '—'}
                              {verifiedStudent.grade ? ` • پایه: ${verifiedStudent.grade}` : ''}
                            </div>
                          </div>
                        </div>
                        <bdi className={styles.usernamePill}>@{verifiedStudent.username}</bdi>
                      </div>
                    )}

                    {/* 6: Relation to Student (پدر، مادر، سایر موارد + conditional input & ثبت button) */}
                    <div className={styles.conditionalBox} data-testid="parent-relation-section">
                      <label className={styles.label}>
                        <HiOutlineUserGroup />
                        <span>نسبت با دانش‌آموز</span>
                        <span className={styles.requiredMark}>*</span>
                      </label>

                      <div className={styles.chipsGrid} data-testid="parent-relation-options">
                        {[
                          { key: 'father', label: 'پدر' },
                          { key: 'mother', label: 'مادر' },
                          { key: 'other', label: 'سایر موارد' },
                        ].map((opt) => {
                          const active = parentForm.relation_type === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              aria-pressed={active}
                              className={`${styles.choiceBtn} ${active ? styles.choiceBtnActive : ''}`}
                              onClick={() =>
                                setParentForm((prev) => ({
                                  ...prev,
                                  relation_type: opt.key,
                                  custom_relation: opt.key === 'other' ? prev.custom_relation : '',
                                  custom_relation_confirmed:
                                    opt.key === 'other' ? prev.custom_relation_confirmed : false,
                                }))
                              }
                            >
                              {active && <HiOutlineCheckCircle style={{ color: '#4f46e5' }} />}
                              <span>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {parentForm.relation_type === 'other' && (
                        <div
                          data-testid="custom-relation-box"
                          style={{
                            marginTop: '10px',
                            padding: '14px',
                            borderRadius: '14px',
                            background: 'var(--bg-card, #ffffff)',
                            border: '1.5px solid rgba(99, 102, 241, 0.25)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                          }}
                        >
                          <label className={styles.label} htmlFor="parent_custom_relation">
                            <span>لطفاً نسبت خود با دانش‌آموز را بنویسید</span>
                            <span className={styles.requiredMark}>*</span>
                          </label>
                          <input
                            id="parent_custom_relation"
                            name="custom_relation"
                            className="input"
                            type="text"
                            placeholder="مثلاً: پدربزرگ، مادربزرگ، برادر، خواهر، سرپرست قانونی..."
                            value={parentForm.custom_relation}
                            onChange={(e) =>
                              setParentForm((prev) => ({
                                ...prev,
                                custom_relation: e.target.value,
                                custom_relation_confirmed: false,
                              }))
                            }
                          />
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                            <button
                              type="button"
                              data-testid="confirm-custom-relation-btn"
                              className={styles.lookupBtn}
                              onClick={handleConfirmCustomRelation}
                            >
                              <HiOutlineCheckCircle />
                              <span>ثبت</span>
                            </button>
                            {parentForm.custom_relation_confirmed && parentForm.custom_relation.trim() && (
                              <span
                                data-testid="custom-relation-confirmed-badge"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontSize: '0.8rem',
                                  fontWeight: 800,
                                  color: '#047857',
                                  background: 'rgba(16, 185, 129, 0.12)',
                                  padding: '5px 12px',
                                  borderRadius: '999px',
                                }}
                              >
                                <HiOutlineCheckCircle />
                                <span>نسبت ثبت‌شده: {parentForm.custom_relation.trim()}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 7: Password */}
                  <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                      <span className={styles.stepNum}>۴</span>
                      <span>رمز عبور حساب کاربری</span>
                    </h2>

                    <div className={styles.gridTwo}>
                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="parent_password">
                          <HiOutlineLockClosed />
                          <span>رمز عبور</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <div className={styles.passwordWrap}>
                          <input
                            id="parent_password"
                            name="password"
                            className={`input ${styles.passwordInput}`}
                            type={showPassword ? 'text' : 'password'}
                            dir="ltr"
                            placeholder="حداقل ۶ کاراکتر"
                            value={parentForm.password}
                            onChange={(e) => setParentForm({ ...parentForm, password: e.target.value })}
                            required
                          />
                          <button
                            type="button"
                            className={styles.eyeBtn}
                            onClick={() => setShowPassword((p) => !p)}
                            aria-label={showPassword ? 'مخفی‌سازی رمز عبور' : 'نمایش رمز عبور'}
                          >
                            {showPassword ? <HiOutlineEyeSlash /> : <HiOutlineEye />}
                          </button>
                        </div>
                        <p className={styles.hint}>
                          اطلاعات شما در دیتابیس زیرمجموعه دانش‌آموز و مدرسه مربوطه ذخیره شده و با نام کاربری اختصاصی وارد می‌شوید.
                        </p>
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="parent_confirm_password">
                          <HiOutlineShieldCheck />
                          <span>تکرار رمز عبور</span>
                          <span className={styles.requiredMark}>*</span>
                        </label>
                        <input
                          id="parent_confirm_password"
                          name="confirm_password"
                          className="input"
                          type={showPassword ? 'text' : 'password'}
                          dir="ltr"
                          placeholder="تکرار رمز عبور"
                          value={parentForm.confirm_password}
                          onChange={(e) => setParentForm({ ...parentForm, confirm_password: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <button type="submit" className={styles.submitBtn} disabled={submitting}>
                    <span>{submitting ? 'در حال ثبت زیرمجموعه دانش‌آموز و صدور نام کاربری...' : 'ثبت‌نام نهایی اولیا و دریافت نام کاربری (آیدی) اختصاصی'}</span>
                    <HiOutlineArrowLeft />
                  </button>
                </form>
              )}

              {!selectedRole && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '18px',
                    borderRadius: '14px',
                    background: 'var(--bg-surface, #f8fafc)',
                    border: '1px dashed var(--border-color, #cbd5e1)',
                    color: 'var(--text-secondary, #64748b)',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                  }}
                >
                  برای شروع ثبت‌نام، روی یکی از سه گزینه «دانش‌آموز»، «معلم» یا «اولیا» در بالا کلیک کنید.
                </div>
              )}
            </>
          ) : (
            /* ── Success Screen Showing Exclusive Personal Username ── */
            <div className={styles.successWrap} data-testid="student-registration-success">
              <div className={styles.successBanner}>
                <div className={styles.successIcon}>
                  <HiOutlineCheckCircle />
                </div>
                <h1 className={styles.successTitle}>ثبت‌نام شما با موفقیت در دیتابیس ذخیره شد</h1>
                <p className={styles.successSub}>
                  نام کاربری انحصاری شما صادر گردید. دفعه بعد می‌توانید از بخش «ورود با نام کاربری» با همین نام کاربری و
                  رمز عبوری که تعیین کردید وارد پنل خود شوید.
                </p>
              </div>

              <div className={styles.usernameRevealCard}>
                <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
                  نام کاربری انحصاری شما جهت ورودهای بعدی:
                </span>
                <div className={styles.usernameRevealRow}>
                  <bdi className={styles.usernameValue} data-testid="generated-student-username">
                    @{registeredResult.user?.username}
                  </bdi>
                  <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => handleCopyUsername(registeredResult.user?.username)}
                  >
                    {copied ? <HiOutlineClipboardDocumentCheck /> : <HiOutlineClipboardDocument />}
                    <span>{copied ? 'کپی شد' : 'کپی نام کاربری'}</span>
                  </button>
                </div>
              </div>

              <div className={styles.summaryGrid}>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryKey}>اسم و فامیل</span>
                  <span className={styles.summaryVal}>
                    {registeredResult.parent?.full_name ||
                      registeredResult.teacher?.full_name ||
                      registeredResult.student?.full_name ||
                      registeredResult.user?.display_name}
                  </span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryKey}>شماره تماس</span>
                  <span className={styles.summaryVal} dir="ltr" style={{ textAlign: 'right' }}>
                    {registeredResult.parent?.phone ||
                      registeredResult.teacher?.phone ||
                      registeredResult.student?.phone ||
                      registeredResult.user?.phone}
                  </span>
                </div>
                {(registeredResult.school?.name ||
                  registeredResult.parent?.school_name ||
                  registeredResult.student?.school_name ||
                  registeredResult.teacher?.school_name) && (
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryKey}>مدرسه (زیرشاخه ثبت‌شده)</span>
                    <span className={styles.summaryVal}>
                      {registeredResult.parent?.school_name ||
                        registeredResult.student?.school_name ||
                        registeredResult.teacher?.school_name ||
                        registeredResult.school?.name}
                    </span>
                  </div>
                )}
                {registeredResult.parent?.student_name && (
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryKey}>دانش‌آموز متصل</span>
                    <span className={styles.summaryVal}>{registeredResult.parent.student_name}</span>
                  </div>
                )}
                {registeredResult.parent?.student_username && (
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryKey}>نام کاربری دانش‌آموز</span>
                    <span className={styles.summaryVal} dir="ltr" style={{ textAlign: 'right' }}>
                      <bdi>@{registeredResult.parent.student_username}</bdi>
                    </span>
                  </div>
                )}
                {registeredResult.parent?.relation && (
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryKey}>نسبت با دانش‌آموز</span>
                    <span className={styles.summaryVal}>{registeredResult.parent.relation}</span>
                  </div>
                )}
                {!registeredResult.parent &&
                  (registeredResult.student?.education_level || registeredResult.teacher?.education_level) && (
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryKey}>
                        {registeredResult.teacher ? 'مقطع تحصیلی تدریس' : 'مقطع تحصیلی'}
                      </span>
                      <span className={styles.summaryVal}>
                        {registeredResult.student?.education_level || registeredResult.teacher?.education_level}
                      </span>
                    </div>
                  )}
                {!registeredResult.parent && registeredResult.student?.major && (
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryKey}>رشته تحصیلی</span>
                    <span className={styles.summaryVal}>{registeredResult.student.major}</span>
                  </div>
                )}
                {Array.isArray(registeredResult.teacher?.majors) && registeredResult.teacher.majors.length > 0 && (
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryKey}>رشته‌های تدریس</span>
                    <span className={styles.summaryVal}>{registeredResult.teacher.majors.join('، ')}</span>
                  </div>
                )}
                {!registeredResult.parent && registeredResult.student?.grade && (
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryKey}>پایه تحصیلی</span>
                    <span className={styles.summaryVal}>{registeredResult.student.grade}</span>
                  </div>
                )}
                {Array.isArray(registeredResult.teacher?.taught_grades) &&
                  registeredResult.teacher.taught_grades.length > 0 && (
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryKey}>پایه‌های تدریس</span>
                      <span className={styles.summaryVal}>
                        {registeredResult.teacher.taught_grades.join('، ')}
                      </span>
                    </div>
                  )}
                {!registeredResult.parent && registeredResult.user?.student_code && (
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryKey}>کد اختصاصی دانش‌آموزی</span>
                    <span className={styles.summaryVal} dir="ltr" style={{ textAlign: 'right' }}>
                      {registeredResult.user.student_code}
                    </span>
                  </div>
                )}
                {(registeredResult.teacher?.personnel_code || registeredResult.user?.personnel_code) && (
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryKey}>کد پرسنلی معلم</span>
                    <span className={styles.summaryVal} dir="ltr" style={{ textAlign: 'right' }}>
                      {registeredResult.teacher?.personnel_code || registeredResult.user?.personnel_code}
                    </span>
                  </div>
                )}
              </div>

              <div className={styles.actionsRow}>
                <button
                  type="button"
                  className={styles.submitBtn}
                  style={{ flex: 1 }}
                  onClick={() =>
                    router.push(registeredResult.student ? '/dashboard/select-teachers/' : '/dashboard/')
                  }
                >
                  <span>
                    {registeredResult.student ? 'انتخاب معلمان و ورود به پنل دانش‌آموز' : 'ورود به پنل کاربری'}
                  </span>
                  <HiOutlineArrowLeft />
                </button>
                <Link href="/login/" className={styles.secondaryBtn}>
                  ورود با نام کاربری
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
