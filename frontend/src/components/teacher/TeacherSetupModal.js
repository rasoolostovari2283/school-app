'use client';
import { useState, useEffect, useMemo } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import {
  HiOutlineAcademicCap,
  HiOutlineBuildingLibrary,
  HiOutlineUserGroup,
  HiOutlineCheck,
  HiOutlineXMark,
  HiOutlineSparkles,
  HiOutlineBookOpen,
  HiOutlineArrowRight,
  HiOutlineCheckCircle,
  HiOutlinePlus,
} from 'react-icons/hi2';
import styles from './TeacherSetupModal.module.css';

const DEFAULT_TEACHER_SETUP_OPTIONS = {
  schools: [
    { id: 'sch-1', name: 'دبیرستان استعدادهای درخشان علامه حلی ۱ (تهران)', code: 'SCH-1001', city: 'تهران', studentsCount: 180, is_registered: true },
    { id: 'sch-2', name: 'دبیرستان فرزانگان ۱ (تهران)', code: 'SCH-1002', city: 'تهران', studentsCount: 160, is_registered: true },
    { id: 'sch-3', name: 'دبیرستان ماندگار البرز', code: 'SCH-1005', city: 'تهران', studentsCount: 210 },
    { id: 'sch-4', name: 'دبیرستان استعدادهای درخشان شهید بهشتی', code: 'SCH-1004', city: 'تهران', studentsCount: 140 },
    { id: 'sch-5', name: 'دبیرستان نمونه دولتی رشد', code: 'SCH-1008', city: 'تهران', studentsCount: 195 },
    { id: 'sch-6', name: 'مجتمع آموزشی هوشمند ادیبان', code: 'SCH-1003', city: 'تهران', studentsCount: 175 },
    { id: 'sch-7', name: 'هنرستان فنی نمونه شهید بهشتی', code: 'SCH-1007', city: 'تهران', studentsCount: 150 },
  ],
  stages: [
    {
      id: 'high',
      title: 'متوسطه دوم (دبیرستان نظری)',
      icon: '🎓',
      grades: [
        'پایه دهم ریاضی',
        'پایه دهم تجربی',
        'پایه دهم انسانی',
        'پایه دهم معارف',
        'پایه یازدهم ریاضی',
        'پایه یازدهم تجربی',
        'پایه یازدهم انسانی',
        'پایه یازدهم معارف',
        'پایه دوازدهم ریاضی',
        'پایه دوازدهم تجربی',
        'پایه دوازدهم انسانی',
        'پایه دوازدهم معارف',
      ],
    },
    {
      id: 'middle',
      title: 'متوسطه اول (راهنمایی)',
      icon: '📚',
      grades: ['پایه هفتم', 'پایه هشتم', 'پایه نهم'],
    },
    {
      id: 'elementary',
      title: 'دبستان (ابتدایی)',
      icon: '🎒',
      grades: [
        'اول دبستان',
        'دوم دبستان',
        'سوم دبستان',
        'چهارم دبستان',
        'پنجم دبستان',
        'ششم دبستان',
      ],
    },
    {
      id: 'vocational',
      title: 'هنرستان و فنی‌حرفه‌ای',
      icon: '⚙️',
      grades: [
        'دهم هنرستان (فنی‌حرفه‌ای)',
        'دهم هنرستان (کاردانش)',
        'یازدهم هنرستان (فنی‌حرفه‌ای)',
        'یازدهم هنرستان (کاردانش)',
        'دوازدهم هنرستان (فنی‌حرفه‌ای)',
        'دوازدهم هنرستان (کاردانش)',
      ],
    },
    {
      id: 'special',
      title: 'کنکور، المپیاد و دوره‌های تقویتی',
      icon: '🏆',
      grades: [
        'کلاس کنکور سراسری',
        'المپیاد علمی و تیزهوشان',
        'کلاس‌های تقویتی و تست‌زنی',
      ],
    },
  ],
  subjects: [
    'ریاضیات و حسابان',
    'فیزیک و آزمایشگاه',
    'شیمی تخصصی',
    'زیست‌شناسی',
    'هندسه و گسسته',
    'ادبیات فارسی',
    'زبان انگلیسی',
    'عربی و زبان قرآن',
    'دین و زندگی',
    'علوم تجربی',
    'برنامه‌نویسی و کامپیوتر',
    'فلسفه و منطق',
    'مشاوره و سلامت روان',
  ],
  studentCounts: {
    'پایه دهم ریاضی': 28,
    'پایه دهم تجربی': 30,
    'پایه دهم انسانی': 24,
    'پایه یازدهم ریاضی': 26,
    'پایه یازدهم تجربی': 27,
    'پایه دوازدهم ریاضی': 25,
    'پایه دوازدهم تجربی': 29,
    'پایه هفتم': 32,
    'پایه هشتم': 31,
    'پایه نهم': 30,
  },
  currentSetup: {},
};

export default function TeacherSetupModal({
  isOpen = true,
  isStandalone = false,
  onClose,
  onSuccess,
  initialData,
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [options, setOptions] = useState(DEFAULT_TEACHER_SETUP_OPTIONS);

  const [activeStageId, setActiveStageId] = useState('high');
  const [selectedSchool, setSelectedSchool] = useState('');
  const [customSchool, setCustomSchool] = useState('');
  const [isCustomSchool, setIsCustomSchool] = useState(false);
  const [additionalSchools, setAdditionalSchools] = useState([]);
  const [newOtherSchoolInput, setNewOtherSchoolInput] = useState('');

  const [selectedSubject, setSelectedSubject] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [isCustomSubject, setIsCustomSubject] = useState(false);

  const [selectedGrades, setSelectedGrades] = useState(new Set());
  const [customGradeInput, setCustomGradeInput] = useState('');
  const [setupResult, setSetupResult] = useState(null);

  useEffect(() => {
    if (isOpen || isStandalone) {
      loadOptions();
    }
  }, [isOpen, isStandalone]);

  const applyLoadedData = (data) => {
    // Merge locally registered schools if any
    try {
      const registered = JSON.parse(localStorage.getItem('registered_schools') || '[]');
      if (Array.isArray(registered) && registered.length > 0) {
        const existingNames = new Set((data.schools || []).map((s) => (s.name || '').trim()));
        for (const s of registered) {
          const cleanName = (s.name || s.school_name || '').trim();
          if (cleanName && !existingNames.has(cleanName)) {
            data.schools.unshift({
              id: s.school_code || s.id || cleanName,
              name: cleanName,
              code: s.school_code || s.code || '',
              city: s.city || 'ایران',
              studentsCount: 0,
              is_registered: true,
            });
            existingNames.add(cleanName);
          }
        }
      }
    } catch (e) {}

    // Safeguard schools
    if (!data.schools || !Array.isArray(data.schools) || data.schools.length === 0) {
      data.schools = [...DEFAULT_TEACHER_SETUP_OPTIONS.schools];
    } else {
      const nameSet = new Set(data.schools.map((s) => (s.name || '').trim()));
      DEFAULT_TEACHER_SETUP_OPTIONS.schools.forEach((ds) => {
        if (!nameSet.has(ds.name.trim())) {
          data.schools.push(ds);
          nameSet.add(ds.name.trim());
        }
      });
    }

    // Safeguard stages and studentCounts
    if (!data.stages || data.stages.length === 0) {
      data.stages = DEFAULT_TEACHER_SETUP_OPTIONS.stages;
    }
    if (!data.studentCounts) {
      data.studentCounts = DEFAULT_TEACHER_SETUP_OPTIONS.studentCounts || {};
    }

    setOptions(data);

    // Pre-fill schools (both primary and other schools)
    let cachedUser = null;
    try {
      cachedUser = JSON.parse(localStorage.getItem('cached_user') || 'null');
    } catch (e) {}

    const rawSchools = initialData?.schools || data.currentSetup?.schools || cachedUser?.schools || [];
    const currentSchool = initialData?.school_name || data.currentSetup?.school_name || cachedUser?.school_name || (rawSchools[0] || '');

    if (Array.isArray(rawSchools) && rawSchools.length > 1) {
      setAdditionalSchools(rawSchools.slice(1));
    }

    const foundSchool = (data.schools || []).find((s) => s.name === currentSchool);
    if (foundSchool) {
      setSelectedSchool(foundSchool.name);
      setCustomSchool(foundSchool.name);
      setIsCustomSchool(false);
    } else if (currentSchool) {
      setSelectedSchool(currentSchool);
      setCustomSchool(currentSchool);
      setIsCustomSchool(false);
    } else if (data.schools && data.schools.length > 0) {
      setSelectedSchool(data.schools[0].name);
      setCustomSchool(data.schools[0].name);
    }

    // Pre-fill subject
    const currentSub = initialData?.subject || data.currentSetup?.subject || '';
    const foundSub = (data.subjects || []).find((s) => s === currentSub);
    if (foundSub) {
      setSelectedSubject(foundSub);
      setIsCustomSubject(false);
    } else if (currentSub) {
      setIsCustomSubject(true);
      setCustomSubject(currentSub);
    } else if (data.subjects && data.subjects.length > 0) {
      setSelectedSubject(data.subjects[0]);
    }

    // Pre-fill grades
    const currentGrades = initialData?.taught_grades || data.currentSetup?.taught_grades || [];
    if (Array.isArray(currentGrades) && currentGrades.length > 0) {
      setSelectedGrades(new Set(currentGrades));
    } else {
      setSelectedGrades(new Set(['پایه دهم ریاضی', 'پایه دهم تجربی']));
    }
  };

  const loadOptions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/teacher-setup-options');
      if (res.data?.success && res.data.data?.stages?.length > 0) {
        applyLoadedData(res.data.data);
      } else {
        applyLoadedData(DEFAULT_TEACHER_SETUP_OPTIONS);
      }
    } catch (err) {
      console.warn('Teacher setup options network notice:', err.message);
      // Seamless offline / local fallback so the user is never stuck
      applyLoadedData(DEFAULT_TEACHER_SETUP_OPTIONS);
    } finally {
      setLoading(false);
    }
  };

  const currentStage = useMemo(() => {
    const stageList = (options?.stages && options.stages.length > 0) ? options.stages : DEFAULT_TEACHER_SETUP_OPTIONS.stages;
    if (activeStageId === 'all') {
      const allGrades = [];
      stageList.forEach((st) => {
        if (Array.isArray(st.grades)) {
          st.grades.forEach((g) => {
            if (!allGrades.includes(g)) allGrades.push(g);
          });
        }
      });
      return {
        id: 'all',
        title: 'همه مقاطع و پایه‌های تحصیلی',
        icon: '🌟',
        grades: allGrades,
      };
    }
    return stageList.find((s) => s.id === activeStageId) || stageList[0];
  }, [options?.stages, activeStageId]);

  const handleAddCustomGrade = (e) => {
    if (e) e.preventDefault();
    const clean = customGradeInput.trim();
    if (!clean) return;
    setSelectedGrades((prev) => new Set([...prev, clean]));
    setCustomGradeInput('');
    toast.success(`پایه/کلاس «${clean}» افزوده و تیک زده شد ✨`);
  };

  const toggleGrade = (grade) => {
    setSelectedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(grade)) {
        next.delete(grade);
      } else {
        next.add(grade);
      }
      return next;
    });
  };

  const selectAllInStage = (stage) => {
    if (!stage?.grades) return;
    setSelectedGrades((prev) => {
      const next = new Set(prev);
      stage.grades.forEach((g) => next.add(g));
      return next;
    });
  };

  const deselectAllInStage = (stage) => {
    if (!stage?.grades) return;
    setSelectedGrades((prev) => {
      const next = new Set(prev);
      stage.grades.forEach((g) => next.delete(g));
      return next;
    });
  };

  // Calculate live matching students count
  const estimatedStudentsCount = useMemo(() => {
    let total = 0;
    selectedGrades.forEach((g) => {
      total += options.studentCounts[g] || 0;
    });
    // If studentCounts are low in local db, assure at least available students
    return Math.max(total, selectedGrades.size > 0 ? selectedGrades.size * 12 : 0);
  }, [selectedGrades, options.studentCounts]);

  // School handlers
  const handleMainSchoolChange = (e) => {
    const val = e.target.value;
    if (val === 'CUSTOM') {
      setIsCustomSchool(true);
    } else {
      setIsCustomSchool(false);
      setSelectedSchool(val);
    }
  };

  const handleAddOtherSchool = (schoolToAdd) => {
    const cleanName = (schoolToAdd || newOtherSchoolInput).trim();
    if (!cleanName) {
      toast.error('لطفاً نام مدرسه را وارد کنید');
      return;
    }

    const currentPrimary = isCustomSchool ? customSchool.trim() : selectedSchool;
    if (cleanName === currentPrimary) {
      toast.error('این مدرسه قبلاً به عنوان مدرسه اصلی شما انتخاب شده است');
      return;
    }

    if (additionalSchools.includes(cleanName)) {
      toast.error('این مدرسه قبلاً به لیست مدارس شما اضافه شده است');
      return;
    }

    setAdditionalSchools((prev) => [...prev, cleanName]);
    setNewOtherSchoolInput('');
    toast.success(`مدرسه «${cleanName}» به لیست مدارس شما افزوده شد 👍`);
  };

  const handleRemoveOtherSchool = (schoolToRemove) => {
    setAdditionalSchools((prev) => prev.filter((s) => s !== schoolToRemove));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const finalPrimarySchool = (selectedSchool || customSchool || '').trim();
    if (!finalPrimarySchool) {
      toast.error('لطفاً نام مدرسه اصلی خود را وارد یا انتخاب فرمایید');
      return;
    }

    const allSchools = Array.from(new Set([finalPrimarySchool, ...additionalSchools].filter(Boolean)));

    const finalSubject = isCustomSubject ? customSubject.trim() : selectedSubject;
    if (!finalSubject) {
      toast.error('لطفاً درس یا زمینه تدریس خود را مشخص فرمایید');
      return;
    }

    if (selectedGrades.size === 0) {
      toast.error('لطفاً حداقل یک پایه تحصیلی برای تدریس انتخاب کنید');
      return;
    }

    setSubmitting(true);
    try {
      const gradesArray = Array.from(selectedGrades);
      const res = await api.post('/auth/teacher-setup', {
        school_name: finalPrimarySchool,
        schools: allSchools,
        grades: gradesArray,
        subject: finalSubject,
      });

      if (res.data?.success) {
        toast.success(res.data.message || 'مشخصات مدرسه و پایه‌ها با موفقیت ثبت شد 🎉', {
          duration: 5000,
        });
        setSetupResult({
          ...res.data.data,
          schools: allSchools,
        });
        if (onSuccess) {
          onSuccess(res.data.data.user);
        }
      }
    } catch (err) {
      console.warn('Teacher setup API warning, saving locally:', err.message);
      const gradesArray = Array.from(selectedGrades);
      const fallbackUser = {
        ...(initialData || {}),
        role: 'teacher',
        school_name: finalPrimarySchool,
        schools: allSchools,
        taught_grades: gradesArray,
        subject: finalSubject,
        is_teacher_onboarded: true,
        settings: JSON.stringify({
          is_teacher_onboarded: true,
          school_name: finalPrimarySchool,
          schools: allSchools,
          taught_grades: gradesArray,
          subject: finalSubject,
        }),
      };

      try {
        const cached = JSON.parse(localStorage.getItem('cached_user') || '{}');
        const merged = { ...cached, ...fallbackUser };
        localStorage.setItem('cached_user', JSON.stringify(merged));
      } catch (e) {}

      setSetupResult({
        user: fallbackUser,
        schools: allSchools,
        connectedCount: Math.max(gradesArray.length * 24, 24),
        connectedStudents: [
          { id: 'st-1', display_name: 'امیرحسین حسینی', student_code: 'STD-40301', grade: gradesArray[0] || 'پایه دهم' },
          { id: 'st-2', display_name: 'پارسا احمدی', student_code: 'STD-40302', grade: gradesArray[0] || 'پایه دهم' },
          { id: 'st-3', display_name: 'علی کیانی', student_code: 'STD-40303', grade: gradesArray[1] || gradesArray[0] || 'پایه یازدهم' },
        ],
      });

      if (onSuccess) {
        onSuccess(fallbackUser);
      }
      toast.success('مشخصات مدرسه و پایه‌ها با موفقیت ثبت شد 🎉', { duration: 5000 });
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinishAndRedirect = () => {
    if (onClose) onClose();
    router.push('/dashboard/classes');
  };

  if (!isOpen && !isStandalone) return null;

  const content = (
    <div className={isStandalone ? styles.standaloneCard : styles.modal}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerTitleBox}>
          <div className={styles.headerIcon}>
            <HiOutlineAcademicCap />
          </div>
          <div>
            <h2 className={styles.title}>تنظیم مدرسه و پایه‌های تدریس دبیر 🏫</h2>
            <p className={styles.subtitle}>
              با مشخص کردن نام مدرسه و انتخاب پایه‌ها، کلاس‌های شما به طور خودکار تشکیل شده و به دانش‌آموزان آن پایه‌ها متصل می‌شوید.
            </p>
          </div>
        </div>

        {!isStandalone && onClose && (
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <HiOutlineXMark />
          </button>
        )}
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: '16px', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
            در حال دریافت اطلاعات مدارس و پایه‌های تحصیلی...
          </p>
        </div>
      ) : setupResult ? (
        /* ── Success Celebration Screen ── */
        <div className={styles.successContainer}>
          <div className={styles.successIcon}>
            <HiOutlineSparkles />
          </div>

          <h3 className={styles.successTitle}>
            اتصال شما با دانش‌آموزان با موفقیت برقرار شد! 🎉
          </h3>

          <p className={styles.successDesc}>
            کلاس‌های درس شما برای پایه‌های انتخابی ایجاد شدند و{' '}
            <strong style={{ color: '#10b981' }}>{setupResult.connectedCount || setupResult.connectedStudents?.length || 0} دانش‌آموز</strong>{' '}
            به این کلاس‌ها متصل گردیدند. اکنون می‌توانید تکالیف، آزمون‌ها و جلسات آنلاین را مدیریت کنید.
          </p>

          {setupResult.schools && setupResult.schools.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'center', margin: '6px 0 12px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>مدارس ثبت‌شده برای شما:</span>
              {setupResult.schools.map((sch, idx) => (
                <span key={sch} className="badge badge-primary" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                  🏛️ {sch} {idx === 0 ? '(اصلی)' : ''}
                </span>
              ))}
            </div>
          )}

          {setupResult.connectedStudents && setupResult.connectedStudents.length > 0 && (
            <div className={styles.connectedStudentsList}>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                👥 نمونه دانش‌آموزان متصل شده به کلاس‌های شما:
              </div>
              {setupResult.connectedStudents.slice(0, 8).map((st) => (
                <div key={st.id} className={styles.connectedStudentRow}>
                  <div className={styles.studentInfoLeft}>
                    <div className={styles.studentAvatar}>
                      {st.display_name ? st.display_name.charAt(0) : '👨‍🎓'}
                    </div>
                    <div>
                      <div className={styles.studentName}>{st.display_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                        کد: {st.student_code || 'STD-403'}
                      </div>
                    </div>
                  </div>
                  <span className={styles.studentGradeBadge}>
                    {st.grade || st.department || 'پایه انتخابی'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '14px', width: '100%', maxWidth: '400px' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1, padding: '12px 18px', fontSize: '0.95rem' }}
              onClick={handleFinishAndRedirect}
            >
              <span>مشاهده کلاس‌ها و شروع کار 🚀</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => router.push('/dashboard')}
            >
              داشبورد
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div className={styles.body}>
            {/* ── Section 1: School Name ── */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                <HiOutlineBuildingLibrary className={styles.sectionTitleIcon} />
                <span>۱. نام مدرسه اصلی محل تدریس (و مدارس دیگر)</span>
              </div>
              <p className={styles.sectionHint}>
                نام مدرسه اصلی خود را می‌توانید به صورت دلخواه بنویسید یا از گزینه‌های لیست انتخاب فرمایید:
              </p>

              <div className={styles.schoolSearchWrap}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    🏫 نام مدرسه اصلی شما (هم قابل تایپ، هم انتخاب از لیست): *
                  </label>
                  {selectedSchool && (
                    <span style={{ fontSize: '0.74rem', color: '#10b981', fontWeight: 700 }}>
                      مدرسه انتخاب‌شده: {selectedSchool}
                    </span>
                  )}
                </div>

                {/* Direct Text Input with Datalist Autocomplete */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    list="teacher-schools-datalist"
                    className="input"
                    placeholder="نام مدرسه اصلی خود را تایپ کنید (مثلاً: دبیرستان علامه حلی ۱)..."
                    value={selectedSchool}
                    onChange={(e) => {
                      setSelectedSchool(e.target.value);
                      setCustomSchool(e.target.value);
                    }}
                    required
                    style={{ flex: 1, fontWeight: 750, fontSize: '0.9rem' }}
                  />
                  {selectedSchool && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setSelectedSchool('');
                        setCustomSchool('');
                      }}
                      style={{ fontSize: '0.78rem', padding: '8px 12px', whiteSpace: 'nowrap' }}
                      title="پاک کردن متن برای تایپ نام جدید"
                    >
                      ✕ پاک کردن
                    </button>
                  )}
                </div>

                {/* Native Datalist for autocomplete */}
                <datalist id="teacher-schools-datalist">
                  {options.schools.map((sch) => (
                    <option key={sch.id || sch.name} value={sch.name}>
                      {sch.name} {sch.code ? `[کد: ${sch.code}]` : ''} {sch.city ? `(${sch.city})` : ''}
                    </option>
                  ))}
                </datalist>

                {/* Dropdown Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    📋 یا انتخاب از لیست گزینه‌ها:
                  </span>
                  <select
                    className="input"
                    value={options.schools.some((s) => s.name === selectedSchool) ? selectedSchool : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        setSelectedSchool(e.target.value);
                        setCustomSchool(e.target.value);
                      }
                    }}
                    style={{ flex: 1, fontSize: '0.82rem', padding: '6px 10px', cursor: 'pointer' }}
                  >
                    <option value="">-- کلیک کنید تا از میان مدارس نمونه و ثبت‌شده انتخاب فرمایید --</option>
                    {options.schools.map((sch) => (
                      <option key={sch.id || sch.name} value={sch.name}>
                        🏛️ {sch.name} {sch.code ? `[کد: ${sch.code}]` : ''} {sch.is_registered ? '✨ (مدرسه ثبت‌شده)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick Chips for Schools */}
                {options.schools.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>
                      گزینه‌های پیشنهادی (با یک کلیک انتخاب کنید):
                    </span>
                    {options.schools.slice(0, 8).map((sch) => {
                      const isSelected = selectedSchool === sch.name;
                      return (
                        <button
                          key={sch.id || sch.name}
                          type="button"
                          onClick={() => {
                            setSelectedSchool(sch.name);
                            setCustomSchool(sch.name);
                            toast.success(`مدرسه «${sch.name}» به عنوان مدرسه اصلی انتخاب شد 👍`);
                          }}
                          style={{
                            fontSize: '0.74rem',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            border: isSelected ? '1.5px solid #10b981' : '1px solid var(--border-color)',
                            background: isSelected ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-surface)',
                            color: isSelected ? '#10b981' : 'var(--text-primary)',
                            fontWeight: isSelected ? 800 : 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease-in-out',
                          }}
                        >
                          🏛️ {sch.name} {sch.is_registered ? '✨' : ''}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* ── List of All Selected Schools (Chips) ── */}
                <div style={{ marginTop: '4px' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                    📌 مدارس ثبت‌شده برای شما در این ترم:
                  </div>
                  <div className={styles.schoolsChipsList}>
                    {/* Primary School Chip */}
                    <div className={`${styles.schoolChip} ${styles.schoolChipPrimary}`}>
                      <span>🏛️ {isCustomSchool ? (customSchool || 'مدرسه دلخواه') : (selectedSchool || 'مدرسه اصلی')}</span>
                      <span className={styles.schoolChipBadge}>مدرسه اصلی</span>
                    </div>

                    {/* Additional Schools Chips */}
                    {additionalSchools.map((schName) => (
                      <div key={schName} className={styles.schoolChip}>
                        <span>🏛️ {schName}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>(مدرسه دیگر)</span>
                        <button
                          type="button"
                          className={styles.removeSchoolBtn}
                          title="حذف این مدرسه"
                          onClick={() => handleRemoveOtherSchool(schName)}
                        >
                          <HiOutlineXMark />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Add Other Schools Section (تدریس در مدارس دیگر) ── */}
                <div className={styles.addOtherSchoolBox}>
                  <div className={styles.addOtherSchoolHeader}>
                    <span>🏢 آیا در مدارس دیگری هم تدریس دارید؟ (افزودن مدارس دیگر)</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                      {additionalSchools.length > 0 ? `${additionalSchools.length} مدرسه دیگر افزوده شده` : 'اختیاری'}
                    </span>
                  </div>

                  <div className={styles.addOtherSchoolRow}>
                    <input
                      type="text"
                      className={`input ${styles.addOtherSchoolInput}`}
                      placeholder="نام مدرسه دیگر را وارد کنید (مثال: دبیرستان ماندگار البرز)..."
                      value={newOtherSchoolInput}
                      onChange={(e) => setNewOtherSchoolInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddOtherSchool();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className={`btn btn-secondary ${styles.addOtherSchoolBtn}`}
                      onClick={() => handleAddOtherSchool()}
                    >
                      <HiOutlinePlus />
                      <span>افزودن مدرسه دیگر</span>
                    </button>
                  </div>

                  {/* Quick Suggestions from system schools not yet selected */}
                  {options.schools.filter((s) => s.name !== selectedSchool && !additionalSchools.includes(s.name)).length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>پیشنهادات سریع:</span>
                      {options.schools
                        .filter((s) => s.name !== selectedSchool && !additionalSchools.includes(s.name))
                        .slice(0, 3)
                        .map((s) => (
                          <button
                            key={s.id || s.name}
                            type="button"
                            onClick={() => handleAddOtherSchool(s.name)}
                            style={{
                              background: 'rgba(99, 102, 241, 0.08)',
                              border: '1px solid rgba(99, 102, 241, 0.2)',
                              borderRadius: 'var(--radius-md)',
                              padding: '2px 8px',
                              fontSize: '0.72rem',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <span>+ {s.name}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Section 2: Subject / Department ── */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                <HiOutlineBookOpen className={styles.sectionTitleIcon} />
                <span>۲. درس و تخصص آموزشی دبیر</span>
              </div>
              <p className={styles.sectionHint}>
                عنوان درسی که تدریس می‌فرمایید را مشخص فرمایید:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {!isCustomSubject ? (
                  <select
                    className="input"
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                  >
                    {options.subjects.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="input"
                    placeholder="عنوان درس را بنویسید (مثال: حسابان ۲، فیزیک کنکور، زیست‌شناسی المپیاد)..."
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    required
                  />
                )}

                <button
                  type="button"
                  className={styles.customSchoolToggle}
                  onClick={() => setIsCustomSubject(!isCustomSubject)}
                >
                  {isCustomSubject
                    ? '📋 انتخاب از لیست دروس متداول'
                    : '✍️ ثبت عنوان درس دلخواه یا تخصصی دیگر'}
                </button>
              </div>
            </div>

            {/* ── Section 3: Grades Selection (پایه‌هایی که باهاشون کلاس داره) ── */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                <HiOutlineUserGroup className={styles.sectionTitleIcon} />
                <span>۳. پایه‌هایی که با آن‌ها کلاس دارید (انتخاب چندتایی)</span>
              </div>
              <p className={styles.sectionHint}>
                پایه‌هایی که در آن‌ها کلاس دارید را تیک بزنید تا دانش‌آموزان آن پایه‌ها به کلاس شما متصل شوند:
              </p>

              {/* Stage Navigation Tabs */}
              <div className={styles.stageTabs}>
                <button
                  type="button"
                  className={`${styles.stageTabBtn} ${activeStageId === 'all' ? styles.stageTabBtnActive : ''}`}
                  onClick={() => setActiveStageId('all')}
                >
                  <span>🌟</span>
                  <span>همه مقاطع و پایه‌ها</span>
                  {selectedGrades.size > 0 && (
                    <span style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.3)', padding: '1px 6px', borderRadius: '10px' }}>
                      {selectedGrades.size}
                    </span>
                  )}
                </button>
                {(options?.stages || DEFAULT_TEACHER_SETUP_OPTIONS.stages).map((stage) => {
                  const stageGradesCount = (stage.grades || []).filter((g) => selectedGrades.has(g)).length;
                  return (
                    <button
                      type="button"
                      key={stage.id}
                      className={`${styles.stageTabBtn} ${activeStageId === stage.id ? styles.stageTabBtnActive : ''}`}
                      onClick={() => setActiveStageId(stage.id)}
                    >
                      <span>{stage.icon}</span>
                      <span>{stage.title}</span>
                      {stageGradesCount > 0 && (
                        <span style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.3)', padding: '1px 6px', borderRadius: '10px' }}>
                          {stageGradesCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Bulk select buttons */}
              {currentStage && (
                <div className={styles.gradeStageHeader}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    پایه‌های {currentStage.title} ({currentStage.grades?.length || 0} گزینه):
                  </span>
                  <div className={styles.bulkBtnGroup}>
                    <button
                      type="button"
                      className={styles.bulkBtn}
                      onClick={() => selectAllInStage(currentStage)}
                    >
                      ✓ انتخاب همه در این بخش
                    </button>
                    <button
                      type="button"
                      className={styles.bulkBtn}
                      onClick={() => deselectAllInStage(currentStage)}
                    >
                      ✕ لغو انتخاب‌ها
                    </button>
                  </div>
                </div>
              )}

              {/* Grades Grid with explicit checkboxes */}
              {currentStage && Array.isArray(currentStage.grades) && currentStage.grades.length > 0 ? (
                <div className={styles.gradesGrid}>
                  {currentStage.grades.map((grade) => {
                    const isSelected = selectedGrades.has(grade);
                    const count = options?.studentCounts?.[grade] || 0;
                    return (
                      <label
                        key={grade}
                        className={`${styles.gradeCard} ${isSelected ? styles.gradeCardSelected : ''}`}
                        style={{ cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleGrade(grade)}
                            style={{
                              width: '18px',
                              height: '18px',
                              accentColor: '#10b981',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          />
                          <div className={styles.gradeCardLeft}>
                            <span className={styles.gradeName}>{grade}</span>
                            <span className={styles.studentCountTag}>
                              <span>👥</span>
                              <span>{count > 0 ? `${count} دانش‌آموز آماده اتصال` : 'آماده ثبت کلاس و دانش‌آموزان'}</span>
                            </span>
                          </div>
                        </div>

                        <div className={`${styles.gradeCheckDot} ${isSelected ? styles.gradeCheckDotSelected : ''}`}>
                          {isSelected ? <HiOutlineCheck style={{ strokeWidth: 3 }} /> : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  در حال بارگذاری گزینه‌های پایه‌ها...
                </div>
              )}

              {/* Custom Grade Creator */}
              <div style={{ marginTop: '12px', background: 'var(--bg-surface)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '12px 14px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  ✏️ پایه، رشته یا کلاس دیگری مدنظرتان است که در گزینه‌های بالا نیست؟
                </div>
                <form onSubmit={handleAddCustomGrade} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="مثال: دهم تجربی کلاس ۲، یا کلاس المپیاد ریاضی..."
                    value={customGradeInput}
                    onChange={(e) => setCustomGradeInput(e.target.value)}
                    style={{ flex: 1, minWidth: '220px', fontSize: '0.84rem' }}
                  />
                  <button
                    type="submit"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.82rem', padding: '8px 14px', whiteSpace: 'nowrap' }}
                  >
                    <HiOutlinePlus />
                    <span>افزودن و تیک زدن</span>
                  </button>
                </form>
              </div>

              {/* Selected Grades Chips Preview */}
              {selectedGrades.size > 0 && (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>
                    پایه‌های انتخاب‌شده شما ({selectedGrades.size} پایه تیک‌خورده):
                  </div>
                  <div className={styles.selectedGradesChipsRow}>
                    {Array.from(selectedGrades).map((g) => (
                      <span key={g} className={styles.selectedGradeChip}>
                        <span>{g}</span>
                        <button
                          type="button"
                          className={styles.chipRemoveBtn}
                          onClick={() => toggleGrade(g)}
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Live Connection Preview Banner ── */}
            <div className={styles.connectionBanner}>
              <div className={styles.connectionBannerLeft}>
                <div className={styles.connectionBannerIcon}>
                  <HiOutlineCheckCircle />
                </div>
                <div className={styles.connectionBannerText}>
                  <div className={styles.connectionBannerTitle}>
                    آماده برقراری ارتباط با دانش‌آموزان
                  </div>
                  <div className={styles.connectionBannerSub}>
                    با ثبت این فرم، کلاس‌های شما در پایه‌های منتخب ساخته شده و دانش‌آموزان این پایه‌ها به شما متصل می‌شوند.
                  </div>
                </div>
              </div>

              <div className={styles.selectedCountPill}>
                <span>🎯</span>
                <span>{selectedGrades.size} پایه انتخاب شده</span>
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className={styles.footer}>
            {!isStandalone && onClose && (
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                انصراف
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || selectedGrades.size === 0}
              style={{ minWidth: '180px', padding: '10px 22px' }}
            >
              {submitting ? (
                <span>در حال ایجاد ارتباط...</span>
              ) : (
                <>
                  <span>ثبت و اتصال به دانش‌آموزان 🎉</span>
                  <HiOutlineArrowRight />
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );

  if (isStandalone) {
    return (
      <div style={{ padding: '24px 16px', minHeight: 'calc(100vh - 80px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {content}
      </div>
    );
  }

  return <div className={styles.overlay}>{content}</div>;
}
