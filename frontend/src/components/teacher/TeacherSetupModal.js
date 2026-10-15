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
  const [options, setOptions] = useState({
    schools: [],
    stages: [],
    subjects: [],
    studentCounts: {},
    totalStudentsInSchool: 0,
    currentSetup: {},
  });

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
  const [setupResult, setSetupResult] = useState(null);

  useEffect(() => {
    if (isOpen || isStandalone) {
      loadOptions();
    }
  }, [isOpen, isStandalone]);

  const loadOptions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/teacher-setup-options');
      if (res.data?.success) {
        const data = res.data.data;

        // Merge locally registered schools if any
        try {
          const registered = JSON.parse(localStorage.getItem('registered_schools') || '[]');
          if (Array.isArray(registered) && registered.length > 0) {
            const extraSchools = registered.map((s) => ({
              id: s.school_code || s.id,
              name: `${s.name || s.school_name} (${s.school_code})`,
              city: s.city || 'ایران',
              studentsCount: 0,
            }));
            const existingNames = new Set(data.schools.map((s) => s.name));
            for (const es of extraSchools) {
              if (!existingNames.has(es.name)) {
                data.schools.unshift(es);
              }
            }
          }
        } catch (e) {}

        setOptions(data);

        // Pre-fill schools (both primary and other schools)
        const rawSchools = initialData?.schools || data.currentSetup?.schools || [];
        const currentSchool = initialData?.school_name || data.currentSetup?.school_name || (rawSchools[0] || '');

        if (Array.isArray(rawSchools) && rawSchools.length > 1) {
          setAdditionalSchools(rawSchools.slice(1));
        }

        const foundSchool = data.schools.find((s) => s.name === currentSchool);
        if (foundSchool) {
          setSelectedSchool(foundSchool.name);
          setIsCustomSchool(false);
        } else if (currentSchool) {
          setIsCustomSchool(true);
          setCustomSchool(currentSchool);
        } else if (data.schools.length > 0) {
          setSelectedSchool(data.schools[0].name);
        }

        // Pre-fill subject
        const currentSub = initialData?.subject || data.currentSetup?.subject || '';
        const foundSub = data.subjects.find((s) => s === currentSub);
        if (foundSub) {
          setSelectedSubject(foundSub);
          setIsCustomSubject(false);
        } else if (currentSub) {
          setIsCustomSubject(true);
          setCustomSubject(currentSub);
        } else if (data.subjects.length > 0) {
          setSelectedSubject(data.subjects[0]);
        }

        // Pre-fill grades
        const currentGrades = initialData?.taught_grades || data.currentSetup?.taught_grades || [];
        if (Array.isArray(currentGrades) && currentGrades.length > 0) {
          setSelectedGrades(new Set(currentGrades));
        } else {
          // Default selection: دهم ریاضی و تجربی
          setSelectedGrades(new Set(['پایه دهم ریاضی', 'پایه دهم تجربی']));
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('خطا در بارگذاری اطلاعات اولیه مدارس و پایه‌ها');
    } finally {
      setLoading(false);
    }
  };

  const currentStage = useMemo(() => {
    return options.stages.find((s) => s.id === activeStageId) || options.stages[0];
  }, [options.stages, activeStageId]);

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

    const finalPrimarySchool = isCustomSchool ? customSchool.trim() : selectedSchool;
    if (!finalPrimarySchool) {
      toast.error('لطفاً نام مدرسه را مشخص فرمایید');
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
      console.error(err);
      toast.error(err.response?.data?.message || 'خطا در ثبت مشخصات دبیر');
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
                <span>۱. نام مدرسه یا مجتمع آموزشی (و امکان افزودن مدارس دیگر)</span>
              </div>
              <p className={styles.sectionHint}>
                مدرسه اصلی خود را انتخاب کنید یا نام مدرسه دلخواه و مدارس دیگری که در آن تدریس دارید را وارد نمایید:
              </p>

              <div className={styles.schoolSearchWrap}>
                <label style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
                  🏫 مدرسه اصلی شما:
                </label>
                {!isCustomSchool ? (
                  <select
                    className={`input ${styles.schoolSelect}`}
                    value={selectedSchool}
                    onChange={handleMainSchoolChange}
                  >
                    {options.schools.map((sch) => (
                      <option key={sch.id || sch.name} value={sch.name}>
                        🏛️ {sch.name} {sch.city ? `(${sch.city})` : ''}
                      </option>
                    ))}
                    <option value="CUSTOM">✏️ سایر مدارس (تایپ نام مدرسه جدید / دلخواه...)</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="نام کامل مدرسه اصلی خود را بنویسید (مثال: دبیرستان علامه حلی ۱ تهران)..."
                      value={customSchool}
                      onChange={(e) => setCustomSchool(e.target.value)}
                      required
                      autoFocus
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setIsCustomSchool(false)}
                      style={{ fontSize: '0.8rem', padding: '8px 12px', whiteSpace: 'nowrap' }}
                    >
                      انتخاب از لیست
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className={styles.customSchoolToggle}
                  onClick={() => setIsCustomSchool(!isCustomSchool)}
                >
                  {isCustomSchool
                    ? '📋 انتخاب از لیست مدارس نمونه سامانه'
                    : '✍️ مدرسه من در لیست نیست؛ ثبت نام مدرسه دلخواه'}
                </button>

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
                {options.stages.map((stage) => {
                  const stageGradesCount = stage.grades.filter((g) => selectedGrades.has(g)).length;
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
                    پایه‌های {currentStage.title}:
                  </span>
                  <div className={styles.bulkBtnGroup}>
                    <button
                      type="button"
                      className={styles.bulkBtn}
                      onClick={() => selectAllInStage(currentStage)}
                    >
                      ✓ انتخاب همه در این مقطع
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

              {/* Grades Grid for active stage */}
              {currentStage && (
                <div className={styles.gradesGrid}>
                  {currentStage.grades.map((grade) => {
                    const isSelected = selectedGrades.has(grade);
                    const count = options.studentCounts[grade] || 0;
                    return (
                      <div
                        key={grade}
                        className={`${styles.gradeCard} ${isSelected ? styles.gradeCardSelected : ''}`}
                        onClick={() => toggleGrade(grade)}
                      >
                        <div className={styles.gradeCardLeft}>
                          <span className={styles.gradeName}>{grade}</span>
                          <span className={styles.studentCountTag}>
                            <span>👥</span>
                            <span>{count > 0 ? `${count} دانش‌آموز` : 'آماده اتصال دانش‌آموزان'}</span>
                          </span>
                        </div>

                        <div className={`${styles.gradeCheckDot} ${isSelected ? styles.gradeCheckDotSelected : ''}`}>
                          {isSelected ? <HiOutlineCheck style={{ strokeWidth: 3 }} /> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Selected Grades Chips Preview */}
              {selectedGrades.size > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>
                    پایه‌های انتخاب‌شده شما ({selectedGrades.size} پایه):
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
